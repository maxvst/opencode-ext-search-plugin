import { log } from "./constants"
import type { Options } from "./types"

const DEFAULT_EXCLUDE_PATTERNS = ["node_modules", ".git", "dist"]
const DEFAULT_MAX_RESULTS = 50

type ValidatedOptions = Required<Omit<Options, "root" | "strict_path_restrictions" | "compile_commands_dir">> & {
  root?: string
  strict_path_restrictions?: boolean
  compile_commands_dir?: string
}

function validateOptions(options?: Options): ValidatedOptions {
  const opts = options ?? ({} as Options)
  log.debug("options validated", { directories: opts.directories, root: opts.root, compile_commands_dir: opts.compile_commands_dir })
  return {
    directories: opts.directories ?? [],
    root: opts.root,
    excludePatterns: opts.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
    maxResults: opts.maxResults ?? DEFAULT_MAX_RESULTS,
    strict_path_restrictions: opts.strict_path_restrictions ?? false,
    compile_commands_dir: opts.compile_commands_dir,
  }
}

export { validateOptions, DEFAULT_EXCLUDE_PATTERNS, DEFAULT_MAX_RESULTS }
