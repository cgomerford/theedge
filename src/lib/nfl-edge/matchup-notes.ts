// src/lib/nfl-edge/matchup-notes.ts
//
// "Matchup notes": the same head-to-head team stats the old lean read used, shown as plain numbers with
// the sample behind each and the rank among all 32 clubs. Replaces factors.ts (retired 8 Oct 2026).
//
// HOUSE RULES: nothing here counts who is ahead, names a winner, or scores the matchup. Each row is
// two numbers, a sample, and a rank. A rank is only given once BOTH clubs have played >= 3 games
// this season; before that the rank is null and the page says the sample is too small.
//
// Reads: nfl_team_form (via form.ts). Writes nothing.

import { column, leagueRates, rankOf, type LeagueForm, type Rates } from './form'
import type { NflGame } from './games'

export type MatchupNote = {
  id: string
  label: string                 // e.g. "Pass offense (EPA per dropback)"
  home: { value: number | null; rank: number | null; n: number }
  away: { value: number | null; rank: number | null; n: number }
  unit: 'epa' | 'pct' | 'yds'
  higherBetter: boolean         // direction the bar is drawn in; not a verdict
  foot: string                  // what the number is and what n counts
}

export const MIN_GAMES_FOR_RANK = 3

type Def = { id: string; label: string; unit: MatchupNote['unit']; higherBetter: boolean; foot: string; pick: (r: Rates) => number | null; n: (r: Rates) => number }

const DEFS: Def[] = [
  { id: 'passO', label: 'Pass offense (EPA per dropback)', unit: 'epa', higherBetter: true, foot: 'Expected points added per dropback. n = plays.', pick: r => r.passEpaO, n: r => Math.round(r.plays) },
  { id: 'rushO', label: 'Rush offense (EPA per carry)', unit: 'epa', higherBetter: true, foot: 'Expected points added per carry. n = plays.', pick: r => r.rushEpaO, n: r => Math.round(r.plays) },
  { id: 'passD', label: 'Pass defense (EPA allowed per dropback)', unit: 'epa', higherBetter: false, foot: 'Expected points allowed per opposing dropback; lower means fewer points allowed. n = plays.', pick: r => r.passEpaD, n: r => Math.round(r.plays) },
  { id: 'rushD', label: 'Rush defense (EPA allowed per carry)', unit: 'epa', higherBetter: false, foot: 'Expected points allowed per opposing carry; lower means fewer points allowed. n = plays.', pick: r => r.rushEpaD, n: r => Math.round(r.plays) },
  { id: 'prot', label: 'Pass protection (sack rate allowed)', unit: 'pct', higherBetter: false, foot: 'Sacks allowed per dropback; lower is fewer sacks. n = plays.', pick: r => r.sackAllowed, n: r => Math.round(r.plays) },
  { id: 'rz', label: 'Red zone (touchdown rate)', unit: 'pct', higherBetter: true, foot: 'Share of red-zone trips ending in a touchdown. n = offensive trips.', pick: r => r.rzTdO, n: r => r.rzTripsO },
]

export function getMatchupNotes(args: { game: NflGame; lf: LeagueForm }): MatchupNote[] {
  const { game, lf } = args
  const lr = leagueRates(lf)
  const home = lr.get(game.homeId), away = lr.get(game.awayId)
  if (!home || !away || lr.size < 16) return []
  const enough = (lf.cur.get(game.homeId)?.games ?? 0) >= MIN_GAMES_FOR_RANK && (lf.cur.get(game.awayId)?.games ?? 0) >= MIN_GAMES_FOR_RANK
  const out: MatchupNote[] = []
  for (const d of DEFS) {
    const hv = d.pick(home), av = d.pick(away)
    if (hv == null && av == null) continue
    const all = column(lr, d.pick)
    out.push({
      id: d.id, label: d.label, unit: d.unit, higherBetter: d.higherBetter,
      home: { value: hv, rank: enough ? rankOf(hv, all, d.higherBetter) : null, n: d.n(home) },
      away: { value: av, rank: enough ? rankOf(av, all, d.higherBetter) : null, n: d.n(away) },
      foot: d.foot,
    })
  }
  return out
}

export function formatNote(v: number | null, unit: MatchupNote['unit']): string {
  if (v == null) return '—'
  if (unit === 'epa') return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
  if (unit === 'pct') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(1)
}
