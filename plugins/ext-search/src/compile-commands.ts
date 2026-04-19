import path from "path"
import { log } from "./logging"
import { getFsHost } from "./fs-host"
import type { ExternalDir } from "./types"

export type ParseCompileCommandsResult = {
  dirs: ExternalDir[]
  error?: string
}

function isSubdirOf(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(parent + path.sep)
}

function isOrInsideAny(candidate: string, dirs: string[]): boolean {
  for (const d of dirs) {
    if (candidate === d || candidate.startsWith(d + path.sep)) return true
  }
  return false
}

function addDirNoNested(set: Set<string>, candidate: string): void {
  for (const existing of set) {
    if (isSubdirOf(candidate, existing)) return
  }
  const toRemove: string[] = []
  for (const existing of set) {
    if (isSubdirOf(existing, candidate)) {
      toRemove.push(existing)
    }
  }
  for (const r of toRemove) {
    set.delete(r)
  }
  set.add(candidate)
}

function parseCompileCommands(
  ccDir: string,
  configDir: string,
  configDirs: ExternalDir[],
): ParseCompileCommandsResult {
  const ccAbsPath = path.resolve(configDir, ccDir)
  const ccFile = path.join(ccAbsPath, "compile_commands.json")
  log.debug("parseCompileCommands: resolving", { ccDir, ccAbsPath, ccFile })

  const fsHost = getFsHost()

  if (!fsHost.existsSync(ccFile)) {
    const errMsg = `compile_commands.json not found at ${ccFile}`
    log.warn(errMsg)
    return { dirs: [], error: errMsg }
  }

  let raw: string
  try {
    raw = fsHost.readFileSync(ccFile, "utf-8")
  } catch (e: any) {
    const errMsg = `Failed to read compile_commands.json: ${e?.message || e}`
    log.error(errMsg)
    return { dirs: [], error: errMsg }
  }

  let entries: Array<{ directory?: string; file?: string }>
  const t0 = Date.now()
  try {
    entries = JSON.parse(raw)
  } catch (e: any) {
    const errMsg = `Failed to parse compile_commands.json: ${e?.message || e}`
    log.error(errMsg, { parseTimeMs: Date.now() - t0 })
    return { dirs: [], error: errMsg }
  }
  const parseMs = Date.now() - t0
  log.debug("compile_commands parsed", { parseTimeMs: parseMs, entries: Array.isArray(entries) ? entries.length : 0 })

  if (!Array.isArray(entries)) {
    raw = null as any
    entries = null as any
    return { dirs: [], error: "compile_commands.json is not an array" }
  }

  const configDirPaths = configDirs.map((d) => d.path)

  const ccSet = new Set<string>()

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const dir = entry.directory
    const file = entry.file
    if (!dir || !file) continue

    const absFile = path.isAbsolute(file) ? file : path.resolve(dir, file)
    const candidateDir = path.dirname(absFile)

    if (isSubdirOf(candidateDir, configDir)) continue

    if (isOrInsideAny(candidateDir, configDirPaths)) continue

    addDirNoNested(ccSet, candidateDir)
  }

  raw = null as any
  entries = null as any

  const dirs: ExternalDir[] = []
  for (const p of ccSet) {
    dirs.push({ path: p, source: "compile_commands" })
  }

  log.info("parseCompileCommands completed", {
    dirs: dirs.length,
    parseTimeMs: parseMs,
  })

  return { dirs }
}

function markDisabledConfigDirs(
  configDirs: ExternalDir[],
  ccDirs: ExternalDir[],
): void {
  const ccPaths = ccDirs.map((d) => d.path)
  for (const cd of configDirs) {
    if (isOrInsideAny(cd.path, ccPaths)) {
      cd.disabled = true
      log.info("config dir disabled (inside compile_commands dir)", { dir: cd.path })
    }
  }
}

export { parseCompileCommands, markDisabledConfigDirs, addDirNoNested, isSubdirOf, isOrInsideAny }
