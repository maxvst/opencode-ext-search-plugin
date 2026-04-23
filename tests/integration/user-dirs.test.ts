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

function setupBaseFs(overrides: Record<string, FsEntry | null> = {}): Record<string, FsEntry | null> {
  const files: Record<string, FsEntry | null> = {
    "/project": { isDir: true },
    "/project/opencode.json": {
      content: JSON.stringify({
        plugin: [["/plugins/ext-search", { directories: ["/ext-dir"] }]],
      }),
    },
    "/plugins/ext-search": { isDir: true },
    "/ext-dir": { isDir: true },
    ...overrides,
  }
  return files
}

describe("user-dirs integration", () => {
  beforeEach(() => { _testing.resetAll() })
  afterEach(() => { _testing.resetAll() })

  it("initializes plugin with user directories from .ext-search.json", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs(setupBaseFs({
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/user-ext"] }),
      },
      "/user-ext": { isDir: true },
    }))
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    expect(result["tool.execute.after"]).toBeDefined()

    const errorToast = toasts.find((t) => t.variant === "error")
    expect(errorToast).toBeUndefined()
  })

  it("shows toast when .ext-search.json has invalid JSON", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs(setupBaseFs({
      "/project/.ext-search.json": { content: "{ invalid" },
    }))
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    expect(result).toBeDefined()
    const parseToast = toasts.find(
      (t) => t.variant === "error" && t.message?.includes("Failed to parse .ext-search.json"),
    )
    expect(parseToast).toBeDefined()
  })

  it("shows toast for each invalid user directory", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs(setupBaseFs({
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/nonexistent-dir", "/project/inside"] }),
      },
      "/project/inside": { isDir: true },
    }))
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    expect(result).toBeDefined()
    const userErrors = toasts.filter(
      (t) => t.variant === "error" && (t.message?.includes("User directory") || t.message?.includes("inside configDir")),
    )
    expect(userErrors.length).toBeGreaterThanOrEqual(2)
  })

  it("combines config + cc + user directories", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-config"], compile_commands_dir: "build" }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-config": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-user"] }),
      },
      "/ext-user": { isDir: true },
      "/project/build/compile_commands.json": {
        content: JSON.stringify([
          { directory: "/cc-external", file: "main.c" },
        ]),
      },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-config"], compile_commands_dir: "build" },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const errorToast = toasts.find((t) => t.variant === "error")
    expect(errorToast).toBeUndefined()
  })

  it("disables config dir when user dir is its parent", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-parent/child", "/other-ext"] }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-parent/child": { isDir: true },
      "/other-ext": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-parent"] }),
      },
      "/ext-parent": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-parent/child", "/other-ext"] },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const inactiveToast = toasts.find(
      (t) => t.message?.includes("No valid external directories"),
    )
    expect(inactiveToast).toBeUndefined()
  })

  it("plugin active only via .ext-search.json (no directories, no compile_commands_dir)", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", {}]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/user-only-dir"] }),
      },
      "/user-only-dir": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: [] },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    expect(result["tool.execute.after"]).toBeDefined()

    const inactiveToast = toasts.find(
      (t) => t.message?.includes("plugin is inactive") || t.message?.includes("No valid external"),
    )
    expect(inactiveToast).toBeUndefined()
  })

  it("plugin inactive when all user directories are invalid and no other sources", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", {}]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/nonexistent"] }),
      },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: [] },
    )

    expect(result).toEqual({})
    const inactiveToast = toasts.find(
      (t) => t.message?.includes("No valid external directories"),
    )
    expect(inactiveToast).toBeDefined()
  })

  it("resolves relative user directory paths against basePath", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs(setupBaseFs({
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["../relative-ext"] }),
      },
      "/relative-ext": { isDir: true },
    }))
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const errorToast = toasts.find((t) => t.variant === "error")
    expect(errorToast).toBeUndefined()
  })

  it("does not read .ext-search.json when configDir is null", async () => {
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
      { directories: ["/ext-dir"] },
    )

    expect(result).toBeDefined()
    expect(result).not.toEqual({})
    const userToast = toasts.find(
      (t) => t.message?.includes(".ext-search.json"),
    )
    expect(userToast).toBeUndefined()
  })

  it("shows toast when .ext-search.json has incorrect structure", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs(setupBaseFs({
      "/project/.ext-search.json": {
        content: JSON.stringify({ wrong_field: ["/ext"] }),
      },
    }))
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    expect(result).toBeDefined()
    const structToast = toasts.find(
      (t) => t.variant === "error" && t.message?.includes("user_dirs"),
    )
    expect(structToast).toBeDefined()
  })
})
