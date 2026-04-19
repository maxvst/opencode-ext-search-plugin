const IS_WIN = process.platform === "win32"
const RG_BIN = IS_WIN ? "rg.exe" : "rg"

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

export { IS_WIN, RG_BIN, IGNORE_TOOLS }
export { log, setLogClient } from "./logging"
export type { Options, ExternalDir } from "./types"
