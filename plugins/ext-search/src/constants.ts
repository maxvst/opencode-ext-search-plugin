const IS_WIN = process.platform === "win32"
const RG_BIN = IS_WIN ? "rg.exe" : "rg"
const DEBUG = !!process.env.EXT_SEARCH_DEBUG

function log(...args: unknown[]): void {
  if (!DEBUG) return
  const ts = new Date().toISOString().slice(11, 19)
  console.error(`[ext-search ${ts}]`, ...args)
}

const IGNORE_TOOLS = new Set([
  "bash",
  "read",
  "write",
  "edit",
  "apply_patch",
  "task",
  "webfetch",
  "websearch",
  "codesearch",
  "skill",
  "question",
  "todo",
  "batch",
  "plan",
  "lsp",
  "deps_read",
])

type Options = {
  root?: string
  directories: string[]
  excludePatterns?: string[]
  maxResults?: number
}

export { IS_WIN, RG_BIN, DEBUG, log, IGNORE_TOOLS }
export type { Options }
