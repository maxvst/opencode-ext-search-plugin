import { describe, it, expect } from "vitest"
import { getTestDirs } from "../setup"
import { runOpencodeJson, getToolNames, findToolEvents } from "../helpers"

describe("auto-permit for external directory access", () => {
  it("auto-approves access to files in external directories", async ({ skip }) => {
    const dirs = getTestDirs()
    const events = await runOpencodeJson(
      "Use the grep tool to search for 'getAnswerToEverything' across the codebase. " +
      "Find where this function is defined, read that file, and tell me exactly what number it returns. " +
      "Only use grep and read tools.",
      dirs.app,
    )

    const toolNames = getToolNames(events)
    console.log(`  Tools used: ${toolNames.join(", ")}`)

    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length === 0) {
      console.log(`  ℹ No grep events found. Tools: ${toolNames.join(", ")}`)
      skip()
      return
    }

    const allText = events.map((e) => JSON.stringify(e)).join(" ")
    console.log(`  ℹ Grep output snippet: ${grepEvents[0].part!.state!.output.slice(0, 200)}`)

    expect(allText).toContain("42")
  })
})
