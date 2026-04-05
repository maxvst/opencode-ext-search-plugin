import path from "path"
import fs from "fs"
import { log } from "./constants"
import { readFileContent } from "./output"
import { findZod } from "./zod"

async function createDepsReadTool(resolvedDirs: string[]): Promise<Record<string, any>> {
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
  return depsReadTool
}

export { createDepsReadTool }
