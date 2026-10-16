// src/components/admin/stat-line/logic.ts
//
// Pure helpers for the stat-line graphic: team palette, gradient CSS, readable
// text colour, and turning an MLB Stats API game-log row into editable fields.
// The official colour data (src/lib/teams.ts) has two colours per club, so the
// palette adds shades/tints of each plus the Edge brand colours — nothing here
// pretends to be an official third colour.

import type { Team } from '@/lib/teams'

export type Swatch = { name: string; hex: string }
export type Gradient = { from: string; to: string; angle: number; style: 'linear' | 'radial' }

const hex2rgb = (h: string): [number, number, number] => {
  const s = h.replace('#', '')
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
const rgb2hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()

/** Mix toward black (amount<0) or white (amount>0), -1..1. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hex2rgb(hex)
  const t = amount < 0 ? 0 : 255, p = Math.abs(amount)
  return rgb2hex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p)
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const [r, g, b] = hex2rgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export const INK = '#1A1A1A'
export const CREAM = '#FAF8F3'

/** Ink on light gradients, cream on dark ones (judged on the average of both stops). */
export function textOn(g: Pick<Gradient, 'from' | 'to'>): string {
  return (luminance(g.from) + luminance(g.to)) / 2 > 0.4 ? INK : CREAM
}

/** Colours that belong to this club only: official primary + secondary, their blend, and deep/light shades of each. */
export function teamPalette(t: Pick<Team, 'name' | 'short' | 'primary_color' | 'secondary_color'>): Swatch[] {
  const p = t.primary_color, s = t.secondary_color
  return [
    { name: `${t.short} primary`, hex: p },
    { name: `${t.short} secondary`, hex: s },
    { name: `${t.short} blend`, hex: mix(p, s, 0.5) },
    { name: `${t.short} primary, deep`, hex: shade(p, -0.4) },
    { name: `${t.short} primary, light`, hex: shade(p, 0.35) },
    { name: `${t.short} secondary, deep`, hex: shade(s, -0.4) },
    { name: `${t.short} secondary, light`, hex: shade(s, 0.35) },
  ]
}

/** Shared Edge brand colours, shown separately so they never read as part of a club's palette. */
export const EDGE_NEUTRALS: Swatch[] = [
  { name: 'Edge orange', hex: '#FF5722' }, { name: 'Edge ink', hex: INK }, { name: 'Edge cream', hex: CREAM }, { name: 'White', hex: '#FFFFFF' },
]

/** Linear mix of two hex colours, t = 0 → a, 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex2rgb(a), [r2, g2, b2] = hex2rgb(b)
  return rgb2hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

export function defaultGradient(t: Pick<Team, 'primary_color' | 'secondary_color'>): Gradient {
  return { from: t.primary_color, to: t.secondary_color, angle: 135, style: 'linear' }
}

export function gradientCss(g: Gradient): string {
  return g.style === 'radial'
    ? `radial-gradient(circle at 70% 35%, ${g.from} 0%, ${g.to} 100%)`
    : `linear-gradient(${g.angle}deg, ${g.from} 0%, ${g.to} 100%)`
}

// ── game-log rows → editable stat fields ─────────────────────────────────
export type Group = 'hitting' | 'pitching'
export type Field = { label: string; value: string }
export type GameLine = {
  date: string; opponent: string; home: boolean
  headline: string                // "3-FOR-4" / "6.0 IP"
  fields: Field[]
}

type Stat = Record<string, unknown>
const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0)

export function hittingFields(s: Stat): Field[] {
  const f: Field[] = [
    { label: 'H', value: String(n(s.hits)) }, { label: 'HR', value: String(n(s.homeRuns)) }, { label: 'RBI', value: String(n(s.rbi)) },
    { label: 'R', value: String(n(s.runs)) }, { label: 'BB', value: String(n(s.baseOnBalls)) }, { label: 'K', value: String(n(s.strikeOuts)) },
  ]
  if (n(s.doubles)) f.push({ label: '2B', value: String(n(s.doubles)) })
  if (n(s.triples)) f.push({ label: '3B', value: String(n(s.triples)) })
  if (n(s.stolenBases)) f.push({ label: 'SB', value: String(n(s.stolenBases)) })
  return f.slice(0, 8)
}

export function pitchingFields(s: Stat): Field[] {
  const f: Field[] = [
    { label: 'IP', value: String(s.inningsPitched ?? '0.0') }, { label: 'K', value: String(n(s.strikeOuts)) }, { label: 'BB', value: String(n(s.baseOnBalls)) },
    { label: 'H', value: String(n(s.hits)) }, { label: 'ER', value: String(n(s.earnedRuns)) }, { label: 'R', value: String(n(s.runs)) },
  ]
  if (n(s.homeRuns)) f.push({ label: 'HR', value: String(n(s.homeRuns)) })
  if (n(s.numberOfPitches)) f.push({ label: 'PIT', value: String(n(s.numberOfPitches)) })
  return f.slice(0, 8)
}

export function headlineFor(group: Group, s: Stat): string {
  if (group === 'pitching') return `${s.inningsPitched ?? '0.0'} IP`
  return `${n(s.hits)}-FOR-${n(s.atBats)}`
}

export function toGameLine(group: Group, row: { date?: string; isHome?: boolean; opponent?: { name?: string }; stat?: Stat }): GameLine | null {
  if (!row?.stat || !row.date) return null
  return {
    date: row.date, opponent: row.opponent?.name ?? '', home: !!row.isHome,
    headline: headlineFor(group, row.stat),
    fields: group === 'pitching' ? pitchingFields(row.stat) : hittingFields(row.stat),
  }
}

/** "2026-09-27" → "Sep 27" */
export function shortDate(iso: string): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, m, d] = iso.split('-').map(Number)
  return `${M[m - 1]} ${d}`
}

// ── X post copy ──────────────────────────────────────────────────────────
export const X_LIMIT = 280
// House rules (CLAUDE.md §1): no betting vocabulary, no raw Edge Score, links go in replies.
const BANNED = /\b(picks?|locks?|odds|bets?|betting|parlay|fade|hammer|value bet|toss-up|edge score|start\/sit|sit\/start)\b/i
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b)/i

export type PostCheck = { length: number; over: boolean; hasLink: boolean; banned: string[] }

export function checkPost(text: string): PostCheck {
  const banned = Array.from(new Set((text.match(new RegExp(BANNED.source, 'gi')) ?? []).map(s => s.toLowerCase())))
  return { length: [...text].length, over: [...text].length > X_LIMIT, hasLink: LINK.test(text), banned }
}

/** A neutral first draft from the selected game line — edit freely. */
export function draftPost(o: { name: string; teamAbbr: string; context: string; headline: string; fields: Field[] }): string {
  const stats = o.fields.filter(f => f.value !== '0' && f.value !== '0.0' && f.label !== 'PIT').map(f => `${f.value} ${f.label}`).join(' · ')
  return [`${o.name} (${o.teamAbbr}): ${o.headline}`, stats, o.context].filter(Boolean).join('\n')
}
