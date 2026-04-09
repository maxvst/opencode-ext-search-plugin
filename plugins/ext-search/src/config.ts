import path from "path"
import { fileURLToPath } from "node:url"
import { log } from "./constants"
import { getFsHost } from "./fs-host"

export type ConfigSearchResult = {
  dir: string | null
  parseErrors: Array<{ configPath: string; error: string }>
}

let _pluginDirOverride: string | undefined

export function setPluginDirOverride(dir: string | undefined): void {
  _pluginDirOverride = dir
}

export function resetConfigState(): void {
  _pluginDirOverride = undefined
}

function findPluginConfigDir(startDir: string): ConfigSearchResult {
  const parseErrors: ConfigSearchResult["parseErrors"] = []

  let pluginDir: string
  if (_pluginDirOverride !== undefined) {
    pluginDir = _pluginDirOverride
  } else {
    try {
      pluginDir = path.dirname(fileURLToPath(import.meta.url))
    } catch {
      log.warn("findPluginConfigDir: cannot resolve pluginDir from import.meta.url")
      return { dir: null, parseErrors: [] }
    }
  }

  log.debug("findPluginConfigDir starting", { pluginDir, startDir })

  const fsHost = getFsHost()
  let current = path.resolve(startDir)
  const root = path.parse(current).root

  while (current !== root) {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const configPath = path.join(current, name)
      try {
        if (!fsHost.existsSync(configPath)) continue
        log.debug("findPluginConfigDir: found config file", { configPath })

        const raw = fsHost.readFileSync(configPath, "utf-8")
        let config: any
        try {
          config = JSON.parse(raw)
        } catch (parseErr: any) {
          parseErrors.push({ configPath, error: parseErr?.message || String(parseErr) })
          log.warn("findPluginConfigDir: parse error", { configPath, error: parseErr?.message })
          continue
        }

        if (!Array.isArray(config.plugin)) {
          log.info("findPluginConfigDir: config has no plugin array", { configPath, pluginType: typeof config.plugin, keys: Object.keys(config) })
          continue
        }

        for (const entry of config.plugin) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") {
            log.debug("findPluginConfigDir: skipping non-conforming plugin entry", { configPath, entry, isArray: Array.isArray(entry), firstType: Array.isArray(entry) ? typeof entry[0] : "n/a" })
            continue
          }
          const resolved = path.resolve(current, entry[0])
          const exactMatch = resolved === pluginDir
          const prefixMatch = pluginDir.startsWith(resolved + path.sep)
          log.info("findPluginConfigDir: comparing paths", { configPath, pluginSpec: entry[0], resolved, pluginDir, exactMatch, prefixMatch })
          if (exactMatch || prefixMatch) {
            log.info("findPluginConfigDir: match found", { configDir: current, pluginSpec: entry[0], resolved })
            return { dir: current, parseErrors }
          }
        }
      } catch (err: any) {
        log.warn("findPluginConfigDir: error reading config", { configPath, error: err?.message })
      }
    }
    log.debug("findPluginConfigDir: ascending", { from: current, to: path.dirname(current) })
    current = path.dirname(current)
  }

  log.warn("findPluginConfigDir: no config found referencing this plugin", { startDir, pluginDir })
  return { dir: null, parseErrors }
}

export { findPluginConfigDir }
