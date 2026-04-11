import { spawn } from "node:child_process"
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

export async function runOpencode(args: string[], cwd: string): Promise<OpencodeResult> {
  return new Promise((resolve) => {
    const child = spawn(OPENCODE, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (data: Buffer) => { stdout += data.toString() })
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString() })

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
    }, 120_000)

    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: 1 })
    })

    child.stdin!.end()
  })
}

export async function runOpencodeJson(message: string, cwd: string): Promise<Record<string, unknown>[]> {
  const result = await runOpencode(["run", "--format", "json", "--dir", cwd, message], cwd)
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
