import path from "path"
import { log, IGNORE_TOOLS } from "./constants"
import type { Options } from "./constants"
import { findRgBinary } from "./rg"
import { findPluginConfigDir } from "./config"
import { resolveDirectories, isPathInExternalDirs } from "./paths"
import { searchExternalGrep, searchExternalGlob } from "./search"
import { createDepsReadTool } from "./deps-read"

const extSearchPlugin = async (ctx: any, options?: Options) => {
  log("=== ext-search plugin initializing ===")
  log("ctx.directory =", ctx.directory)
  log("ctx.worktree =", ctx.worktree)
  log("ctx keys:", Object.keys(ctx).join(", "))
  log("platform:", process.platform, ", IS_WIN:", process.platform === "win32", ", Bun available:", typeof Bun !== "undefined")
  log("options:", JSON.stringify(options))

  const opts = options ?? ({} as Options)
  if (
    !opts.directories ||
    !Array.isArray(opts.directories) ||
    opts.directories.length === 0
  ) {
    log("plugin init: no directories configured or directories is empty, returning empty hooks")
    return {}
  }

  const maxResults = opts.maxResults ?? 50
  const excludePatterns = opts.excludePatterns ?? [
    "node_modules",
    ".git",
    "dist",
  ]
  const worktree = path.resolve(ctx.worktree)
  const openDir = path.resolve(ctx.directory)

  log("plugin init: worktree (resolved) =", worktree)
  log("plugin init: openDir (resolved) =", openDir)
  log("plugin init: opts.root =", opts.root)

  const configDir = findPluginConfigDir(openDir)
  log("plugin init: configDir =", configDir)

  const basePath = opts.root
    ? path.resolve(configDir || openDir, opts.root)
    : worktree

  if (opts.root) {
    log("plugin init: basePath = path.resolve(configDir || openDir, root) = path.resolve(", configDir || openDir, ",", opts.root, ") =", basePath)
  } else {
    log("plugin init: no root specified, basePath = worktree =", worktree)
  }

  const resolvedDirs = resolveDirectories(opts.directories, basePath)

  if (resolvedDirs.length === 0) {
    log("plugin init: resolvedDirs is EMPTY — no valid external directories found. Returning empty hooks.")
    log("plugin init: this likely means the directories in config don't exist relative to basePath =", basePath)
    return {}
  }

  const rgPath = findRgBinary()
  log("plugin init: rgPath =", rgPath)
  log("plugin init: maxResults =", maxResults)
  log("plugin init: excludePatterns =", JSON.stringify(excludePatterns))
  log("plugin init: resolvedDirs =", JSON.stringify(resolvedDirs))
  log("plugin init: worktree =", worktree)
  log("plugin init: openDir =", openDir)
  log("=== ext-search plugin initialized successfully ===")

  const depsReadTool = await createDepsReadTool(resolvedDirs)

  function isNarrowSearchPath(searchPath: string | undefined): boolean {
    if (!searchPath) {
      log("isNarrowSearchPath: no searchPath → false (will run external search)")
      return false
    }
    const normalized = path.resolve(searchPath)
    const result = normalized !== worktree && normalized !== openDir
    log("isNarrowSearchPath: searchPath =", searchPath, ", normalized =", normalized)
    log("isNarrowSearchPath: normalized !== worktree (", worktree, ") =", normalized !== worktree)
    log("isNarrowSearchPath: normalized !== openDir (", openDir, ") =", normalized !== openDir)
    log("isNarrowSearchPath: result =", result, result ? "→ NARROW, skipping external search" : "→ BROAD, will run external search")
    return result
  }

  return {
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = input.tool
      log("tool.execute.after: tool =", toolName)

      if (IGNORE_TOOLS.has(toolName)) {
        log("tool.execute.after: tool", toolName, "is in IGNORE_TOOLS, skipping")
        return
      }

      if (toolName === "grep") {
        if (!rgPath) {
          log("tool.execute.after: grep — no rg binary available, skipping external search")
          return
        }
        const { pattern, include, path: searchPath } = input.args || {}
        log("tool.execute.after: grep — pattern =", JSON.stringify(pattern), ", include =", include, ", searchPath =", searchPath)
        if (!pattern) {
          log("tool.execute.after: grep — no pattern, skipping")
          return
        }
        if (isNarrowSearchPath(searchPath)) {
          log("tool.execute.after: grep — searchPath is narrow, skipping external search")
          return
        }

        const external = await searchExternalGrep(
          pattern,
          include,
          resolvedDirs,
          excludePatterns,
          maxResults,
          searchPath,
          rgPath,
        )

        if (!external.output) {
          log("tool.execute.after: grep — external search returned no results")
          return
        }

        log("tool.execute.after: grep — external search returned", external.count, "results")
        if (output.output.includes("No files found")) {
          log("tool.execute.after: grep — built-in search found nothing, replacing output with external results")
          output.output = external.output
        } else {
          log("tool.execute.after: grep — appending external results to built-in results")
          output.output +=
            "\n\n--- External dependencies ---\n" + external.output
        }
        output.metadata.matches =
          (output.metadata.matches ?? 0) + external.count
        log("tool.execute.after: grep — total matches in metadata:", output.metadata.matches)
      }

      if (toolName === "glob") {
        const { pattern, path: searchPath } = input.args || {}
        log("tool.execute.after: glob — pattern =", JSON.stringify(pattern), ", searchPath =", searchPath)
        if (!pattern) {
          log("tool.execute.after: glob — no pattern, skipping")
          return
        }
        if (isNarrowSearchPath(searchPath)) {
          log("tool.execute.after: glob — searchPath is narrow, skipping external search")
          return
        }

        const external = await searchExternalGlob(
          pattern,
          resolvedDirs,
          excludePatterns,
          maxResults,
          searchPath,
        )

        if (!external.output) {
          log("tool.execute.after: glob — external search returned no results")
          return
        }

        log("tool.execute.after: glob — external search returned", external.count, "results")
        if (output.output.includes("No files found")) {
          log("tool.execute.after: glob — built-in search found nothing, replacing output with external results")
          output.output = external.output
        } else {
          log("tool.execute.after: glob — appending external results to built-in results")
          output.output +=
            "\n\n--- External dependencies ---\n" + external.output
        }
        output.metadata.count =
          (output.metadata.count ?? 0) + external.count
        log("tool.execute.after: glob — total count in metadata:", output.metadata.count)
      }
    },

    tool: depsReadTool,
  }
}

export default { id: "ext-search", server: extSearchPlugin }
