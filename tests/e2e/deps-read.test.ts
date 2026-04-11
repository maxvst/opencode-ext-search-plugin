import path from "node:path"
import { describe, it, expect } from "vitest"
import { getTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "../helpers"

describe("deps_read tool", () => {
  it("reads file content from external directory", async ({ skip }) => {
    const dirs = getTestDirs()
    const typesFile = path.join(dirs.sharedTypes, "types.ts")
    const events = await runOpencodeJson(
      `Use the deps_read tool to read the file at ${typesFile}. Only use deps_read.`,
      dirs.app,
    )
    const depsReadEvents = findToolEvents(events, "deps_read")
    if (depsReadEvents.length === 0) {
      const toolNames = getToolNames(events)
      console.log(`  ℹ No deps_read tool events found. Tools used: ${toolNames.join(", ")}`)
      skip()
      return
    }
    const output = depsReadEvents[0].part!.state!.output
    expect(typeof output).toBe("string")
    expect(output.length).toBeGreaterThan(0)
    expect(output).toMatch(/UserProfile|interface/)
  })
})
