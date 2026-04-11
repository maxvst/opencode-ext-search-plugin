import { describe, it, expect } from "vitest"
import { getTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents, getToolNames, type ToolEvent } from "../helpers"

describe("grep interception", () => {
  it("finds pattern in external dependencies", async ({ skip }) => {
    const dirs = getTestDirs()
    const events = await runOpencodeJson(
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

  it("applies include filter for external results", async ({ skip }) => {
    const dirs = getTestDirs()
    const events = await runOpencodeJson(
      'Use the grep tool to search for "formatDate" in "*.ts" files only. Use include "*.ts".',
      dirs.app,
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length === 0) {
      skip()
      return
    }
    const output = grepEvents[0].part!.state!.output
    expect(output).toMatch(/External dependencies|helpers\.ts/)
  })

  it("does not duplicate external dependencies when path is already external", async ({ skip }) => {
    const dirs = getTestDirs()
    const events = await runOpencodeJson(
      'Use the grep tool to search for "formatDate". Set the path parameter to "../../common-utils". Only use grep.',
      dirs.app,
    )
    const allGrep = events.filter(
      (e) => e.type === "tool_use" && (e as any).part?.tool === "grep",
    ) as ToolEvent[]
    if (allGrep.length === 0) {
      const toolNames = getToolNames(events)
      console.log(`  ℹ No grep tool events found. Tools used: ${toolNames.join(", ")}`)
      skip()
      return
    }
    const grepEvent = allGrep.find((e) => e.part?.state?.status === "completed")
    if (!grepEvent) {
      const statuses = allGrep.map((e) => e.part?.state?.status ?? "no-state")
      console.log(`  ℹ Grep completed with status: ${statuses.join(", ")}`)
      return
    }
    const output = grepEvent.part!.state!.output
    const extDepsCount = (output.match(/--- External dependencies ---/g) || []).length
    expect(extDepsCount).toBeLessThanOrEqual(1)
  })

  it("skips external search when subdirectory path is narrow", async ({ skip }) => {
    const dirs = getTestDirs()
    const events = await runOpencodeJson(
      'Use the grep tool to search for "narrowHelper" in the subdirectory "src". Set the path parameter to "src". Only use grep.',
      dirs.app,
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length === 0) {
      skip()
      return
    }
    const output = grepEvents[0].part!.state!.output
    expect(output).not.toContain("External dependencies")
  })
})
