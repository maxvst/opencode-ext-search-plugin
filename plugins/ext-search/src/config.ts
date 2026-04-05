import path from "path"
import fs from "fs"
import { fileURLToPath } from "node:url"
import { log } from "./constants"

function findPluginConfigDir(startDir: string): string | null {
  let pluginDir: string
  try {
    pluginDir = path.dirname(fileURLToPath(import.meta.url))
  } catch {
    log.warn("findPluginConfigDir: cannot resolve pluginDir from import.meta.url")
    return null
  }

  log.debug("findPluginConfigDir starting", { pluginDir, startDir })

  let current = path.resolve(startDir)
  const root = path.parse(current).root

  while (current !== root) {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const configPath = path.join(current, name)
      try {
        if (!fs.existsSync(configPath)) continue
        log.debug("findPluginConfigDir: found config file", { configPath })

        const raw = fs.readFileSync(configPath, "utf-8")
        const config = JSON.parse(raw)
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
            return current
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
  return null
}

export { findPluginConfigDir }
