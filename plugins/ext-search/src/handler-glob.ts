import { log } from "./constants"
import type { SearchDeps, ToolOutput } from "./types"
import { searchExternalGlob } from "./search"
import { calculateBudget, mergeExternalOutput } from "./budget"
import { buildHint } from "./hint"
import { isNarrowSearchPath, applyMetadata } from "./output-meta"
import { filterCoveredDirs } from "./paths"
import path from "path"

async function handleGlob(
  input: any,
  output: ToolOutput,
  deps: SearchDeps,
): Promise<void> {
  const { pattern, path: searchPath } = input.args || {}
  if (!pattern) return
  log.debug("handleGlob", { pattern, searchPath: searchPath ?? "(none)" })
  if (isNarrowSearchPath(searchPath, deps.worktree, deps.openDir, deps.configDir)) return

  const effectiveMainPath = searchPath ? path.resolve(searchPath) : deps.worktree
  const filteredDirs = filterCoveredDirs(deps.resolvedDirs, effectiveMainPath)
  if (!filteredDirs.length) return

  const budget = calculateBudget(output.output)
  log.debug("handleGlob budget", { budget })

  if (budget === 0) {
    log.info("handleGlob: budget exhausted, skipping external search")
    output.output += buildHint(filteredDirs)
    return
  }

  const effectiveMax = Math.min(budget, deps.maxResults)
  const external = await searchExternalGlob(
    pattern,
    filteredDirs,
    deps.excludePatterns,
    deps.maxResults,
    effectiveMax,
    searchPath,
  )
  log.debug("handleGlob result", { count: external.count, hintDirs: external.hintDirs.length })

  if (!external.output) return

  output.output = mergeExternalOutput(output.output, external.output)
  applyMetadata(output, external.count, "count")

  if (external.hintDirs.length > 0) {
    output.output += buildHint(external.hintDirs)
  }
}

export { handleGlob }
