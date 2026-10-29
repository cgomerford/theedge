// src/lib/article-blocks.ts
//
// Small pure helpers shared by the article renderer (server) and the writer (browser): URL safety and the pipe-table format.

/** Only http(s) URLs are ever rendered into an href or src; anything else (javascript:, data:) becomes null. */
export function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** "Pitch | Use | Whiff" on the first line, one row per line after it. Cells are split on |. */
export function parseTable(raw: string): { head: string[]; rows: string[][] } {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { head: [], rows: [] }
  const cells = (l: string) => l.split('|').map(c => c.trim())
  return { head: cells(lines[0]), rows: lines.slice(1).map(cells) }
}
