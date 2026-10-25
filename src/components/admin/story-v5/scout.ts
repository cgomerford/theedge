// src/components/admin/story-v5/scout.ts
//
// Pure: the existing Scout Report desks (loadScoutExtras result) -> the numbers the optional "Scout Report" slide shows.
//   run  = the catcher each club will have behind the plate (pop time, caught stealing, steal attempts per game against) + ABS record
//   late = hitting in late and close games, with runners in scoring position and from the 7th on, plus the one-run record
// A missing number stays missing (null); a desk with nothing usable returns an empty list and the slide is simply unavailable.

import { headshotUrl } from './teams'
import type { ScoutLate, ScoutRun, ScoutSlides, Side } from './types'

type Strip = { label: string; value: number }
type RunCardLike = { catcher: { id: number; name: string; sb: number; cs: number; strips: Strip[] } | null; attemptsPerGame: number | null }
type AbsLike = { challenges: number; overturns: number } | null
type LateLike = { hitting: { label: string; pa: number; ops: number | null }[]; oneRun: { w: number; l: number } | null }
export type ScoutLike = {
  run: { away: RunCardLike | null; home: RunCardLike | null }
  abs: { away: AbsLike; home: AbsLike }
  late: { away: LateLike | null; home: LateLike | null }
}

const MIN_ATTEMPTS = 10           // caught-stealing % needs at least this many attempts against

export function buildScout(s: ScoutLike | null, teamIds: Record<Side, number>): ScoutSlides {
  if (!s) return { run: [], late: [] }
  // A club's offence card is its running against the OTHER club's catcher: away offence meets the home catcher.
  const run: ScoutRun[] = ([['home', s.run.away], ['away', s.run.home]] as const).flatMap(([defSide, c]) => {
    const cat = c?.catcher
    if (!c || !cat) return []
    const pop = cat.strips.find(x => x.label.toLowerCase().startsWith('pop'))?.value ?? null
    const att = cat.sb + cat.cs
    const abs = s.abs[defSide]
    const row: ScoutRun = {
      side: defSide, teamId: teamIds[defSide], catcher: cat.name, catcherId: cat.id, headshot: headshotUrl(cat.id), pop,
      csPct: att >= MIN_ATTEMPTS ? Math.round((cat.cs / att) * 1000) / 10 : null, csOf: att >= MIN_ATTEMPTS ? att : null,
      attemptsPerGame: c.attemptsPerGame, abs: abs && abs.challenges > 0 ? { challenges: abs.challenges, overturns: abs.overturns } : null,
    }
    return row.pop != null || row.csPct != null ? [row] : []
  }).sort((a, b) => (a.side === 'away' ? 0 : 1) - (b.side === 'away' ? 0 : 1))
  const late: ScoutLate[] = (['away', 'home'] as const).flatMap(side => {
    const l = s.late[side]
    const rows = (l?.hitting ?? []).filter(r => r.ops != null && r.pa > 0).map(r => ({ label: r.label, ops: r.ops as number, pa: r.pa })).slice(0, 3)
    return rows.length ? [{ side, teamId: teamIds[side], rows, oneRun: l?.oneRun ?? null }] : []
  })
  return { run, late }
}
