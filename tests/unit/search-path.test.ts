import { describe, it, expect } from "vitest"
import { isOnDirectPath, isNarrowSearchPath } from "../../plugins/ext-search/src/output-meta"
import { filterCoveredDirs } from "../../plugins/ext-search/src/paths"

describe("isOnDirectPath", () => {
  it("returns true when dir equals a", () => {
    expect(isOnDirectPath("/a/b/c", "/a/b/c", "/x/y")).toBe(true)
  })

  it("returns true when dir equals b", () => {
    expect(isOnDirectPath("/x/y", "/a/b/c", "/x/y")).toBe(true)
  })

  it("returns true for intermediate dir between a and b (a deeper)", () => {
    expect(isOnDirectPath("/a/b", "/a/b/c/d", "/a/b")).toBe(true)
    expect(isOnDirectPath("/a/b/c", "/a/b/c/d", "/a/b")).toBe(true)
    expect(isOnDirectPath("/a/b/c/d", "/a/b/c/d", "/a/b")).toBe(true)
  })

  it("returns true for intermediate dir between a and b (b deeper)", () => {
    expect(isOnDirectPath("/x/y/z", "/x", "/x/y/z/w")).toBe(true)
    expect(isOnDirectPath("/x/y/z/w", "/x", "/x/y/z/w")).toBe(true)
    expect(isOnDirectPath("/x", "/x", "/x/y/z/w")).toBe(true)
  })

  it("returns false for dir not on the path", () => {
    expect(isOnDirectPath("/a/x", "/a/b/c", "/a/b")).toBe(false)
    expect(isOnDirectPath("/other", "/a/b/c", "/a/b")).toBe(false)
  })

  it("returns false when a and b are unrelated", () => {
    expect(isOnDirectPath("/c", "/a/b", "/x/y")).toBe(false)
  })

  it("returns true when a and b are the same and dir matches", () => {
    expect(isOnDirectPath("/a/b", "/a/b", "/a/b")).toBe(true)
  })
})

describe("isNarrowSearchPath", () => {
  const worktree = "/project"
  const openDir = "/project/packages/app"
  const configDir = "/project/packages"

  it("returns false when searchPath is undefined", () => {
    expect(isNarrowSearchPath(undefined, worktree, openDir, configDir)).toBe(false)
  })

  it("returns false when searchPath equals worktree", () => {
    expect(isNarrowSearchPath(worktree, worktree, openDir, configDir)).toBe(false)
  })

  it("returns false when searchPath equals openDir", () => {
    expect(isNarrowSearchPath(openDir, worktree, openDir, configDir)).toBe(false)
  })

  it("returns false when searchPath equals configDir", () => {
    expect(isNarrowSearchPath(configDir, worktree, openDir, configDir)).toBe(false)
  })

  it("returns false for dir between openDir and configDir", () => {
    expect(isNarrowSearchPath("/project/packages", worktree, openDir, configDir)).toBe(false)
  })

  it("returns true for dir not on the path between openDir and configDir", () => {
    expect(isNarrowSearchPath("/project/packages/app/src", worktree, openDir, configDir)).toBe(true)
  })

  it("returns true for unrelated dir", () => {
    expect(isNarrowSearchPath("/other/project", worktree, openDir, configDir)).toBe(true)
  })

  it("falls back to old behavior when configDir is null", () => {
    expect(isNarrowSearchPath(undefined, worktree, openDir, null)).toBe(false)
    expect(isNarrowSearchPath(worktree, worktree, openDir, null)).toBe(false)
    expect(isNarrowSearchPath(openDir, worktree, openDir, null)).toBe(false)
    expect(isNarrowSearchPath("/project/packages", worktree, openDir, null)).toBe(true)
  })

  it("handles deep nesting: openDir several levels below configDir", () => {
    const deepOpenDir = "/monorepo/team/services/web/my-app"
    const deepConfigDir = "/monorepo/team"
    expect(isNarrowSearchPath("/monorepo/team/services", "/monorepo", deepOpenDir, deepConfigDir)).toBe(false)
    expect(isNarrowSearchPath("/monorepo/team/services/web", "/monorepo", deepOpenDir, deepConfigDir)).toBe(false)
    expect(isNarrowSearchPath("/monorepo/team/services/web/my-app", "/monorepo", deepOpenDir, deepConfigDir)).toBe(false)
    expect(isNarrowSearchPath("/monorepo/team/services/web/my-app/src", "/monorepo", deepOpenDir, deepConfigDir)).toBe(true)
  })
})

describe("filterCoveredDirs", () => {
  it("removes dir equal to searchPath", () => {
    expect(filterCoveredDirs(["/a/b", "/c/d"], "/a/b")).toEqual(["/c/d"])
  })

  it("removes dir inside searchPath", () => {
    expect(filterCoveredDirs(["/a/b/c", "/x/y"], "/a/b")).toEqual(["/x/y"])
  })

  it("keeps dir outside searchPath", () => {
    expect(filterCoveredDirs(["/a/b", "/x/y"], "/c/d")).toEqual(["/a/b", "/x/y"])
  })

  it("keeps dir that is a parent of searchPath", () => {
    expect(filterCoveredDirs(["/a"], "/a/b")).toEqual(["/a"])
  })

  it("returns empty array when all dirs are covered", () => {
    expect(filterCoveredDirs(["/a/b/c", "/a/b/d"], "/a/b")).toEqual([])
  })

  it("handles prefix-like paths correctly (no false match)", () => {
    expect(filterCoveredDirs(["/a/bc"], "/a/b")).toEqual(["/a/bc"])
  })
})
