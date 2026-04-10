import { log } from "./constants"
import type { GrepDeps, ToolOutput } from "./types"
import { searchExternalGrep } from "./search"
import { calculateBudget, mergeExternalOutput } from "./budget"
import { buildHint } from "./hint"
import { isNarrowSearchPath, applyMetadata } from "./output-meta"
import { filterCoveredDirs } from "./paths"
import path from "path"

async function handleGrep(
  input: any,
  output: ToolOutput,
  deps: GrepDeps,
): Promise<void> {
  const { pattern, include, path: searchPath } = input.args || {}
  if (!pattern) return
  log.debug("handleGrep", { pattern, include, searchPath: searchPath ?? "(none)" })
  if (isNarrowSearchPath(searchPath, deps.worktree, deps.openDir, deps.configDir)) return

  const effectiveMainPath = searchPath ? path.resolve(searchPath) : deps.worktree
  const filteredDirs = filterCoveredDirs(deps.resolvedDirs, effectiveMainPath)
  if (!filteredDirs.length) return

  const budget = calculateBudget(output.output)
  log.debug("handleGrep budget", { budget })

  if (budget === 0) {
    log.info("handleGrep: budget exhausted, skipping external search")
    output.output += buildHint(filteredDirs)
    return
  }

  const effectiveMax = Math.min(budget, deps.maxResults)
  const external = await searchExternalGrep(
    pattern,
    include,
    filteredDirs,
    deps.excludePatterns,
    effectiveMax,
    searchPath,
    deps.rgPath,
  )
  log.debug("handleGrep result", { count: external.count })

  if (!external.output) return

  output.output = mergeExternalOutput(output.output, external.output)
  applyMetadata(output, external.count, "matches")

  if (external.count >= budget) {
    output.output += buildHint(filteredDirs)
  }
}

export { handleGrep }
