import path from "path"
import os from "os"
import fs from "fs"
import { log } from "./logging"
import { findPluginConfigDir } from "./config"

function resolveDirectories(dirs: string[], basePath: string): string[] {
  log.debug("resolveDirectories", { dirs, basePath })
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
      if (stat.isDirectory()) {
        result.push(resolved)
        log.debug("directory resolved", { dir: d, resolved })
      }
    } catch {
      log.warn("directory not found, skipping", { dir: d, resolved })
    }
  }
  return result
}

function isPathInExternalDirs(searchPath: string, resolvedDirs: string[]): boolean {
  const normalized = path.resolve(searchPath)
  const result = resolvedDirs.some(
    (d) => normalized === d || normalized.startsWith(d + path.sep),
  )
  log.debug("isPathInExternalDirs", { searchPath, normalized, resolvedDirs, result })
  return result
}

function resolveBasePath(
  root: string | undefined,
  openDir: string,
  worktree: string,
): string {
  if (!root) return worktree
  const configDir = findPluginConfigDir(openDir)
  const resolved = path.resolve(configDir || openDir, root)
  log.debug("basePath resolved", { root, configDir: configDir ?? openDir, resolved })
  return resolved
}

export { resolveDirectories, isPathInExternalDirs, resolveBasePath }
