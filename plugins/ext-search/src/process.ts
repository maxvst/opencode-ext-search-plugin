import { log } from "./constants"

async function spawn(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; exitCode: number }> {
  log.debug("spawn", { cmd: args[0], argsCount: args.length })
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
      return { stdout, exitCode }
    }
  } catch {
    // Bun.spawn unavailable, fallback to child_process
  }

  try {
    const childProcess = await import("child_process")
    const stdout = childProcess.execFileSync(args[0], args.slice(1), {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      ...(cwd ? { cwd } : {}),
    })
    return { stdout, exitCode: 0 }
  } catch (e: any) {
    return { stdout: e.stdout || "", exitCode: e.status || 1 }
  }
}

export { spawn }
