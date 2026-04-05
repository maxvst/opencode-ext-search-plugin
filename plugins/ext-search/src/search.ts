import path from "path"
import fs from "fs"
import { log } from "./constants"
import { isPathInExternalDirs } from "./paths"
import { spawn } from "./process"
import { parseRgOutput, formatGrepResults } from "./output"

function globMatches(str: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${regexStr}$`).test(str)
}

function shouldExclude(relPath: string, excludePatterns: string[]): boolean {
  const parts = relPath.split(/[/\\]/)
  const basename = parts[parts.length - 1]
  for (const pattern of excludePatterns) {
    const hasWildcard =
      pattern.includes("*") ||
      pattern.includes("?") ||
      pattern.includes("[")
    if (!hasWildcard) {
      if (parts.includes(pattern)) return true
      continue
    }
    if (globMatches(basename, pattern)) return true
  }
  return false
}

function walkDir(
  current: string,
  base: string,
  files: string[],
  excludePatterns: string[],
  maxResults: number,
): void {
  if (files.length >= maxResults) return
  const entries = fs.readdirSync(current, { withFileTypes: true })
  for (const entry of entries) {
    if (files.length >= maxResults) return
    const rel = path.join(base, entry.name)
    if (shouldExclude(rel, excludePatterns)) continue
    if (entry.isDirectory()) {
      walkDir(path.join(current, entry.name), rel, files, excludePatterns, maxResults)
    } else if (entry.isFile()) {
      files.push(path.resolve(current, rel))
    }
  }
}

async function collectGlobBun(
  pattern: string,
  dirs: string[],
  excludePatterns: string[],
  maxResults: number,
): Promise<string[]> {
  const files: string[] = []
  for (const dir of dirs) {
    if (files.length >= maxResults) break
    try {
      const glob = new Bun.Glob(pattern)
      for await (const relPath of glob.scan({ cwd: dir, absolute: false })) {
        if (files.length >= maxResults) break
        if (shouldExclude(relPath, excludePatterns)) continue
        files.push(path.resolve(dir, relPath))
      }
    } catch (e: any) {
      log.error("Bun.Glob error", { dir, error: e.message })
    }
  }
  return files
}

function collectGlobFsWalk(
  dirs: string[],
  excludePatterns: string[],
  maxResults: number,
): string[] {
  const files: string[] = []
  for (const dir of dirs) {
    if (files.length >= maxResults) break
    try {
      walkDir(dir, "", files, excludePatterns, maxResults)
    } catch (e: any) {
      log.error("fs.walk error", { dir, error: e.message })
    }
  }
  return files
}

async function collectGlobResults(
  pattern: string,
  dirs: string[],
  excludePatterns: string[],
  maxResults: number,
): Promise<string[]> {
  if (typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined") {
    return collectGlobBun(pattern, dirs, excludePatterns, maxResults)
  }
  return collectGlobFsWalk(dirs, excludePatterns, maxResults)
}

async function searchExternalGrep(
  pattern: string,
  include: string | undefined,
  resolvedDirs: string[],
  excludePatterns: string[],
  maxResults: number,
  searchPath: string | undefined,
  rgPath: string,
): Promise<{ output: string; count: number }> {
  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    return { output: "", count: 0 }
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
    `--max-count=${maxResults}`,
    ...excludeArgs,
  ]
  if (include) args.push("--glob", include)
  args.push("--regexp", pattern, ...resolvedDirs)

  try {
    const { stdout, exitCode } = await spawn(args)
    if (exitCode === 0 || (exitCode === 2 && stdout.trim())) {
      const entries = parseRgOutput(stdout)
      if (!entries.length) return { output: "", count: 0 }
      return formatGrepResults(entries, maxResults)
    }
  } catch (e: any) {
    log.error("grep error", { error: e.message })
  }

  return { output: "", count: 0 }
}

async function searchExternalGlob(
  pattern: string,
  resolvedDirs: string[],
  excludePatterns: string[],
  maxResults: number,
  searchPath: string | undefined,
): Promise<{ output: string; count: number }> {
  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    return { output: "", count: 0 }
  }

  const files = await collectGlobResults(
    pattern,
    resolvedDirs,
    excludePatterns,
    maxResults,
  )
  if (!files.length) return { output: "", count: 0 }

  const limited = files.slice(0, maxResults)
  return { output: limited.join("\n"), count: limited.length }
}

export { searchExternalGrep, searchExternalGlob }
