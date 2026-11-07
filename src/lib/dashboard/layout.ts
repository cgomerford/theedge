// src/lib/dashboard/layout.ts
//
// The shape of a My x9Lab dashboard and the rules for it. The layout is plain JSON saved per person (user_dashboards.layout). Everything that arrives from a
// browser goes through parseLayout, which keeps only widgets and slicers that are well formed, use stats that exist, and fit the person's plan, so a saved layout
// can never carry something the plan does not allow. Client-safe (no server imports).

import { STATS, allowedStats, statDef, type Role } from './stats'

export const FREE_WIDGET_LIMIT = 6
export const PRO_WIDGET_LIMIT = 24
export const SLICER_LIMIT = 5

export type Size = 'S' | 'M' | 'L' | 'XL'   // 3, 6, 9 or 12 of the 12 grid columns
export const SPAN: Record<Size, number> = { S: 3, M: 6, L: 9, XL: 12 }

export type Slicer =
  | { id: string; kind: 'range'; role: Role; stat: string; lo: number | null; hi: number | null }
  | { id: string; kind: 'team'; team: string }

export type Widget =
  | { id: string; kind: 'kpi'; size: Size; role: Role; stat: string; agg: 'leader' | 'average' | 'median' | 'total' }
  | { id: string; kind: 'leaders'; size: Size; role: Role; stat: string; n: number; dir: 'best' | 'worst' }
  | { id: string; kind: 'scatter'; size: Size; role: Role; x: string; y: string }
  | { id: string; kind: 'myPlayers'; size: Size }
  | { id: string; kind: 'myTeams'; size: Size }
  | { id: string; kind: 'starred'; size: Size }

export type Layout = { v: 1; slicers: Slicer[]; widgets: Widget[] }
export const WIDGET_KINDS: Widget['kind'][] = ['kpi', 'leaders', 'scatter', 'myPlayers', 'myTeams', 'starred']

const SIZES: Size[] = ['S', 'M', 'L', 'XL']
const isRole = (v: unknown): v is Role => v === 'batter' || v === 'pitcher'
const isSize = (v: unknown): v is Size => SIZES.includes(v as Size)
const str = (v: unknown, max = 40) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

let counter = 0
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

const statOk = (role: Role, key: unknown, isPro: boolean) => typeof key === 'string' && allowedStats(role, isPro).some(s => s.key === key)

/** Keep only what is well formed and allowed for the plan. Returns null when there is nothing usable at all (the caller then uses the starter layout). */
export function parseLayout(input: unknown, isPro: boolean): Layout | null {
  const o = rec(input)
  if (!o || !Array.isArray(o.widgets) || !Array.isArray(o.slicers)) return null
  const limit = isPro ? PRO_WIDGET_LIMIT : FREE_WIDGET_LIMIT
  const seen = new Set<string>()
  const uniq = (id: string) => { if (seen.has(id)) return false; seen.add(id); return true }

  const slicers: Slicer[] = []
  for (const raw of o.slicers) {
    const s = rec(raw), id = s ? str(s.id) : null
    if (!s || !id || !uniq(id) || slicers.length >= SLICER_LIMIT) continue
    if (s.kind === 'team') { const team = typeof s.team === 'string' && /^[A-Z]{2,3}$/.test(s.team) ? s.team : ''; slicers.push({ id, kind: 'team', team }) }
    else if (s.kind === 'range' && isRole(s.role) && statOk(s.role, s.stat, isPro)) slicers.push({ id, kind: 'range', role: s.role, stat: s.stat as string, lo: num(s.lo), hi: num(s.hi) })
  }

  const widgets: Widget[] = []
  for (const raw of o.widgets) {
    const w = rec(raw), id = w ? str(w.id) : null
    if (!w || !id || !uniq(id) || widgets.length >= limit || !isSize(w.size)) continue
    const size = w.size
    if (w.kind === 'myPlayers' || w.kind === 'myTeams' || w.kind === 'starred') widgets.push({ id, kind: w.kind, size })
    else if (w.kind === 'kpi' && isRole(w.role) && statOk(w.role, w.stat, isPro) && ['leader', 'average', 'median', 'total'].includes(w.agg as string)) widgets.push({ id, kind: 'kpi', size, role: w.role, stat: w.stat as string, agg: w.agg as 'leader' | 'average' | 'median' | 'total' })
    else if (w.kind === 'leaders' && isRole(w.role) && statOk(w.role, w.stat, isPro) && (w.dir === 'best' || w.dir === 'worst')) {
      const n = Math.min(10, Math.max(3, Math.round(num(w.n) ?? 5)))
      widgets.push({ id, kind: 'leaders', size, role: w.role, stat: w.stat as string, n, dir: w.dir })
    } else if (w.kind === 'scatter' && isRole(w.role) && statOk(w.role, w.x, isPro) && statOk(w.role, w.y, isPro)) widgets.push({ id, kind: 'scatter', size, role: w.role, x: w.x as string, y: w.y as string })
  }
  return widgets.length === 0 && slicers.length === 0 ? null : { v: 1, slicers, widgets }
}

/** What a person sees before they have built anything: league leaders, a "who is outperforming" scatter, and their own follows. */
export function starterLayout(isPro: boolean): Layout {
  const widgets: Widget[] = [
    { id: 'k-hr', kind: 'kpi', size: 'S', role: 'batter', stat: 'home_run', agg: 'leader' },
    { id: 'k-avg', kind: 'kpi', size: 'S', role: 'batter', stat: 'batting_avg', agg: 'leader' },
    { id: 'k-era', kind: 'kpi', size: 'S', role: 'pitcher', stat: 'p_era', agg: 'leader' },
    { id: 'k-so', kind: 'kpi', size: 'S', role: 'pitcher', stat: 'p_strikeout', agg: 'leader' },
    { id: 'l-hr', kind: 'leaders', size: 'M', role: 'batter', stat: 'home_run', n: 5, dir: 'best' },
    { id: 'l-era', kind: 'leaders', size: 'M', role: 'pitcher', stat: 'p_era', n: 5, dir: 'best' },
    { id: 's-obp', kind: 'scatter', size: 'M', role: 'batter', x: 'on_base_percent', y: 'slg_percent' },
    { id: 's-woba', kind: 'scatter', size: 'M', role: 'batter', x: 'xwoba', y: 'woba' },
    { id: 'my-p', kind: 'myPlayers', size: 'M' },
    { id: 'my-t', kind: 'myTeams', size: 'M' },
    { id: 'my-s', kind: 'starred', size: 'M' },
  ]
  // a free account holds six widgets: keep the most useful six (two tiles, two leaderboards, a scatter and their follows)
  const free = ['k-hr', 'k-era', 'l-hr', 'l-era', 's-obp', 'my-p']
  return {
    v: 1,
    slicers: [
      { id: 'sl-pa', kind: 'range', role: 'batter', stat: 'pa', lo: 100, hi: null },
      { id: 'sl-ip', kind: 'range', role: 'pitcher', stat: 'p_ip', lo: 30, hi: null },
    ],
    widgets: isPro ? widgets : widgets.filter(w => free.includes(w.id)),
  }
}

export const statLabel = (role: Role, key: string) => statDef(role, key)?.label ?? key
export const knownStatKeys = new Set(STATS.map(s => `${s.role}:${s.key}`))
