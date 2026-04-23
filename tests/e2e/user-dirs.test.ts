import { describe, it, expect } from "vitest"
import { getUserTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "../helpers"

describe("user-dirs e2e", () => {
  it("finds pattern from user external dir via grep", async ({ skip }) => {
    const dirs = getUserTestDirs()
    const events = await runOpencodeJson(
      'Use the grep tool to search for the pattern "UserMathSub" across the codebase. Only use the grep tool, nothing else.',
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
    expect(output).toContain("UserMathSub")
    expect(output).toContain("user_math.h")
  })

  it("finds files from user external dir via glob", async ({ skip }) => {
    const dirs = getUserTestDirs()
    const events = await runOpencodeJson(
      'Use the glob tool to search for "**/*.h" files across the codebase. Only use the glob tool, nothing else.',
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
    expect(output).toContain("user_math.h")
  })

  it("finds type from user external dir via grep", async ({ skip }) => {
    const dirs = getUserTestDirs()
    const events = await runOpencodeJson(
      'Use the grep tool to search for the pattern "UserExternalPoint" across the codebase. Only use the grep tool, nothing else.',
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
    expect(output).toContain("UserExternalPoint")
    expect(output).toContain("user_types.h")
  })
})
