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
  permission?: {
    reply(params: { requestID: string; reply: "once" | "always" | "reject" }): Promise<unknown>
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

type ExternalDir = {
  path: string
  source: "config" | "compile_commands" | "user"
  disabled?: boolean
}

type Options = {
  root?: string
  directories: string[]
  excludePatterns?: string[]
  maxResults?: number
  strict_path_restrictions?: boolean
  compile_commands_dir?: string
}

export type { PluginContext, PluginClient, SearchDeps, GrepDeps, ToolOutput, Options, ToastInput, ExternalDir }
