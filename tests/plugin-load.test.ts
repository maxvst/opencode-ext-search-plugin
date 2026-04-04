import { describe, it, expect } from "vitest"
import { getTestDirs } from "./setup"
import { runOpencode } from "./helpers"

describe("plugin loading", () => {
  it("loads plugin without errors", () => {
    const dirs = getTestDirs()
    const debugResult = runOpencode(["debug", "config"], dirs.app)
    const stderrLower = debugResult.stderr.toLowerCase()
    const hasPluginError = stderrLower.includes("error") && stderrLower.includes("plugin")
    expect(hasPluginError).toBe(false)
  })
})
