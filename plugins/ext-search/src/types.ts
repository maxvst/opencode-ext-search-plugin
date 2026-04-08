interface PluginContext {
  directory: string
  worktree: string
  [key: string]: unknown
}

interface SearchDeps {
  resolvedDirs: string[]
  excludePatterns: string[]
  maxResults: number
  worktree: string
  openDir: string
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

export type { PluginContext, SearchDeps, GrepDeps, ToolOutput, Options }
