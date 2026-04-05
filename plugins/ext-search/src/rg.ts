import path from "path"
import os from "os"
import fs from "fs"
import { IS_WIN, RG_BIN, log } from "./constants"

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
  log("getOpenCodeBinPaths: platform=%s, prefixes=%o, candidate paths:", process.platform, prefixes)
  for (const p of paths) {
    log("  ", p)
  }
  return paths
}

let cachedRgPath: string | null = null
let rgPathResolved = false

function findRgBinary(): string | null {
  if (rgPathResolved) {
    log("findRgBinary: returning cached result:", cachedRgPath)
    return cachedRgPath
  }
  rgPathResolved = true

  const pathEnv = process.env.PATH || ""
  const pathSep = IS_WIN ? ";" : ":"
  const pathExt = IS_WIN
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""]

  log("findRgBinary: searching in PATH...")
  for (const dir of pathEnv.split(pathSep)) {
    if (!dir) continue
    for (const ext of pathExt) {
      const candidate = path.join(dir, RG_BIN + ext)
      try {
        if (fs.existsSync(candidate)) {
          cachedRgPath = candidate
          log("findRgBinary: found rg in PATH:", candidate)
          return cachedRgPath
        }
      } catch {
        log("findRgBinary: error checking PATH candidate:", candidate)
      }
    }
  }

  log("findRgBinary: not in PATH, searching OpenCode bin directories...")
  for (const dir of getOpenCodeBinPaths()) {
    const candidate = path.join(dir, RG_BIN)
    try {
      if (fs.existsSync(candidate)) {
        cachedRgPath = candidate
        log("findRgBinary: found rg in OpenCode bin dir:", candidate)
        return cachedRgPath
      }
    } catch {
      log("findRgBinary: error checking OpenCode bin candidate:", candidate)
    }
  }

  log("findRgBinary: rg NOT found anywhere")
  return null
}

export { findRgBinary }
