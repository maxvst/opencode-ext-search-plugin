import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  parseCompileCommands,
  markDisabledConfigDirs,
  addDirNoNested,
  isSubdirOf,
  isOrInsideAny,
} from "../../plugins/ext-search/src/compile-commands"
import { setFsHost, resetFsHost } from "../../plugins/ext-search/src/fs-host"
import type { ExternalDir } from "../../plugins/ext-search/src/types"

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

function ccJson(entries: Array<{ directory: string; file: string }>): string {
  return JSON.stringify(entries)
}

function configDir(path: string): ExternalDir {
  return { path, source: "config" }
}

function ccDir(path: string): ExternalDir {
  return { path, source: "compile_commands" }
}

describe("isSubdirOf", () => {
  it("returns true for exact match", () => {
    expect(isSubdirOf("/a/b", "/a/b")).toBe(true)
  })
  it("returns true for child", () => {
    expect(isSubdirOf("/a/b/c", "/a/b")).toBe(true)
  })
  it("returns false for parent", () => {
    expect(isSubdirOf("/a/b", "/a/b/c")).toBe(false)
  })
  it("returns false for sibling", () => {
    expect(isSubdirOf("/a/bc", "/a/b")).toBe(false)
  })
})

describe("isOrInsideAny", () => {
  it("returns true when candidate equals a dir in list", () => {
    expect(isOrInsideAny("/a/b", ["/a/b", "/x/y"])).toBe(true)
  })
  it("returns true when candidate is subdir", () => {
    expect(isOrInsideAny("/a/b/c", ["/a/b"])).toBe(true)
  })
  it("returns false for unrelated", () => {
    expect(isOrInsideAny("/z", ["/a/b"])).toBe(false)
  })
  it("returns false for empty list", () => {
    expect(isOrInsideAny("/a/b", [])).toBe(false)
  })
})

describe("addDirNoNested", () => {
  it("adds to empty set", () => {
    const set = new Set<string>()
    addDirNoNested(set, "/a/b")
    expect(set.has("/a/b")).toBe(true)
  })
  it("skips child of existing", () => {
    const set = new Set<string>(["/a/b"])
    addDirNoNested(set, "/a/b/c")
    expect(set.has("/a/b/c")).toBe(false)
    expect(set.has("/a/b")).toBe(true)
  })
  it("replaces children with parent", () => {
    const set = new Set<string>(["/a/b/c", "/a/b/d"])
    addDirNoNested(set, "/a/b")
    expect(set.has("/a/b")).toBe(true)
    expect(set.has("/a/b/c")).toBe(false)
    expect(set.has("/a/b/d")).toBe(false)
  })
  it("skips exact duplicate", () => {
    const set = new Set<string>(["/a/b"])
    addDirNoNested(set, "/a/b")
    expect(set.size).toBe(1)
  })
  it("adds unrelated dir", () => {
    const set = new Set<string>(["/a/b"])
    addDirNoNested(set, "/x/y")
    expect(set.has("/x/y")).toBe(true)
    expect(set.size).toBe(2)
  })
})

describe("parseCompileCommands", () => {
  const configDirPath = "/project"

  beforeEach(() => { resetFsHost() })
  afterEach(() => { resetFsHost() })

  it("extracts unique directories from compile_commands.json", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/libA", file: "src/main.cpp" },
          { directory: "/external/libA", file: "src/util.cpp" },
          { directory: "/external/libB", file: "core.c" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(2)
    const paths = result.dirs.map((d) => d.path).sort()
    expect(paths).toEqual(["/external/libA/src", "/external/libB"])
    expect(result.dirs.every((d) => d.source === "compile_commands")).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("uses absolute file path when file is absolute", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/some/dir", file: "/external/lib/src/main.cpp" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/external/lib/src")
  })

  it("resolves relative file against directory", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/lib", file: "sub/file.c" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/external/lib/sub")
  })

  it("deduplicates: child is skipped when parent already in set", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/lib", file: "src/main.cpp" },
          { directory: "/external/lib", file: "src/sub/util.cpp" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/external/lib/src")
  })

  it("deduplicates: parent replaces children", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/lib", file: "src/sub/a/util.cpp" },
          { directory: "/external/lib", file: "src/sub/b/util.cpp" },
          { directory: "/external/lib", file: "src/main.cpp" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/external/lib/src")
  })

  it("skips dirs inside configDir", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/project", file: "src/main.cpp" },
          { directory: "/project", file: "lib/util.cpp" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(0)
  })

  it("skips dirs inside config external dirs", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/lib", file: "src/main.cpp" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [configDir("/external/lib")])
    expect(result.dirs).toHaveLength(0)
  })

  it("skips dirs equal to config external dirs", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: ccJson([
          { directory: "/external/lib", file: "file.c" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [configDir("/external/lib")])
    expect(result.dirs).toHaveLength(0)
  })

  it("returns error when file not found", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build": { isDir: true },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(0)
    expect(result.error).toContain("not found")
  })

  it("returns error when JSON is invalid", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": { content: "{ invalid" },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(0)
    expect(result.error).toContain("Failed to parse")
  })

  it("handles empty array of entries", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": { content: "[]" },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(0)
    expect(result.error).toBeUndefined()
  })

  it("skips entries without directory or file fields", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: JSON.stringify([
          { directory: "/ext", file: "a.c" },
          { directory: "/ext" },
          { file: "b.c" },
          {},
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/ext")
  })

  it("resolves ccDir relative to configDir", () => {
    const fs = createMockFs({
      "/myconfig": { isDir: true },
      "/myconfig/output/compile_commands.json": {
        content: ccJson([
          { directory: "/external/lib", file: "main.c" },
        ]),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("output", "/myconfig", [])
    expect(result.dirs).toHaveLength(1)
    expect(result.dirs[0].path).toBe("/external/lib")
  })

  it("returns error when JSON is not an array", () => {
    const fs = createMockFs({
      "/project": { isDir: true },
      "/project/build/compile_commands.json": {
        content: JSON.stringify({ directory: "/foo", file: "bar.c" }),
      },
    })
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(0)
    expect(result.error).toContain("not an array")
  })

  it("returns error when readFileSync fails", () => {
    const fs = {
      existsSync: () => true,
      readFileSync: () => {
        throw new Error("EACCES: permission denied")
      },
      statSync: () => ({ isDirectory: () => false, size: 0 }),
    }
    setFsHost(fs as any)

    const result = parseCompileCommands("build", configDirPath, [])
    expect(result.dirs).toHaveLength(0)
    expect(result.error).toContain("Failed to read")
  })
})

describe("markDisabledConfigDirs", () => {
  it("marks config dir as disabled when inside cc dir", () => {
    const configs = [configDir("/external/lib/src")]
    const ccs = [ccDir("/external/lib")]
    markDisabledConfigDirs(configs, ccs)
    expect(configs[0].disabled).toBe(true)
  })

  it("does not mark config dir when not inside cc dir", () => {
    const configs = [configDir("/other/lib")]
    const ccs = [ccDir("/external/lib")]
    markDisabledConfigDirs(configs, ccs)
    expect(configs[0].disabled).toBeUndefined()
  })

  it("marks config dir as disabled when equal to cc dir", () => {
    const configs = [configDir("/external/lib")]
    const ccs = [ccDir("/external/lib")]
    markDisabledConfigDirs(configs, ccs)
    expect(configs[0].disabled).toBe(true)
  })

  it("handles empty arrays", () => {
    const configs: ExternalDir[] = []
    const ccs: ExternalDir[] = []
    expect(() => markDisabledConfigDirs(configs, ccs)).not.toThrow()
  })
})
