import path from "path"
import { log, setLogClient, IGNORE_TOOLS } from "./constants"
import type { Options } from "./constants"
import { findRgBinary } from "./rg"
import { findPluginConfigDir } from "./config"
import { resolveDirectories } from "./paths"
import { searchExternalGrep, searchExternalGlob } from "./search"
import { createDepsReadTool } from "./deps-read"

const DEFAULT_EXCLUDE_PATTERNS = ["node_modules", ".git", "dist"]
const DEFAULT_MAX_RESULTS = 50

interface PluginContext {
  directory: string
  worktree: string
  [key: string]: unknown
}

interface ExternalResult {
  output: string
  count: number
}

interface SearchDeps {
  resolvedDirs: string[]
  excludePatterns: string[]
  maxResults: number
  worktree: string
  openDir: string
}

interface GrepDeps extends SearchDeps {
  rgPath: string
}

function validateOptions(
  options?: Options,
): (Required<Omit<Options, "root">> & { root?: string }) | null {
  const opts = options ?? ({} as Options)
  if (!opts.directories?.length) return null
  return {
    directories: opts.directories,
    root: opts.root,
    excludePatterns: opts.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
    maxResults: opts.maxResults ?? DEFAULT_MAX_RESULTS,
  }
}

function resolveBasePath(
  root: string | undefined,
  openDir: string,
  worktree: string,
): string {
  if (!root) return worktree
  const configDir = findPluginConfigDir(openDir)
  return path.resolve(configDir || openDir, root)
}

function isNarrowSearchPath(
  searchPath: string | undefined,
  worktree: string,
  openDir: string,
): boolean {
  if (!searchPath) return false
  const normalized = path.resolve(searchPath)
  return normalized !== worktree && normalized !== openDir
}

function mergeResults(
  output: { output: string; metadata: Record<string, unknown> },
  external: ExternalResult,
  metadataKey: string,
): void {
  if (!external.output) return
  output.output = output.output.includes("No files found")
    ? external.output
    : output.output +
      "\n\n--- External dependencies ---\n" +
      external.output
  const prev = (output.metadata[metadataKey] as number | undefined) ?? 0
  output.metadata[metadataKey] = prev + external.count
}

async function handleGrep(
  input: any,
  output: { output: string; metadata: Record<string, unknown> },
  deps: GrepDeps,
): Promise<void> {
  const { pattern, include, path: searchPath } = input.args || {}
  if (!pattern) return
  if (isNarrowSearchPath(searchPath, deps.worktree, deps.openDir)) return

  const external = await searchExternalGrep(
    pattern,
    include,
    deps.resolvedDirs,
    deps.excludePatterns,
    deps.maxResults,
    searchPath,
    deps.rgPath,
  )
  mergeResults(output, external, "matches")
}

async function handleGlob(
  input: any,
  output: { output: string; metadata: Record<string, unknown> },
  deps: SearchDeps,
): Promise<void> {
  const { pattern, path: searchPath } = input.args || {}
  if (!pattern) return
  if (isNarrowSearchPath(searchPath, deps.worktree, deps.openDir)) return

  const external = await searchExternalGlob(
    pattern,
    deps.resolvedDirs,
    deps.excludePatterns,
    deps.maxResults,
    searchPath,
  )
  mergeResults(output, external, "count")
}

const extSearchPlugin = async (ctx: PluginContext, options?: Options) => {
  setLogClient(ctx.client as any)
  log.info("ext-search plugin initializing")

  const opts = validateOptions(options)
  if (!opts) return {}

  const worktree = path.resolve(ctx.worktree)
  const openDir = path.resolve(ctx.directory)
  const basePath = resolveBasePath(opts.root, openDir, worktree)
  const resolvedDirs = resolveDirectories(opts.directories, basePath)

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
      if (IGNORE_TOOLS.has(toolName)) return

      if (toolName === "grep" && rgPath) {
        await handleGrep(input, output, { ...searchDeps, rgPath })
      } else if (toolName === "glob") {
        await handleGlob(input, output, searchDeps)
      }
    },

    tool: depsReadTool,
  }
}

export default { id: "ext-search", server: extSearchPlugin }
