#!/usr/bin/env node
import { execFileSync } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

const OPENCODE = process.env.OPENCODE_BIN || path.join(os.homedir(), ".opencode", "bin", "opencode")
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ext-search-test-"))
const PLUGIN_DIR = path.resolve(import.meta.dirname ?? __dirname, "..", "plugins", "ext-search")

let passed = 0
let failed = 0
let skipped = 0

function log(msg) {
  process.stdout.write(`  ${msg}\n`)
}

function assertCondition(condition, msg) {
  if (condition) {
    log(`  ✓ ${msg}`)
    passed++
  } else {
    log(`  ✗ FAIL: ${msg}`)
    failed++
  }
}

function setupTestMonorepo() {
  const dirs = {
    root: TEST_DIR,
    app: path.join(TEST_DIR, "packages", "my-app"),
    sharedTypes: path.join(TEST_DIR, "packages", "shared-types"),
    commonUtils: path.join(TEST_DIR, "packages", "common-utils"),
  }

  for (const d of Object.values(dirs)) {
    fs.mkdirSync(d, { recursive: true })
  }

  fs.writeFileSync(
    path.join(dirs.sharedTypes, "types.ts"),
    `export interface UserProfile {\n  id: string;\n  name: string;\n  email: string;\n}\n\nexport type UserId = string;\n`
  )
  fs.writeFileSync(
    path.join(dirs.sharedTypes, "enums.ts"),
    `export enum Status {\n  Active = "active",\n  Inactive = "inactive",\n}\n`
  )
  fs.writeFileSync(
    path.join(dirs.commonUtils, "helpers.ts"),
    `export function formatDate(d) {\n  return d.toISOString().split("T")[0];\n}\n\nexport function parseConfig(raw) {\n  return Object.fromEntries(raw.split("\\n").map(line => {\n    const [k, ...v] = line.split("=");\n    return [k, v.join("=")];\n  }));\n}\n`
  )
  fs.writeFileSync(
    path.join(dirs.commonUtils, "validator.ts"),
    `export function isValidEmail(email) {\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);\n}\n`
  )
  fs.writeFileSync(
    path.join(dirs.app, "main.ts"),
    `import { UserProfile } from "../shared-types/types";\n\nfunction greet(user) {\n  return \`Hello, \${user.name}!\`;\n}\n`
  )
  fs.writeFileSync(
    path.join(dirs.app, "config.json"),
    `{\n  "name": "my-app",\n  "version": "1.0.0"\n}\n`
  )

  const sharedTypesGlob = dirs.sharedTypes + path.sep + "*"
  const commonUtilsGlob = dirs.commonUtils + path.sep + "*"

  fs.writeFileSync(
    path.join(dirs.root, "opencode.json"),
    JSON.stringify(
      {
        plugin: [
          [
            "./plugins/ext-search",
            {
              directories: ["packages/shared-types", "packages/common-utils"],
              excludePatterns: ["node_modules", ".git", "dist", "*.test.*"],
              maxResults: 50,
            },
          ],
        ],
        permission: {
          external_directory: {
            [sharedTypesGlob]: "allow",
            [commonUtilsGlob]: "allow",
          },
        },
      },
      null,
      2
    )
  )

  fs.cpSync(PLUGIN_DIR, path.join(dirs.root, "plugins", "ext-search"), { recursive: true })

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@test.com",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@test.com",
  }
  execFileSync("git", ["init"], { cwd: dirs.root, stdio: "pipe" })
  execFileSync("git", ["add", "-A"], { cwd: dirs.root, stdio: "pipe" })
  execFileSync("git", ["commit", "-m", "init"], { cwd: dirs.root, stdio: "pipe", env: gitEnv })

  return dirs
}

function runOpencode(args, cwd) {
  try {
    const stdout = execFileSync(OPENCODE, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    })
    return { stdout: stdout.toString(), stderr: "", exitCode: 0 }
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : "",
      stderr: err.stderr ? err.stderr.toString() : "",
      exitCode: err.status || 1,
    }
  }
}

function runOpencodeJson(message, cwd) {
  const result = runOpencode(["run", "--format", "json", "--dir", cwd, message], cwd)
  const events = []
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith("{")) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {}
  }
  return events
}

function findToolEvents(events, toolName) {
  return events.filter(
    (e) => e.type === "tool_use" && e.part && e.part.tool === toolName && e.part.state && e.part.state.status === "completed"
  )
}

function cleanup() {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {}
}

async function main() {
  process.stdout.write("\n=== ext-search plugin e2e tests ===\n\n")

  if (!fs.existsSync(OPENCODE)) {
    process.stdout.write(`SKIP: opencode not found at ${OPENCODE}\n`)
    process.exit(0)
  }

  process.stdout.write(`Test dir: ${TEST_DIR}\n`)
  process.stdout.write(`Plugin dir: ${PLUGIN_DIR}\n\n`)

  let dirs

  process.stdout.write("Setting up test monorepo...\n")
  try {
    dirs = setupTestMonorepo()
    assertCondition(true, "Test monorepo created successfully")
  } catch (err) {
    assertCondition(false, `Failed to create test monorepo: ${err.message}`)
    cleanup()
    process.exit(1)
  }

  process.stdout.write("\n--- Test 1: grep finds pattern in external dependencies ---\n")
  try {
    const events = runOpencodeJson(
      'Use the grep tool to search for the pattern "UserProfile" across the codebase. Only use the grep tool, nothing else.',
      dirs.app
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length > 0) {
      const output = grepEvents[0].part.state.output
      assertCondition(output.includes("External dependencies"), "grep output contains 'External dependencies' section")
      assertCondition(output.includes("UserProfile"), "grep output contains 'UserProfile'")
      assertCondition(output.includes("types.ts"), "grep output references types.ts from shared-types")
    } else {
      const allToolEvents = events.filter((e) => e.type === "tool_use")
      const toolNames = allToolEvents.map((e) => e.part && e.part.tool).filter(Boolean)
      log(`  ℹ No grep tool events found. Tools used: ${[...new Set(toolNames)].join(", ")}`)
      skipped++
      assertCondition(false, "grep tool was not called (LLM chose different approach)")
    }
  } catch (err) {
    assertCondition(false, `Test 1 error: ${err.message}`)
  }

  process.stdout.write("\n--- Test 2: glob finds files in external dependencies ---\n")
  try {
    const events = runOpencodeJson(
      'Use the glob tool with pattern "**/*.ts" to find all TypeScript files. Only use the glob tool, nothing else.',
      dirs.app
    )
    const globEvents = findToolEvents(events, "glob")
    if (globEvents.length > 0) {
      const output = globEvents[0].part.state.output
      assertCondition(output.includes("External dependencies"), "glob output contains 'External dependencies' section")
      assertCondition(output.includes("types.ts") || output.includes("helpers.ts"), "glob output contains files from external dirs")
    } else {
      const allToolEvents = events.filter((e) => e.type === "tool_use")
      const toolNames = allToolEvents.map((e) => e.part && e.part.tool).filter(Boolean)
      log(`  ℹ No glob tool events found. Tools used: ${[...new Set(toolNames)].join(", ")}`)
      skipped++
      assertCondition(false, "glob tool was not called (LLM chose different approach)")
    }
  } catch (err) {
    assertCondition(false, `Test 2 error: ${err.message}`)
  }

  process.stdout.write("\n--- Test 3: deps_read tool is registered ---\n")
  try {
    const typesFile = path.join(dirs.sharedTypes, "types.ts")
    const events = runOpencodeJson(
      `Use the deps_read tool to read the file at ${typesFile}. Only use deps_read.`,
      dirs.app
    )
    const depsReadEvents = findToolEvents(events, "deps_read")
    if (depsReadEvents.length > 0) {
      const output = depsReadEvents[0].part.state.output
      assertCondition(typeof output === "string" && output.length > 0, "deps_read returns content")
      assertCondition(output.includes("UserProfile") || output.includes("interface"), "deps_read returns file content with expected text")
    } else {
      const allToolEvents = events.filter((e) => e.type === "tool_use")
      const toolNames = allToolEvents.map((e) => e.part && e.part.tool).filter(Boolean)
      log(`  ℹ No deps_read tool events found. Tools used: ${[...new Set(toolNames)].join(", ")}`)
      skipped++
      assertCondition(false, "deps_read tool was not called (LLM chose different approach)")
    }
  } catch (err) {
    assertCondition(false, `Test 3 error: ${err.message}`)
  }

  process.stdout.write("\n--- Test 4: grep with include filter works ---\n")
  try {
    const events = runOpencodeJson(
      'Use the grep tool to search for "formatDate" in "*.ts" files only. Use include "*.ts".',
      dirs.app
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length > 0) {
      const output = grepEvents[0].part.state.output
      assertCondition(output.includes("External dependencies") || output.includes("helpers.ts"), "grep with include finds external results")
    } else {
      skipped++
      assertCondition(false, "grep tool was not called with include filter")
    }
  } catch (err) {
    assertCondition(false, `Test 4 error: ${err.message}`)
  }

  process.stdout.write("\n--- Test 5: plugin loads without errors ---\n")
  try {
    const debugResult = runOpencode(["debug", "config", "--dir", dirs.app], dirs.app)
    const hasPluginError = debugResult.stderr.toLowerCase().includes("error") && debugResult.stderr.toLowerCase().includes("plugin")
    assertCondition(!hasPluginError, "Plugin loads without errors")
  } catch (err) {
    assertCondition(false, `Test 5 error: ${err.message}`)
  }

  process.stdout.write("\n--- Test 6: grep no-duplicate when path is external dir ---\n")
  try {
    const events = runOpencodeJson(
      `Use the grep tool to search for "formatDate" in ${dirs.commonUtils}. Set the path parameter to ${dirs.commonUtils}.`,
      dirs.app
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length > 0) {
      const output = grepEvents[0].part.state.output
      const extDepsCount = (output.match(/--- External dependencies ---/g) || []).length
      assertCondition(extDepsCount <= 1, "No duplicate external dependencies section when path is external dir")
    } else {
      skipped++
      assertCondition(false, "grep tool was not called")
    }
  } catch (err) {
    assertCondition(false, `Test 6 error: ${err.message}`)
  }

  process.stdout.write("\n--- Test 7: grep with narrow subdirectory path skips external search ---\n")
  try {
    const subdir = path.join(dirs.app, "src")
    fs.mkdirSync(subdir, { recursive: true })
    fs.writeFileSync(path.join(subdir, "util.ts"), `export function narrowHelper() { return 42; }\n`)
    const events = runOpencodeJson(
      `Use the grep tool to search for "narrowHelper" in the subdirectory ${subdir}. Set the path parameter to ${subdir}. Only use grep.`,
      dirs.app
    )
    const grepEvents = findToolEvents(events, "grep")
    if (grepEvents.length > 0) {
      const output = grepEvents[0].part.state.output
      assertCondition(!output.includes("External dependencies"), "grep with narrow subdirectory path does NOT add external results")
    } else {
      skipped++
      assertCondition(false, "grep tool was not called for narrow path test")
    }
  } catch (err) {
    assertCondition(false, `Test 7 error: ${err.message}`)
  }

  process.stdout.write("\n--- Test 8: opencode run basic command works in test dir ---\n")
  try {
    const events = runOpencodeJson("Use bash to run: echo test-plugin-ok", dirs.app)
    const bashEvents = findToolEvents(events, "bash")
    if (bashEvents.length > 0) {
      const output = bashEvents[0].part.state.output
      assertCondition(output.includes("test-plugin-ok"), "Basic bash command works in test dir with plugin loaded")
    } else {
      assertCondition(false, "bash tool was not called")
    }
  } catch (err) {
    assertCondition(false, `Test 8 error: ${err.message}`)
  }

  process.stdout.write("\n=== Summary ===\n")
  process.stdout.write(`  Passed:  ${passed}\n`)
  process.stdout.write(`  Failed:  ${failed}\n`)
  process.stdout.write(`  Skipped: ${skipped}\n`)

  cleanup()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  process.stdout.write(`Fatal error: ${err}\n`)
  cleanup()
  process.exit(1)
})
