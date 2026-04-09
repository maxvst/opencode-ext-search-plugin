import path from "path"
import os from "os"
import { log } from "./logging"
import { getFsHost } from "./fs-host"

export type ResolveDirsResult = {
  resolved: string[]
  missing: string[]
}

function resolveDirectories(dirs: string[], basePath: string): ResolveDirsResult {
  log.debug("resolveDirectories", { dirs, basePath })
  const resolved: string[] = []
  const missing: string[] = []
  const fsHost = getFsHost()

  for (const d of dirs) {
    let resolvedPath: string
    if (d.startsWith("~/") || d === "~") {
      resolvedPath = path.join(os.homedir(), d.slice(1))
    } else if (path.isAbsolute(d)) {
      resolvedPath = d
    } else {
      resolvedPath = path.resolve(basePath, d)
    }
    try {
      const stat = fsHost.statSync(resolvedPath)
      if (stat.isDirectory()) {
        resolved.push(resolvedPath)
        log.debug("directory resolved", { dir: d, resolved: resolvedPath })
      } else {
        missing.push(d)
        log.warn("path is not a directory, skipping", { dir: d, resolved: resolvedPath })
      }
    } catch {
      missing.push(d)
      log.warn("directory not found, skipping", { dir: d, resolved: resolvedPath })
    }
  }
  return { resolved, missing }
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
  configDir: string | null,
): string {
  if (!root) return worktree
  const resolved = path.resolve(configDir || openDir, root)
  log.debug("basePath resolved", { root, configDir: configDir ?? openDir, resolved })
  return resolved
}

export { resolveDirectories, isPathInExternalDirs, resolveBasePath }
