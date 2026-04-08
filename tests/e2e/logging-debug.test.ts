import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { describe, it, expect } from "vitest"
import { getTestDirs } from "../setup"
import { runOpencodeJson, findToolEvents, getToolNames } from "../helpers"

function getLogDir(): string {
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
    "opencode",
    "log",
  )
}

function getLatestLogFiles(count: number): string[] {
  const logDir = getLogDir()
  if (!fs.existsSync(logDir)) return []
  const files = fs
    .readdirSync(logDir)
    .filter((f: string) => f.endsWith(".log"))
    .sort()
  return files.slice(-count).map((f: string) => path.join(logDir, f))
}

function collectExtSearchLines(logFiles: string[]): string[] {
  const lines: string[] = []
  for (const logFile of logFiles) {
    try {
      const content = fs.readFileSync(logFile, "utf-8")
      for (const line of content.split("\n")) {
        if (line.includes("service=ext-search")) {
          lines.push(line)
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return lines
}

describe("logging structured fields", () => {
  it("log entries have correct level prefix and service tag", ({ skip }) => {
    const dirs = getTestDirs()

    const events = runOpencodeJson(
      "Use bash to run: echo test-log-structure",
      dirs.app,
    )

    const bashEvents = findToolEvents(events, "bash")
    if (bashEvents.length === 0) {
      const toolNames = getToolNames(events)
      console.log(`  ℹ No bash tool events found. Tools used: ${toolNames.join(", ")}`)
      skip()
      return
    }

    const logFiles = getLatestLogFiles(3)
    const lines = collectExtSearchLines(logFiles)

    expect(lines.length).toBeGreaterThan(0)

    const validLevels = ["INFO  ", "DEBUG ", "WARN  ", "ERROR "]
    const hasValidLevel = lines.some((l) =>
      validLevels.some((pfx) => l.startsWith(pfx)),
    )
    expect(hasValidLevel).toBe(true)
  })

  it("logs initialized message with directory count and rg info", ({ skip }) => {
    const dirs = getTestDirs()

    const events = runOpencodeJson(
      "Use bash to run: echo test-log-init-fields",
      dirs.app,
    )

    const bashEvents = findToolEvents(events, "bash")
    if (bashEvents.length === 0) {
      const toolNames = getToolNames(events)
      console.log(`  ℹ No bash tool events found. Tools used: ${toolNames.join(", ")}`)
      skip()
      return
    }

    const logFiles = getLatestLogFiles(3)
    const lines = collectExtSearchLines(logFiles)

    expect(lines.length).toBeGreaterThan(0)

    const hasInit = lines.some(
      (l) => l.includes("initialized") && l.includes("dirs="),
    )
    expect(hasInit).toBe(true)
  })
})
