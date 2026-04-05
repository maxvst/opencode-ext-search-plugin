import { log } from "./constants"

async function spawn(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; exitCode: number }> {
  log("spawn: command:", args[0], "args:", args.slice(1).join(" "), cwd ? "cwd=" + cwd : "(no cwd)")
  try {
    if (typeof Bun !== "undefined" && typeof Bun.spawn === "function") {
      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
        ...(cwd ? { cwd } : {}),
      })
      const chunks: Uint8Array[] = []
      const reader = proc.stdout.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      const stdout = Buffer.concat(chunks).toString()
      const exitCode = await proc.exited
      log("spawn: Bun.spawn exited with code", exitCode, ", stdout length:", stdout.length)
      return { stdout, exitCode }
    }
  } catch (e: any) {
    log("spawn: Bun.spawn failed:", e.message || e)
  }

  try {
    const childProcess = await import("child_process")
    const stdout = childProcess.execFileSync(args[0], args.slice(1), {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      ...(cwd ? { cwd } : {}),
    })
    log("spawn: execFileSync succeeded, stdout length:", stdout.length)
    return { stdout, exitCode: 0 }
  } catch (e: any) {
    log("spawn: execFileSync failed:", e.message || e, ", exitCode:", e.status)
    return { stdout: e.stdout || "", exitCode: e.status || 1 }
  }
}

export { spawn }
