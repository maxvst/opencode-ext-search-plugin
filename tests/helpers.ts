import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"

export const OPENCODE =
  process.env.OPENCODE_BIN || path.join(os.homedir(), ".opencode", "bin", "opencode")

export interface OpencodeResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface ToolEvent {
  type: string
  part?: {
    tool: string
    state?: {
      status: string
      output: string
    }
  }
}

export function runOpencode(args: string[], cwd: string): OpencodeResult {
  try {
    const stdout = execFileSync(OPENCODE, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
      env: { ...process.env, NO_COLOR: "1" },
    })
    return { stdout: stdout.toString(), stderr: "", exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number }
    return {
      stdout: e.stdout ? e.stdout.toString() : "",
      stderr: e.stderr ? e.stderr.toString() : "",
      exitCode: e.status || 1,
    }
  }
}

export function runOpencodeJson(message: string, cwd: string): Record<string, unknown>[] {
  const result = runOpencode(["run", "--format", "json", "--dir", cwd, message], cwd)
  const events: Record<string, unknown>[] = []
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith("{")) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // skip unparseable lines
    }
  }
  return events
}

export function findToolEvents(events: Record<string, unknown>[], toolName: string): ToolEvent[] {
  return events.filter(
    (e): e is ToolEvent =>
      e.type === "tool_use" &&
      (e as ToolEvent).part !== undefined &&
      (e as ToolEvent).part!.tool === toolName &&
      (e as ToolEvent).part!.state !== undefined &&
      (e as ToolEvent).part!.state!.status === "completed",
  )
}

export function getToolNames(events: Record<string, unknown>[]): string[] {
  const all = events.filter((e) => e.type === "tool_use") as ToolEvent[]
  return [...new Set(all.map((e) => e.part?.tool).filter(Boolean) as string[])]
}
