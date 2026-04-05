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
        const raw = fs.readFileSync(configPath, "utf-8")
        const config = JSON.parse(raw)
        if (!Array.isArray(config.plugin)) continue
        for (const entry of config.plugin) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") continue
          const resolved = path.resolve(current, entry[0])
          if (resolved === pluginDir || pluginDir.startsWith(resolved + path.sep)) {
            log.debug("findPluginConfigDir found config", { configDir: current, pluginSpec: entry[0], resolved })
            return current
          }
        }
      } catch {
        // skip unreadable or invalid config files
      }
    }
    current = path.dirname(current)
  }

  log.warn("findPluginConfigDir: no config found referencing this plugin", { startDir, pluginDir })
  return null
}

export { findPluginConfigDir }
