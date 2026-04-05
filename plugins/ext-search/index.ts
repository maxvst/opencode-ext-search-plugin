import path from "path"
import os from "os"
import fs from "fs"
import { fileURLToPath } from "node:url"

const IS_WIN = process.platform === "win32"
const RG_BIN = IS_WIN ? "rg.exe" : "rg"

const DEBUG = !!process.env.EXT_SEARCH_DEBUG

function log(...args: unknown[]): void {
  if (!DEBUG) return
  const ts = new Date().toISOString().slice(11, 19)
  console.error(`[ext-search ${ts}]`, ...args)
}

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
  root?: string
  directories: string[]
  excludePatterns?: string[]
  maxResults?: number
}

function getOpenCodeBinPaths(): string[] {
  const home = os.homedir()
  const prefixes: string[] = []

  if (process.platform === "darwin") {
    prefixes.push(home)
  } else if (IS_WIN) {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming")
    prefixes.push(localAppData, appData, home)
  } else {
    const xdgCacheHome =
      process.env.XDG_CACHE_HOME || path.join(home, ".cache")
    const xdgDataHome =
      process.env.XDG_DATA_HOME || path.join(home, ".local", "share")
    prefixes.push(xdgCacheHome, xdgDataHome, home)
  }

  const suffixes = [
    "opencode/bin",
    ".opencode/bin",
    ".cache/opencode/bin",
    ".local/share/opencode/bin",
    "Library/Caches/opencode/bin",
    "Library/Application Support/opencode/bin",
  ]

  const paths: string[] = []
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      paths.push(path.join(prefix, suffix))
    }
  }
  log("getOpenCodeBinPaths: platform=%s, prefixes=%o, candidate paths:", process.platform, prefixes)
  for (const p of paths) {
    log("  ", p)
  }
  return paths
}

let cachedRgPath: string | null = null
let rgPathResolved = false

function findRgBinary(): string | null {
  if (rgPathResolved) {
    log("findRgBinary: returning cached result:", cachedRgPath)
    return cachedRgPath
  }
  rgPathResolved = true

  const pathEnv = process.env.PATH || ""
  const pathSep = IS_WIN ? ";" : ":"
  const pathExt = IS_WIN
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""]

  log("findRgBinary: searching in PATH...")
  for (const dir of pathEnv.split(pathSep)) {
    if (!dir) continue
    for (const ext of pathExt) {
      const candidate = path.join(dir, RG_BIN + ext)
      try {
        if (fs.existsSync(candidate)) {
          cachedRgPath = candidate
          log("findRgBinary: found rg in PATH:", candidate)
          return cachedRgPath
        }
      } catch {
        log("findRgBinary: error checking PATH candidate:", candidate)
      }
    }
  }

  log("findRgBinary: not in PATH, searching OpenCode bin directories...")
  for (const dir of getOpenCodeBinPaths()) {
    const candidate = path.join(dir, RG_BIN)
    try {
      if (fs.existsSync(candidate)) {
        cachedRgPath = candidate
        log("findRgBinary: found rg in OpenCode bin dir:", candidate)
        return cachedRgPath
      }
    } catch {
      log("findRgBinary: error checking OpenCode bin candidate:", candidate)
    }
  }

  log("findRgBinary: rg NOT found anywhere")
  return null
}

function findPluginConfigDir(startDir: string): string | null {
  let pluginDir: string
  try {
    pluginDir = path.dirname(fileURLToPath(import.meta.url))
  } catch {
    log("findPluginConfigDir: failed to determine plugin directory from import.meta.url")
    return null
  }

  log("findPluginConfigDir: pluginDir =", pluginDir, ", startDir =", startDir)

  let current = path.resolve(startDir)
  const root = path.parse(current).root

  while (current !== root) {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const configPath = path.join(current, name)
      try {
        if (!fs.existsSync(configPath)) continue
        const raw = fs.readFileSync(configPath, "utf-8")
        const config = JSON.parse(raw)
        if (!Array.isArray(config.plugin)) {
          log("findPluginConfigDir:", configPath, "— no 'plugin' array, skipping")
          continue
        }
        for (const entry of config.plugin) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") {
            log("findPluginConfigDir:", configPath, "— entry is not [string, opts]:", JSON.stringify(entry))
            continue
          }
          const resolved = path.resolve(current, entry[0])
          log("findPluginConfigDir:", configPath, "— plugin entry[0]:", entry[0], ", resolved:", resolved, ", pluginDir:", pluginDir)
          if (resolved === pluginDir) {
            log("findPluginConfigDir: MATCH found! configDir =", current)
            return current
          }
        }
      } catch (e: any) {
        log("findPluginConfigDir: error reading/parsing", configPath, ":", e.message || e)
      }
    }
    current = path.dirname(current)
  }

  log("findPluginConfigDir: no matching config found, walked up to filesystem root:", root)
  return null
}

function resolveDirectories(dirs: string[], basePath: string): string[] {
  log("resolveDirectories: basePath =", basePath, ", input dirs:", JSON.stringify(dirs))
  const result: string[] = []
  for (const d of dirs) {
    let resolved: string
    if (d.startsWith("~/") || d === "~") {
      resolved = path.join(os.homedir(), d.slice(1))
      log("resolveDirectories:", JSON.stringify(d), "→ (home expansion) →", resolved)
    } else if (path.isAbsolute(d)) {
      resolved = d
      log("resolveDirectories:", JSON.stringify(d), "→ (absolute) →", resolved)
    } else {
      resolved = path.resolve(basePath, d)
      log("resolveDirectories:", JSON.stringify(d), "→ (relative to basePath) →", resolved)
    }
    try {
      const exists = fs.existsSync(resolved)
      const isDir = exists && fs.statSync(resolved).isDirectory()
      log("resolveDirectories:", resolved, "— exists:", exists, ", isDirectory:", isDir)
      if (exists && isDir) {
        result.push(resolved)
      }
    } catch (e: any) {
      log("resolveDirectories: error checking", resolved, ":", e.message || e)
    }
  }
  log("resolveDirectories: final resolved dirs:", JSON.stringify(result))
  return result
}

function isPathInExternalDirs(
  searchPath: string,
  resolvedDirs: string[],
): boolean {
  const normalized = path.resolve(searchPath)
  const result = resolvedDirs.some(
    (d) => normalized === d || normalized.startsWith(d + path.sep),
  )
  log("isPathInExternalDirs: searchPath =", searchPath, ", normalized =", normalized, ", result =", result)
  return result
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
  log("searchExternalGrep: pattern =", JSON.stringify(pattern), ", include =", include, ", searchPath =", searchPath)
  log("searchExternalGrep: resolvedDirs =", JSON.stringify(resolvedDirs))

  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    log("searchExternalGrep: searchPath is inside external dirs, skipping to avoid duplication")
    return { output: "", count: 0 }
  }

  log(">>> LAUNCHING external grep search")
  log("    pattern:       ", JSON.stringify(pattern))
  log("    include:       ", include ?? "(none)")
  log("    searchPath:    ", searchPath ?? "(none)")
  log("    resolvedDirs:  ", JSON.stringify(resolvedDirs))
  log("    excludePats:   ", JSON.stringify(excludePatterns))
  log("    maxResults:    ", maxResults)
  log("    rgPath:        ", rgPath)

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
    log("searchExternalGrep: rg exitCode =", exitCode, ", stdout length:", stdout.length)
    if (exitCode === 0 || (exitCode === 2 && stdout.trim())) {
      const entries = parseRgOutput(stdout)
      log("searchExternalGrep: parsed", entries.length, "entries from rg output")
      if (entries.length === 0) return { output: "", count: 0 }
      const formatted = formatGrepResults(entries, maxResults)
      log("searchExternalGrep: returning", formatted.count, "formatted results")
      return formatted
    }
    log("searchExternalGrep: rg exitCode", exitCode, "with no usable output")
  } catch (e: any) {
    log("searchExternalGrep: exception:", e.message || e)
  }

  return { output: "", count: 0 }
}

async function searchExternalGlob(
  pattern: string,
  resolvedDirs: string[],
  excludePatterns: string[],
  maxResults: number,
  searchPath: string | undefined,
): Promise<{ output: string; count: number }> {
  log("searchExternalGlob: pattern =", JSON.stringify(pattern), ", searchPath =", searchPath)
  log("searchExternalGlob: resolvedDirs =", JSON.stringify(resolvedDirs))

  if (searchPath && isPathInExternalDirs(searchPath, resolvedDirs)) {
    log("searchExternalGlob: searchPath is inside external dirs, skipping to avoid duplication")
    return { output: "", count: 0 }
  }

  log(">>> LAUNCHING external glob search")
  log("    pattern:       ", JSON.stringify(pattern))
  log("    searchPath:    ", searchPath ?? "(none)")
  log("    resolvedDirs:  ", JSON.stringify(resolvedDirs))
  log("    excludePats:   ", JSON.stringify(excludePatterns))
  log("    maxResults:    ", maxResults)

  const files: string[] = []

  if (typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined") {
    log("searchExternalGlob: using Bun.Glob engine")
    for (const dir of resolvedDirs) {
      if (files.length >= maxResults) break
      try {
        const glob = new Bun.Glob(pattern)
        let scanned = 0
        for await (const relPath of glob.scan({ cwd: dir, absolute: false })) {
          scanned++
          if (files.length >= maxResults) break
          if (shouldExclude(relPath, excludePatterns)) continue
          files.push(path.resolve(dir, relPath))
        }
        log("searchExternalGlob: Bun.Glob scanned", scanned, "entries in", dir, ", accepted:", files.length)
      } catch (e: any) {
        log("searchExternalGlob: Bun.Glob error in", dir, ":", e.message || e)
      }
    }
  } else {
    log("searchExternalGlob: Bun.Glob unavailable, using fallback fs.walk")
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
        log("searchExternalGlob: fs.walk found", files.length, "files in", dir)
      } catch (e: any) {
        log("searchExternalGlob: fs.walk error in", dir, ":", e.message || e)
      }
    }
  }

  if (files.length === 0) {
    log("searchExternalGlob: no files found")
    return { output: "", count: 0 }
  }
  const limited = files.slice(0, maxResults)
  log("searchExternalGlob: returning", limited.length, "files")
  return { output: limited.join("\n"), count: limited.length }
}

async function findZod(): Promise<any> {
  log("findZod: attempting to import 'zod'...")
  try {
    const z = await import("zod")
    log("findZod: direct import succeeded")
    return z
  } catch {
    log("findZod: direct import failed")
  }

  if (typeof Bun !== "undefined" && typeof Bun.resolveSync === "function") {
    const candidates = [
      path.dirname(process.execPath),
      path.join(path.dirname(process.execPath), ".."),
      path.join(os.homedir(), ".opencode"),
      os.homedir(),
    ]
    log("findZod: trying Bun.resolveSync with candidates:", JSON.stringify(candidates))
    const seen = new Set<string>()
    for (const dir of candidates) {
      if (seen.has(dir)) continue
      seen.add(dir)
      try {
        const resolved = Bun.resolveSync("zod", dir)
        log("findZod: Bun.resolveSync found zod at:", resolved)
        return await import(resolved)
      } catch {
        log("findZod: Bun.resolveSync failed for dir:", dir)
      }
    }
  }

  log("findZod: zod NOT found anywhere")
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
  log("=== ext-search plugin initializing ===")
  log("ctx.directory =", ctx.directory)
  log("ctx.worktree =", ctx.worktree)
  log("ctx keys:", Object.keys(ctx).join(", "))
  log("platform:", process.platform, ", IS_WIN:", IS_WIN, ", Bun available:", typeof Bun !== "undefined")
  log("options:", JSON.stringify(options))

  const opts = options ?? ({} as Options)
  if (
    !opts.directories ||
    !Array.isArray(opts.directories) ||
    opts.directories.length === 0
  ) {
    log("plugin init: no directories configured or directories is empty, returning empty hooks")
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

  log("plugin init: worktree (resolved) =", worktree)
  log("plugin init: openDir (resolved) =", openDir)
  log("plugin init: opts.root =", opts.root)

  const configDir = findPluginConfigDir(openDir)
  log("plugin init: configDir =", configDir)

  const basePath = opts.root
    ? path.resolve(configDir || openDir, opts.root)
    : worktree

  if (opts.root) {
    log("plugin init: basePath = path.resolve(configDir || openDir, root) = path.resolve(", configDir || openDir, ",", opts.root, ") =", basePath)
  } else {
    log("plugin init: no root specified, basePath = worktree =", worktree)
  }

  const resolvedDirs = resolveDirectories(opts.directories, basePath)

  if (resolvedDirs.length === 0) {
    log("plugin init: resolvedDirs is EMPTY — no valid external directories found. Returning empty hooks.")
    log("plugin init: this likely means the directories in config don't exist relative to basePath =", basePath)
    return {}
  }

  const rgPath = findRgBinary()
  log("plugin init: rgPath =", rgPath)
  log("plugin init: maxResults =", maxResults)
  log("plugin init: excludePatterns =", JSON.stringify(excludePatterns))
  log("plugin init: resolvedDirs =", JSON.stringify(resolvedDirs))
  log("plugin init: worktree =", worktree)
  log("plugin init: openDir =", openDir)
  log("=== ext-search plugin initialized successfully ===")

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
          log("deps_read: filePath =", args.filePath, ", resolved =", resolvedPath)
          const isAllowed = resolvedDirs.some(
            (d) => resolvedPath === d || resolvedPath.startsWith(d + path.sep),
          )
          log("deps_read: isAllowed =", isAllowed, ", checked against dirs:", JSON.stringify(resolvedDirs))
          if (!isAllowed) {
            log("deps_read: DENIED — path not in external directories")
            return `Error: path "${args.filePath}" is not within configured external directories`
          }
          try {
            if (!fs.existsSync(resolvedPath)) {
              log("deps_read: file not found:", resolvedPath)
              return `Error: file not found: ${args.filePath}`
            }
            const stat = fs.statSync(resolvedPath)
            if (stat.size > 10 * 1024 * 1024) {
              log("deps_read: file too large:", stat.size, "bytes")
              return `Error: file is too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use offset/limit.`
            }
            log("deps_read: reading file, size =", stat.size, "bytes, offset =", args.offset, ", limit =", args.limit)
            return readFileContent(resolvedPath, args.offset, args.limit)
          } catch (err: any) {
            log("deps_read: error reading file:", err.message || err)
            return `Error reading file: ${err.message || err}`
          }
        },
      },
    }
    log("plugin init: deps_read tool registered successfully")
  } catch (e: any) {
    log("plugin init: deps_read tool NOT registered — zod not found:", e.message || e)
  }

  function isNarrowSearchPath(searchPath: string | undefined): boolean {
    if (!searchPath) {
      log("isNarrowSearchPath: no searchPath → false (will run external search)")
      return false
    }
    const normalized = path.resolve(searchPath)
    const result = normalized !== worktree && normalized !== openDir
    log("isNarrowSearchPath: searchPath =", searchPath, ", normalized =", normalized)
    log("isNarrowSearchPath: normalized !== worktree (", worktree, ") =", normalized !== worktree)
    log("isNarrowSearchPath: normalized !== openDir (", openDir, ") =", normalized !== openDir)
    log("isNarrowSearchPath: result =", result, result ? "→ NARROW, skipping external search" : "→ BROAD, will run external search")
    return result
  }

  return {
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = input.tool
      log("tool.execute.after: tool =", toolName)

      if (IGNORE_TOOLS.has(toolName)) {
        log("tool.execute.after: tool", toolName, "is in IGNORE_TOOLS, skipping")
        return
      }

      if (toolName === "grep") {
        if (!rgPath) {
          log("tool.execute.after: grep — no rg binary available, skipping external search")
          return
        }
        const { pattern, include, path: searchPath } = input.args || {}
        log("tool.execute.after: grep — pattern =", JSON.stringify(pattern), ", include =", include, ", searchPath =", searchPath)
        if (!pattern) {
          log("tool.execute.after: grep — no pattern, skipping")
          return
        }
        if (isNarrowSearchPath(searchPath)) {
          log("tool.execute.after: grep — searchPath is narrow, skipping external search")
          return
        }

        const external = await searchExternalGrep(
          pattern,
          include,
          resolvedDirs,
          excludePatterns,
          maxResults,
          searchPath,
          rgPath,
        )

        if (!external.output) {
          log("tool.execute.after: grep — external search returned no results")
          return
        }

        log("tool.execute.after: grep — external search returned", external.count, "results")
        if (output.output.includes("No files found")) {
          log("tool.execute.after: grep — built-in search found nothing, replacing output with external results")
          output.output = external.output
        } else {
          log("tool.execute.after: grep — appending external results to built-in results")
          output.output +=
            "\n\n--- External dependencies ---\n" + external.output
        }
        output.metadata.matches =
          (output.metadata.matches ?? 0) + external.count
        log("tool.execute.after: grep — total matches in metadata:", output.metadata.matches)
      }

      if (toolName === "glob") {
        const { pattern, path: searchPath } = input.args || {}
        log("tool.execute.after: glob — pattern =", JSON.stringify(pattern), ", searchPath =", searchPath)
        if (!pattern) {
          log("tool.execute.after: glob — no pattern, skipping")
          return
        }
        if (isNarrowSearchPath(searchPath)) {
          log("tool.execute.after: glob — searchPath is narrow, skipping external search")
          return
        }

        const external = await searchExternalGlob(
          pattern,
          resolvedDirs,
          excludePatterns,
          maxResults,
          searchPath,
        )

        if (!external.output) {
          log("tool.execute.after: glob — external search returned no results")
          return
        }

        log("tool.execute.after: glob — external search returned", external.count, "results")
        if (output.output.includes("No files found")) {
          log("tool.execute.after: glob — built-in search found nothing, replacing output with external results")
          output.output = external.output
        } else {
          log("tool.execute.after: glob — appending external results to built-in results")
          output.output +=
            "\n\n--- External dependencies ---\n" + external.output
        }
        output.metadata.count =
          (output.metadata.count ?? 0) + external.count
        log("tool.execute.after: glob — total count in metadata:", output.metadata.count)
      }
    },

    tool: depsReadTool,
  }
}

export default { id: "ext-search", server: extSearchPlugin }
