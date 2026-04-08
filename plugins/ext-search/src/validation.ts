import { log } from "./constants"
import type { Options } from "./types"

const DEFAULT_EXCLUDE_PATTERNS = ["node_modules", ".git", "dist"]
const DEFAULT_MAX_RESULTS = 50

function validateOptions(
  options?: Options,
): (Required<Omit<Options, "root">> & { root?: string }) | null {
  const opts = options ?? ({} as Options)
  if (!opts.directories?.length) {
    log.warn("no directories configured, plugin inactive")
    return null
  }
  log.debug("options validated", { directories: opts.directories, root: opts.root })
  return {
    directories: opts.directories,
    root: opts.root,
    excludePatterns: opts.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
    maxResults: opts.maxResults ?? DEFAULT_MAX_RESULTS,
  }
}

export { validateOptions, DEFAULT_EXCLUDE_PATTERNS, DEFAULT_MAX_RESULTS }
