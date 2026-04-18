import path from "path"
import { log } from "./logging"

function isAllowedPath(
  searchPath: string,
  configDir: string,
  resolvedDirs: string[],
): boolean {
  const normalized = path.resolve(searchPath)

  if (normalized === configDir || normalized.startsWith(configDir + path.sep)) {
    return true
  }

  for (const d of resolvedDirs) {
    if (normalized === d || normalized.startsWith(d + path.sep)) {
      return true
    }
  }

  return false
}

function createStrictPathBeforeHook(
  configDir: string,
  resolvedDirs: string[],
  openDir: string,
): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    const toolName = input.tool as string
    if (toolName !== "glob" && toolName !== "grep") return

    const rawPath = output.args?.path
    if (!rawPath) return

    const resolvedPath = path.isAbsolute(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(openDir, rawPath)

    if (isAllowedPath(resolvedPath, configDir, resolvedDirs)) {
      log.debug("strict-paths: path allowed", { tool: toolName, path: resolvedPath })
      return
    }

    log.info("strict-paths: redirecting path to configDir", {
      tool: toolName,
      original: resolvedPath,
      redirected: configDir,
    })
    output.args.path = configDir
  }
}

export { isAllowedPath, createStrictPathBeforeHook }
