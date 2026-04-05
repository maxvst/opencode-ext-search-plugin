import path from "path"
import fs from "fs"
import { fileURLToPath } from "node:url"

function findPluginConfigDir(startDir: string): string | null {
  let pluginDir: string
  try {
    pluginDir = path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return null
  }

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
            return current
          }
        }
      } catch {
        // skip unreadable or invalid config files
      }
    }
    current = path.dirname(current)
  }

  return null
}

export { findPluginConfigDir }
