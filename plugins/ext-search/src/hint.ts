function buildHint(dirs: string[]): string {
  return (
    "\n\n(External dependencies may contain additional matches: " +
    dirs.join(", ") +
    ".\nUse the deps-read tool or search with grep/glob specifying an external directory path.)"
  )
}

function buildRgFallbackHint(dirs: string[]): string {
  return (
    "\n\n(ripgrep not available. External dependency directories: " +
    dirs.join(", ") +
    ".\nUse the deps-read tool or search with glob specifying an external directory path to explore their contents.)"
  )
}

export { buildHint, buildRgFallbackHint }
