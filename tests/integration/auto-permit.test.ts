import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import pluginModule, { _testing } from "../../plugins/ext-search/dist/index.js"

interface ToastCall {
  title?: string
  message: string
  variant?: "info" | "success" | "warning" | "error"
}

interface ReplyCall {
  requestID: string
  reply: "once" | "always" | "reject"
}

function createMockClient() {
  const toasts: ToastCall[] = []
  const replies: ReplyCall[] = []
  return {
    toasts,
    replies,
    client: {
      showToast: vi.fn(async (input: ToastCall) => {
        toasts.push(input)
      }),
      app: {
        log: vi.fn(async () => {}),
      },
      permission: {
        reply: vi.fn(async (params: ReplyCall) => {
          replies.push(params)
        }),
      },
    },
  }
}

interface FsEntry {
  content?: string
  isDir?: boolean
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

describe("auto-permit event hook", () => {
  beforeEach(() => {
    _testing.resetAll()
  })

  afterEach(() => {
    _testing.resetAll()
  })

  it("registers event hook that auto-approves external_directory for resolved dirs", async () => {
    const { client, replies } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"] }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    expect(result.event).toBeDefined()

    await result.event!({
      event: {
        type: "permission.asked",
        properties: {
          id: "perm-123",
          sessionID: "sess-1",
          permission: "external_directory",
          patterns: ["/ext-dir/**"],
          metadata: {},
          always: ["/ext-dir/**"],
        },
      },
    })

    expect(client.permission.reply).toHaveBeenCalledTimes(1)
    expect(replies[0]).toEqual({ requestID: "perm-123", reply: "always" })
  })

  it("does not approve non-external_directory permissions", async () => {
    const { client, replies } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"] }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    await result.event!({
      event: {
        type: "permission.asked",
        properties: {
          id: "perm-456",
          sessionID: "sess-1",
          permission: "bash",
          patterns: ["/ext-dir/**"],
          metadata: {},
          always: [],
        },
      },
    })

    expect(client.permission.reply).not.toHaveBeenCalled()
  })

  it("does not approve external_directory for unrelated paths", async () => {
    const { client, replies } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"] }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    await result.event!({
      event: {
        type: "permission.asked",
        properties: {
          id: "perm-789",
          sessionID: "sess-1",
          permission: "external_directory",
          patterns: ["/other-dir/**"],
          metadata: { filepath: "/other-dir/secret.txt" },
          always: [],
        },
      },
    })

    expect(client.permission.reply).not.toHaveBeenCalled()
  })

  it("ignores non-permission events", async () => {
    const { client } = createMockClient()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"] }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    await result.event!({
      event: {
        type: "message.updated",
        properties: { someData: "value" },
      },
    })

    expect(client.permission.reply).not.toHaveBeenCalled()
  })

  it("handles missing permission.reply gracefully", async () => {
    const toasts: ToastCall[] = []
    const client = {
      showToast: vi.fn(async (input: ToastCall) => {
        toasts.push(input)
      }),
      app: {
        log: vi.fn(async () => {}),
      },
    }

    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/opencode.json": {
        content: JSON.stringify({
          plugin: [["/plugins/ext-search", { directories: ["/ext-dir"] }]],
        }),
      },
      "/plugins/ext-search": { isDir: true },
      "/ext-dir": { isDir: true },
    })
    _testing.setFsHost(fs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride("/usr/bin/rg")

    const result = await pluginModule.server(
      { directory: "/project", worktree: "/project", client } as any,
      { directories: ["/ext-dir"] },
    )

    await result.event!({
      event: {
        type: "permission.asked",
        properties: {
          id: "perm-no-reply",
          sessionID: "sess-1",
          permission: "external_directory",
          patterns: ["/ext-dir/**"],
          metadata: {},
          always: [],
        },
      },
    })

    expect(true).toBe(true)
  })
})
