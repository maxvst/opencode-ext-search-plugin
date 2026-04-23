import path from "path"
import os from "os"
import { log } from "./logging"
import { getFsHost } from "./fs-host"
import { isSubdirOf, isOrInsideAny, addDirNoNested } from "./compile-commands"
import type { ExternalDir } from "./types"

export type ParseUserDirsResult = {
  dirs: ExternalDir[]
  errors: Array<{ dir: string; message: string }>
  parseError?: string
}

function parseUserDirs(
  configDir: string,
  basePath: string,
  existingDirs: ExternalDir[],
  configDirAbs: string,
): ParseUserDirsResult {
  const filePath = path.join(configDir, ".ext-search.json")
  log.debug("parseUserDirs: checking file", { filePath })

  const fsHost = getFsHost()

  if (!fsHost.existsSync(filePath)) {
    log.debug("parseUserDirs: file not found, skipping")
    return { dirs: [], errors: [] }
  }

  let raw: string
  try {
    raw = fsHost.readFileSync(filePath, "utf-8")
  } catch (e: any) {
    const errMsg = `Failed to read .ext-search.json: ${e?.message || e}`
    log.error(errMsg)
    return { dirs: [], errors: [], parseError: errMsg }
  }

  let parsed: any
  const t0 = Date.now()
  try {
    parsed = JSON.parse(raw)
  } catch (e: any) {
    const errMsg = `Failed to parse .ext-search.json: ${e?.message || e}`
    log.error(errMsg, { parseTimeMs: Date.now() - t0 })
    return { dirs: [], errors: [], parseError: errMsg }
  }
  const parseMs = Date.now() - t0

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.user_dirs)) {
    const errMsg = '.ext-search.json: expected "user_dirs" array'
    log.error(errMsg)
    return { dirs: [], errors: [], parseError: errMsg }
  }

  const userDirsRaw: string[] = parsed.user_dirs
  raw = null as any
  parsed = null as any

  if (!userDirsRaw.length) {
    log.debug("parseUserDirs: user_dirs is empty")
    return { dirs: [], errors: [] }
  }

  log.debug("parseUserDirs parsed", { parseTimeMs: parseMs, userDirs: userDirsRaw.length })

  const existingPaths = existingDirs.map((d) => d.path)
  const errors: Array<{ dir: string; message: string }> = []
  const userSet = new Set<string>()

  for (const d of userDirsRaw) {
    if (typeof d !== "string") {
      errors.push({ dir: String(d), message: `User directory must be a string, got ${typeof d}` })
      continue
    }
    let resolvedPath: string
    if (d.startsWith("~/") || d === "~") {
      resolvedPath = path.join(os.homedir(), d.slice(1))
    } else if (path.isAbsolute(d)) {
      resolvedPath = d
    } else {
      resolvedPath = path.resolve(basePath, d)
    }

    try {
      const stat = fsHost.statSync(resolvedPath)
      if (!stat.isDirectory()) {
        errors.push({ dir: d, message: `User directory not a directory: ${d}` })
        continue
      }
    } catch {
      errors.push({ dir: d, message: `User directory not found: ${d}` })
      continue
    }

    if (isSubdirOf(resolvedPath, configDirAbs)) {
      errors.push({ dir: d, message: `User directory "${d}" is inside configDir, skipping` })
      continue
    }

    if (isOrInsideAny(resolvedPath, existingPaths)) {
      errors.push({ dir: d, message: `User directory "${d}" conflicts with existing external directory, skipping` })
      continue
    }

    addDirNoNested(userSet, resolvedPath)
  }

  const dirs: ExternalDir[] = []
  for (const p of userSet) {
    dirs.push({ path: p, source: "user" })
  }

  log.info("parseUserDirs completed", {
    dirs: dirs.length,
    errors: errors.length,
    parseTimeMs: parseMs,
  })

  return { dirs, errors }
}

function markDisabledByUserDirs(
  allDirs: ExternalDir[],
  userDirs: ExternalDir[],
): void {
  if (!userDirs.length) return
  const userPaths = userDirs.map((d) => d.path)
  for (const d of allDirs) {
    if (d.source === "user") continue
    if (isOrInsideAny(d.path, userPaths)) {
      d.disabled = true
      log.info("dir disabled (inside user dir)", { dir: d.path, source: d.source })
    }
  }
}

export { parseUserDirs, markDisabledByUserDirs }
