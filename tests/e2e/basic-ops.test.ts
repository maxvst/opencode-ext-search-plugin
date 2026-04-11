import { describe, it, expect } from "vitest"
import { getTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents } from "../helpers"

describe("basic ops", () => {
  it("executes basic bash command in test dir", async () => {
    const dirs = getTestDirs()
    const events = await runOpencodeJson("Use bash to run: echo test-plugin-ok", dirs.app)
    const bashEvents = findToolEvents(events, "bash")
    expect(bashEvents.length).toBeGreaterThan(0)
    const output = bashEvents[0].part!.state!.output
    expect(output).toContain("test-plugin-ok")
  })
})
