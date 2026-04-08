const DEBUG = !!process.env.EXT_SEARCH_DEBUG

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogClient {
  app: {
    log: (opts: {
      body: { service: string; level: LogLevel; message: string; extra?: Record<string, unknown> }
    }) => Promise<any>
  }
}

let _client: LogClient | null = null

function setLogClient(client: LogClient): void {
  _client = client
}

function _send(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (_client) {
    _client.app.log({
      body: { service: "ext-search", level, message, extra },
    }).catch(() => {})
    return
  }
  if (!DEBUG) return
  const ts = new Date().toISOString().slice(11, 19)
  console.error(`[ext-search ${ts}] [${level}]`, message, extra ?? "")
}

const log = {
  debug(message: string, extra?: Record<string, unknown>) { _send("debug", message, extra) },
  info(message: string, extra?: Record<string, unknown>) { _send("info", message, extra) },
  warn(message: string, extra?: Record<string, unknown>) { _send("warn", message, extra) },
  error(message: string, extra?: Record<string, unknown>) { _send("error", message, extra) },
}

export { log, setLogClient, DEBUG }
export type { LogClient, LogLevel }
