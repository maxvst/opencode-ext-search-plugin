import fs from "fs"

export interface FsHost {
  existsSync(path: string): boolean
  readFileSync(path: string, encoding: string): string
  statSync(path: string): { isDirectory(): boolean; size: number }
}

const defaultFs: FsHost = {
  existsSync: (p) => fs.existsSync(p),
  readFileSync: (p, enc) => fs.readFileSync(p, enc as any),
  statSync: (p) => fs.statSync(p) as any,
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
