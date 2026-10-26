// Data for the game page's Cockpit / Pitchers / Batters / Bullpen & park tabs.
// Everything here is read-only: MLB Stats API (cached 5 min) + tables the repo already fills.
import { getSpinByPitch } from '@/lib/mlb-homepage'
import { getPitcherStatsTable } from '@/lib/stats-data'
import { computeGroupedPercentiles } from '@/lib/percentiles'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { fetchPitcherHands } from '@/lib/pitcher-hands'
import { getProjectedLineup, type ProjectedLineup } from '@/lib/lineups'

import { mlb, REVALIDATE_SECONDS } from '@/lib/mlb-cockpit.server-fetch-allowed'

type StatBlock = { type: { displayName: string }; splits: { date?: string; opponent?: { name?: string; abbreviation?: string }; stat: Record<string, string | number> }[] }
const num = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

// ── Starters ────────────────────────────────────────────────────────────────
export type PitchMixRow = { code: string; name: string; usagePct: number | null; pitches: number; velo: number | null; whiffPct: number | null; swings: number }
export type LastStart = { stage: string | null; date: string | null; opponent: string | null; ip: string; h: number; r: number; k: number; pitches: number | null }
export type StarterBlock = {
  status: 'ok' | 'not_announced' | 'first_start'
  id: number | null
  name: string | null
  hand: 'L' | 'R' | null
  opener: boolean
  era: number | null
  wins: number | null
  losses: number | null
  ip: string | null
  bf: number
  kPct: number | null
  bbPct: number | null
  xwoba: number | null
  xwobaPct: number | null  // 0-100, 100 = best (lowest xwOBA allowed) among pitchers with 30+ IP
  spin: Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>
  mix: PitchMixRow[]
  mixPitches: number
  lastStart: LastStart | null
  throughDate: string | null
  hasPitchData: boolean
}


/** Pitch mix rows (usage, velo, whiff with n swings) from the stored zone arsenal's "all" split. */
export function mixFromArsenal(arsenal: unknown): { mix: PitchMixRow[]; mixPitches: number } {
  const all = (arsenal as Record<string, { arsenal: Record<string, { pitch_name: string; usage_pct: number | null; avg_velo: number | null; total_pitches: number; zones: Record<string, { whiffs: number; swings: number }> }>; total_pitches: number }>)['all']
  const mix: PitchMixRow[] = all
    ? Object.entries(all.arsenal).map(([code, p]) => {
        let whiffs = 0, swings = 0
        for (const z of Object.values(p.zones)) { whiffs += Number(z.whiffs ?? 0); swings += Number(z.swings ?? 0) }
        return { code, name: p.pitch_name, usagePct: p.usage_pct == null ? null : Number(p.usage_pct), pitches: Number(p.total_pitches), velo: p.avg_velo == null ? null : Number(p.avg_velo), whiffPct: swings > 0 ? (whiffs / swings) * 100 : null, swings }
      }).sort((x, y) => (y.usagePct ?? 0) - (x.usagePct ?? 0))
    : []
  return { mix, mixPitches: all ? Number(all.total_pitches) : 0 }
}

export async function getPitcherMix(id: number) {
  const arsenal = await getPitcherZoneArsenal(id).catch(() => ({}))
  return mixFromArsenal(arsenal)
}

// Percentile of xwOBA allowed among pitchers with 30+ IP: 100 = lowest (best), shown at the right end of the gauge.
const xwobaPercentiles = cache(async (season: number): Promise<Map<number, number>> => {
  const rows = await getPitcherStatsTable({ season, minIp: 30 })
  const m = computeGroupedPercentiles(rows, [{ key: 'xwoba_allowed', label: 'xwOBA', higherIsBetter: false }], () => 'all')
  const out = new Map<number, number>()
  for (const [id, v] of m) { const p = v.get('xwoba_allowed'); if (p != null) out.set(id, p) }
  return out
})

export async function getStarterBlock(id: number | undefined, name: string | undefined, season: number): Promise<StarterBlock> {
  const empty: StarterBlock = { status: 'not_announced', id: null, name: null, hand: null, opener: false, era: null, wins: null, losses: null, ip: null, bf: 0, kPct: null, bbPct: null, xwoba: null, xwobaPct: null, spin: {}, mix: [], mixPitches: 0, lastStart: null, throughDate: null, hasPitchData: false }
  if (!id) return empty
  const [stats, post, hands, arsenal, ps, pool, spin] = await Promise.all([
    mlb<{ stats: StatBlock[] }>(`/people/${id}/stats?stats=season,gameLog,career&group=pitching&season=${season}`),
    mlb<{ stats: StatBlock[] }>(`/people/${id}/stats?stats=gameLog&group=pitching&season=${season}&gameType=W,L,D,F`),
    fetchPitcherHands([id]).catch(() => new Map<number, 'L' | 'R'>()),
    getPitcherZoneArsenal(id).catch(() => ({})),
    createAdminClient().from('pitcher_stats').select('xwoba_allowed').eq('player_id', id).eq('season', season).maybeSingle(),
    xwobaPercentiles(season),
    getSpinByPitch(id).catch(() => ({})),
  ])
  const by = (t: string) => stats?.stats?.find(s => s.type.displayName === t)?.splits ?? []
  const seasonStat = by('season')[0]?.stat
  const careerStat = by('career')[0]?.stat
  const log = by('gameLog')
  const lastReg = [...log].reverse().find(s => num(s.stat.gamesStarted) === 1)
  // A postseason start is his most recent outing when he has one (the regular-season log does not include playoff games).
  const postLog = post?.stats?.[0]?.splits ?? []
  const lastPost = [...postLog].reverse().find(s => num(s.stat.gamesStarted) === 1)
  const lastS = lastPost ?? lastReg
  const STAGE: Record<string, string> = { W: 'World Series', L: 'Championship Series', D: 'Division Series', F: 'Wild Card' }
  const stage = lastPost ? (STAGE[String((lastPost as unknown as { gameType?: string }).gameType ?? '')] ?? 'Postseason') : null

  const bf = num(seasonStat?.battersFaced) ?? 0
  const gs = num(seasonStat?.gamesStarted) ?? 0
  const ipNum = (v: unknown) => { const [a, b] = String(v ?? '0').split('.'); return Number(a) + Number(b ?? 0) / 3 }
  const opener = gs >= 3 && ipNum(seasonStat?.inningsPitched) / gs < 2

  const { mix, mixPitches } = mixFromArsenal(arsenal)
  const careerBf = num(careerStat?.battersFaced) ?? 0
  const firstStart = careerBf === 0 && bf === 0

  return {
    status: firstStart ? 'first_start' : 'ok',
    id, name: name ?? null, hand: hands.get(id) ?? null, opener,
    era: num(seasonStat?.era), wins: num(seasonStat?.wins), losses: num(seasonStat?.losses), ip: seasonStat?.inningsPitched != null ? String(seasonStat.inningsPitched) : null, bf,
    kPct: bf > 0 ? (Number(seasonStat?.strikeOuts) / bf) * 100 : null,
    bbPct: bf > 0 ? (Number(seasonStat?.baseOnBalls) / bf) * 100 : null,
    xwoba: num((ps.data as { xwoba_allowed?: unknown } | null)?.xwoba_allowed),
    xwobaPct: pool.get(id) ?? null, spin,
    mix, mixPitches,
    lastStart: lastS ? { stage, date: lastS.date ?? null, opponent: lastS.opponent?.abbreviation ?? lastS.opponent?.name ?? null, ip: String(lastS.stat.inningsPitched ?? '0.0'), h: Number(lastS.stat.hits ?? 0), r: Number(lastS.stat.runs ?? 0), k: Number(lastS.stat.strikeOuts ?? 0), pitches: num(lastS.stat.numberOfPitches) } : null,
    throughDate: log.length ? (log[log.length - 1].date ?? null) : null,
    hasPitchData: mix.length > 0,
  }
}

// ── Lineups + H2H + splits ──────────────────────────────────────────────────
export type LineupRow = {
  id: number; name: string; order: number; hand: 'L' | 'R' | 'S' | null
  ops: number | null; pa: number | null
  h2h: { pa: number; h: number; hr: number; k: number } | null
  vsHand: { pa: number; ops: number | null } | null  // batter's split vs the opposing starter's hand
  contact: { xwoba: number; pa: number } | null      // xwOBA over every pitch type he has faced this season
  vsPitch: { code: string; xwoba: number | null; pa: number }[]  // against the opposing starter's top pitch types
}
export type TeamLineup = { source: ProjectedLineup['source']; dateUsed: string | null; rows: LineupRow[]; splitsThrough: string | null }

export async function getTeamLineup(teamId: number, gameDate: string, gamePk: number, opp: { id: number | null; hand: 'L' | 'R' | null; pitchCodes?: string[] }): Promise<TeamLineup> {
  const lineup = await getProjectedLineup(teamId, gameDate, gamePk)
  const pitchSplits = await getBatterPitchSplits(lineup.batters.map(b => b.player_id))
  const rows = await Promise.all(lineup.batters.map(async (b): Promise<LineupRow> => {
    const [vs, split] = await Promise.all([
      opp.id ? mlb<{ stats: StatBlock[] }>(`/people/${b.player_id}/stats?stats=vsPlayer&opposingPlayerId=${opp.id}&group=hitting`) : Promise.resolve(null),
      opp.hand ? mlb<{ stats: StatBlock[] }>(`/people/${b.player_id}/stats?stats=statSplits&sitCodes=${opp.hand === 'L' ? 'vl' : 'vr'}&group=hitting&season=${new Date().getFullYear()}`) : Promise.resolve(null),
    ])
    const t = vs?.stats?.find(s => s.type.displayName === 'vsPlayerTotal')?.splits[0]?.stat
    const sp = split?.stats?.[0]?.splits?.[0]?.stat
    return {
      id: b.player_id, name: b.player_name, order: b.batting_order,
      hand: b.switch_hitter ? 'S' : (b.bat_side ?? null),
      ops: b.season_ops, pa: b.season_pa ?? null,
      h2h: opp.id ? { pa: Number(t?.plateAppearances ?? 0), h: Number(t?.hits ?? 0), hr: Number(t?.homeRuns ?? 0), k: Number(t?.strikeOuts ?? 0) } : null,
      vsHand: sp ? { pa: Number(sp.plateAppearances ?? 0), ops: num(sp.ops) } : null,
      contact: pitchSplits.rows.get(b.player_id)?.contact ?? null,
      vsPitch: (opp.pitchCodes ?? []).map(code => ({ code, xwoba: pitchSplits.rows.get(b.player_id)?.byPitch[code]?.xwoba ?? null, pa: pitchSplits.rows.get(b.player_id)?.byPitch[code]?.pa ?? 0 })),
    }
  }))
  return { source: lineup.source, dateUsed: lineup.game_date_used, rows: rows.sort((a, b) => a.order - b.order), splitsThrough: pitchSplits.through }
}

// ── Bullpen ────────────────────────────────────────────────────────────────
// A relief appearance is any pitcher in a game's boxscore pitchers list except the first one listed for that team (the game's starter).
// Season role is never used as a filter, so a pitcher who has started games this year (Ashby, May, Hall, Seymour, Matz) still counts when he relieves.
// Window: the N days BEFORE the game date (the game's own day is not played yet), counted in the schedule's official dates.
export type BullpenRow = { id: number; name: string; byDate: Record<string, number>; total: number; games: number; lastDate: string }
type BoxTeam = { pitchers?: number[]; players?: Record<string, { person?: { fullName?: string }; stats?: { pitching?: { numberOfPitches?: number | string } } }> }
type SchedResp = { dates?: { date: string; games: { gamePk: number; officialDate?: string; status?: { abstractGameState?: string } }[] }[] }

const shiftDay = (d: string, by: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + by); return x.toISOString().slice(0, 10) }

export async function getBullpenRecent(teamId: number, _starterIds: number[], anchorDate: string, days: 3 | 7): Promise<{ dates: string[]; rows: BullpenRow[]; games: number }> {
  const dates = Array.from({ length: days }, (_, i) => shiftDay(anchorDate, i - days))   // oldest to newest, ending the day before the game
  const sched = await mlb<SchedResp>(`/schedule?sportId=1&teamId=${teamId}&startDate=${dates[0]}&endDate=${dates[days - 1]}`)
  const finals = (sched?.dates ?? []).flatMap(d => d.games.map(g => ({ pk: g.gamePk, date: g.officialDate ?? d.date, state: g.status?.abstractGameState })))
    .filter(g => g.state === 'Final' && dates.includes(g.date))
  const boxes = await Promise.all(finals.map(g => mlb<{ teams?: { away?: BoxTeam & { team?: { id: number } }; home?: BoxTeam & { team?: { id: number } } } }>(`/game/${g.pk}/boxscore`)))
  const byPitcher = new Map<number, BullpenRow>()
  finals.forEach((g, i) => {
    const t = [boxes[i]?.teams?.away, boxes[i]?.teams?.home].find(x => x?.team?.id === teamId)
    if (!t?.pitchers) return
    for (const id of t.pitchers.slice(1)) {                                   // the first pitcher listed is the starter
      const pl = t.players?.[`ID${id}`]
      const n = Number(pl?.stats?.pitching?.numberOfPitches ?? 0)
      if (!(n > 0)) continue
      const row = byPitcher.get(id) ?? { id, name: pl?.person?.fullName ?? `Player ${id}`, byDate: {}, total: 0, games: 0, lastDate: '' }
      row.byDate[g.date] = (row.byDate[g.date] ?? 0) + n
      row.total += n; row.games += 1
      if (g.date > row.lastDate) row.lastDate = g.date
      byPitcher.set(id, row)
    }
  })
  return { dates, rows: [...byPitcher.values()].sort((a, b) => b.total - a.total), games: finals.length }
}

// ── Batter xwOBA by pitch type (table batter_pitch_type_splits, filled by scripts/fetch_batter_pitch_splits.py) ──
export async function getBatterPitchSplits(ids: number[]): Promise<{ rows: Map<number, { contact: { xwoba: number; pa: number } | null; byPitch: Record<string, { xwoba: number | null; pa: number }> }>; through: string | null }> {
  const rows = new Map<number, { contact: { xwoba: number; pa: number } | null; byPitch: Record<string, { xwoba: number | null; pa: number }> }>()
  if (!ids.length) return { rows, through: null }
  const { data, error } = await createAdminClient()
    .from('batter_pitch_type_splits')
    .select('player_id, pitch_type, pa, est_woba, computed_date')
    .eq('season', new Date().getFullYear())
    .in('player_id', ids)
    .range(0, 999)
  if (error) { console.error('[getBatterPitchSplits] Supabase error:', error.message); return { rows, through: null } }
  let through: string | null = null
  const sums = new Map<number, { w: number; pa: number }>()
  for (const r of (data ?? []) as { player_id: number; pitch_type: string | null; pa: number | string | null; est_woba: number | string | null; computed_date: string | null }[]) {
    const id = Number(r.player_id), pa = Number(r.pa ?? 0), xw = r.est_woba == null ? null : Number(r.est_woba)
    if (r.computed_date && (!through || r.computed_date > through)) through = r.computed_date
    const row = rows.get(id) ?? { contact: null, byPitch: {} }
    if (r.pitch_type) row.byPitch[r.pitch_type] = { xwoba: xw, pa }
    rows.set(id, row)
    if (xw != null) { const t = sums.get(id) ?? { w: 0, pa: 0 }; t.w += xw * pa; t.pa += pa; sums.set(id, t) }
  }
  for (const [id, t] of sums) { const row = rows.get(id); if (row && t.pa > 0) row.contact = { xwoba: t.w / t.pa, pa: t.pa } }
  return { rows, through }
}
