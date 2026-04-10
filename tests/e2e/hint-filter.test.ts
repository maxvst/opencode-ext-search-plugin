import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { runOpencodeJson, findToolEvents, getToolNames } from "../helpers"

const PLUGIN_DIR = path.resolve(__dirname, "../../plugins/ext-search")

interface ScenarioConfig {
  appFileCount: number
  dirAFiles: number
  dirBFiles: number
}

function createTsFiles(dir: string, count: number): void {
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(path.join(dir, `f${i}.ts`), `export const v${i} = ${i};\n`)
  }
}

function setupMonorepo(config: ScenarioConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ext-search-hint-"))

  const projectDir = path.join(root, "project")
  const appDir = path.join(projectDir, "app")
  const extA = path.join(root, "ext-a")
  const extB = path.join(root, "ext-b")
  const pluginDest = path.join(projectDir, ".opencode", "plugins", "ext-search")

  fs.mkdirSync(appDir, { recursive: true })
  fs.mkdirSync(extA, { recursive: true })
  fs.mkdirSync(extB, { recursive: true })
  fs.mkdirSync(path.dirname(pluginDest), { recursive: true })

  createTsFiles(appDir, config.appFileCount)
  createTsFiles(extA, config.dirAFiles)
  createTsFiles(extB, config.dirBFiles)

  fs.cpSync(PLUGIN_DIR, pluginDest, { recursive: true })

  const opencodeConfig = {
    plugin: [
      [
        "./.opencode/plugins/ext-search",
        {
          root: "../",
          directories: ["ext-a", "ext-b"],
          excludePatterns: ["node_modules", ".git", "dist"],
          maxResults: 50,
        },
      ],
    ],
  }
  fs.writeFileSync(
    path.join(projectDir, "opencode.json"),
    JSON.stringify(opencodeConfig, null, 2),
  )

  return { root, appDir, extA, extB }
}

function cleanupMonorepo(root: string): void {
  fs.rmSync(root, { recursive: true, force: true })
}

function runGlobAndGetOutput(appDir: string): string | null {
  const events = runOpencodeJson(
    'Use the glob tool with pattern "**/*.ts" to find all TypeScript files. Only use the glob tool, nothing else.',
    appDir,
  )
  const globEvents = findToolEvents(events, "glob")
  if (globEvents.length === 0) {
    const toolNames = getToolNames(events)
    console.log(`  ℹ No glob tool events. Tools: ${toolNames.join(", ")}`)
    return null
  }
  return globEvents[0].part!.state!.output
}

describe("hint filtering by search results (e2e)", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const r of roots) {
      cleanupMonorepo(r)
    }
    roots.length = 0
  })

  it("hints only dirs with truncated results, excludes dir that fits", ({ skip }) => {
    const { root, appDir, extA, extB } = setupMonorepo({
      appFileCount: 90,
      dirAFiles: 3,
      dirBFiles: 40,
    })
    roots.push(root)

    const output = runGlobAndGetOutput(appDir)
    if (!output) {
      skip()
      return
    }

    expect(output).toContain("External dependencies")
    const hintMatch = output.match(/may contain additional matches: (.*)\.\n/)
    expect(hintMatch).toBeTruthy()
    expect(hintMatch![1]).not.toContain(extA)
    expect(hintMatch![1]).toContain(extB)
  })

  it("does not add hint when all results fit in budget", ({ skip }) => {
    const { root, appDir } = setupMonorepo({
      appFileCount: 10,
      dirAFiles: 5,
      dirBFiles: 5,
    })
    roots.push(root)

    const output = runGlobAndGetOutput(appDir)
    if (!output) {
      skip()
      return
    }

    expect(output).toContain("External dependencies")
    expect(output).not.toContain("may contain additional matches")
  })

  it("hints both dirs when both have truncated results", ({ skip }) => {
    const { root, appDir, extA, extB } = setupMonorepo({
      appFileCount: 90,
      dirAFiles: 40,
      dirBFiles: 40,
    })
    roots.push(root)

    const output = runGlobAndGetOutput(appDir)
    if (!output) {
      skip()
      return
    }

    expect(output).toContain("External dependencies")
    const hintMatch = output.match(/may contain additional matches: (.*)\.\n/)
    expect(hintMatch).toBeTruthy()
    expect(hintMatch![1]).toContain(extA)
    expect(hintMatch![1]).toContain(extB)
  })

  it("hints all filtered dirs when budget is 0", ({ skip }) => {
    const { root, appDir, extA, extB } = setupMonorepo({
      appFileCount: 110,
      dirAFiles: 5,
      dirBFiles: 5,
    })
    roots.push(root)

    const output = runGlobAndGetOutput(appDir)
    if (!output) {
      skip()
      return
    }

    expect(output).toContain("may contain additional matches")
    expect(output).toContain(extA)
    expect(output).toContain(extB)
  })

  it("excludes dir with no results from hint", ({ skip }) => {
    const { root, appDir, extA, extB } = setupMonorepo({
      appFileCount: 90,
      dirAFiles: 0,
      dirBFiles: 40,
    })
    roots.push(root)

    const output = runGlobAndGetOutput(appDir)
    if (!output) {
      skip()
      return
    }

    expect(output).toContain("External dependencies")
    const hintMatch = output.match(/may contain additional matches: (.*)\.\n/)
    expect(hintMatch).toBeTruthy()
    expect(hintMatch![1]).not.toContain(extA)
    expect(hintMatch![1]).toContain(extB)
  })
})
