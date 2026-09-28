// Copied, not imported, from the app's lib/mentions.ts; tests/cli-mentions.test.ts in the app checks they agree.
const WORD = /[\p{L}\p{N}_-]/u

function matchesAt(text: string, at: number, name: string): boolean {
  if (text.slice(at, at + name.length).toLowerCase() !== name.toLowerCase()) return false
  const after = text[at + name.length]
  return after === undefined || !WORD.test(after)
}

export function mentionedNames(text: string, names: readonly string[]): string[] {
  const ordered = [...new Set(names.filter((name) => name.length > 0))].sort((a, b) => b.length - a.length)
  const found: string[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@') continue
    const before = text[index - 1]
    if (before !== undefined && WORD.test(before)) continue
    const name = ordered.find((candidate) => matchesAt(text, index + 1, candidate))
    if (!name) continue
    found.push(name)
    index += name.length
  }
  return found
}
