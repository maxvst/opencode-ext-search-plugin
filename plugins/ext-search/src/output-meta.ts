import path from "path"
import { log } from "./logging"
import type { ToolOutput } from "./types"

function isOnDirectPath(dir: string, a: string, b: string): boolean {
  const nDir = path.resolve(dir)
  const nA = path.resolve(a)
  const nB = path.resolve(b)
  if (nDir === nA || nDir === nB) return true
  if (nA.startsWith(nB + path.sep)) {
    let cur = nA
    while (cur !== nB) {
      if (cur === nDir) return true
      const p = path.dirname(cur)
      if (p === cur) break
      cur = p
    }
  } else if (nB.startsWith(nA + path.sep)) {
    let cur = nB
    while (cur !== nA) {
      if (cur === nDir) return true
      const p = path.dirname(cur)
      if (p === cur) break
      cur = p
    }
  }
  return false
}

function isNarrowSearchPath(
  searchPath: string | undefined,
  worktree: string,
  openDir: string,
  configDir: string | null,
): boolean {
  if (!searchPath) return false
  const normalized = path.resolve(searchPath)
  if (normalized === worktree || normalized === openDir) return false
  if (configDir && isOnDirectPath(normalized, openDir, configDir)) return false
  log.debug("isNarrowSearchPath", { searchPath, normalized, worktree, openDir, configDir })
  return true
}

function applyMetadata(
  output: ToolOutput,
  count: number,
  metadataKey: string,
): void {
  const prev = (output.metadata[metadataKey] as number | undefined) ?? 0
  output.metadata[metadataKey] = prev + count
}

export { isOnDirectPath, isNarrowSearchPath, applyMetadata }
