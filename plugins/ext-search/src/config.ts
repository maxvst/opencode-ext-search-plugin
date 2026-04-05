import path from "path"
import fs from "fs"
import { fileURLToPath } from "node:url"
import { log } from "./constants"

function findPluginConfigDir(startDir: string): string | null {
  let pluginDir: string
  try {
    pluginDir = path.dirname(fileURLToPath(import.meta.url))
  } catch {
    log("findPluginConfigDir: failed to determine plugin directory from import.meta.url")
    return null
  }

  log("findPluginConfigDir: pluginDir =", pluginDir, ", startDir =", startDir)

  let current = path.resolve(startDir)
  const root = path.parse(current).root

  while (current !== root) {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const configPath = path.join(current, name)
      try {
        if (!fs.existsSync(configPath)) continue
        const raw = fs.readFileSync(configPath, "utf-8")
        const config = JSON.parse(raw)
        if (!Array.isArray(config.plugin)) {
          log("findPluginConfigDir:", configPath, "— no 'plugin' array, skipping")
          continue
        }
        for (const entry of config.plugin) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") {
            log("findPluginConfigDir:", configPath, "— entry is not [string, opts]:", JSON.stringify(entry))
            continue
          }
          const resolved = path.resolve(current, entry[0])
          log("findPluginConfigDir:", configPath, "— plugin entry[0]:", entry[0], ", resolved:", resolved, ", pluginDir:", pluginDir)
          if (resolved === pluginDir || pluginDir.startsWith(resolved + path.sep)) {
            log("findPluginConfigDir: MATCH found! configDir =", current)
            return current
          }
        }
      } catch (e: any) {
        log("findPluginConfigDir: error reading/parsing", configPath, ":", e.message || e)
      }
    }
    current = path.dirname(current)
  }

  log("findPluginConfigDir: no matching config found, walked up to filesystem root:", root)
  return null
}

export { findPluginConfigDir }
