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

function makeConfig(dirs: string[], strict: boolean = false): string {
  const config: any = {
    plugin: [
      ["/plugins/ext-search", { directories: dirs }],
    ],
  }
  if (strict) {
    config.plugin[0][1].strict_path_restrictions = true
  }
  return JSON.stringify(config)
}

describe("strict_path_restrictions: tool.execute.before hook", () => {
  beforeEach(() => _testing.resetAll())
  afterEach(() => _testing.resetAll())

  async function setupPlugin(strict: boolean) {
    const fs: Record<string, FsEntry | null> = {
      "/mono": { isDir: true },
      "/mono/team": { isDir: true },
      "/mono/team/opencode.json": { content: makeConfig(["/mono/shared", "/ext-libs"], strict) },
      "/mono/team/app": { isDir: true },
      "/mono/shared": { isDir: true },
      "/ext-libs": { isDir: true },
      "/plugins/ext-search": { isDir: true },
    }
    const { client } = createMockClient()
    const mockFs = createMockFs(fs)
    _testing.setFsHost(mockFs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    return await pluginModule.server(
      { directory: "/mono/team/app", worktree: "/mono", client } as any,
      { directories: ["/mono/shared", "/ext-libs"], strict_path_restrictions: strict },
    )
  }

  it("registers tool.execute.before when strict_path_restrictions is true", async () => {
    const result = await setupPlugin(true)
    expect(result).toBeDefined()
    expect(typeof result!["tool.execute.before"]).toBe("function")
  })

  it("does not register tool.execute.before when strict_path_restrictions is false", async () => {
    const result = await setupPlugin(false)
    expect(result).toBeDefined()
    expect(result!["tool.execute.before"]).toBeUndefined()
  })

  it("does not register tool.execute.before when strict_path_restrictions is not set", async () => {
    const result = await setupPlugin(false)
    expect(result).toBeDefined()
    expect(result!["tool.execute.before"]).toBeUndefined()
  })

  it("redirects glob path outside allowed dirs to configDir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "/random/dir", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("/mono/team")
  })

  it("redirects grep path outside allowed dirs to configDir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "/some/other/place", pattern: "test" } }
    await hook({ tool: "grep" }, output)
    expect(output.args.path).toBe("/mono/team")
  })

  it("does not redirect when path is configDir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "/mono/team", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("/mono/team")
  })

  it("does not redirect when path is subdir of configDir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "/mono/team/src", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("/mono/team/src")
  })

  it("does not redirect when path is external dir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "/ext-libs", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("/ext-libs")
  })

  it("does not redirect when path is subdir of external dir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "/ext-libs/utils", pattern: "test" } }
    await hook({ tool: "grep" }, output)
    expect(output.args.path).toBe("/ext-libs/utils")
  })

  it("does not add path when args has no path", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBeUndefined()
  })

  it("does not interfere with other tools", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { filePath: "/random/file.ts" } }
    await hook({ tool: "read" }, output)
    expect(output.args.filePath).toBe("/random/file.ts")
    expect(output.args.path).toBeUndefined()
  })

  it("handles relative paths by resolving against openDir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "../../other-project", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("/mono/team")
  })

  it("preserves other args when redirecting", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "/random/dir", pattern: "**/*.ts", include: "*.js" } }
    await hook({ tool: "grep" }, output)
    expect(output.args.path).toBe("/mono/team")
    expect(output.args.pattern).toBe("**/*.ts")
    expect(output.args.include).toBe("*.js")
  })

  it("allows relative path resolving to configDir via ..", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    // openDir is /mono/team/app, ".." resolves to /mono/team which IS configDir
    const output = { args: { path: "..", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("..")
  })

  it("allows relative path resolving to allowed external dir", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    // openDir is /mono/team/app, "../../shared" resolves to /mono/shared which IS allowed
    const output = { args: { path: "../../shared", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("../../shared")
  })

  it("does not modify path when args is undefined", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = {}
    await hook({ tool: "glob" }, output)
    expect(output).toEqual({})
  })

  it("does not modify path when args.path is empty string", async () => {
    const result = await setupPlugin(true)
    const hook = result!["tool.execute.before"]
    const output = { args: { path: "", pattern: "**/*.ts" } }
    await hook({ tool: "glob" }, output)
    expect(output.args.path).toBe("")
  })
})

describe("strict_path_restrictions: configDir is null", () => {
  beforeEach(() => _testing.resetAll())
  afterEach(() => _testing.resetAll())

  it("does not register hook when configDir is null even if strict_path_restrictions is true", async () => {
    // No opencode.json anywhere in the path, so configDir will be null
    const fs: Record<string, FsEntry | null> = {
      "/mono": { isDir: true },
      "/mono/team": { isDir: true },
      "/mono/team/app": { isDir: true },
      "/mono/shared": { isDir: true },
      "/ext-libs": { isDir: true },
      "/plugins/ext-search": { isDir: true },
    }
    const { client } = createMockClient()
    const mockFs = createMockFs(fs)
    _testing.setFsHost(mockFs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/mono/team/app", worktree: "/mono", client } as any,
      { directories: ["/mono/shared", "/ext-libs"], strict_path_restrictions: true },
    )
    expect(result).toBeDefined()
    expect(result!["tool.execute.before"]).toBeUndefined()
  })
})
