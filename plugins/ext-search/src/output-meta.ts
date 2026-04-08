import path from "path"
import { log } from "./logging"
import type { ToolOutput } from "./types"

function isNarrowSearchPath(
  searchPath: string | undefined,
  worktree: string,
  openDir: string,
): boolean {
  if (!searchPath) return false
  const normalized = path.resolve(searchPath)
  const narrow = normalized !== worktree && normalized !== openDir
  log.debug("isNarrowSearchPath", { searchPath, normalized, worktree, openDir, narrow })
  return narrow
}

function applyMetadata(
  output: ToolOutput,
  count: number,
  metadataKey: string,
): void {
  const prev = (output.metadata[metadataKey] as number | undefined) ?? 0
  output.metadata[metadataKey] = prev + count
}

export { isNarrowSearchPath, applyMetadata }
