import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import pluginModule, { _testing } from "../../plugins/ext-search/dist/index.js"

interface ToastCall {
  title?: string
  message: string
  variant?: "info" | "success" | "warning" | "error"
  duration?: number
}

interface FsEntry {
  content?: string
  isDir?: boolean
}

function createMockClient() {
  const toasts: ToastCall[] = []
  return {
    toasts,
    client: {
      showToast: vi.fn(async (input: ToastCall) => {
        toasts.push(input)
      }),
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

function ccJson(entries: Array<{ directory: string; file: string }>): string {
  return JSON.stringify(entries)
}

describe("compile_commands-dir integration", () => {
  beforeEach(() => { _testing.resetAll() })
  afterEach(() => { _testing.resetAll() })

  it("initializes plugin with compile_commands-dir and finds dirs", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"], compile_commands_dir: "build" }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/libA", file: "src/main.cpp" },
          { directory: "/external/libB", file: "core.c" },
        ]),
      },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    expect(result["tool.execute.after"]).toBeDefined()

    const noErrorToast = toasts.find((t) => t.variant === "error")
    expect(noErrorToast).toBeUndefined()
  })

  it("shows toast when compile_commands.json not found", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"], compile_commands_dir: "build" }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
      "/project/build": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    const ccToast = toasts.find(
      (t) => t.variant === "error" && t.message?.includes("compile_commands.json"),
    )
    expect(ccToast).toBeDefined()
    expect(ccToast!.message).toContain("not found")
  })

  it("shows toast when compile_commands.json has invalid JSON", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"], compile_commands_dir: "build" }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
      "/project/build/compile_commands.json": { content: "{ bad json" },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    const ccToast = toasts.find(
      (t) => t.variant === "error" && t.message?.includes("Failed to parse"),
    )
    expect(ccToast).toBeDefined()
  })

  it("combines config dirs and compile_commands dirs", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-config-dir"], compile_commands_dir: "build" }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-config-dir": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/cc-external/lib", file: "src/main.cpp" },
        ]),
      },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-config-dir"], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const errorToast = toasts.find((t) => t.variant === "error")
    expect(errorToast).toBeUndefined()
  })

  it("works with only compile_commands_dir (no directories)", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { compile_commands_dir: "build" }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/lib", file: "main.c" },
        ]),
      },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: [], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const inactiveToast = toasts.find(
      (t) => t.message?.includes("plugin is inactive") || t.message?.includes("No directories"),
    )
    expect(inactiveToast).toBeUndefined()
  })

  it("plugin inactive when compile_commands_dir yields no dirs", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { compile_commands_dir: "build" }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/project", file: "src/main.cpp" },
        ]),
      },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: [], compile_commands_dir: "build" },
    )

    expect(result).toEqual({})
    const inactiveToast = toasts.find(
      (t) => t.message?.includes("No valid external directories"),
    )
    expect(inactiveToast).toBeDefined()
  })

  it("skips compile_commands-dir when configDir is null", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/ext-dir": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const ccErrorToast = toasts.find(
      (t) => t.message?.includes("compile_commands"),
    )
    expect(ccErrorToast).toBeUndefined()
  })

  it("disables config dir when it is inside compile_commands dir", async () => {
    const { client, toasts } = createMockClient()
    // config dir: /ext-libs/sublib (inside /ext-libs which is a cc dir)
    // cc entry: { directory: "/ext-libs", file: "sublib/main.cpp" } → cc dir: /ext-libs/sublib
    // But we also add a separate cc dir to make it work
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [
            [
              "/plugins/ext-search",
              {
                directories: ["/ext-libs/sublib", "/other-project"],
                compile_commands_dir: "build",
              },
            ],
          ],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-libs/sublib": { isDir: true },
      "/other-project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/ext-libs", file: "sublib/main.cpp" },
          { directory: "/cc-lib", file: "core.c" },
        ]),
      },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-libs/sublib", "/other-project"], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const errorToast = toasts.find((t) => t.variant === "error")
    expect(errorToast).toBeUndefined()
    // Plugin should still be active because:
    // - /ext-libs/sublib (config) is disabled (inside cc dir /ext-libs/sublib)
    // - /other-project (config) is NOT disabled
    // - /ext-libs/sublib (cc) is active
    // - /cc-lib (cc) is active
    const inactiveToast = toasts.find(
      (t) => t.message?.includes("No valid external directories"),
    )
    expect(inactiveToast).toBeUndefined()
  })
})
