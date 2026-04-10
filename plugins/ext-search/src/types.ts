interface ToastInput {
  title?: string
  message: string
  variant?: "info" | "success" | "warning" | "error"
  duration?: number
}

interface PluginClient {
  showToast(params: ToastInput): Promise<unknown>
  app: {
    log(opts: {
      body: {
        service: string
        level: string
        message: string
        extra?: Record<string, unknown>
      }
    }): Promise<unknown>
  }
}

interface PluginContext {
  directory: string
  worktree: string
  client: PluginClient
  [key: string]: unknown
}

interface SearchDeps {
  resolvedDirs: string[]
  excludePatterns: string[]
  maxResults: number
  worktree: string
  openDir: string
  configDir: string | null
}

interface GrepDeps extends SearchDeps {
  rgPath: string
}

interface ToolOutput {
  output: string
  metadata: Record<string, unknown>
}

type Options = {
  root?: string
  directories: string[]
  excludePatterns?: string[]
  maxResults?: number
}

export type { PluginContext, PluginClient, SearchDeps, GrepDeps, ToolOutput, Options, ToastInput }
