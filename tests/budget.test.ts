import { describe, it, expect } from "vitest"
import {
  TOTAL_BUDGET,
  countNonEmptyLines,
  calculateBudget,
  buildHint,
  mergeExternalOutput,
} from "../plugins/ext-search/src/budget"

describe("countNonEmptyLines", () => {
  it("returns 0 for empty string", () => {
    expect(countNonEmptyLines("")).toBe(0)
  })

  it("counts non-empty lines", () => {
    expect(countNonEmptyLines("a\nb\nc")).toBe(3)
  })

  it("ignores empty and whitespace-only lines", () => {
    expect(countNonEmptyLines("a\n\n  \nb")).toBe(2)
  })

  it("handles trailing newline", () => {
    expect(countNonEmptyLines("a\nb\n")).toBe(2)
  })
})

describe("calculateBudget", () => {
  it("returns TOTAL_BUDGET for empty output", () => {
    expect(calculateBudget("")).toBe(TOTAL_BUDGET)
  })

  it("subtracts non-empty lines from TOTAL_BUDGET", () => {
    const lines = Array(30).fill("some line").join("\n")
    expect(calculateBudget(lines)).toBe(TOTAL_BUDGET - 30)
  })

  it("returns 0 when output has >= TOTAL_BUDGET non-empty lines", () => {
    const lines = Array(150).fill("line").join("\n")
    expect(calculateBudget(lines)).toBe(0)
  })

  it("returns 0 when output has exactly TOTAL_BUDGET non-empty lines", () => {
    const lines = Array(TOTAL_BUDGET).fill("line").join("\n")
    expect(calculateBudget(lines)).toBe(0)
  })

  it("returns 1 when output has TOTAL_BUDGET - 1 non-empty lines", () => {
    const lines = Array(TOTAL_BUDGET - 1).fill("line").join("\n")
    expect(calculateBudget(lines)).toBe(1)
  })

  it("ignores empty lines in the count", () => {
    const lines = Array(50).fill("line").join("\n") + "\n\n\n"
    expect(calculateBudget(lines)).toBe(TOTAL_BUDGET - 50)
  })
})

describe("buildHint", () => {
  it("contains all directory paths", () => {
    const dirs = ["/absolute/path/shared-utils", "/absolute/path/common-utils"]
    const hint = buildHint(dirs)
    expect(hint).toContain("/absolute/path/shared-utils")
    expect(hint).toContain("/absolute/path/common-utils")
  })

  it("contains guidance about deps-read tool", () => {
    const hint = buildHint(["/some/dir"])
    expect(hint).toContain("deps-read tool")
  })

  it("joins multiple dirs with comma", () => {
    const hint = buildHint(["/a", "/b", "/c"])
    expect(hint).toContain("/a, /b, /c")
  })

  it("starts with double newline for separation", () => {
    const hint = buildHint(["/dir"])
    expect(hint.startsWith("\n\n(")).toBe(true)
  })
})

describe("mergeExternalOutput", () => {
  it("returns main output unchanged when external is empty", () => {
    const result = mergeExternalOutput("main output", "")
    expect(result).toBe("main output")
  })

  it("replaces main output when it contains 'No files found'", () => {
    const result = mergeExternalOutput("No files found.\n", "external results")
    expect(result).toBe("external results")
  })

  it("appends external results with separator", () => {
    const result = mergeExternalOutput("main output", "external results")
    expect(result).toBe("main output\n\n--- External dependencies ---\nexternal results")
  })

  it("preserves main output content", () => {
    const result = mergeExternalOutput("line1\nline2", "ext1\next2")
    expect(result).toContain("line1\nline2")
    expect(result).toContain("ext1\next2")
  })
})
