import path from "path"
import os from "os"
import fs from "fs"

const IS_WIN = process.platform === "win32"
const RG_BIN = IS_WIN ? "rg.exe" : "rg"

const IGNORE_TOOLS = new Set([
  "bash",
  "read",
  "write",
  "edit",
  "apply_patch",
  "task",
  "webfetch",
  "websearch",
  "codesearch",
  "skill",
  "question",
  "todo",
  "batch",
  "plan",
  "lsp",
  "deps_read",
])

type Options = {
  directories: string[]
  excludePatterns?: string[]
  maxResults?: number
}

function getOpenCodeBinPaths(): string[] {
  const home = os.homedir()
  const paths: string[] = []

  if (process.platform === "darwin") {
    paths.push(path.join(home, "Library", "Caches", "opencode", "bin"))
    paths.push(
      path.join(home, "Library", "Application Support", "opencode", "bin"),
    )
  } else if (IS_WIN) {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming")
    paths.push(path.join(localAppData, "opencode", "bin"))
    paths.push(path.join(appData, "opencode", "bin"))
  } else {
    const xdgCacheHome =
      process.env.XDG_CACHE_HOME || path.join(home, ".cache")
    const xdgDataHome =
      process.env.XDG_DATA_HOME || path.join(home, ".local", "share")
    paths.push(path.join(xdgCacheHome, "opencode", "bin"))
    paths.push(path.join(xdgDataHome, "opencode", "bin"))
  }

  paths.push(path.join(home, ".opencode", "bin"))
  return paths
}

let cachedRgPath: string | null = null
let rgPathResolved = false

function findRgBinary(): string | null {
  if (rgPathResolved) return cachedRgPath
  rgPathResolved = true

  const pathEnv = process.env.PATH || ""
  const pathSep = IS_WIN ? ";" : ":"
  const pathExt = IS_WIN
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""]

  for (const dir of pathEnv.split(pathSep)) {
    if (!dir) continue
    for (const ext of pathExt) {
      const candidate = path.join(dir, RG_BIN + ext)
      try {
        if (fs.existsSync(candidate)) {
          cachedRgPath = candidate
          return cachedRgPath
        }
      } catch {}
    }
  }

  for (const dir of getOpenCodeBinPaths()) {
    const candidate = path.join(dir, RG_BIN)
    try {
      if (fs.existsSync(candidate)) {
        cachedRgPath = candidate
        return cachedRgPath
      }
    } catch {}
  }

  return null
}

function resolveDirectories(dirs: string[], worktree: string): string[] {
  const result: string[] = []
  for (const d of dirs) {
    let resolved: string
    if (d.startsWith("~/") || d === "~") {
      resolved = path.join(os.homedir(), d.slice(1))
    } else if (path.isAbsolute(d)) {
      resolved = d
    } else {
      resolved = path.resolve(worktree, d)
    }
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        result.push(resolved)
      }
    } catch {}
  }
  return result
}

function isPathInExternalDirs(
  searchPath: string,
  resolvedDirs: string[],
): boolean {
  const normalized = path.resolve(searchPath)
  return resolvedDirs.some(
    (d) => normalized === d || normalized.startsWith(d + path.sep),
  )
}

function parseRgOutput(
  raw: string,
): Array<{ filePath: string; lineNum: number; lineText: string }> {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean)
  const entries: Array<{ filePath: string; lineNum: number; lineText: string }> =
    []
  for (const line of lines) {
    const sep1 = line.indexOf("|")
    if (sep1 === -1) continue
    const sep2 = line.indexOf("|", sep1 + 1)
    if (sep2 === -1) continue
    const filePath = line.substring(0, sep1)
    const lineNum = parseInt(line.substring(sep1 + 1, sep2), 10)
    const lineText = line.substring(sep2 + 1)
    if (isNaN(lineNum)) continue
    entries.push({ filePath, lineNum, lineText })
  }
  return entries
}

function formatGrepResults(
  entries: Array<{ filePath: string; lineNum: number; lineText: string }>,
  maxResults: number,
): { output: string; count: number } {
  if (entries.length === 0) return { output: "", count: 0 }
  const limited = entries.slice(0, maxResults)
  const outputLines: string[] = [`Found ${limited.length} matches`]
  let currentFile = ""
  for (const entry of limited) {
    if (currentFile !== entry.filePath) {
      if (currentFile !== "") outputLines.push("")
      currentFile = entry.filePath
      outputLines.push(`${entry.filePath}:`)
    }
    const truncatedLine =
      entry.lineText.length > 2000
        ? entry.lineText.substring(0, 2000) + "..."
        : entry.lineText
    outputLines.push(`  Line ${entry.lineNum}: ${truncatedLine}`)
  }
  return { output: outputLines.join("\n"), count: limited.length }
}

async function spawn(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; exitCode: number }> {
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
  } catch {}

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

function shouldExclude(relPath: string, excludePatterns: string[]): boolean {
  const parts = relPath.split(/[/\\]/)
  const basename = parts[parts.length - 1]
  for (const pattern of excludePatterns) {
    if (!pattern.includes("*") && !pattern.includes("?") && !pattern.includes("[")) {
      if (parts.includes(pattern)) return true
      continue
    }
    if (globMatches(basename, pattern)) return true
  }
  return false
}

function globMatches(str: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${regexStr}$`).test(str)
}

async function searchExternalGrep(
  pattern: string,
  include: string | undefined,
  resolvedDirs: string[],
  excludePatterns: string[],
  maxResults: number,
  searchPath: string | undefined,
  rgPath: string,
): Promise<{ output: string; count: number }> {
  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    return { output: "", count: 0 }
  }

  const excludeArgs: string[] = []
  for (const p of excludePatterns) {
    excludeArgs.push("--glob", `!${p}`)
  }

  const args = [
    rgPath,
    "-n",
    "--hidden",
    "--no-messages",
    "--field-match-separator=|",
    `--max-count=${maxResults}`,
    ...excludeArgs,
  ]
  if (include) {
    args.push("--glob", include)
  }
  args.push("--regexp", pattern, ...resolvedDirs)

  try {
    const { stdout, exitCode } = await spawn(args)
    if (exitCode === 0 || (exitCode === 2 && stdout.trim())) {
      const entries = parseRgOutput(stdout)
      if (entries.length === 0) return { output: "", count: 0 }
      return formatGrepResults(entries, maxResults)
    }
  } catch {}

  return { output: "", count: 0 }
}

async function searchExternalGlob(
  pattern: string,
  resolvedDirs: string[],
  excludePatterns: string[],
  maxResults: number,
  searchPath: string | undefined,
): Promise<{ output: string; count: number }> {
  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    return { output: "", count: 0 }
  }

  const files: string[] = []

  if (typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined") {
    for (const dir of resolvedDirs) {
      if (files.length >= maxResults) break
      try {
        const glob = new Bun.Glob(pattern)
        for await (const relPath of glob.scan({ cwd: dir, absolute: false })) {
          if (files.length >= maxResults) break
          if (shouldExclude(relPath, excludePatterns)) continue
          files.push(path.resolve(dir, relPath))
        }
      } catch {}
    }
  } else {
    for (const dir of resolvedDirs) {
      if (files.length >= maxResults) break
      try {
        function walk(d: string, base: string) {
          if (files.length >= maxResults) return
          const entries = fs.readdirSync(d, { withFileTypes: true })
          for (const entry of entries) {
            if (files.length >= maxResults) return
            const rel = path.join(base, entry.name)
            if (shouldExclude(rel, excludePatterns)) continue
            if (entry.isDirectory()) {
              walk(path.join(d, entry.name), rel)
            } else if (entry.isFile()) {
              files.push(path.resolve(dir, rel))
            }
          }
        }
        walk(dir, "")
      } catch {}
    }
  }

  if (files.length === 0) return { output: "", count: 0 }
  const limited = files.slice(0, maxResults)
  return { output: limited.join("\n"), count: limited.length }
}

async function findZod(): Promise<any> {
  try {
    return await import("zod")
  } catch {}

  if (typeof Bun !== "undefined" && typeof Bun.resolveSync === "function") {
    const candidates = [
      path.dirname(process.execPath),
      path.join(path.dirname(process.execPath), ".."),
      path.join(os.homedir(), ".opencode"),
      os.homedir(),
    ]
    const seen = new Set<string>()
    for (const dir of candidates) {
      if (seen.has(dir)) continue
      seen.add(dir)
      try {
        const resolved = Bun.resolveSync("zod", dir)
        return await import(resolved)
      } catch {}
    }
  }

  return null
}

function readFileContent(
  filePath: string,
  offset?: number,
  limit?: number,
): string {
  const resolvedPath = path.resolve(filePath)
  const content = fs.readFileSync(resolvedPath, "utf-8")
  const lines = content.split(/\r?\n/)
  const startLine = Math.max(1, offset ?? 1)
  const lineLimit = limit ?? 2000
  const selectedLines = lines.slice(startLine - 1, startLine - 1 + lineLimit)

  if (selectedLines.length === 0) {
    return `Error: no lines in range ${startLine}-${startLine + lineLimit - 1} (file has ${lines.length} lines)`
  }

  const numbered = selectedLines.map((line, i) => {
    const lineNum = startLine + i
    const truncated =
      line.length > 2000 ? line.substring(0, 2000) + "..." : line
    return `${lineNum}: ${truncated}`
  })

  let result = numbered.join("\n")
  if (lines.length > startLine - 1 + lineLimit) {
    result += `\n\n(showing lines ${startLine}-${startLine - 1 + selectedLines.length} of ${lines.length})`
  }
  return result
}

const extSearchPlugin = async (ctx: any, options?: Options) => {
  const opts = options ?? ({} as Options)
  if (
    !opts.directories ||
    !Array.isArray(opts.directories) ||
    opts.directories.length === 0
  ) {
    return {}
  }

  const maxResults = opts.maxResults ?? 50
  const excludePatterns = opts.excludePatterns ?? [
    "node_modules",
    ".git",
    "dist",
  ]
  const worktree = path.resolve(ctx.worktree)
  const openDir = path.resolve(ctx.directory)
  const resolvedDirs = resolveDirectories(opts.directories, ctx.worktree)

  if (resolvedDirs.length === 0) return {}

  const rgPath = findRgBinary()

  let depsReadTool: Record<string, any> = {}
  try {
    const z = await findZod()
    if (!z) throw new Error("zod not found")
    const zodZ = z.z || z.default || z

    depsReadTool = {
      deps_read: {
        description:
          "Read a file from external dependency directories. Use absolute paths from grep/glob external results.",
        args: {
          filePath: zodZ.string().describe("Absolute path to the file"),
          offset: zodZ
            .coerce.number()
            .optional()
            .describe("Line number to start from (1-indexed)"),
          limit: zodZ
            .coerce.number()
            .optional()
            .describe("Maximum lines to read (default 2000)"),
        },
        async execute(args: any) {
          const resolvedPath = path.resolve(args.filePath)
          const isAllowed = resolvedDirs.some(
            (d) => resolvedPath === d || resolvedPath.startsWith(d + path.sep),
          )
          if (!isAllowed) {
            return `Error: path "${args.filePath}" is not within configured external directories`
          }
          try {
            if (!fs.existsSync(resolvedPath)) {
              return `Error: file not found: ${args.filePath}`
            }
            const stat = fs.statSync(resolvedPath)
            if (stat.size > 10 * 1024 * 1024) {
              return `Error: file is too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use offset/limit.`
            }
            return readFileContent(resolvedPath, args.offset, args.limit)
          } catch (err: any) {
            return `Error reading file: ${err.message || err}`
          }
        },
      },
    }
  } catch {}

  function isNarrowSearchPath(searchPath: string | undefined): boolean {
    if (!searchPath) return false
    const normalized = path.resolve(searchPath)
    return normalized !== worktree && normalized !== openDir
  }

  return {
    "tool.execute.after": async (input: any, output: any) => {
      if (IGNORE_TOOLS.has(input.tool)) return

      if (input.tool === "grep") {
        if (!rgPath) return
        const { pattern, include, path: searchPath } = input.args || {}
        if (!pattern) return
        if (isNarrowSearchPath(searchPath)) return

        const external = await searchExternalGrep(
          pattern,
          include,
          resolvedDirs,
          excludePatterns,
          maxResults,
          searchPath,
          rgPath,
        )
        if (!external.output) return

        if (output.output.includes("No files found")) {
          output.output = external.output
        } else {
          output.output +=
            "\n\n--- External dependencies ---\n" + external.output
        }
        output.metadata.matches =
          (output.metadata.matches ?? 0) + external.count
      }

      if (input.tool === "glob") {
        const { pattern, path: searchPath } = input.args || {}
        if (!pattern) return
        if (isNarrowSearchPath(searchPath)) return

        const external = await searchExternalGlob(
          pattern,
          resolvedDirs,
          excludePatterns,
          maxResults,
          searchPath,
        )
        if (!external.output) return

        if (output.output.includes("No files found")) {
          output.output = external.output
        } else {
          output.output +=
            "\n\n--- External dependencies ---\n" + external.output
        }
        output.metadata.count =
          (output.metadata.count ?? 0) + external.count
      }
    },

    tool: depsReadTool,
  }
}

export default { id: "ext-search", server: extSearchPlugin }
