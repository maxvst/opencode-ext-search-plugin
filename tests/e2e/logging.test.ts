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

describe("logging via client.app.log", () => {
  it("writes structured log entries to opencode log files", ({ skip }) => {
    const dirs = getTestDirs()

    const beforeFiles = getLatestLogFiles(2)
    const beforeSizes = new Map<string, number>()
    for (const f of beforeFiles) {
      try {
        beforeSizes.set(f, fs.statSync(f).size)
      } catch {
        beforeSizes.set(f, 0)
      }
    }

    const events = runOpencodeJson(
      "Use bash to run: echo test-log-check",
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
    const extSearchLines: string[] = []

    for (const logFile of logFiles) {
      try {
        const content = fs.readFileSync(logFile, "utf-8")
        for (const line of content.split("\n")) {
          if (line.includes("service=ext-search")) {
            extSearchLines.push(line)
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    if (extSearchLines.length === 0) {
      const logDir = getLogDir()
      const allFiles = fs.readdirSync(logDir).filter((f: string) => f.endsWith(".log")).sort()
      const latest = allFiles.slice(-1)[0]
      if (latest) {
        const content = fs.readFileSync(path.join(logDir, latest), "utf-8")
        console.log(
          `  ℹ No ext-search entries in ${latest}. Last 10 lines:\n  ` +
          content.split("\n").slice(-11, -1).join("\n  "),
        )
      }
    }

    expect(extSearchLines.length).toBeGreaterThan(0)

    const hasInitLine = extSearchLines.some(
      (l) => l.includes("ext-search plugin initializing") || l.includes("initialized"),
    )
    expect(hasInitLine).toBe(true)
  })
})
