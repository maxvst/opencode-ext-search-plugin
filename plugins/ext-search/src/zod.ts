import path from "path"
import os from "os"
import { log } from "./constants"

async function findZod(): Promise<any> {
  log("findZod: attempting to import 'zod'...")
  try {
    const z = await import("zod")
    log("findZod: direct import succeeded")
    return z
  } catch {
    log("findZod: direct import failed")
  }

  if (typeof Bun !== "undefined" && typeof Bun.resolveSync === "function") {
    const candidates = [
      path.dirname(process.execPath),
      path.join(path.dirname(process.execPath), ".."),
      path.join(os.homedir(), ".opencode"),
      os.homedir(),
    ]
    log("findZod: trying Bun.resolveSync with candidates:", JSON.stringify(candidates))
    const seen = new Set<string>()
    for (const dir of candidates) {
      if (seen.has(dir)) continue
      seen.add(dir)
      try {
        const resolved = Bun.resolveSync("zod", dir)
        log("findZod: Bun.resolveSync found zod at:", resolved)
        return await import(resolved)
      } catch {
        log("findZod: Bun.resolveSync failed for dir:", dir)
      }
    }
  }

  log("findZod: zod NOT found anywhere")
  return null
}

export { findZod }
