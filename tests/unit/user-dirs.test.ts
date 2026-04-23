import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { parseUserDirs, markDisabledByUserDirs } from "../../plugins/ext-search/src/user-dirs"
import { setFsHost, resetFsHost } from "../../plugins/ext-search/src/fs-host"
import type { ExternalDir } from "../../plugins/ext-search/src/types"
import os from "os"

function createMockFs(files: Record<string, { content?: string; isDir?: boolean } | null>) {
  return {
    existsSync(p: string) {
      return p in files && files[p] !== null
    },
    readFileSync(p: string, _enc: string) {
      const entry = files[p]
      if (!entry || entry.content === undefined) throw new Error(`ENOENT: ${p}`)
      return entry.content
    },
    statSync(p: string) {
      const entry = files[p]
      if (!entry) throw new Error(`ENOENT: ${p}`)
      return { isDirectory: () => entry.isDir ?? false, size: entry.content?.length ?? 0 }
    },
  }
}

function configDir(p: string): ExternalDir {
  return { path: p, source: "config" }
}

function ccDir(p: string): ExternalDir {
  return { path: p, source: "compile_commands" }
}

const CONFIG_DIR_PATH = "/project"
const BASE_PATH = "/project"

describe("parseUserDirs", () => {
  beforeEach(() => { resetFsHost() })
  afterEach(() => { resetFsHost() })

  it("returns empty result when .ext-search.json does not exist", () => {
    const fs = createMockFs({ "/project": { isDir: true } })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
    expect(result.parseError).toBeUndefined()
  })

  it("parses valid .ext-search.json with absolute paths", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-a", "/ext-b"] }),
      },
      "/ext-a": { isDir: true },
      "/ext-b": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(2)
    expect(result.dirs.map((d) => d.path).sort()).toEqual(["/ext-a", "/ext-b"])
    expect(result.dirs.every((d) => d.source === "user")).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("resolves relative paths against basePath", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["../shared"] }),
      },
      "/shared": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/shared")
  })

  it("resolves ~/ paths against home", () => {
    const home = os.homedir()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["~/my-projects"] }),
      },
      [`${home}/my-projects`]: { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe(`${home}/my-projects`)
  })

  it("returns parseError for invalid JSON", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": { content: "{ invalid" },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.parseError).toContain("Failed to parse")
  })

  it("returns parseError for read failure", () => {
    const fs = {
      existsSync: () => true,
      readFileSync: () => { throw new Error("EACCES") },
      statSync: () => ({ isDirectory: () => false, size: 0 }),
    }
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.parseError).toContain("Failed to read")
  })

  it("returns parseError when user_dirs is not an array", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: "not-array" }),
      },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.parseError).toContain("user_dirs")
  })

  it("returns parseError when user_dirs field is missing", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ other: [] }),
      },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.parseError).toContain("user_dirs")
  })

  it("returns empty result for empty user_dirs array", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: [] }),
      },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
    expect(result.parseError).toBeUndefined()
  })

  it("errors when user directory is inside configDir", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/project/sub"] }),
      },
      "/project/sub": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("inside configDir")
  })

  it("errors when user directory equals configDir", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/project"] }),
      },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("inside configDir")
  })

  it("errors when user directory conflicts with existing external dir", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-a"] }),
      },
      "/ext-a": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [configDir("/ext-a")], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("conflicts")
  })

  it("errors when user directory is subdirectory of existing external dir", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-a/sub"] }),
      },
      "/ext-a/sub": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [configDir("/ext-a")], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("conflicts")
  })

  it("errors when user directory not found", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/nonexistent"] }),
      },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("not found")
  })

  it("errors when user path is not a directory", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/a-file"] }),
      },
      "/a-file": { content: "hello" },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("not a directory")
  })

  it("deduplicates nested user directories — child skipped", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-a", "/ext-a/sub"] }),
      },
      "/ext-a": { isDir: true },
      "/ext-a/sub": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/ext-a")
  })

  it("deduplicates nested user directories — parent replaces children", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-a/sub1", "/ext-a/sub2", "/ext-a"] }),
      },
      "/ext-a": { isDir: true },
      "/ext-a/sub1": { isDir: true },
      "/ext-a/sub2": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/ext-a")
  })

  it("returns multiple errors for multiple invalid dirs", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/nonexistent", "/project/sub"] }),
      },
      "/project/sub": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(2)
  })

  it("skips invalid dirs but adds valid ones", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/nonexistent", "/ext-valid"] }),
      },
      "/ext-valid": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/ext-valid")
    expect(result.errors).toHaveLength(1)
  })

  it("resolves bare ~ to home directory", () => {
    const home = os.homedir()
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["~"] }),
      },
      [home]: { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe(home)
    expect(result.dirs[0].source).toBe("user")
  })

  it("deduplicates exact duplicate user directories", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-a", "/ext-a"] }),
      },
      "/ext-a": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/ext-a")
  })

  it("errors when user directory conflicts with existing compile_commands dir", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/cc-dir"] }),
      },
      "/cc-dir": { isDir: true },
    })
    setFsHost(fs as any)
    const result = parseUserDirs(CONFIG_DIR_PATH, BASE_PATH, [ccDir("/cc-dir")], CONFIG_DIR_PATH)
    expect(result.dirs).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("conflicts")
  })

  it("errors when user directory is parent of existing external dir (not covered by conflict check)", () => {
    // A user dir that is a PARENT of an existing external dir is NOT caught by the conflict
    // check in parseUserDirs (which only checks if user dir is inside/equal to existing).
    // Instead, the existing dir is later marked as disabled by markDisabledByUserDirs.
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/.ext-search.json": {
        content: JSON.stringify({ user_dirs: ["/ext-parent"] }),
      },
      "/ext-parent": { isDir: true },
    })
    setFsHost(fs as any)
    // existing dir is a child of the user dir
    const result = parseUserDirs(
      CONFIG_DIR_PATH, BASE_PATH,
      [configDir("/ext-parent/child")],
      CONFIG_DIR_PATH,
    )
    // The user dir itself is not inside the existing dir, so it's added
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/ext-parent")
    expect(result.errors).toHaveLength(0)
  })
})

describe("markDisabledByUserDirs", () => {
  it("marks config dir as disabled when inside user dir", () => {
    const configs = [configDir("/ext-a/sub")]
    const users = [{ path: "/ext-a", source: "user" as const }]
    markDisabledByUserDirs(configs, users)
    expect(configs[0].disabled).toBe(true)
  })

  it("marks cc dir as disabled when inside user dir", () => {
    const ccs = [ccDir("/ext-a/sub")]
    const users = [{ path: "/ext-a", source: "user" as const }]
    markDisabledByUserDirs(ccs, users)
    expect(ccs[0].disabled).toBe(true)
  })

  it("does not mark user dirs as disabled", () => {
    const allDirs: ExternalDir[] = [
      { path: "/ext-a", source: "user" },
      { path: "/ext-b", source: "config" },
    ]
    const users = [{ path: "/ext-a", source: "user" as const }]
    markDisabledByUserDirs(allDirs, users)
    expect(allDirs[0].disabled).toBeUndefined()
    expect(allDirs[1].disabled).toBeUndefined()
  })

  it("does not mark unrelated dirs as disabled", () => {
    const configs = [configDir("/other-project")]
    const users = [{ path: "/ext-a", source: "user" as const }]
    markDisabledByUserDirs(configs, users)
    expect(configs[0].disabled).toBeUndefined()
  })

  it("handles empty arrays", () => {
    expect(() => markDisabledByUserDirs([], [])).not.toThrow()
  })

  it("repeated disabled is not destructive", () => {
    const configs = [configDir("/ext-a/sub")]
    configs[0].disabled = true
    const users = [{ path: "/ext-a", source: "user" as const }]
    markDisabledByUserDirs(configs, users)
    expect(configs[0].disabled).toBe(true)
  })

  it("marks dir as disabled when path exactly matches user dir", () => {
    const allDirs: ExternalDir[] = [
      { path: "/ext-a", source: "config" },
      { path: "/ext-b", source: "compile_commands" },
    ]
    const users = [{ path: "/ext-a", source: "user" as const }]
    markDisabledByUserDirs(allDirs, users)
    expect(allDirs[0].disabled).toBe(true)
    expect(allDirs[1].disabled).toBeUndefined()
  })

  it("marks multiple dirs as disabled in a single call", () => {
    const allDirs: ExternalDir[] = [
      { path: "/ext-a/child1", source: "config" },
      { path: "/ext-a/child2", source: "compile_commands" },
      { path: "/unrelated", source: "config" },
    ]
    const users = [{ path: "/ext-a", source: "user" as const }]
    markDisabledByUserDirs(allDirs, users)
    expect(allDirs[0].disabled).toBe(true)
    expect(allDirs[1].disabled).toBe(true)
    expect(allDirs[2].disabled).toBeUndefined()
  })
})
