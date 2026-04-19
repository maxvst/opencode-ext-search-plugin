import { describe, it, expect } from "vitest"
import { getCcTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "../helpers"

describe("compile_commands-dir e2e", () => {
  it("finds pattern from compile_commands external dir via grep", async ({ skip }) => {
    const dirs = getCcTestDirs()
    const events = await runOpencodeJson(
      'Use the grep tool to search for the pattern "CcMathAdd" across the codebase. Only use the grep tool, nothing else.',
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
    expect(output).toContain("CcMathAdd")
    expect(output).toContain("cc_math.h")
  })

  it("finds files from compile_commands external dir via glob", async ({ skip }) => {
    const dirs = getCcTestDirs()
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
    expect(output).toContain("cc_math.h")
  })

  it("finds type from compile_commands external dir via grep", async ({ skip }) => {
    const dirs = getCcTestDirs()
    const events = await runOpencodeJson(
      'Use the grep tool to search for the pattern "CcExternalPoint" across the codebase. Only use the grep tool, nothing else.',
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
    expect(output).toContain("CcExternalPoint")
    expect(output).toContain("cc_types.h")
  })
})
