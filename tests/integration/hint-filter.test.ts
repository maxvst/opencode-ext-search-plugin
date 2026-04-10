import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "fs"
import path from "path"
import os from "os"
import pluginModule, { _testing } from "../../plugins/ext-search/dist/index.js"

function createMockClient() {
  return {
    client: {
      showToast: vi.fn(async () => {}),
      app: {
        log: vi.fn(async () => {}),
      },
    },
  }
}

function makeConfig(): string {
  return JSON.stringify({
    plugin: [["/plugins/ext-search", { directories: [] }]],
  })
}

function createMockFs(externalDirs: string[]) {
  const entries: Record<string, { content?: string; isDir?: boolean } | null> = {
    "/plugins/ext-search": { isDir: true },
    "/tmp-test": { isDir: true },
    "/tmp-test/opencode.json": { content: makeConfig() },
    "/tmp-test/app": { isDir: true },
  }
  for (const d of externalDirs) {
    entries[d] = { isDir: true }
  }
  return {
    existsSync(p: string) {
      return p in entries && entries[p] !== null
    },
    readFileSync(p: string, _enc: string) {
      const entry = entries[p]
      if (!entry || entry.content === undefined) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`)
        ;(err as any).code = "ENOENT"
        throw err
      }
      return entry.content
    },
    statSync(p: string) {
      const entry = entries[p]
      if (!entry) {
        const err = new Error(`ENOENT: no such file or directory, stat '${p}'`)
        ;(err as any).code = "ENOENT"
        throw err
      }
      return {
        isDirectory: () => entry.isDir ?? false,
        size: entry.content?.length ?? 0,
      }
    },
  }
}

describe("hint filtering by search results", () => {
  let tempDir: string
  let dirA: string
  let dirB: string

  beforeEach(() => {
    _testing.resetAll()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hint-test-"))
    dirA = path.join(tempDir, "a")
    dirB = path.join(tempDir, "b")
  })

  afterEach(() => {
    _testing.resetAll()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createFiles(dir: string, count: number) {
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 0; i < count; i++) {
      fs.writeFileSync(path.join(dir, `f${i}.ts`), `export const v${i} = ${i};\n`)
    }
  }

  async function setupHook(dirAFiles: number, dirBFiles: number) {
    createFiles(dirA, dirAFiles)
    createFiles(dirB, dirBFiles)

    const { client } = createMockClient()
    const mockFs = createMockFs([dirA, dirB])
    _testing.setFsHost(mockFs as any)
    _testing.setPluginDirOverride("/plugins/ext-search")
    _testing.setRgPathOverride(null)

    const result = await pluginModule.server(
      { directory: "/tmp-test/app", worktree: "/tmp-test", client } as any,
      { directories: [dirA, dirB] },
    )
    return result?.["tool.execute.after"] as Function
  }

  it("hints only dirs with truncated results, excludes dir that fits", async () => {
    const hook = await setupHook(5, 40)

    const mainLines = Array(80).fill("main result line").join("\n")
    const output = { output: mainLines, metadata: {} }

    await hook(
      { tool: "glob", args: { pattern: "**/*.ts" } },
      output,
    )

    expect(output.output).toContain("External dependencies")
    const hintMatch = output.output.match(/may contain additional matches: (.*)\.\n/)
    expect(hintMatch).toBeTruthy()
    expect(hintMatch![1]).not.toContain(dirA)
    expect(hintMatch![1]).toContain(dirB)
  })

  it("does not add hint when all results fit in budget", async () => {
    const hook = await setupHook(5, 5)

    const mainLines = Array(50).fill("main result line").join("\n")
    const output = { output: mainLines, metadata: {} }

    await hook(
      { tool: "glob", args: { pattern: "**/*.ts" } },
      output,
    )

    expect(output.output).toContain("External dependencies")
    expect(output.output).not.toContain("may contain additional matches")
  })

  it("hints both dirs when both have truncated results", async () => {
    const hook = await setupHook(40, 40)

    const mainLines = Array(80).fill("main result line").join("\n")
    const output = { output: mainLines, metadata: {} }

    await hook(
      { tool: "glob", args: { pattern: "**/*.ts" } },
      output,
    )

    expect(output.output).toContain("External dependencies")
    const hintMatch = output.output.match(/may contain additional matches: (.*)\.\n/)
    expect(hintMatch).toBeTruthy()
    expect(hintMatch![1]).toContain(dirA)
    expect(hintMatch![1]).toContain(dirB)
  })

  it("hints all filtered dirs when budget is 0", async () => {
    const hook = await setupHook(5, 5)

    const bigOutput = Array(101).fill("line").join("\n")
    const output = { output: bigOutput, metadata: {} }

    await hook(
      { tool: "glob", args: { pattern: "**/*.ts" } },
      output,
    )

    expect(output.output).toContain("may contain additional matches")
    expect(output.output).toContain(dirA)
    expect(output.output).toContain(dirB)
  })
})
