import path from "path"
import { log } from "./constants"
import { isPathInExternalDirs } from "./paths"
import { spawn } from "./process"
import { parseRgOutput, formatGrepResults } from "./output"
import { shouldExclude } from "./exclusion"
import { getFsHost } from "./fs-host"

interface ExternalSearchResult {
  output: string
  count: number
  hintDirs: string[]
}

function findParentDir(filePath: string, dirs: string[]): string | null {
  let best: string | null = null
  for (const dir of dirs) {
    if (filePath === dir || filePath.startsWith(dir + path.sep)) {
      if (!best || dir.length > best.length) best = dir
    }
  }
  return best
}

function computePerDirCounts(
  items: Array<{ filePath: string }>,
  resolvedDirs: string[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const dir = findParentDir(item.filePath, resolvedDirs)
    if (dir) counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }
  return counts
}

function computeHintDirs(
  totalCounts: Map<string, number>,
  limitedCounts: Map<string, number>,
  resolvedDirs: string[],
): string[] {
  return resolvedDirs.filter((dir) => {
    const total = totalCounts.get(dir) ?? 0
    const included = limitedCounts.get(dir) ?? 0
    return total > 0 && included < total
  })
}

async function searchExternalGrep(
  pattern: string,
  include: string | undefined,
  resolvedDirs: string[],
  excludePatterns: string[],
  maxPerFile: number,
  displayLimit: number,
  searchPath: string | undefined,
  rgPath: string,
): Promise<ExternalSearchResult> {
  const empty: ExternalSearchResult = { output: "", count: 0, hintDirs: [] }
  log.debug("searchExternalGrep", { pattern, include: include ?? "(none)", dirs: resolvedDirs.length, maxPerFile, displayLimit })
  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    log.debug("searchPath already in external dirs, skipping grep", { searchPath })
    return empty
  }

  const excludeArgs: string[] = []
  for (const p of excludePatterns) {
    excludeArgs.push("--glob", `!${p}`)
  }

  const args = [
    rgPath,
    "-n",
    "--hidden",
    "--no-messages",
    "--field-match-separator=|",
    `--max-count=${maxPerFile}`,
    ...excludeArgs,
  ]
  if (include) args.push("--glob", include)
  args.push("--regexp", pattern, ...resolvedDirs)
  log.debug("rg args", { args })

  try {
    const { stdout, exitCode } = await spawn(args)
    log.debug("rg spawn result", { exitCode, stdoutLen: stdout.length })
    if (exitCode === 0 || (exitCode === 2 && stdout.trim())) {
      const entries = parseRgOutput(stdout)
      if (!entries.length) return empty
      log.info("grep found matches", { matches: entries.length, pattern })

      const totalDirCounts = computePerDirCounts(entries, resolvedDirs)

      const formatted = formatGrepResults(entries, displayLimit)
      const limitedEntries = entries.slice(0, displayLimit)
      const limitedDirCounts = computePerDirCounts(limitedEntries, resolvedDirs)

      const hintDirs = computeHintDirs(totalDirCounts, limitedDirCounts, resolvedDirs)

      return { output: formatted.output, count: formatted.count, hintDirs }
    }
  } catch (e: any) {
    log.error("grep error", { error: e.message })
  }

  return empty
}

async function searchExternalGlob(
  pattern: string,
  resolvedDirs: string[],
  excludePatterns: string[],
  maxPerDir: number,
  displayLimit: number,
  searchPath: string | undefined,
): Promise<ExternalSearchResult> {
  const empty: ExternalSearchResult = { output: "", count: 0, hintDirs: [] }
  log.debug("searchExternalGlob", { pattern, dirs: resolvedDirs.length, maxPerDir, displayLimit })
  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    log.debug("searchPath already in external dirs, skipping glob", { searchPath })
    return empty
  }

  const fsHost = getFsHost()
  const allFiles: string[] = []
  for (const dir of resolvedDirs) {
    try {
      const dirFiles = await fsHost.globScan(pattern, dir, excludePatterns, maxPerDir)
      allFiles.push(...dirFiles)
    } catch (e: any) {
      log.error("globScan error", { dir, error: e.message })
    }
  }
  if (!allFiles.length) return empty

  log.info("glob found files", { count: allFiles.length, pattern })

  const totalDirCounts = new Map<string, number>()
  for (const f of allFiles) {
    const dir = findParentDir(f, resolvedDirs)
    if (dir) totalDirCounts.set(dir, (totalDirCounts.get(dir) ?? 0) + 1)
  }

  const limited = allFiles.slice(0, displayLimit)
  const limitedDirCounts = new Map<string, number>()
  for (const f of limited) {
    const dir = findParentDir(f, resolvedDirs)
    if (dir) limitedDirCounts.set(dir, (limitedDirCounts.get(dir) ?? 0) + 1)
  }

  const hintDirs = computeHintDirs(totalDirCounts, limitedDirCounts, resolvedDirs)

  return { output: limited.join("\n"), count: limited.length, hintDirs }
}

export { searchExternalGrep, searchExternalGlob, findParentDir, computeHintDirs }
export type { ExternalSearchResult }
