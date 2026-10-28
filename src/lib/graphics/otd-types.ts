// src/lib/graphics/otd-types.ts
//
// Plain data for the "On this day" and "Stat of the day" cards. A card is a headline, a subline, a body (one to several sections laid out side by side,
// optionally with a tile row under them) and nothing else: there is no field for a logo, headshot or team mark.

export type Tone = 'orange' | 'grey'

export type KvRow = { label: string; value: string }
export type OtdTileData = { label: string; value: string; detail?: string }

export type LinescoreRow = { team: string; runs: number[]; total: string }
export type TimelinePoint = { date: string; label: string; detail?: string }
export type VBar = { label: string; value: number; display?: string; tone: Tone }
export type HBar = { label: string; value: number; display: string; tone: Tone }
export type GameCell = { n: number; score: string; winner: string; won: boolean }
export type TradeGroup = { label: string; names: string[] }

export type OtdSectionData =
  | { type: 'kv'; label: string; rows: KvRow[] }
  | { type: 'linescore'; label: string; innings: number; highlight: number[]; rows: LinescoreRow[] }
  | { type: 'timeline'; label: string; points: TimelinePoint[] }
  | { type: 'vbars'; label: string; bars: VBar[]; marker?: { before: number; label: string }; note?: string; max?: number }
  | { type: 'hbars'; label: string; rows: HBar[]; max?: number }
  | { type: 'games'; label: string; games: GameCell[] }
  | { type: 'trade'; label: string; groups: TradeGroup[]; note?: { title: string; value: string; detail?: string } }
  | { type: 'slash'; label: string; line: string; caption: string; detail?: string }

export const SECTION_TYPES: { type: OtdSectionData['type']; name: string }[] = [
  { type: 'kv', name: 'Key-value table' }, { type: 'linescore', name: 'Linescore' }, { type: 'timeline', name: 'Timeline' },
  { type: 'vbars', name: 'Bar chart (vertical)' }, { type: 'hbars', name: 'Bar chart (comparison)' }, { type: 'games', name: 'Series scores' },
  { type: 'trade', name: 'Trade panel' }, { type: 'slash', name: 'Big slash line' },
]

/** Sections sit side by side in 16:9 (widths are ratios, e.g. [600, 508]) and stack in 4:5. A two-column comparison is two `kv` sections. */
export type OtdBody = { sections: OtdSectionData[]; widths?: number[]; tiles?: OtdTileData[] }
