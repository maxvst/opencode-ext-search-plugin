import path from "path"
import os from "os"
import { IS_WIN, RG_BIN, log } from "./constants"
import { getFsHost } from "./fs-host"

function getOpenCodeBinPaths(): string[] {
  const home = os.homedir()
  const prefixes: string[] = []

  if (process.platform === "darwin") {
    prefixes.push(home)
  } else if (IS_WIN) {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    const appData =
      process.env.APPDATA || path.join(home, "AppData", "Roaming")
    prefixes.push(localAppData, appData, home)
  } else {
    const xdgCacheHome =
      process.env.XDG_CACHE_HOME || path.join(home, ".cache")
    const xdgDataHome =
      process.env.XDG_DATA_HOME || path.join(home, ".local", "share")
    prefixes.push(xdgCacheHome, xdgDataHome, home)
  }

  const suffixes = [
    "opencode/bin",
    ".opencode/bin",
    ".cache/opencode/bin",
    ".local/share/opencode/bin",
    "Library/Caches/opencode/bin",
    "Library/Application Support/opencode/bin",
  ]

  const paths: string[] = []
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      paths.push(path.join(prefix, suffix))
    }
  }
  return paths
}

let cachedRgPath: string | null = null
let rgPathResolved = false

let _rgPathOverride: string | null | undefined = undefined

export function setRgPathOverride(rgPath: string | null | undefined): void {
  _rgPathOverride = rgPath
  rgPathResolved = false
  cachedRgPath = null
}

export function resetRgCache(): void {
  _rgPathOverride = undefined
  rgPathResolved = false
  cachedRgPath = null
}

function findRgBinary(): string | null {
  if (_rgPathOverride !== undefined) {
    return _rgPathOverride
  }

  if (rgPathResolved) return cachedRgPath
  rgPathResolved = true

  const fsHost = getFsHost()
  const pathEnv = process.env.PATH || ""
  const pathSep = IS_WIN ? ";" : ":"
  const pathExt = IS_WIN
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""]

  for (const dir of pathEnv.split(pathSep)) {
    if (!dir) continue
    for (const ext of pathExt) {
      const candidate = path.join(dir, RG_BIN + ext)
      try {
        if (fsHost.existsSync(candidate)) {
          cachedRgPath = candidate
          log.debug("rg binary found in PATH", { path: candidate })
          return cachedRgPath
        }
      } catch {
        // skip inaccessible paths
      }
    }
  }

  for (const dir of getOpenCodeBinPaths()) {
    const candidate = path.join(dir, RG_BIN)
    try {
      if (fsHost.existsSync(candidate)) {
        cachedRgPath = candidate
        log.debug("rg binary found in opencode paths", { path: candidate })
        return cachedRgPath
      }
    } catch {
      // skip inaccessible paths
    }
  }

  log.warn("rg binary not found")
  return null
}

export { findRgBinary }
