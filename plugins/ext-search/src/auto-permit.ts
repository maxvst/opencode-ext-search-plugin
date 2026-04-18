import path from "path"
import { log } from "./logging"

interface PermissionClient {
  permission?: {
    reply(params: { requestID: string; reply: "once" | "always" | "reject" }): Promise<unknown>
  }
}

function extractBaseFromGlob(pattern: string): string {
  const clean = pattern.replace(/\/\*\*$/, "").replace(/\/\*$/, "")
  if (path.isAbsolute(clean)) return clean
  return ""
}

function isInsideExternalDirs(targetPath: string, resolvedDirs: string[]): boolean {
  const normalized = path.resolve(targetPath)
  return resolvedDirs.some(
    (d) => normalized === d || normalized.startsWith(d + path.sep),
  )
}

function isInsideDir(targetPath: string, dir: string): boolean {
  const normalized = path.resolve(targetPath)
  return normalized === dir || normalized.startsWith(dir + path.sep)
}

function shouldAutoApprove(
  permission: string,
  patterns: string[],
  metadata: Record<string, unknown>,
  resolvedDirs: string[],
  configDir: string | null,
): boolean {
  if (permission !== "external_directory") return false

  const pathsToCheck: string[] = []

  for (const p of patterns) {
    const base = extractBaseFromGlob(p)
    if (base) pathsToCheck.push(base)
  }

  if (typeof metadata.filepath === "string") {
    pathsToCheck.push(metadata.filepath)
  }
  if (typeof metadata.parentDir === "string") {
    pathsToCheck.push(metadata.parentDir)
  }

  if (pathsToCheck.some((p) => isInsideExternalDirs(p, resolvedDirs))) return true

  if (configDir && pathsToCheck.some((p) => isInsideDir(p, configDir))) return true

  return false
}

function createAutoPermitHandler(
  resolvedDirs: string[],
  client: PermissionClient,
  configDir: string | null = null,
): (input: { event: { type: string; properties?: any } }) => Promise<void> {
  return async (input) => {
    if (input.event.type !== "permission.asked") return

    const props = input.event.properties
    if (!props) return

    const { id, permission, patterns, metadata } = props
    if (!id || !permission || !Array.isArray(patterns)) return

    if (!shouldAutoApprove(permission, patterns, metadata || {}, resolvedDirs, configDir)) return

    if (!client.permission?.reply) {
      log.warn("auto-permit: client.permission.reply not available", { requestId: id })
      return
    }

    try {
      await client.permission.reply({ requestID: id, reply: "always" })
      log.info("auto-permit: approved external directory access", {
        requestId: id,
        permission,
        patterns,
      })
    } catch (err: any) {
      log.warn("auto-permit: reply failed", { requestId: id, error: err?.message })
    }
  }
}

export { createAutoPermitHandler, shouldAutoApprove, isInsideExternalDirs, isInsideDir, extractBaseFromGlob }
