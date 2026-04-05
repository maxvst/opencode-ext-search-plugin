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
    if (!pattern.includes("*") && !pattern.includes("?") && !pattern.includes("[")) {
      if (parts.includes(pattern)) return true
      continue
    }
    if (globMatches(basename, pattern)) return true
  }
  return false
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
  log("searchExternalGrep: pattern =", JSON.stringify(pattern), ", include =", include, ", searchPath =", searchPath)
  log("searchExternalGrep: resolvedDirs =", JSON.stringify(resolvedDirs))

  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    log("searchExternalGrep: searchPath is inside external dirs, skipping to avoid duplication")
    return { output: "", count: 0 }
  }

  log(">>> LAUNCHING external grep search")
  log("    pattern:       ", JSON.stringify(pattern))
  log("    include:       ", include ?? "(none)")
  log("    searchPath:    ", searchPath ?? "(none)")
  log("    resolvedDirs:  ", JSON.stringify(resolvedDirs))
  log("    excludePats:   ", JSON.stringify(excludePatterns))
  log("    maxResults:    ", maxResults)
  log("    rgPath:        ", rgPath)

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
  if (include) {
    args.push("--glob", include)
  }
  args.push("--regexp", pattern, ...resolvedDirs)

  try {
    const { stdout, exitCode } = await spawn(args)
    log("searchExternalGrep: rg exitCode =", exitCode, ", stdout length:", stdout.length)
    if (exitCode === 0 || (exitCode === 2 && stdout.trim())) {
      const entries = parseRgOutput(stdout)
      log("searchExternalGrep: parsed", entries.length, "entries from rg output")
      if (entries.length === 0) return { output: "", count: 0 }
      const formatted = formatGrepResults(entries, maxResults)
      log("searchExternalGrep: returning", formatted.count, "formatted results")
      return formatted
    }
    log("searchExternalGrep: rg exitCode", exitCode, "with no usable output")
  } catch (e: any) {
    log("searchExternalGrep: exception:", e.message || e)
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
  log("searchExternalGlob: pattern =", JSON.stringify(pattern), ", searchPath =", searchPath)
  log("searchExternalGlob: resolvedDirs =", JSON.stringify(resolvedDirs))

  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    log("searchExternalGlob: searchPath is inside external dirs, skipping to avoid duplication")
    return { output: "", count: 0 }
  }

  log(">>> LAUNCHING external glob search")
  log("    pattern:       ", JSON.stringify(pattern))
  log("    searchPath:    ", searchPath ?? "(none)")
  log("    resolvedDirs:  ", JSON.stringify(resolvedDirs))
  log("    excludePats:   ", JSON.stringify(excludePatterns))
  log("    maxResults:    ", maxResults)

  const files: string[] = []

  if (typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined") {
    log("searchExternalGlob: using Bun.Glob engine")
    for (const dir of resolvedDirs) {
      if (files.length >= maxResults) break
      try {
        const glob = new Bun.Glob(pattern)
        let scanned = 0
        for await (const relPath of glob.scan({ cwd: dir, absolute: false })) {
          scanned++
          if (files.length >= maxResults) break
          if (shouldExclude(relPath, excludePatterns)) continue
          files.push(path.resolve(dir, relPath))
        }
        log("searchExternalGlob: Bun.Glob scanned", scanned, "entries in", dir, ", accepted:", files.length)
      } catch (e: any) {
        log("searchExternalGlob: Bun.Glob error in", dir, ":", e.message || e)
      }
    }
  } else {
    log("searchExternalGlob: Bun.Glob unavailable, using fallback fs.walk")
    for (const dir of resolvedDirs) {
      if (files.length >= maxResults) break
      try {
        function walk(d: string, base: string) {
          if (files.length >= maxResults) return
          const entries = fs.readdirSync(d, { withFileTypes: true })
          for (const entry of entries) {
            if (files.length >= maxResults) return
            const rel = path.join(base, entry.name)
            if (shouldExclude(rel, excludePatterns)) continue
            if (entry.isDirectory()) {
              walk(path.join(d, entry.name), rel)
            } else if (entry.isFile()) {
              files.push(path.resolve(dir, rel))
            }
          }
        }
        walk(dir, "")
        log("searchExternalGlob: fs.walk found", files.length, "files in", dir)
      } catch (e: any) {
        log("searchExternalGlob: fs.walk error in", dir, ":", e.message || e)
      }
    }
  }

  if (files.length === 0) {
    log("searchExternalGlob: no files found")
    return { output: "", count: 0 }
  }
  const limited = files.slice(0, maxResults)
  log("searchExternalGlob: returning", limited.length, "files")
  return { output: limited.join("\n"), count: limited.length }
}

export { searchExternalGrep, searchExternalGlob }
