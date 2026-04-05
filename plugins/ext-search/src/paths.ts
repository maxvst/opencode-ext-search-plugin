import path from "path"
import os from "os"
import fs from "fs"
import { log } from "./constants"

function resolveDirectories(dirs: string[], basePath: string): string[] {
  log("resolveDirectories: basePath =", basePath, ", input dirs:", JSON.stringify(dirs))
  const result: string[] = []
  for (const d of dirs) {
    let resolved: string
    if (d.startsWith("~/") || d === "~") {
      resolved = path.join(os.homedir(), d.slice(1))
      log("resolveDirectories:", JSON.stringify(d), "→ (home expansion) →", resolved)
    } else if (path.isAbsolute(d)) {
      resolved = d
      log("resolveDirectories:", JSON.stringify(d), "→ (absolute) →", resolved)
    } else {
      resolved = path.resolve(basePath, d)
      log("resolveDirectories:", JSON.stringify(d), "→ (relative to basePath) →", resolved)
    }
    try {
      const exists = fs.existsSync(resolved)
      const isDir = exists && fs.statSync(resolved).isDirectory()
      log("resolveDirectories:", resolved, "— exists:", exists, ", isDirectory:", isDir)
      if (exists && isDir) {
        result.push(resolved)
      }
    } catch (e: any) {
      log("resolveDirectories: error checking", resolved, ":", e.message || e)
    }
  }
  log("resolveDirectories: final resolved dirs:", JSON.stringify(result))
  return result
}

function isPathInExternalDirs(
  searchPath: string,
  resolvedDirs: string[],
): boolean {
  const normalized = path.resolve(searchPath)
  const result = resolvedDirs.some(
    (d) => normalized === d || normalized.startsWith(d + path.sep),
  )
  log("isPathInExternalDirs: searchPath =", searchPath, ", normalized =", normalized, ", result =", result)
  return result
}

export { resolveDirectories, isPathInExternalDirs }
