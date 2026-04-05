import path from "path"
import fs from "fs"
import { log } from "./constants"

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

export { parseRgOutput, formatGrepResults, readFileContent }
