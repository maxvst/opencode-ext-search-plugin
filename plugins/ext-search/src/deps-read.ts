import path from "path"
import fs from "fs"
import { log } from "./constants"
import { readFileContent } from "./output"
import { findZod } from "./zod"

const MAX_FILE_SIZE = 10 * 1024 * 1024

async function createDepsReadTool(resolvedDirs: string[]): Promise<Record<string, any>> {
  try {
    const z = await findZod()
    if (!z) throw new Error("zod not found")
    const zodZ = z.z || z.default || z

    return {
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
          log.debug("deps_read execute", { filePath: args.filePath, offset: args.offset, limit: args.limit })
          const isAllowed = resolvedDirs.some(
            (d) => resolvedPath === d || resolvedPath.startsWith(d + path.sep),
          )
          if (!isAllowed) {
            log.warn("deps_read path not in external dirs", { filePath: args.filePath })
            return `Error: path "${args.filePath}" is not within configured external directories`
          }
          try {
            if (!fs.existsSync(resolvedPath)) {
              log.warn("deps_read file not found", { filePath: args.filePath })
              return `Error: file not found: ${args.filePath}`
            }
            const stat = fs.statSync(resolvedPath)
            if (stat.size > MAX_FILE_SIZE) {
              log.warn("deps_read file too large", { filePath: args.filePath, sizeMB: (stat.size / 1024 / 1024).toFixed(1) })
              return `Error: file is too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use offset/limit.`
            }
            return readFileContent(resolvedPath, args.offset, args.limit)
          } catch (err: any) {
            return `Error reading file: ${err.message || err}`
          }
        },
      },
    }
  } catch {
    log.warn("deps_read tool not registered: zod not found")
    return {}
  }
}

export { createDepsReadTool }
