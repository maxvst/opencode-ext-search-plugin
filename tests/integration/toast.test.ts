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

function setupGoodFs(): Record<string, FsEntry | null> {
  return {
    "/project": { isDir: true },
    "/project/opencode.json": {
      content: JSON.stringify({
        plugin: [["/plugins/ext-search", { directories: ["/ext-dir"] }]],
      }),
    },
    "/plugins/ext-search": { isDir: true },
    "/ext-dir": { isDir: true },
  }
}

describe("toast notifications", () => {
  beforeEach(() => {
    _testing.resetAll()
  })

  afterEach(() => {
    _testing.resetAll()
  })

  it("shows toast when rg not found", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs(setupGoodFs())
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride(null)

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    const rgToast = toasts.find(
      (t) => t.message?.toLowerCase().includes("rg") || t.message?.toLowerCase().includes("ripgrep"),
    )
    expect(rgToast).toBeDefined()
    expect(rgToast!.variant).toBe("warning")
    expect(result).toBeDefined()
  })

  it("shows toast on opencode.json parse error", async () => {
    const { client, toasts } = createMockClient()
    const files = setupGoodFs()
    files["/project/opencode.json"] = { content: "{ invalid json ???" }
    const fs = createMockFs(files)
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    const parseToast = toasts.find(
      (t) => t.variant === "error" && t.message?.includes("parse"),
    )
    expect(parseToast).toBeDefined()
    expect(parseToast!.message).toContain("opencode.json")
  })

  it("shows toast when opencode.json not found", async () => {
    const { client, toasts } = createMockClient()
    const files: Record<string, FsEntry | null> = {
      "/project": { isDir: true },
      "/ext-dir": { isDir: true },
    }
    const fs = createMockFs(files)
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    const configToast = toasts.find(
      (t) => t.message?.includes("opencode.json") && t.message?.includes("not found"),
    )
    expect(configToast).toBeDefined()
    expect(configToast!.variant).toBe("warning")
  })

  it("shows toast when configured directory not found", async () => {
    const { client, toasts } = createMockClient()
    const files = setupGoodFs()
    delete files["/ext-dir"]
    const fs = createMockFs(files)
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    const dirToast = toasts.find(
      (t) => t.message?.includes("/ext-dir") && t.message?.includes("not found"),
    )
    expect(dirToast).toBeDefined()
    expect(dirToast!.variant).toBe("warning")

    const emptyToast = toasts.find(
      (t) => t.message?.includes("No valid external directories"),
    )
    expect(emptyToast).toBeDefined()
    expect(result).toEqual({})
  })

  it("shows toast when directories option is empty", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({})
    _testing.setFsHost(fs as any)

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: [] },
    )

    const toast = toasts.find(
      (t) => t.message?.includes("No directories configured"),
    )
    expect(toast).toBeDefined()
    expect(toast!.variant).toBe("warning")
    expect(result).toEqual({})
  })

  it("shows toast when no options provided", async () => {
    const { client, toasts } = createMockClient()
    const fs = createMockFs({})
    _testing.setFsHost(fs as any)

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
    )

    const toast = toasts.find(
      (t) => t.message?.includes("No directories configured"),
    )
    expect(toast).toBeDefined()
    expect(result).toEqual({})
  })

  it("shows toast when some directories are valid and some missing", async () => {
    const { client, toasts } = createMockClient()
    const files = setupGoodFs()
    files["/another-dir"] = { isDir: true }
    const fs = createMockFs(files)
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir", "/missing-dir"] },
    )

    const missingToast = toasts.find(
      (t) => t.message?.includes("/missing-dir") && t.message?.includes("not found"),
    )
    expect(missingToast).toBeDefined()
    expect(missingToast!.variant).toBe("warning")
    expect(result).toBeDefined()
    expect(result).not.toEqual({})
  })

  it("shows zod warning when deps_read tool cannot be created", async () => {
    const { client, toasts } = createMockClient()
    const files = setupGoodFs()
    const fs = createMockFs(files)
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    const zodToast = toasts.find(
      (t) => t.message?.toLowerCase().includes("zod"),
    )
    expect(zodToast).toBeDefined()
    expect(zodToast!.variant).toBe("warning")
    expect(result).toBeDefined()
  })

  it("shows multiple toasts for compound errors", async () => {
    const { client, toasts } = createMockClient()
    const files: Record<string, FsEntry | null> = {
      "/project": { isDir: true },
      "/project/opencode.json": { content: "{ bad" },
    }
    const fs = createMockFs(files)
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride(null)

    await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    const parseToast = toasts.find((t) => t.variant === "error")
    expect(parseToast).toBeDefined()

    const configNotFoundToast = toasts.find(
      (t) => t.message?.includes("opencode.json") && t.message?.includes("not found"),
    )
    expect(configNotFoundToast).toBeDefined()

    const dirToast = toasts.find(
      (t) => t.message?.includes("/ext-dir") && t.message?.includes("not found"),
    )
    expect(dirToast).toBeDefined()

    const emptyToast = toasts.find(
      (t) => t.message?.includes("No valid external directories"),
    )
    expect(emptyToast).toBeDefined()
  })
})
