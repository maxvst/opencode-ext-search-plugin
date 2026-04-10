import fs from "fs"
import path from "path"
import { shouldExclude, walkDir } from "./exclusion"

export interface FsHost {
  existsSync(path: string): boolean
  readFileSync(path: string, encoding: string): string
  statSync(path: string): { isDirectory(): boolean; size: number }
  readdirSync(path: string, opts: { withFileTypes: boolean }): fs.Dirent[]
  globScan(pattern: string, dir: string, excludePatterns: string[], maxResults: number): Promise<string[]>
}

async function defaultGlobScan(
  pattern: string,
  dir: string,
  excludePatterns: string[],
  maxResults: number,
): Promise<string[]> {
  if (typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined") {
    const files: string[] = []
    let count = 0
    const glob = new Bun.Glob(pattern)
    for await (const relPath of glob.scan({ cwd: dir, absolute: false })) {
      if (count >= maxResults) break
      if (shouldExclude(relPath, excludePatterns)) continue
      files.push(path.resolve(dir, relPath))
      count++
    }
    return files
  }
  const files: string[] = []
  walkDir(dir, "", files, excludePatterns, maxResults)
  return files
}

const defaultFs: FsHost = {
  existsSync: (p) => fs.existsSync(p),
  readFileSync: (p, enc) => fs.readFileSync(p, enc as any),
  statSync: (p) => fs.statSync(p) as any,
  readdirSync: (p, opts) => fs.readdirSync(p, opts) as fs.Dirent[],
  globScan: defaultGlobScan,
}

let _fs: FsHost = defaultFs

export function getFsHost(): FsHost {
  return _fs
}

export function setFsHost(fsHost: FsHost): void {
  _fs = fsHost
}

export function resetFsHost(): void {
  _fs = defaultFs
}
