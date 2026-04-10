import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import pluginModule, { _testing } from "../../plugins/ext-search/dist/index.js"

interface FsEntry {
  content?: string
  isDir?: boolean
}

function createMockClient() {
  return {
    client: {
      showToast: vi.fn(async () => {}),
      app: {
        log: vi.fn(async () => {}),
      },
    },
  }
}

function createMockFs(files: Record<string, FsEntry | null>) {
  return {
    existsSync(p: string) {
      return p in files && files[p] !== null
    },
    readFileSync(p: string, _enc: string) {
      const entry = files[p]
      if (!entry || entry.content === undefined) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`)
        ;(err as any).code = "ENOENT"
        throw err
      }
      return entry.content
    },
    statSync(p: string) {
      const entry = files[p]
      if (!entry) {
        const err = new Error(`ENOENT: no such file or directory, stat '${p}'`)
        ;(err as any).code = "ENOENT"
        throw err
      }
      return {
        isDirectory: () => entry.isDir ?? false,
        size: entry.content?.length ?? 0,
      }
    },
  }
}

function makeConfig(dirs: string[]): string {
  return JSON.stringify({
    plugin: [["/plugins/ext-search", { directories: dirs }]],
  })
}

function setupNestedFs(): Record<string, FsEntry | null> {
  return {
    "/mono": { isDir: true },
    "/mono/team": { isDir: true },
    "/mono/team/opencode.json": { content: makeConfig(["/mono/shared-types", "/other/utils"]) },
    "/mono/team/services": { isDir: true },
    "/mono/team/services/web": { isDir: true },
    "/mono/team/services/web/app": { isDir: true },
    "/mono/shared-types": { isDir: true },
    "/other": { isDir: true },
    "/other/utils": { isDir: true },
    "/plugins/ext-search": { isDir: true },
  }
}

async function initPlugin(fs: Record<string, FsEntry | null>, worktree: string, openDir: string, rgOverride: string | null) {
  const { client } = createMockClient()
  const mockFs = createMockFs(fs)
  _testing.setFsHost(mockFs as any)
  _testing.setPluginDirOverride("/plugins/ext-search")
  _testing.setRgPathOverride(rgOverride)

  const result = await pluginModule.server(
    { directory: openDir, worktree, client } as any,
    { directories: Object.keys(fs)
      .filter(k => fs[k]?.isDir && k !== "/mono" && k !== "/mono/team" && k !== "/mono/team/services" && k !== "/mono/team/services/web" && k !== "/mono/team/services/web/app" && k !== "/plugins/ext-search" && k !== "/other")
      .length ? undefined : undefined
    },
  )
  const hook = result?.["tool.execute.after"]
  return { hook, result }
}

describe("extended search trigger: searchPath between openDir and configDir", () => {
  beforeEach(() => _testing.resetAll())
  afterEach(() => _testing.resetAll())

  async function setupHook(rgOverride: string | null = "/usr/bin/rg") {
    const fs = setupNestedFs()
    const dirs = ["/mono/shared-types", "/other/utils"]
    const { client } = createMockClient()
    const mockFs = createMockFs(fs)
    _testing.setFsHost(mockFs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride(rgOverride)

    const worktree = "/mono"
    const openDir = "/mono/team/services/web/app"

    const result = await pluginModule.server(
      { directory: openDir, worktree, client } as any,
      { directories: dirs },
    )
    return result?.["tool.execute.after"] as Function
  }

  it("triggers external search when searchPath is configDir (budget=0, glob)", async () => {
    const hook = await setupHook()
    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "glob", args: { pattern: "**/*.ts", path: "/mono/team" } },
      output,
    )
    expect(output.output).toContain("External dependencies")
    expect(output.output).toContain("/mono/shared-types")
  })

  it("triggers external search when searchPath is intermediate dir between openDir and configDir (budget=0, grep)", async () => {
    const hook = await setupHook()
    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test", path: "/mono/team/services" } },
      output,
    )
    expect(output.output).toContain("External dependencies")
    expect(output.output).toContain("/mono/shared-types")
  })

  it("skips external search for truly narrow path below openDir", async () => {
    const hook = await setupHook()
    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "glob", args: { pattern: "**/*.ts", path: "/mono/team/services/web/app/src" } },
      output,
    )
    expect(output.output).not.toContain("External dependencies")
  })

  it("skips external search for unrelated path", async () => {
    const hook = await setupHook()
    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test", path: "/some/random/dir" } },
      output,
    )
    expect(output.output).not.toContain("External dependencies")
  })

  it("rg fallback hint shows dirs for extended searchPath", async () => {
    const hook = await setupHook(null)
    const output = { output: "initial", metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test", path: "/mono/team/services" } },
      output,
    )
    expect(output.output).toContain("ripgrep not available")
    expect(output.output).toContain("/mono/shared-types")
    expect(output.output).toContain("/other/utils")
  })

  it("rg fallback hint applies filtering but does not narrow-check", async () => {
    const hook = await setupHook(null)
    const output = { output: "initial", metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test", path: "/mono/team/services/web/app/src" } },
      output,
    )
    expect(output.output).toContain("ripgrep not available")
    expect(output.output).toContain("/mono/shared-types")
    expect(output.output).toContain("/other/utils")
  })
})

describe("filterCoveredDirs: external dirs covered by main search are excluded", () => {
  beforeEach(() => _testing.resetAll())
  afterEach(() => _testing.resetAll())

  async function setupHook(rgOverride: string | null = "/usr/bin/rg") {
    const fs: Record<string, FsEntry | null> = {
      "/project": { isDir: true },
      "/project/opencode.json": { content: makeConfig(["/project/ext-a", "/other/ext-b"]) },
      "/project/ext-a": { isDir: true },
      "/other": { isDir: true },
      "/other/ext-b": { isDir: true },
      "/plugins/ext-search": { isDir: true },
    }
    const { client } = createMockClient()
    const mockFs = createMockFs(fs)
    _testing.setFsHost(mockFs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride(rgOverride)

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/project/ext-a", "/other/ext-b"] },
    )
    return result?.["tool.execute.after"] as Function
  }

  it("excludes covered dir from hint when searchPath is worktree (budget=0, glob)", async () => {
    const hook = await setupHook()
    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "glob", args: { pattern: "**/*.ts" } },
      output,
    )
    expect(output.output).toContain("/other/ext-b")
    expect(output.output).not.toContain("/project/ext-a")
  })

  it("excludes covered dir from hint when searchPath explicitly covers it (budget=0, grep)", async () => {
    const hook = await setupHook()
    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test", path: "/project" } },
      output,
    )
    expect(output.output).toContain("/other/ext-b")
    expect(output.output).not.toContain("/project/ext-a")
  })

  it("excludes covered dir when searchPath covers it in nested structure (budget=0, glob)", async () => {
    const fs: Record<string, FsEntry | null> = {
      "/root": { isDir: true },
      "/root/team": { isDir: true },
      "/root/team/opencode.json": { content: makeConfig(["/root/shared", "/other/utils"]) },
      "/root/team/app": { isDir: true },
      "/root/shared": { isDir: true },
      "/other": { isDir: true },
      "/other/utils": { isDir: true },
      "/plugins/ext-search": { isDir: true },
    }
    const { client } = createMockClient()
    _testing.setFsHost(createMockFs(fs) as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/root/team/app", worktree: "/root", client } as any,
      { directories: ["/root/shared", "/other/utils"] },
    )
    const hook = result?.["tool.execute.after"] as Function

    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "glob", args: { pattern: "**/*.ts", path: "/root" } },
      output,
    )
    expect(output.output).toContain("/other/utils")
    expect(output.output).not.toContain("/root/shared")
  })

  it("keeps both dirs when searchPath does not cover either (nested, budget=0, grep)", async () => {
    const fs: Record<string, FsEntry | null> = {
      "/root": { isDir: true },
      "/root/team": { isDir: true },
      "/root/team/opencode.json": { content: makeConfig(["/root/shared", "/other/utils"]) },
      "/root/team/app": { isDir: true },
      "/root/shared": { isDir: true },
      "/other": { isDir: true },
      "/other/utils": { isDir: true },
      "/plugins/ext-search": { isDir: true },
    }
    const { client } = createMockClient()
    _testing.setFsHost(createMockFs(fs) as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/root/team/app", worktree: "/root", client } as any,
      { directories: ["/root/shared", "/other/utils"] },
    )
    const hook = result?.["tool.execute.after"] as Function

    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test", path: "/root/team" } },
      output,
    )
    expect(output.output).toContain("/root/shared")
    expect(output.output).toContain("/other/utils")
  })

  it("rg fallback hint also filters covered dirs", async () => {
    const hook = await setupHook(null)
    const output = { output: "initial", metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test" } },
      output,
    )
    expect(output.output).toContain("/other/ext-b")
    expect(output.output).not.toContain("/project/ext-a")
  })

  it("no hint when all external dirs are covered by searchPath", async () => {
    const hook = await setupHook()
    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "glob", args: { pattern: "**/*.ts", path: "/" } },
      output,
    )
    expect(output.output).not.toContain("External dependencies")
  })
})

describe("combined: nested structure with covered dirs filtering", () => {
  beforeEach(() => _testing.resetAll())
  afterEach(() => _testing.resetAll())

  it("excludes covered external dir when searchPath is intermediate dir between openDir and configDir", async () => {
    const fs: Record<string, FsEntry | null> = {
      "/mono": { isDir: true },
      "/mono/team": { isDir: true },
      "/mono/team/opencode.json": { content: makeConfig(["/mono/shared", "/ext-libs"]) },
      "/mono/team/services": { isDir: true },
      "/mono/team/services/web": { isDir: true },
      "/mono/team/services/web/app": { isDir: true },
      "/mono/shared": { isDir: true },
      "/ext-libs": { isDir: true },
      "/plugins/ext-search": { isDir: true },
    }
    const { client } = createMockClient()
    _testing.setFsHost(createMockFs(fs) as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/mono/team/services/web/app", worktree: "/mono", client } as any,
      { directories: ["/mono/shared", "/ext-libs"] },
    )
    const hook = result?.["tool.execute.after"] as Function

    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test", path: "/mono" } },
      output,
    )
    expect(output.output).toContain("/ext-libs")
    expect(output.output).not.toContain("/mono/shared")
  })

  it("excludes covered external dir when searchPath equals worktree in nested setup (glob)", async () => {
    const fs: Record<string, FsEntry | null> = {
      "/mono": { isDir: true },
      "/mono/team": { isDir: true },
      "/mono/team/opencode.json": { content: makeConfig(["/mono/shared", "/ext-libs"]) },
      "/mono/team/services": { isDir: true },
      "/mono/team/services/web": { isDir: true },
      "/mono/team/services/web/app": { isDir: true },
      "/mono/shared": { isDir: true },
      "/ext-libs": { isDir: true },
      "/plugins/ext-search": { isDir: true },
    }
    const { client } = createMockClient()
    _testing.setFsHost(createMockFs(fs) as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride(null)

    const result = await pluginModule.server(
      { directory: "/mono/team/services/web/app", worktree: "/mono", client } as any,
      { directories: ["/mono/shared", "/ext-libs"] },
    )
    const hook = result?.["tool.execute.after"] as Function

    const output = { output: "initial", metadata: {} }
    await hook(
      { tool: "grep", args: { pattern: "test" } },
      output,
    )
    expect(output.output).toContain("/ext-libs")
    expect(output.output).not.toContain("/mono/shared")
  })
})
