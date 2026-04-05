import path from "path"
import os from "os"
import { log } from "./constants"

async function findZod(): Promise<any> {
  try {
    return await import("zod")
  } catch {
    // direct import failed
  }

  if (typeof Bun !== "undefined" && typeof Bun.resolveSync === "function") {
    const candidates = [
      path.dirname(process.execPath),
      path.join(path.dirname(process.execPath), ".."),
      path.join(os.homedir(), ".opencode"),
      os.homedir(),
    ]
    const seen = new Set<string>()
    for (const dir of candidates) {
      if (seen.has(dir)) continue
      seen.add(dir)
      try {
        const resolved = Bun.resolveSync("zod", dir)
        return await import(resolved)
      } catch {
        // skip failed resolution
      }
    }
  }

  log.warn("zod not found")
  return null
}

export { findZod }
