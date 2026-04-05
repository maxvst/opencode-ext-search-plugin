import path from "path"
import os from "os"
import fs from "fs"

function resolveDirectories(dirs: string[], basePath: string): string[] {
  const result: string[] = []
  for (const d of dirs) {
    let resolved: string
    if (d.startsWith("~/") || d === "~") {
      resolved = path.join(os.homedir(), d.slice(1))
    } else if (path.isAbsolute(d)) {
      resolved = d
    } else {
      resolved = path.resolve(basePath, d)
    }
    try {
      const stat = fs.statSync(resolved)
      if (stat.isDirectory()) result.push(resolved)
    } catch {
      // skip inaccessible directories
    }
  }
  return result
}

function isPathInExternalDirs(searchPath: string, resolvedDirs: string[]): boolean {
  const normalized = path.resolve(searchPath)
  return resolvedDirs.some(
    (d) => normalized === d || normalized.startsWith(d + path.sep),
  )
}

export { resolveDirectories, isPathInExternalDirs }
