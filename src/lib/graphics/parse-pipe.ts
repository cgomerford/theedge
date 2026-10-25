// src/lib/graphics/parse-pipe.ts
//
// Pipe list parser: "label value | label value | label value (sub)".
// The first numeric-looking word starts the value; a trailing "(text)" is the sub line.

import type { Stat } from './types'

export interface ParseError { index: number; message: string }

// Starts with a digit, ".", "+", "−" (U+2212) or "-" followed by a digit.
const NUMERIC = /^[+−-]?\.?\d/

export function parsePipeList(input: string): { stats: Stat[]; errors: ParseError[] } {
  const stats: Stat[] = []
  const errors: ParseError[] = []
  const entries = input.split('|').map(s => s.trim())
  entries.forEach((raw, index) => {
    if (!raw) {
      if (entries.length > 1) errors.push({ index, message: 'empty entry' })
      return
    }
    let text = raw
    let sub: string | undefined
    const m = text.match(/\(([^()]*)\)\s*$/)
    if (m) { sub = m[1].trim() || undefined; text = text.slice(0, m.index).trim() }
    const words = text.split(/\s+/)
    const at = words.findIndex(w => NUMERIC.test(w))
    if (at === -1) { errors.push({ index, message: `no number found in "${raw}"` }); return }
    if (at === 0) { errors.push({ index, message: `missing label before the number in "${raw}"` }); return }
    stats.push({ label: words.slice(0, at).join(' '), value: words.slice(at).join(' '), ...(sub ? { sub } : {}) })
  })
  return { stats, errors }
}

/** Numbered-list variant: each entry is "headline (explanation)"; the number is the entry order. */
export function parseItemList(input: string): Stat[] {
  return input.split('|').map(s => s.trim()).filter(Boolean).map((raw, i) => {
    const m = raw.match(/\(([^()]*)\)\s*$/)
    const label = (m ? raw.slice(0, m.index) : raw).trim()
    const sub = m?.[1].trim()
    return { label, value: String(i + 1), ...(sub ? { sub } : {}) }
  })
}
