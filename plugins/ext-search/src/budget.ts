const TOTAL_BUDGET = 100

function countNonEmptyLines(text: string): number {
  return text.split("\n").filter((l) => l.trim().length > 0).length
}

function calculateBudget(outputText: string): number {
  return Math.max(0, TOTAL_BUDGET - countNonEmptyLines(outputText))
}

function buildHint(dirs: string[]): string {
  return (
    "\n\n(External dependencies may contain additional matches: " +
    dirs.join(", ") +
    ".\nUse the deps-read tool or search with grep/glob specifying an external directory path.)"
  )
}

function mergeExternalOutput(mainOutput: string, externalOutput: string): string {
  if (!externalOutput) return mainOutput
  if (mainOutput.includes("No files found")) return externalOutput
  return mainOutput + "\n\n--- External dependencies ---\n" + externalOutput
}

function buildRgFallbackHint(dirs: string[]): string {
  return (
    "\n\n(ripgrep not available. External dependency directories: " +
    dirs.join(", ") +
    ".\nUse the deps-read tool or search with glob specifying an external directory path to explore their contents.)"
  )
}

export { TOTAL_BUDGET, countNonEmptyLines, calculateBudget, buildHint, buildRgFallbackHint, mergeExternalOutput }
