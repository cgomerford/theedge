// src/components/admin/story-v5/remotion/custom.ts
//
// Custom slides: a small line, a headline, and a stack of blocks you add, remove and reorder. Pure data and helpers (no React) so the admin
// panel, the video and the tests all agree. Block heights are estimates used to warn before a slide overflows the space under the headline.

export type Team3 = 'away' | 'home' | 'both'
export type Block =
  | { id: string; type: 'number'; value: string; label: string }
  | { id: string; type: 'lines'; lines: string[] }
  | { id: string; type: 'logos'; teams: Team3; size: 's' | 'm' | 'l' }
  | { id: string; type: 'matchup'; pitchers: boolean; firstPitch: boolean }
  | { id: string; type: 'pitchers' }
  | { id: string; type: 'compare'; rows: { label: string; away: string; home: string }[] }
export type BlockType = Block['type']
export type CustomSlide = { kicker: string; headline: string; blocks: Block[] }

export const EMPTY_CUSTOM: CustomSlide = { kicker: '', headline: '', blocks: [] }
export const BLOCK_TYPES: { type: BlockType; label: string; blurb: string }[] = [
  { type: 'number', label: 'Big number', blurb: 'one big number or word with a label (a number counts up)' },
  { type: 'lines', label: 'Text lines', blurb: 'up to 4 short lines' },
  { type: 'logos', label: 'Team logos', blurb: 'one or both clubs, three sizes' },
  { type: 'matchup', label: 'Matchup', blurb: 'both logos, starting pitchers and first pitch time' },
  { type: 'pitchers', label: 'Starting pitchers', blurb: 'both starters with headshots' },
  { type: 'compare', label: 'Head to head table', blurb: 'rows you type: a label with a number for each club' },
]
export const MAX_LINES = 4, MAX_ROWS = 6
/** Vertical space under the headline, in video pixels. */
export const CONTENT_H = 760

let counter = 0
export const newId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`

export function newBlock(type: BlockType): Block {
  const id = newId()
  switch (type) {
    case 'number': return { id, type, value: '', label: '' }
    case 'lines': return { id, type, lines: [''] }
    case 'logos': return { id, type, teams: 'both', size: 'm' }
    case 'matchup': return { id, type, pitchers: true, firstPitch: true }
    case 'pitchers': return { id, type }
    case 'compare': return { id, type, rows: [{ label: '', away: '', home: '' }] }
  }
}

export const blockText = (b: Block): string[] =>
  b.type === 'number' ? [b.value, b.label] : b.type === 'lines' ? b.lines : b.type === 'compare' ? b.rows.flatMap(r => [r.label, r.away, r.home]) : []

/** A block with nothing to show (an empty number, empty lines, a table with no filled row) is left out of the video. */
export function blockReady(b: Block): boolean {
  if (b.type === 'number') return b.value.trim() !== ''
  if (b.type === 'lines') return b.lines.some(l => l.trim() !== '')
  if (b.type === 'compare') return b.rows.some(r => r.label.trim() !== '' && (r.away.trim() !== '' || r.home.trim() !== ''))
  return true
}

export function blockHeight(b: Block): number {
  switch (b.type) {
    case 'number': return 200 + (b.label.trim() ? 50 : 0)
    case 'lines': return b.lines.filter(l => l.trim()).length * 56
    case 'logos': return b.size === 's' ? 150 : b.size === 'm' ? 230 : 320
    case 'matchup': return 250 + (b.pitchers ? 120 : 0) + (b.firstPitch ? 50 : 0)
    case 'pitchers': return 190
    case 'compare': return 100 + b.rows.filter(r => r.label.trim()).length * 66
  }
}
export const GAP = 30
export function customHeight(c: CustomSlide): number {
  const bs = c.blocks.filter(blockReady)
  return bs.reduce((a, b) => a + blockHeight(b), 0) + Math.max(0, bs.length - 1) * GAP
}
/** The slide can be used once it has any words or any block that has something to show. */
export const customReady = (c: CustomSlide | undefined): boolean => !!c && (c.kicker.trim() !== '' || c.headline.trim() !== '' || c.blocks.some(blockReady))
export const customText = (c: CustomSlide): string[] => [c.kicker, c.headline, ...c.blocks.flatMap(blockText)]

/** Whatever was saved before (the first custom slide had value / valueLabel / lines) becomes blocks. Unknown shapes become an empty slide. */
export function migrateCustom(x: unknown): CustomSlide {
  const o = (x ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: CustomSlide = { kicker: str(o.kicker), headline: str(o.headline), blocks: [] }
  if (Array.isArray(o.blocks)) {
    for (const b of o.blocks as Record<string, unknown>[]) {
      const id = typeof b?.id === 'string' ? b.id : newId()
      switch (b?.type) {
        case 'number': out.blocks.push({ id, type: 'number', value: str(b.value), label: str(b.label) }); break
        case 'lines': out.blocks.push({ id, type: 'lines', lines: (Array.isArray(b.lines) ? b.lines.map(str) : ['']).slice(0, MAX_LINES) }); break
        case 'logos': out.blocks.push({ id, type: 'logos', teams: b.teams === 'away' || b.teams === 'home' ? b.teams : 'both', size: b.size === 's' || b.size === 'l' ? b.size : 'm' }); break
        case 'matchup': out.blocks.push({ id, type: 'matchup', pitchers: b.pitchers !== false, firstPitch: b.firstPitch !== false }); break
        case 'pitchers': out.blocks.push({ id, type: 'pitchers' }); break
        case 'compare': out.blocks.push({ id, type: 'compare', rows: (Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]).map(r => ({ label: str(r?.label), away: str(r?.away), home: str(r?.home) })) : [{ label: '', away: '', home: '' }]).slice(0, MAX_ROWS) }); break
      }
    }
  } else {
    if (str(o.value).trim() !== '') out.blocks.push({ id: newId(), type: 'number', value: str(o.value), label: str(o.valueLabel) })
    const lines = Array.isArray(o.lines) ? o.lines.map(str).filter(l => l.trim() !== '').slice(0, MAX_LINES) : []
    if (lines.length) out.blocks.push({ id: newId(), type: 'lines', lines })
  }
  return out
}

/** "+12%" -> { prefix: '+', num: 12, suffix: '%', decimals: 0 }. Anything that is not a plain number (with an optional sign and unit) returns null and is shown as typed. */
export function parseNumber(s: string): { prefix: string; num: number; suffix: string; decimals: number } | null {
  const m = /^\s*([+-]?)\s*(\.?\d[\d,]*\.?\d*|\.\d+)\s*([%a-zA-Z.]{0,6})\s*$/.exec(s)
  if (!m) return null
  const digits = m[2].replace(/,/g, '')
  const num = Number(digits)
  if (!Number.isFinite(num)) return null
  return { prefix: m[1] === '+' ? '+' : m[1] === '-' ? '-' : '', num, suffix: m[3], decimals: (digits.split('.')[1] ?? '').length }
}
