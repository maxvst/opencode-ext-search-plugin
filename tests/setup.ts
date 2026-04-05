import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, "fixtures", "monorepo")
const FIXTURES_DEEP_DIR = path.resolve(__dirname, "fixtures", "monorepo-deep")
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
    app: path.join(testDir, "team-alpha", "my-app"),
    sharedTypes: path.join(testDir, "shared-types"),
    commonUtils: path.join(testDir, "common-utils"),
  }
}

export function getDeepDirs(testDir: string): Dirs {
  return {
    root: testDir,
    app: path.join(testDir, "team-alpha", "services", "web", "my-app"),
    sharedTypes: path.join(testDir, "shared-types"),
    commonUtils: path.join(testDir, "common-utils"),
  }
}

export function setupTestMonorepo(testDir?: string): Dirs {
  const dir = testDir ?? createTestDir()

  fs.cpSync(FIXTURES_DIR, dir, { recursive: true })
  fs.cpSync(PLUGIN_DIR, path.join(dir, "team-alpha", ".opencode", "plugins", "ext-search"), { recursive: true })

  return getDirs(dir)
}

export function setupTestMonorepoDeep(testDir?: string): Dirs {
  const dir = testDir ?? createTestDir()

  fs.cpSync(FIXTURES_DEEP_DIR, dir, { recursive: true })
  fs.cpSync(PLUGIN_DIR, path.join(dir, "team-alpha", ".opencode", "plugins", "ext-search"), { recursive: true })

  return getDeepDirs(dir)
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

export function getDeepTestDirs(): Dirs {
  const testDir = process.env.EXT_SEARCH_DEEP_TEST_DIR
  if (!testDir) throw new Error("EXT_SEARCH_DEEP_TEST_DIR env not set — was global-setup executed?")
  return getDeepDirs(testDir)
}
