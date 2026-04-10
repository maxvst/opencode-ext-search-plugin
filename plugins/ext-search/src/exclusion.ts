import path from "path"
import { log } from "./constants"
import { getFsHost } from "./fs-host"

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
  const entries = getFsHost().readdirSync(current, { withFileTypes: true })
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

export { globMatches, shouldExclude, walkDir }
