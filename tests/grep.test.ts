import path from "node:path"
import { describe, it, expect } from "vitest"
import { getTestDirs } from "./setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "./helpers"

describe("grep interception", () => {
  it("finds pattern in external dependencies", ({ skip }) => {
    const dirs = getTestDirs()
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

  it("applies include filter for external results", ({ skip }) => {
    const dirs = getTestDirs()
    const events = runOpencodeJson(
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

  it("does not duplicate external dependencies when path is already external", ({ skip }) => {
    const dirs = getTestDirs()
    const events = runOpencodeJson(
      `Use the grep tool to search for "formatDate" in ${dirs.commonUtils}. Set the path parameter to ${dirs.commonUtils}.`,
      dirs.app,
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length === 0) {
      skip()
      return
    }
    const output = grepEvents[0].part!.state!.output
    const extDepsCount = (output.match(/--- External dependencies ---/g) || []).length
    expect(extDepsCount).toBeLessThanOrEqual(1)
  })

  it("skips external search when subdirectory path is narrow", ({ skip }) => {
    const dirs = getTestDirs()
    const subdir = path.join(dirs.app, "src")
    const events = runOpencodeJson(
      `Use the grep tool to search for "narrowHelper" in the subdirectory ${subdir}. Set the path parameter to ${subdir}. Only use grep.`,
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
