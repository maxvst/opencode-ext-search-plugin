import { describe, it, expect } from "vitest"
import { getDeepTestDirs } from "./setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "./helpers"

describe("deep nesting with intermediate config", () => {
  it("finds pattern in external deps despite intermediate opencode.json", ({ skip }) => {
    const dirs = getDeepTestDirs()
    const events = runOpencodeJson(
      'Use the grep tool to search for the pattern "UserProfile" across the codebase. Only use the grep tool, nothing else.',
      dirs.app,
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length === 0) {
      const toolNames = getToolNames(events)
      console.log(`  ℹ No grep tool events found. Tools used: ${toolNames.join(", ")}`)
      skip()
      return
    }
    const output = grepEvents[0].part!.state!.output
    expect(output).toContain("External dependencies")
    expect(output).toContain("UserProfile")
    expect(output).toContain("types.ts")
  })

  it("finds files in external deps via glob with deep nesting", ({ skip }) => {
    const dirs = getDeepTestDirs()
    const events = runOpencodeJson(
      'Use the glob tool to search for "**/*.ts" files. Only use the glob tool, nothing else.',
      dirs.app,
    )
    const globEvents = findToolEvents(events, "glob")
    if (globEvents.length === 0) {
      const toolNames = getToolNames(events)
      console.log(`  ℹ No glob tool events found. Tools used: ${toolNames.join(", ")}`)
      skip()
      return
    }
    const output = globEvents[0].part!.state!.output
    expect(output).toContain("External dependencies")
    expect(output).toContain("helpers.ts")
    expect(output).toContain("types.ts")
  })
})
