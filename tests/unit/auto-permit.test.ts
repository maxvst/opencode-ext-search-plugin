import { describe, it, expect, vi } from "vitest"
import {
  extractBaseFromGlob,
  isInsideExternalDirs,
  isInsideDir,
  shouldAutoApprove,
  createAutoPermitHandler,
} from "../../plugins/ext-search/src/auto-permit"

describe("extractBaseFromGlob", () => {
  it("removes /** suffix", () => {
    expect(extractBaseFromGlob("/foo/bar/**")).toBe("/foo/bar")
  })

  it("removes /* suffix", () => {
    expect(extractBaseFromGlob("/foo/bar/*")).toBe("/foo/bar")
  })

  it("returns absolute path as-is when no glob suffix", () => {
    expect(extractBaseFromGlob("/foo/bar")).toBe("/foo/bar")
  })

  it("returns empty string for relative paths", () => {
    expect(extractBaseFromGlob("foo/bar/**")).toBe("")
  })

  it("returns empty string for empty input", () => {
    expect(extractBaseFromGlob("")).toBe("")
  })

  it("returns root slash as-is", () => {
    expect(extractBaseFromGlob("/")).toBe("/")
  })
})

describe("isInsideExternalDirs", () => {
  const dirs = ["/ext/a", "/ext/b"]

  it("returns true for exact match", () => {
    expect(isInsideExternalDirs("/ext/a", dirs)).toBe(true)
  })

  it("returns true for subdirectory", () => {
    expect(isInsideExternalDirs("/ext/a/sub/file.ts", dirs)).toBe(true)
  })

  it("returns false for unrelated path", () => {
    expect(isInsideExternalDirs("/other/dir", dirs)).toBe(false)
  })

  it("returns false for partial name match without separator", () => {
    expect(isInsideExternalDirs("/ext/abc", dirs)).toBe(false)
  })

  it("returns false for empty dirs array", () => {
    expect(isInsideExternalDirs("/ext/a/sub", [])).toBe(false)
  })
})

describe("isInsideDir", () => {
  it("returns true for exact match", () => {
    expect(isInsideDir("/project/team", "/project/team")).toBe(true)
  })

  it("returns true for subdirectory", () => {
    expect(isInsideDir("/project/team/src", "/project/team")).toBe(true)
  })

  it("returns false for parent directory", () => {
    expect(isInsideDir("/project", "/project/team")).toBe(false)
  })

  it("returns false for sibling with prefix-like name", () => {
    expect(isInsideDir("/project/team-other", "/project/team")).toBe(false)
  })

  it("returns false for unrelated path", () => {
    expect(isInsideDir("/other/dir", "/project/team")).toBe(false)
  })
})

describe("shouldAutoApprove", () => {
  const dirs = ["/ext/deps", "/ext/shared"]

  it("approves external_directory with matching glob pattern", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/ext/deps/**"],
        {},
        dirs,
        null,
      ),
    ).toBe(true)
  })

  it("approves external_directory with matching filepath in metadata", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/unrelated/**"],
        { filepath: "/ext/deps/lib/index.ts" },
        dirs,
        null,
      ),
    ).toBe(true)
  })

  it("approves external_directory with matching parentDir in metadata", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/unrelated/**"],
        { parentDir: "/ext/shared" },
        dirs,
        null,
      ),
    ).toBe(true)
  })

  it("rejects non-external_directory permission", () => {
    expect(
      shouldAutoApprove("bash", ["/ext/deps/**"], {}, dirs, null),
    ).toBe(false)
  })

  it("rejects when no paths match", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/other/**"],
        { filepath: "/other/file.ts" },
        dirs,
        null,
      ),
    ).toBe(false)
  })

  it("rejects when patterns empty and no metadata paths", () => {
    expect(
      shouldAutoApprove("external_directory", [], {}, dirs, null),
    ).toBe(false)
  })

  it("approves when one of multiple patterns matches", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/unrelated/**", "/ext/deps/**", "/other/**"],
        {},
        dirs,
        null,
      ),
    ).toBe(true)
  })

  it("rejects when all multiple patterns are unrelated", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/unrelated/**", "/other/**", "/misc/**"],
        {},
        dirs,
        null,
      ),
    ).toBe(false)
  })

  it("approves when filepath matches but parentDir does not", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/unrelated/**"],
        { filepath: "/ext/deps/file.ts", parentDir: "/unrelated" },
        dirs,
        null,
      ),
    ).toBe(true)
  })

  it("approves when parentDir matches but filepath does not", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/unrelated/**"],
        { filepath: "/unrelated/file.ts", parentDir: "/ext/shared" },
        dirs,
        null,
      ),
    ).toBe(true)
  })

  it("ignores non-string metadata values", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/ext/deps/**"],
        { filepath: 123, parentDir: null },
        dirs,
        null,
      ),
    ).toBe(true)
    // Still approved because pattern matches; metadata is safely ignored
  })

  it("approves when path is inside configDir", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/project/team/src/**"],
        {},
        dirs,
        "/project/team",
      ),
    ).toBe(true)
  })

  it("approves when path equals configDir", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/project/team/**"],
        {},
        dirs,
        "/project/team",
      ),
    ).toBe(true)
  })

  it("rejects when path is parent of configDir", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/project/**"],
        {},
        dirs,
        "/project/team",
      ),
    ).toBe(false)
  })

  it("rejects when configDir is null and no external dir matches", () => {
    expect(
      shouldAutoApprove(
        "external_directory",
        ["/project/team/**"],
        {},
        dirs,
        null,
      ),
    ).toBe(false)
  })
})

describe("createAutoPermitHandler", () => {
  const resolvedDirs = ["/ext/deps"]

  it("auto-approves matching external_directory permission", async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const handler = createAutoPermitHandler(resolvedDirs, {
      permission: { reply },
    })

    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-1",
          permission: "external_directory",
          patterns: ["/ext/deps/**"],
          metadata: {},
        },
      },
    })

    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith({ requestID: "req-1", reply: "always" })
  })

  it("does not call reply for non-matching paths", async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const handler = createAutoPermitHandler(resolvedDirs, {
      permission: { reply },
    })

    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-2",
          permission: "external_directory",
          patterns: ["/other/**"],
          metadata: {},
        },
      },
    })

    expect(reply).not.toHaveBeenCalled()
  })

  it("does not call reply for non-permission events", async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const handler = createAutoPermitHandler(resolvedDirs, {
      permission: { reply },
    })

    await handler({
      event: {
        type: "message.updated",
        properties: { some: "data" },
      },
    })

    expect(reply).not.toHaveBeenCalled()
  })

  it("does not throw when client.permission is undefined", async () => {
    const handler = createAutoPermitHandler(resolvedDirs, {})

    // Should not throw
    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-3",
          permission: "external_directory",
          patterns: ["/ext/deps/**"],
          metadata: {},
        },
      },
    })
  })

  it("does not throw when event has no properties", async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const handler = createAutoPermitHandler(resolvedDirs, {
      permission: { reply },
    })

    await handler({
      event: { type: "permission.asked" },
    })

    expect(reply).not.toHaveBeenCalled()
  })

  it("does not throw when patterns is not an array", async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const handler = createAutoPermitHandler(resolvedDirs, {
      permission: { reply },
    })

    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-4",
          permission: "external_directory",
          patterns: "/ext/deps/**",
          metadata: {},
        },
      },
    })

    expect(reply).not.toHaveBeenCalled()
  })

  it("catches reply errors gracefully", async () => {
    const reply = vi.fn().mockRejectedValue(new Error("network error"))
    const handler = createAutoPermitHandler(resolvedDirs, {
      permission: { reply },
    })

    // Should not throw even though reply rejects
    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-5",
          permission: "external_directory",
          patterns: ["/ext/deps/**"],
          metadata: {},
        },
      },
    })

    expect(reply).toHaveBeenCalledTimes(1)
  })

  it("handles multiple sequential permission requests", async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const handler = createAutoPermitHandler(resolvedDirs, {
      permission: { reply },
    })

    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-a",
          permission: "external_directory",
          patterns: ["/ext/deps/**"],
          metadata: {},
        },
      },
    })

    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-b",
          permission: "external_directory",
          patterns: ["/other/**"],
          metadata: {},
        },
      },
    })

    await handler({
      event: {
        type: "permission.asked",
        properties: {
          id: "req-c",
          permission: "external_directory",
          patterns: ["/ext/deps/lib/**"],
          metadata: {},
        },
      },
    })

    expect(reply).toHaveBeenCalledTimes(2)
    expect(reply).toHaveBeenCalledWith({ requestID: "req-a", reply: "always" })
    expect(reply).toHaveBeenCalledWith({ requestID: "req-c", reply: "always" })
  })
})
