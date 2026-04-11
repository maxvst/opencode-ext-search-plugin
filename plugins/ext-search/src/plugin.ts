import path from "path"
import { log, setLogClient, IGNORE_TOOLS } from "./constants"
import type { Options, PluginContext, ToastInput, SearchDeps, GrepDeps } from "./types"
import { findRgBinary, setRgPathOverride, resetRgCache } from "./rg"
import { resolveDirectories, resolveBasePath, filterCoveredDirs } from "./paths"
import { findPluginConfigDir, setPluginDirOverride, resetConfigState } from "./config"
import { createDepsReadTool } from "./deps-read"
import { buildRgFallbackHint } from "./hint"
import { validateOptions } from "./validation"
import { handleGrep } from "./handler-grep"
import { handleGlob } from "./handler-glob"
import { setFsHost, resetFsHost } from "./fs-host"
import { createAutoPermitHandler } from "./auto-permit"

async function showToast(ctx: PluginContext, input: ToastInput): Promise<void> {
  try {
    if (ctx.client?.showToast) {
      await ctx.client.showToast(input)
    }
  } catch {}
}

const extSearchPlugin = async (ctx: PluginContext, options?: Options) => {
  setLogClient(ctx.client as any)
  log.info("ext-search plugin initializing", { directory: ctx.directory, worktree: ctx.worktree })

  const opts = validateOptions(options)
  if (!opts) {
    await showToast(ctx, {
      variant: "warning",
      title: "ext-search",
      message: "No directories configured. The plugin is inactive.",
    })
    return {}
  }

  const worktree = path.resolve(ctx.worktree)
  const openDir = path.resolve(ctx.directory)
  log.debug("resolved context paths", { worktree, openDir })

  const configResult = findPluginConfigDir(openDir)

  for (const pe of configResult.parseErrors) {
    await showToast(ctx, {
      variant: "error",
      title: "ext-search: config parse error",
      message: `Failed to parse ${pe.configPath}: ${pe.error}`,
    })
  }

  if (!configResult.dir) {
    await showToast(ctx, {
      variant: "warning",
      title: "ext-search",
      message: `opencode.json that initializes this module was not found (searched from ${openDir})`,
    })
  }

  const basePath = resolveBasePath(opts.root, openDir, worktree, configResult.dir)
  log.info("basePath computed", { basePath, root: opts.root })

  const dirsResult = resolveDirectories(opts.directories, basePath)
  log.info("resolvedDirs", { dirs: dirsResult.resolved })

  for (const d of dirsResult.missing) {
    await showToast(ctx, {
      variant: "warning",
      title: "ext-search",
      message: `Configured directory not found: ${d}`,
    })
  }

  if (!dirsResult.resolved.length) {
    await showToast(ctx, {
      variant: "warning",
      title: "ext-search",
      message: "No valid external directories resolved. The plugin is inactive.",
    })
    return {}
  }

  const rgPath = findRgBinary()
  if (!rgPath) {
    await showToast(ctx, {
      variant: "warning",
      title: "ext-search",
      message: "ripgrep (rg) not found. Grep search in external directories will be limited.",
    })
  }
  log.info("initialized", { dirs: dirsResult.resolved.length, rg: rgPath ?? "not found" })

  const depsResult = await createDepsReadTool(dirsResult.resolved)
  if (!depsResult.zodFound) {
    await showToast(ctx, {
      variant: "warning",
      title: "ext-search",
      message: "zod library not found. The deps_read tool will not be available.",
    })
  }

  const searchDeps: SearchDeps = {
    resolvedDirs: dirsResult.resolved,
    excludePatterns: opts.excludePatterns,
    maxResults: opts.maxResults,
    worktree,
    openDir,
    configDir: configResult.dir,
  }

  const autoPermitHandler = createAutoPermitHandler(dirsResult.resolved, ctx.client)

  return {
    event: autoPermitHandler,

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
        const sp = input.args?.path
        const effectivePath = sp ? path.resolve(sp) : worktree
        const filtered = filterCoveredDirs(searchDeps.resolvedDirs, effectivePath)
        if (filtered.length) {
          output.output += buildRgFallbackHint(filtered)
        }
      } else if (toolName === "glob") {
        log.debug("dispatching to handleGlob", { tool: toolName })
        await handleGlob(input, output, searchDeps)
      }
    },

    tool: depsResult.tool,
  }
}

const _testing = {
  setFsHost,
  resetFsHost,
  setPluginDirOverride,
  resetConfigState,
  setRgPathOverride,
  resetRgCache,
  resetAll() {
    resetFsHost()
    resetConfigState()
    resetRgCache()
  },
}

export default { id: "ext-search", server: extSearchPlugin }
export { _testing }
