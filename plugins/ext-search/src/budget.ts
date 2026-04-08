const TOTAL_BUDGET = 100

function countNonEmptyLines(text: string): number {
  return text.split("\n").filter((l) => l.trim().length > 0).length
}

function calculateBudget(outputText: string): number {
  return Math.max(0, TOTAL_BUDGET - countNonEmptyLines(outputText))
}

function mergeExternalOutput(mainOutput: string, externalOutput: string): string {
  if (!externalOutput) return mainOutput
  if (mainOutput.includes("No files found")) return externalOutput
  return mainOutput + "\n\n--- External dependencies ---\n" + externalOutput
}

export { TOTAL_BUDGET, countNonEmptyLines, calculateBudget, mergeExternalOutput }
export { buildHint, buildRgFallbackHint } from "./hint"
