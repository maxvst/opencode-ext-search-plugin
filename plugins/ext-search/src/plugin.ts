import path from "path"
import { log, setLogClient, IGNORE_TOOLS } from "./constants"
import type { Options } from "./constants"
import type { PluginContext, SearchDeps, GrepDeps } from "./types"
import { findRgBinary } from "./rg"
import { resolveDirectories, resolveBasePath } from "./paths"
import { createDepsReadTool } from "./deps-read"
import { buildRgFallbackHint } from "./hint"
import { validateOptions } from "./validation"
import { handleGrep } from "./handler-grep"
import { handleGlob } from "./handler-glob"

const extSearchPlugin = async (ctx: PluginContext, options?: Options) => {
  setLogClient(ctx.client as any)
  log.info("ext-search plugin initializing", { directory: ctx.directory, worktree: ctx.worktree })

  const opts = validateOptions(options)
  if (!opts) return {}

  const worktree = path.resolve(ctx.worktree)
  const openDir = path.resolve(ctx.directory)
  log.debug("resolved context paths", { worktree, openDir })

  const basePath = resolveBasePath(opts.root, openDir, worktree)
  log.info("basePath computed", { basePath, root: opts.root })

  const resolvedDirs = resolveDirectories(opts.directories, basePath)
  log.info("resolvedDirs", { dirs: resolvedDirs })

  if (!resolvedDirs.length) {
    log.warn("no valid external directories resolved")
    return {}
  }

  const rgPath = findRgBinary()
  log.info("initialized", { dirs: resolvedDirs.length, rg: rgPath ?? "not found" })

  const depsReadTool = await createDepsReadTool(resolvedDirs)
  const searchDeps: SearchDeps = {
    resolvedDirs,
    excludePatterns: opts.excludePatterns,
    maxResults: opts.maxResults,
    worktree,
    openDir,
  }

  return {
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = input.tool as string
      if (IGNORE_TOOLS.has(toolName)) {
        log.debug("tool ignored", { tool: toolName })
        return
      }

      if (toolName === "grep" && rgPath) {
        log.debug("dispatching to handleGrep", { tool: toolName })
        await handleGrep(input, output, { ...searchDeps, rgPath })
      } else if (toolName === "grep") {
        log.info("rg not found, appending directory hint for grep")
        output.output += buildRgFallbackHint(searchDeps.resolvedDirs)
      } else if (toolName === "glob") {
        log.debug("dispatching to handleGlob", { tool: toolName })
        await handleGlob(input, output, searchDeps)
      }
    },

    tool: depsReadTool,
  }
}

export default { id: "ext-search", server: extSearchPlugin }
