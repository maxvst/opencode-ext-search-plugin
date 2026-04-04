import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, "fixtures", "monorepo")
const PLUGIN_DIR = path.resolve(__dirname, "..", "plugins", "ext-search")

export interface Dirs {
  root: string
  app: string
  sharedTypes: string
  commonUtils: string
}

export function createTestDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ext-search-test-"))
}

export function getDirs(testDir: string): Dirs {
  return {
    root: testDir,
    app: path.join(testDir, "packages", "my-app"),
    sharedTypes: path.join(testDir, "packages", "shared-types"),
    commonUtils: path.join(testDir, "packages", "common-utils"),
  }
}

export function setupTestMonorepo(testDir?: string): Dirs {
  const dir = testDir ?? createTestDir()

  fs.cpSync(FIXTURES_DIR, dir, { recursive: true })
  fs.cpSync(PLUGIN_DIR, path.join(dir, "plugins", "ext-search"), { recursive: true })

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@test.com",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@test.com",
  }
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" })
  execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" })
  execFileSync("git", ["commit", "-m", "init"], {
    cwd: dir,
    stdio: "pipe",
    env: gitEnv,
  })

  return getDirs(dir)
}

export function cleanup(testDir: string): void {
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}

export function getTestDirs(): Dirs {
  const testDir = process.env.EXT_SEARCH_TEST_DIR
  if (!testDir) throw new Error("EXT_SEARCH_TEST_DIR env not set — was global-setup executed?")
  return getDirs(testDir)
}
