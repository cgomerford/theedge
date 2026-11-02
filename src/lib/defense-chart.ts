// src/lib/defense-chart.ts
//
// One player's defense for the article writer's chart picker (admin only, read on demand, never a public page):
//   OAA        Savant outs above average by direction and by batter side, from the league table the site already caches (getLeagueOaa)
//   Arm        Savant arm strength (mph), qualified throwers
//   Catcher    Savant pop time to second, exchange, arm and framing runs
//   Fielding   traditional MLB fielding by position (errors, fielding %, assists, putouts, double plays). Not an advanced value stat.
// Ranks are among the players on the same Savant table, so a rank never disagrees with the number beside it. Empty means no data, never a stand-in.

import { getLeagueOaa } from '@/lib/batter-fielding'
import { parseCsv } from '@/components/admin/story-v5/csv'
import { log, logOnce } from '@/lib/log'

export type OaaBlock = { oaa: number; frp: number; inFront: number; toward3B: number; toward1B: number; behind: number; vsRHH: number; vsLHH: number; actual: string; estimated: string; diff: string; pos: string; rank: number; of: number; posRank: number; posOf: number }
export type ArmBlock = { overall: number | null; max: number | null; throws: number; byPos: { pos: string; mph: number; throws: number }[]; rank: number | null; of: number }
export type CatcherBlock = { pop2b: number | null; exchange: number | null; armMax: number | null; attempts: number; popRank: number | null; popOf: number; framingRuns: number | null; framingPitches: number | null; framingRank: number | null; framingOf: number }
export type FieldingLine = { pos: string; g: number; chances: number; errors: number; pct: string; assists: number; putOuts: number; dp: number }
export type DefenseProfile = { oaa: OaaBlock | null; arm: ArmBlock | null; catcher: CatcherBlock | null; fielding: FieldingLine[] }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const n = (v: string | undefined): number | null => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null }

async function savantRows(path: string, key: string): Promise<Record<string, string>[]> {
  try {
    const res = await fetch(`https://baseballsavant.mlb.com/${path}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' } })
    if (!res.ok) { logOnce(`defense:${key}:${res.status}`, 'defense-chart', `${key} HTTP ${res.status}`); return [] }
    return parseCsv(await res.text())
  } catch (e) {
    logOnce(`defense:${key}:threw`, 'defense-chart', `${key} fetch failed`, e)
    return []
  }
}

const PO: Record<string, string> = { '1': '1B', '2': '2B', '3': '3B', ss: 'SS', lf: 'LF', cf: 'CF', rf: 'RF' }

export async function getDefenseProfile(playerId: number, season: number): Promise<DefenseProfile> {
  const [league, armRows, popRows, frameRows, fieldingJson] = await Promise.all([
    getLeagueOaa(season),
    savantRows(`leaderboard/arm-strength?type=player&year=${season}&minThrows=50&csv=true`, 'arm'),
    savantRows(`leaderboard/poptime?year=${season}&team=&min2b=1&min3b=0&pos=&sort=2&sortDir=asc&csv=true`, 'poptime'),
    savantRows(`leaderboard/catcher-framing?year=${season}&team=&min=q&type=catcher&csv=true`, 'framing'),
    fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=fielding&sportId=1&season=${season}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) }).then(r => (r.ok ? r.json() : null)).catch(e => { log.error('defense-chart', 'fielding fetch failed', e); return null }),
  ])

  const mine = league[String(playerId)]
  const all = Object.values(league)
  const oaa: OaaBlock | null = mine ? {
    oaa: mine.outsAboveAverage, frp: mine.fieldingRunsPrevented, inFront: mine.oaaInFront, toward3B: mine.oaaLateralToward3B, toward1B: mine.oaaLateralToward1B, behind: mine.oaaBehind,
    vsRHH: mine.oaaVsRHH, vsLHH: mine.oaaVsLHH, actual: mine.actualSuccessRate, estimated: mine.estimatedSuccessRate, diff: mine.diffSuccessRate, pos: mine.position,
    rank: 1 + all.filter(p => p.outsAboveAverage > mine.outsAboveAverage).length, of: all.length,
    posRank: 1 + all.filter(p => p.position === mine.position && p.outsAboveAverage > mine.outsAboveAverage).length, posOf: all.filter(p => p.position === mine.position).length,
  } : null

  let arm: ArmBlock | null = null
  const a = armRows.find(r => Number(r.player_id) === playerId)
  if (a) {
    const overall = n(a.arm_overall)
    const byPos = Object.entries(PO).map(([k, pos]) => ({ pos, mph: n(a[`arm_${k}`]), throws: n(a[`total_throws_${k}`]) ?? 0 })).filter((p): p is { pos: string; mph: number; throws: number } => p.mph != null && p.throws > 0)
    const q = armRows.map(r => n(r.arm_overall)).filter((v): v is number => v != null)
    arm = { overall, max: n(a.max_arm_strength), throws: n(a.total_throws) ?? 0, byPos, rank: overall != null ? 1 + q.filter(v => v > overall).length : null, of: q.length }
  }

  let catcher: CatcherBlock | null = null
  const p = popRows.find(r => Number(r.entity_id) === playerId)
  const f = frameRows.find(r => Number(r.id) === playerId)
  if (p || f) {
    const pop = n(p?.pop_2b_sba)
    const pops = popRows.map(r => n(r.pop_2b_sba)).filter((v): v is number => v != null)
    const fr = n(f?.rv_tot)
    const frs = frameRows.map(r => n(r.rv_tot)).filter((v): v is number => v != null)
    catcher = {
      pop2b: pop, exchange: n(p?.exchange_2b_3b_sba), armMax: n(p?.maxeff_arm_2b_3b_sba), attempts: n(p?.pop_2b_sba_count) ?? 0,
      popRank: pop != null ? 1 + pops.filter(v => v < pop).length : null, popOf: pops.length,
      framingRuns: fr, framingPitches: n(f?.pitches), framingRank: fr != null ? 1 + frs.filter(v => v > fr).length : null, framingOf: frs.length,
    }
  }

  type Split = { stat: { position?: { abbreviation?: string }; gamesPlayed?: number; chances?: number; errors?: number; fielding?: string; assists?: number; putOuts?: number; doublePlays?: number } }
  const fielding: FieldingLine[] = ((fieldingJson?.stats?.[0]?.splits ?? []) as Split[])
    .map(s => ({ pos: s.stat.position?.abbreviation ?? '', g: s.stat.gamesPlayed ?? 0, chances: s.stat.chances ?? 0, errors: s.stat.errors ?? 0, pct: s.stat.fielding ?? '', assists: s.stat.assists ?? 0, putOuts: s.stat.putOuts ?? 0, dp: s.stat.doublePlays ?? 0 }))
    .filter(l => l.pos && l.pos !== 'DH' && l.chances > 0)
    .sort((x, y) => y.g - x.g)

  return { oaa, arm, catcher, fielding }
}
