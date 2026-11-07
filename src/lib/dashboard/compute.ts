// src/lib/dashboard/compute.ts
//
// The arithmetic behind the dashboard widgets, on the league rows the browser holds. Slicers filter the rows first, then each widget reads what it needs.
// A player missing a stat is left out of that stat's numbers, never counted as zero. Client-safe.

import type { Role } from './stats'
import { statDef } from './stats'
import type { Slicer } from './layout'

export type LeagueRow = { id: number; name: string; team: string | null; pos: string | null; s: Record<string, number> }

/** Rows of one role that pass every slicer that applies to that role (range slicers of the same role, and the team slicer). */
export function sliced(rows: LeagueRow[], role: Role, slicers: Slicer[]): LeagueRow[] {
  return rows.filter(r => slicers.every(sl => {
    if (sl.kind === 'team') return !sl.team || r.team === sl.team
    if (sl.role !== role) return true
    const v = r.s[sl.stat]
    if (v == null) return sl.lo == null && sl.hi == null   // a player with no number for the slicer's stat only stays if the slicer is open
    return (sl.lo == null || v >= sl.lo) && (sl.hi == null || v <= sl.hi)
  }))
}

const withStat = (rows: LeagueRow[], stat: string) => rows.filter(r => r.s[stat] != null)

/** Players ranked best first by the stat (best = the way that is good for the player), or worst first. */
export function ranked(rows: LeagueRow[], role: Role, stat: string, dir: 'best' | 'worst'): LeagueRow[] {
  const def = statDef(role, stat)
  const high = (def?.better ?? 'high') === 'high'
  const sign = (dir === 'best') === high ? -1 : 1   // -1 sorts high to low
  return withStat(rows, stat).sort((a, b) => sign * (a.s[stat] - b.s[stat]) || a.name.localeCompare(b.name))
}

export type Kpi = { value: number | null; who: string | null; n: number }
export function kpi(rows: LeagueRow[], role: Role, stat: string, agg: 'leader' | 'average' | 'median' | 'total'): Kpi {
  const have = withStat(rows, stat)
  if (have.length === 0) return { value: null, who: null, n: 0 }
  if (agg === 'leader') { const top = ranked(have, role, stat, 'best')[0]; return { value: top.s[stat], who: `${top.name}${top.team ? ` · ${top.team}` : ''}`, n: have.length } }
  const vals = have.map(r => r.s[stat]).sort((a, b) => a - b)
  if (agg === 'total') return { value: vals.reduce((a, b) => a + b, 0), who: null, n: vals.length }
  if (agg === 'median') { const m = Math.floor(vals.length / 2); return { value: vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2, who: null, n: vals.length } }
  return { value: vals.reduce((a, b) => a + b, 0) / vals.length, who: null, n: vals.length }
}

export type Point = { id: number; name: string; team: string | null; x: number; y: number }
export function scatterPoints(rows: LeagueRow[], x: string, y: string): Point[] {
  return rows.filter(r => r.s[x] != null && r.s[y] != null).map(r => ({ id: r.id, name: r.name, team: r.team, x: r.s[x], y: r.s[y] }))
}

/** Where a value sits among the players with that stat, 1 (lowest) to 99 (highest), for "league average" style context. */
export function leagueMean(rows: LeagueRow[], stat: string): number | null {
  const v = withStat(rows, stat).map(r => r.s[stat])
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
