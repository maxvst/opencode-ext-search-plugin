import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

function makeConfig(dirs: string[]): string {
  return JSON.stringify({
    plugin: [["/plugins/ext-search", { directories: dirs }]],
  })
}

interface FsEntry {
  content?: string
  isDir?: boolean
}

function createMockFs(
  files: Record<string, FsEntry | null>,
  globResults?: Record<string, string[]>,
) {
  return {
    existsSync(p: string) {
      return p in files && files[p] !== null
    },
    readFileSync(p: string, _enc: string) {
      const entry = files[p]
      if (!entry || entry.content === undefined) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`)
        ;(err as any).code = "ENOENT"
        throw err
      }
      return entry.content
    },
    statSync(p: string) {
      const entry = files[p]
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
    readdirSync(_p: string, _opts: any) {
      return []
    },
    async globScan(_pattern: string, dir: string, _excludePatterns: string[], _maxResults: number): Promise<string[]> {
      if (globResults && dir in globResults) return globResults[dir]
      return []
    },
  }
}

describe("hint filtering by search results", () => {
  const dirA = "/ext/a"
  const dirB = "/ext/b"

  beforeEach(() => _testing.resetAll())
  afterEach(() => _testing.resetAll())

  async function setupHook(
    dirAFiles: string[],
    dirBFiles: string[],
  ) {
    const fsEntries: Record<string, FsEntry | null> = {
      "/plugins/ext-search": { isDir: true },
      "/tmp-test": { isDir: true },
      "/tmp-test/opencode.json": { content: makeConfig([dirA, dirB]) },
      "/tmp-test/app": { isDir: true },
      [dirA]: { isDir: true },
      [dirB]: { isDir: true },
    }

    const globResults: Record<string, string[]> = {
      [dirA]: dirAFiles,
      [dirB]: dirBFiles,
    }

    const { client } = createMockClient()
    const mockFs = createMockFs(fsEntries, globResults)
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
    const aFiles = Array.from({ length: 5 }, (_, i) => `${dirA}/f${i}.ts`)
    const bFiles = Array.from({ length: 40 }, (_, i) => `${dirB}/f${i}.ts`)
    const hook = await setupHook(aFiles, bFiles)

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
    const aFiles = Array.from({ length: 5 }, (_, i) => `${dirA}/f${i}.ts`)
    const bFiles = Array.from({ length: 5 }, (_, i) => `${dirB}/f${i}.ts`)
    const hook = await setupHook(aFiles, bFiles)

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
    const aFiles = Array.from({ length: 40 }, (_, i) => `${dirA}/f${i}.ts`)
    const bFiles = Array.from({ length: 40 }, (_, i) => `${dirB}/f${i}.ts`)
    const hook = await setupHook(aFiles, bFiles)

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
    const aFiles = Array.from({ length: 5 }, (_, i) => `${dirA}/f${i}.ts`)
    const bFiles = Array.from({ length: 5 }, (_, i) => `${dirB}/f${i}.ts`)
    const hook = await setupHook(aFiles, bFiles)

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

  it("excludes dir with no results from hint", async () => {
    const aFiles: string[] = []
    const bFiles = Array.from({ length: 40 }, (_, i) => `${dirB}/f${i}.ts`)
    const hook = await setupHook(aFiles, bFiles)

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
})
