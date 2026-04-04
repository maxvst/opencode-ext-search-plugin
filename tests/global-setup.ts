import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { setupTestMonorepo, cleanup } from "./setup"

const OPENCODE = process.env.OPENCODE_BIN || path.join(os.homedir(), ".opencode", "bin", "opencode")

export default function globalSetup() {
  if (!fs.existsSync(OPENCODE)) {
    console.log(`SKIP: opencode not found at ${OPENCODE}`)
    process.exit(0)
  }

  const dirs = setupTestMonorepo()
  process.env.EXT_SEARCH_TEST_DIR = dirs.root

  console.log(`Test dir: ${dirs.root}`)
  console.log(`Opencode: ${OPENCODE}\n`)

  return () => {
    cleanup(dirs.root)
  }
}
