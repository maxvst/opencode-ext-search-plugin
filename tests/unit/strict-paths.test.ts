import { describe, it, expect } from "vitest"
import { isAllowedPath } from "../../plugins/ext-search/src/strict-paths"

describe("isAllowedPath", () => {
  const configDir = "/project/team"
  const resolvedDirs = ["/project/shared", "/external/libs"]

  it("allows configDir itself", () => {
    expect(isAllowedPath("/project/team", configDir, resolvedDirs)).toBe(true)
  })

  it("allows subdir of configDir", () => {
    expect(isAllowedPath("/project/team/src", configDir, resolvedDirs)).toBe(true)
    expect(isAllowedPath("/project/team/src/components", configDir, resolvedDirs)).toBe(true)
  })

  it("allows external dir itself", () => {
    expect(isAllowedPath("/project/shared", configDir, resolvedDirs)).toBe(true)
    expect(isAllowedPath("/external/libs", configDir, resolvedDirs)).toBe(true)
  })

  it("allows subdir of external dir", () => {
    expect(isAllowedPath("/project/shared/types", configDir, resolvedDirs)).toBe(true)
    expect(isAllowedPath("/external/libs/utils", configDir, resolvedDirs)).toBe(true)
  })

  it("rejects unrelated path", () => {
    expect(isAllowedPath("/random/dir", configDir, resolvedDirs)).toBe(false)
  })

  it("rejects sibling of configDir", () => {
    expect(isAllowedPath("/project/other-team", configDir, resolvedDirs)).toBe(false)
  })

  it("rejects parent of configDir", () => {
    expect(isAllowedPath("/project", configDir, resolvedDirs)).toBe(false)
  })

  it("handles prefix-like paths without false positive", () => {
    expect(isAllowedPath("/project/team-other", configDir, resolvedDirs)).toBe(false)
    expect(isAllowedPath("/project/shared-other", configDir, resolvedDirs)).toBe(false)
  })

  it("handles empty resolvedDirs", () => {
    expect(isAllowedPath("/project/team/src", configDir, [])).toBe(true)
    expect(isAllowedPath("/project/shared", configDir, [])).toBe(false)
  })

  it("works when configDir also appears in resolvedDirs", () => {
    expect(isAllowedPath("/project/team/src", configDir, [configDir, "/external/libs"])).toBe(true)
    expect(isAllowedPath("/external/libs/utils", configDir, [configDir, "/external/libs"])).toBe(true)
  })

  it("rejects path with trailing separator that is not a subdir", () => {
    expect(isAllowedPath("/project/team-other/", configDir, resolvedDirs)).toBe(false)
  })

  it("handles root path", () => {
    expect(isAllowedPath("/", configDir, resolvedDirs)).toBe(false)
  })
})
