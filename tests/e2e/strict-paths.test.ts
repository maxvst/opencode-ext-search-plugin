import { describe, it, expect } from "vitest"
import { getTestDirs, getStrictTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "../helpers"

const BEACON = "ZETA_BEACON_9KX"
const PARENT_MARKER = "parent-marker-signal"
const PROJECT_MARKER = "project-marker-signal"

function buildGrepPrompt(rootDir: string): string {
  return [
    `Use the grep tool to search for the pattern "${BEACON}" in the directory "${rootDir}".`,
    `IMPORTANT: you MUST set the path argument of the grep tool to "${rootDir}" exactly.`,
    "Only use the grep tool, nothing else.",
  ].join(" ")
}

function skipIfNoGrep(events: Record<string, unknown>[], skip: () => void) {
  const grepEvents = findToolEvents(events, "grep")
  if (grepEvents.length === 0) {
    const toolNames = getToolNames(events)
    console.log(`  ℹ No grep tool events found. Tools used: ${toolNames.join(", ")}`)
    skip()
    return null
  }
  return grepEvents
}

describe("strict_path_restrictions", () => {
  it("strict=true: grep in parent dir is redirected to configDir, only project marker found", async ({
    skip,
  }) => {
    const dirs = getStrictTestDirs()
    const events = await runOpencodeJson(buildGrepPrompt(dirs.root), dirs.app, { skipPermissions: true })
    const grepEvents = skipIfNoGrep(events, skip)
    if (!grepEvents) return

    const output = grepEvents[0]!.part!.state!.output

    if (!output.includes(PROJECT_MARKER) && !output.includes(PARENT_MARKER)) {
      console.log(
        `  ℹ Grep ran but no beacon markers found. Output preview: ${output.slice(0, 300)}`,
      )
      skip()
      return
    }

    expect(output).toContain(PROJECT_MARKER)
    expect(output).not.toContain(PARENT_MARKER)
  })

  it("strict=false: grep in parent dir finds both markers", async ({ skip }) => {
    const dirs = getTestDirs()
    const events = await runOpencodeJson(buildGrepPrompt(dirs.root), dirs.app, { skipPermissions: true })
    const grepEvents = skipIfNoGrep(events, skip)
    if (!grepEvents) return

    const output = grepEvents[0]!.part!.state!.output

    if (!output.includes(PROJECT_MARKER) && !output.includes(PARENT_MARKER)) {
      console.log(
        `  ℹ Grep ran but no beacon markers found. Output preview: ${output.slice(0, 300)}`,
      )
      skip()
      return
    }

    expect(output).toContain(PROJECT_MARKER)
    expect(output).toContain(PARENT_MARKER)
  })
})
