import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, "fixtures", "monorepo")
const FIXTURES_DEEP_DIR = path.resolve(__dirname, "fixtures", "monorepo-deep")
const FIXTURES_STRICT_DIR = path.resolve(__dirname, "fixtures", "monorepo-strict")
const FIXTURES_CC_DIR = path.resolve(__dirname, "fixtures", "monorepo-cc")
const FIXTURES_USER_DIR = path.resolve(__dirname, "fixtures", "monorepo-user")
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

export function setupTestMonorepoStrict(testDir?: string): Dirs {
  const dir = testDir ?? createTestDir()

  fs.cpSync(FIXTURES_STRICT_DIR, dir, { recursive: true })
  fs.cpSync(PLUGIN_DIR, path.join(dir, "team-alpha", ".opencode", "plugins", "ext-search"), { recursive: true })

  return getDirs(dir)
}

export interface CcDirs {
  root: string
  app: string
  ccExternal: string
}

export interface UserDirs {
  root: string
  app: string
  userExternal: string
}

export function getCcDirs(testDir: string): CcDirs {
  return {
    root: testDir,
    app: path.join(testDir, "team-alpha", "my-app"),
    ccExternal: path.join(testDir, "cc-external", "lib", "src"),
  }
}

export function setupTestMonorepoCC(testDir?: string): CcDirs {
  const dir = testDir ?? createTestDir()

  fs.cpSync(FIXTURES_CC_DIR, dir, { recursive: true })
  fs.cpSync(PLUGIN_DIR, path.join(dir, "team-alpha", ".opencode", "plugins", "ext-search"), { recursive: true })

  // Generate compile_commands.json with absolute paths pointing to the temp dir
  const ccContent = JSON.stringify([
    { directory: path.join(dir, "cc-external", "lib"), file: "src/cc_math.h" },
    { directory: path.join(dir, "cc-external", "lib"), file: "src/cc_types.h" },
  ])
  fs.mkdirSync(path.join(dir, "build"), { recursive: true })
  fs.writeFileSync(path.join(dir, "build", "compile_commands.json"), ccContent)

  return getCcDirs(dir)
}

export function getUserDirs(testDir: string): UserDirs {
  return {
    root: testDir,
    app: path.join(testDir, "team-alpha", "my-app"),
    userExternal: path.join(testDir, "user-external", "lib"),
  }
}

export function setupTestMonorepoUser(testDir?: string): UserDirs {
  const dir = testDir ?? createTestDir()

  fs.cpSync(FIXTURES_USER_DIR, dir, { recursive: true })
  fs.cpSync(PLUGIN_DIR, path.join(dir, "team-alpha", ".opencode", "plugins", "ext-search"), { recursive: true })

  const extSearchContent = JSON.stringify({
    user_dirs: [path.join(dir, "user-external", "lib")],
  })
  fs.writeFileSync(path.join(dir, "team-alpha", ".ext-search.json"), extSearchContent)

  return getUserDirs(dir)
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

export function getStrictTestDirs(): Dirs {
  const testDir = process.env.EXT_SEARCH_STRICT_TEST_DIR
  if (!testDir) throw new Error("EXT_SEARCH_STRICT_TEST_DIR env not set — was global-setup executed?")
  return getDirs(testDir)
}

export function getCcTestDirs(): CcDirs {
  const testDir = process.env.EXT_SEARCH_CC_TEST_DIR
  if (!testDir) throw new Error("EXT_SEARCH_CC_TEST_DIR env not set — was global-setup executed?")
  return getCcDirs(testDir)
}

export function getUserTestDirs(): UserDirs {
  const testDir = process.env.EXT_SEARCH_USER_TEST_DIR
  if (!testDir) throw new Error("EXT_SEARCH_USER_TEST_DIR env not set — was global-setup executed?")
  return getUserDirs(testDir)
}
