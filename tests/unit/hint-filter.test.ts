import { describe, it, expect } from "vitest"
import { findParentDir, computeHintDirs } from "../../plugins/ext-search/src/search"

describe("findParentDir", () => {
  const dirs = ["/mono/shared-types", "/mono/common-utils", "/other/libs"]

  it("returns dir when file is directly inside it", () => {
    expect(findParentDir("/mono/shared-types/types.ts", dirs)).toBe("/mono/shared-types")
  })

  it("returns dir for nested file", () => {
    expect(findParentDir("/mono/common-utils/src/helpers.ts", dirs)).toBe("/mono/common-utils")
  })

  it("returns most specific dir when dirs overlap", () => {
    const overlapDirs = ["/mono", "/mono/shared-types"]
    expect(findParentDir("/mono/shared-types/types.ts", overlapDirs)).toBe("/mono/shared-types")
  })

  it("returns null for file not in any dir", () => {
    expect(findParentDir("/unrelated/file.ts", dirs)).toBeNull()
  })

  it("returns dir when file path equals dir", () => {
    expect(findParentDir("/mono/shared-types", dirs)).toBe("/mono/shared-types")
  })

  it("handles empty dirs array", () => {
    expect(findParentDir("/mono/shared-types/types.ts", [])).toBeNull()
  })

  it("does not match partial segment", () => {
    const prefixDirs = ["/mono/shared"]
    expect(findParentDir("/mono/shared-types/types.ts", prefixDirs)).toBeNull()
  })
})

describe("computeHintDirs", () => {
  it("returns empty when all results fit in budget", () => {
    const totalCounts = new Map<string, number>([
      ["/a", 10],
      ["/b", 5],
    ])
    const limitedCounts = new Map<string, number>([
      ["/a", 10],
      ["/b", 5],
    ])
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a", "/b"])).toEqual([])
  })

  it("returns dir with truncated results", () => {
    const totalCounts = new Map<string, number>([
      ["/a", 30],
      ["/b", 20],
    ])
    const limitedCounts = new Map<string, number>([
      ["/a", 25],
      ["/b", 15],
    ])
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a", "/b"])).toEqual(["/a", "/b"])
  })

  it("excludes dir with zero total results", () => {
    const totalCounts = new Map<string, number>([
      ["/a", 10],
      ["/b", 0],
    ])
    const limitedCounts = new Map<string, number>([
      ["/a", 5],
    ])
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a", "/b", "/c"])).toEqual(["/a"])
  })

  it("excludes dir where all results fit", () => {
    const totalCounts = new Map<string, number>([
      ["/a", 10],
      ["/b", 20],
    ])
    const limitedCounts = new Map<string, number>([
      ["/a", 10],
      ["/b", 5],
    ])
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a", "/b"])).toEqual(["/b"])
  })

  it("includes dir with results but zero included", () => {
    const totalCounts = new Map<string, number>([
      ["/a", 15],
    ])
    const limitedCounts = new Map<string, number>()
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a"])).toEqual(["/a"])
  })

  it("preserves order of resolvedDirs", () => {
    const totalCounts = new Map<string, number>([
      ["/c", 10],
      ["/a", 10],
      ["/b", 10],
    ])
    const limitedCounts = new Map<string, number>([
      ["/c", 5],
      ["/a", 5],
      ["/b", 5],
    ])
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a", "/b", "/c"])).toEqual(["/a", "/b", "/c"])
  })

  it("returns empty for empty total counts", () => {
    const totalCounts = new Map<string, number>()
    const limitedCounts = new Map<string, number>()
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a", "/b"])).toEqual([])
  })

  it("excludes dir not present in limited and with zero total", () => {
    const totalCounts = new Map<string, number>([
      ["/a", 5],
    ])
    const limitedCounts = new Map<string, number>([
      ["/a", 5],
    ])
    expect(computeHintDirs(totalCounts, limitedCounts, ["/a", "/b"])).toEqual([])
  })
})
