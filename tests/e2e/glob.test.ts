import { describe, it, expect } from "vitest"
import { getTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "../helpers"

describe("glob interception", () => {
  it("finds TypeScript files in external dependencies", ({ skip }) => {
    const dirs = getTestDirs()
    const events = runOpencodeJson(
      'Use the glob tool with pattern "**/*.ts" to find all TypeScript files. Only use the glob tool, nothing else.',
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
    expect(output).toMatch(/types\.ts|helpers\.ts/)
  })
})
