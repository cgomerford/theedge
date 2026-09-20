// src/lib/postgame/bullpen.ts
//
// Postgame §9 Bullpen used tonight — every reliever who pitched, when he came in (inning, outs,
// the score from his club's side), his line, and "into tomorrow" workload chips: pitches thrown
// tonight plus the two days before, with a plain flag when he's worked on consecutive days.
// Tonight comes from the live feed (boxscore pitchers after the starter; the first plate
// appearance each faced gives the entry point). The two prior days come from pitcher_workload_daily
// (written nightly by scripts/compute-pitcher-workload.ts — read-only here); tonight itself is
// deliberately taken from the feed, not the table, so it can never be double counted.
// Limits, stated on the page: an earlier game the same day (doubleheader) isn't in the prior-days
// figure; a day with no workload rows at all for the club shows "—" rather than a made-up zero.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import type { Side } from './recap'
import { buildPitchLog } from './pitchlog'

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export type Reliever = {
  id: number
  name: string
  entered: { inning: number; top: boolean; outs: number; margin: number } | null   // margin: own club's lead (+) or deficit (−) on entry
  line: { ip: string; h: number; r: number; er: number; bb: number; k: number; pitches: number; strikes: number }
  dec: 'W' | 'L' | 'S' | 'H' | 'BS' | null
  /** pitches on the day before / two days before; null = no workload row for that day */
  d1: number | null
  d2: number | null
  threeDay: number
  streak: 'back-to-back' | 'three straight' | null
  /** what he threw: type, share, average velocity, swinging misses */
  mix: { type: string; name: string; n: number; pct: number; velo: number | null; whiffs: number }[]
  zone: number | null      // Zone% for the outing
  whiff: number | null     // whiffs per swing
  swings: number
}
export type PenSide = { side: Side; relievers: Reliever[]; pitches: number; outs: number }

export function shiftDate(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

type Workload = { byPlayer: Map<number, Map<string, number>>; clubDays: Set<string> }

/** Both clubs' rows for the two prior days. The table holds only pitchers who threw, so a club-day with
 *  ANY row means that day was recorded, and a reliever missing from it threw 0; a club-day with none is unknown. */
async function getPriorWorkload(teamIds: number[], gameDate: string): Promise<Workload> {
  const out: Workload = { byPlayer: new Map(), clubDays: new Set() }
  const { data, error } = await createAdminClient()
    .from('pitcher_workload_daily')
    .select('team_id, player_id, game_date, pitches')
    .in('team_id', teamIds)
    .in('game_date', [shiftDate(gameDate, -1), shiftDate(gameDate, -2)])
  if (error) { console.error('[getPriorWorkload] Supabase error:', error.message); return out }
  for (const r of (data ?? []) as { team_id: number; player_id: number; game_date: string; pitches: number | string }[]) {
    const pid = Number(r.player_id)
    out.clubDays.add(`${Number(r.team_id)}|${r.game_date}`)
    if (!out.byPlayer.has(pid)) out.byPlayer.set(pid, new Map())
    // numeric columns can come back as strings — coerce
    out.byPlayer.get(pid)!.set(r.game_date, (out.byPlayer.get(pid)!.get(r.game_date) ?? 0) + Number(r.pitches))
  }
  return out
}

export const getBullpenNight = cache(async (d: PostData, gameDate: string): Promise<PenSide[]> => {
  const f = d.feed, box = f.liveData.boxscore.teams, dec = f.liveData.decisions
  const plays = f.liveData.plays.allPlays
  const prior = await getPriorWorkload([f.gameData.teams.away.id, f.gameData.teams.home.id], gameDate)
  const d1 = shiftDate(gameDate, -1), d2 = shiftDate(gameDate, -2)
  const log = buildPitchLog(d)

  return (['away', 'home'] as Side[]).map((side) => {
    const t = box[side]
    const relievers: Reliever[] = (t.pitchers ?? []).slice(1).flatMap((id) => {
      const p = t.players[`ID${id}`], st = p?.stats?.pitching
      if (!p || !st) return []
      const idx = plays.findIndex((pl) => pl.matchup.pitcher.id === id)
      let entered: Reliever['entered'] = null
      if (idx > 0) {
        const pl = plays[idx], prev = plays[idx - 1]
        const sameHalf = prev.about.inning === pl.about.inning && prev.about.isTopInning === pl.about.isTopInning
        const own = side === 'away' ? n(prev.result.awayScore) : n(prev.result.homeScore)
        const opp = side === 'away' ? n(prev.result.homeScore) : n(prev.result.awayScore)
        entered = { inning: pl.about.inning, top: pl.about.isTopInning, outs: sameHalf ? n(prev.count.outs) : 0, margin: own - opp }
      }
      const nm = p.person.fullName
      const decision: Reliever['dec'] = dec?.winner?.fullName === nm ? 'W' : dec?.loser?.fullName === nm ? 'L' : dec?.save?.fullName === nm ? 'S' : n(st.blownSaves) > 0 ? 'BS' : n(st.holds) > 0 ? 'H' : null
      const tonight = n(st.pitchesThrown ?? st.numberOfPitches)
      const w = prior.byPlayer.get(id), teamId = f.gameData.teams[side].id
      const day = (date: string) => (w?.has(date) ? (w.get(date) as number) : prior.clubDays.has(`${teamId}|${date}`) ? 0 : null)
      const y1 = day(d1), y2 = day(d2)
      const mine = log.filter((x) => x.pitcherId === id)
      const by = new Map<string, typeof mine>()
      for (const r of mine) by.set(r.type, [...(by.get(r.type) ?? []), r])
      const mix = [...by.entries()].map(([type, rs]) => {
        const v = rs.filter((r) => r.velo != null)
        return { type, name: rs[0].typeName, n: rs.length, pct: (rs.length / mine.length) * 100, velo: v.length ? v.reduce((a, r) => a + (r.velo as number), 0) / v.length : null, whiffs: rs.filter((r) => r.whiff).length }
      }).sort((a, b) => b.n - a.n)
      const sw = mine.filter((r) => r.swing), located = mine.filter((r) => r.zone != null)
      return [{
        mix, swings: sw.length,
        zone: located.length ? (located.filter((r) => (r.zone as number) <= 9).length / located.length) * 100 : null,
        whiff: sw.length ? (sw.filter((r) => r.whiff).length / sw.length) * 100 : null,
        id, name: nm, entered,
        line: { ip: String(st.inningsPitched ?? '0.0'), h: n(st.hits), r: n(st.runs), er: n(st.earnedRuns), bb: n(st.baseOnBalls), k: n(st.strikeOuts), pitches: tonight, strikes: n(st.strikes) },
        dec: decision, d1: y1, d2: y2,
        threeDay: tonight + (y1 ?? 0) + (y2 ?? 0),
        streak: (y1 ?? 0) > 0 && (y2 ?? 0) > 0 ? 'three straight' : (y1 ?? 0) > 0 ? 'back-to-back' : null,
      }]
    })
    return { side, relievers, pitches: relievers.reduce((a, r) => a + r.line.pitches, 0), outs: relievers.reduce((a, r) => { const [w, fr = '0'] = r.line.ip.split('.'); return a + n(w) * 3 + n(fr) }, 0) }
  })
})
