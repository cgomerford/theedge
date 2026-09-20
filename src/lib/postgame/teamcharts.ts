// src/lib/postgame/teamcharts.ts
//
// Pro: team- and game-level charts.
//   Bullpen stress   each club's relievers tonight (pitches, arms used, how many entered in high leverage — MLB's
//                    leverageIndex at the first plate appearance each faced, 2.0+) against the club's typical bullpen day over
//                    its previous 14 days of pitcher_workload_daily (read-only). The table lists every pitcher who threw, starters
//                    included, so a day's starter is taken as its highest pitch count when that is 60+ and left out: an estimate,
//                    and labelled so on the page.
//   Offense process  hard-hit % and barrel % tonight vs the club's season (contact.ts), with a plain read of whether the runs
//                    matched the contact.
//   Starter watch    one card per starter from the pitcher check: velocity vs season, whiff vs season, hard-hit tonight, dial.

import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import { getBullpenNight } from './bullpen'
import { getContact } from './contact'
import { getPitcherChecks, type PitcherCheck } from './pitchercheck'
import { buildPitchLog } from './pitchlog'
import { shiftDate } from './bullpen'
import type { Side } from './recap'

export const HIGH_LI = 2.0
export type PenStress = { side: Side; arms: number; pitches: number; highLeverage: number; typical: number | null; days: number; three: number }
export type Process = { side: Side; runs: number; hard: number | null; seasonHard: number | null; barrel: number | null; seasonBarrel: number | null; bbe: number; read: string }
export type Watch = { side: Side; id: number; name: string; velo: number | null; whiff: number | null; hard: number | null; bip: number; dial: PitcherCheck['dial'] }
export type TeamCharts = { pens: PenStress[]; process: Process[]; watch: Watch[] }

export async function getTeamCharts(d: PostData, gameDate: string): Promise<TeamCharts> {
  const gd = d.feed.gameData
  const [pens, contact, checks] = await Promise.all([getBullpenNight(d, gameDate), getContact(d, gameDate), getPitcherChecks(d, gameDate)])

  // typical bullpen day: previous 14 days of the workload table, starter (max pitcher ≥ 60) removed from each day
  const teamIds = [gd.teams.away.id, gd.teams.home.id]
  const { data, error } = await createAdminClient().from('pitcher_workload_daily').select('team_id, player_id, game_date, pitches')
    .in('team_id', teamIds).gte('game_date', shiftDate(gameDate, -14)).lt('game_date', gameDate)
  if (error) console.error('[getTeamCharts] Supabase error:', error.message)
  const days = new Map<string, number[]>()        // `${team}|${date}` → pitcher pitch counts
  for (const r of (data ?? []) as { team_id: number; game_date: string; pitches: number | string }[]) {
    const k = `${Number(r.team_id)}|${r.game_date}`
    days.set(k, [...(days.get(k) ?? []), Number(r.pitches)])
  }
  const typical = (teamId: number) => {
    const pen = [...days.entries()].filter(([k]) => k.startsWith(`${teamId}|`)).map(([, v]) => { const max = Math.max(...v); return v.reduce((a, b) => a + b, 0) - (max >= 60 ? max : 0) })
    return { avg: pen.length ? pen.reduce((a, b) => a + b, 0) / pen.length : null, days: pen.length }
  }

  const log = buildPitchLog(d)
  const liAt = (atBat: number) => d.wp.find((w) => w.atBatIndex === atBat)?.leverageIndex ?? null
  const stress: PenStress[] = (['away', 'home'] as Side[]).map((side) => {
    const pen = pens.find((p) => p.side === side)
    const t = typical(gd.teams[side].id)
    const high = (pen?.relievers ?? []).filter((r) => { const first = log.find((x) => x.pitcherId === r.id); const li = first ? liAt(first.atBat) : null; return li != null && Number(li) >= HIGH_LI }).length
    return { side, arms: pen?.relievers.length ?? 0, pitches: pen?.pitches ?? 0, highLeverage: high, typical: t.avg, days: t.days, three: (pen?.relievers ?? []).reduce((a, r) => a + r.threeDay, 0) }
  })

  const runs = { away: Number(d.feed.liveData.linescore.teams?.away?.runs ?? 0), home: Number(d.feed.liveData.linescore.teams?.home?.runs ?? 0) }
  const process: Process[] = contact.map((c) => {
    const hard = c.bbe ? (c.hardHit / c.bbe) * 100 : null, barrel = c.bbe ? (c.barrels / c.bbe) * 100 : null
    const r = runs[c.side]
    const read = hard == null || c.seasonHardPct == null ? 'No season contact baseline for this club.'
      : r >= 5 && hard <= c.seasonHardPct - 5 ? 'The runs came without the usual hard contact — a win that looks better than the contact.'
      : r <= 2 && hard >= c.seasonHardPct + 5 ? 'Hit the ball harder than usual and did not score much — the contact was better than the score.'
      : 'Runs and contact quality lined up with the club’s season.'
    return { side: c.side, runs: r, hard, seasonHard: c.seasonHardPct, barrel, seasonBarrel: c.seasonBarrelPct, bbe: c.bbe, read }
  })

  const watch: Watch[] = checks.map((c) => {
    const p = c.velo.primary ? c.velo.types.find((t) => t.code === c.velo.primary) : undefined
    const wr = c.whiff.rows.filter((r) => r.season != null && r.tonight != null && r.swings >= 4)
    const wt = wr.reduce((a, r) => a + (r.tonight as number) * r.swings, 0), ws = wr.reduce((a, r) => a + (r.season as number) * r.swings, 0), sw = wr.reduce((a, r) => a + r.swings, 0)
    return { side: c.side, id: c.id, name: c.name, velo: p && p.tonight != null && p.season != null ? p.tonight - p.season : null, whiff: sw >= 12 ? (wt - ws) / sw : null, hard: c.zone.hard, bip: c.zone.bip, dial: c.dial }
  })
  return { pens: stress, process, watch }
}
