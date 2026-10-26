// Server data for the player page overview: season line, game log (regular + postseason), splits, last 30 days, arsenal / vs pitch type.
// All fetched on the server in parallel (Promise.all); the page passes them down as props. Every metric carries its n.
// Sources: MLB Stats API (cached 5 min), pitcher_zone_arsenal and batter_pitch_type_splits (Savant data already stored).
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { createAdminClient } from '@/lib/supabase'
import { mixFromArsenal, type PitchMixRow } from '@/lib/game-cockpit'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getSpinByPitch } from '@/lib/mlb-homepage'
import { getPitcherPercentiles, type PercentileStat } from '@/lib/pitcher-percentiles'
import { slugifyGame } from '@/lib/mlb'
import { getMetricPercentile, LEADER_METRICS } from '@/lib/lab'
import type { PlayerPageData } from '@/lib/player-page'

type Splits = { split?: { code?: string }; date?: string; gameType?: string; opponent?: { name?: string; abbreviation?: string }; team?: { name?: string }; isHome?: boolean; game?: { gamePk?: number; gameNumber?: number }; stat: Record<string, string | number> }[]
type StatsResp = { stats?: { type?: { displayName: string }; splits: Splits }[] }
const n = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export type GameLine = { date: string; opp: string; home: boolean; stage: string | null; stat: Record<string, string | number>; slug: string | null }
export type SplitRow = { label: string; n: number; stat: Record<string, string | number> }
export type BatterPitchRow = { code: string; name: string; pa: number; whiffPct: number | null; xwoba: number | null }
export type PlayerOverview = {
  isPitcher: boolean
  season: number
  seasonNote: string | null
  line: Record<string, string | number> | null
  lineN: number                       // PA (batters) or batters faced (pitchers) behind the season line
  recent: GameLine[]                  // last 5, newest first
  latest: GameLine | null
  splits: SplitRow[]
  last30: { stat: Record<string, string | number>; n: number } | null
  mix: PitchMixRow[]; mixPitches: number; spin: Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>
  vsPitch: BatterPitchRow[]; vsPitchThrough: string | null
  percentiles: { stats: PercentileStat[]; qualified: boolean } | null
  /** batters: rank among the league's top 500 for each counting/rate stat (same method as the Batting Lab); empty when he is outside every top 500 */
  batterPercentiles: { key: string; label: string; value: string; percentile: number }[]
}

const BATTER_METRICS = ['avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'stolenBases', 'hits', 'doubles', 'triples', 'baseOnBalls', 'totalBases'] as const

const STAGE: Record<string, string> = { W: 'World Series', L: 'Championship Series', D: 'Division Series', F: 'Wild Card' }
const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function getPlayerOverview(data: PlayerPageData): Promise<PlayerOverview> {
  const { identity } = data
  const id = identity.id
  const isPitcher = identity.isPitcher
  const group = isPitcher ? 'pitching' : 'hitting'
  const rows = isPitcher ? data.yearByYearPitching : data.yearByYearHitting

  // Latest season with games (year by year already came with the page data).
  const thisYear = new Date().getFullYear()
  const played = rows.filter(r => Number(r.stat.gamesPlayed ?? 0) > 0).map(r => Number(r.season)).filter(Number.isFinite)
  const season = played.length ? Math.max(...played) : thisYear
  const seasonNote = played.length && season < thisYear ? `Season hasn't started yet; showing ${season}` : null

  const end = new Date(), start = new Date(Date.now() - 30 * 86400000)
  const [seasonResp, logReg, logPost, splitResp, last30Resp, arsenal, spin, pitchSplits, pct, batPct] = await Promise.all([
    mlb<StatsResp>(`/people/${id}/stats?stats=season&group=${group}&season=${season}`),
    mlb<StatsResp>(`/people/${id}/stats?stats=gameLog&group=${group}&season=${season}`),
    mlb<StatsResp>(`/people/${id}/stats?stats=gameLog&group=${group}&season=${season}&gameType=W,L,D,F`),
    mlb<StatsResp>(`/people/${id}/stats?stats=statSplits&sitCodes=vl,vr,h,a&group=${group}&season=${season}`),
    season === thisYear ? mlb<StatsResp>(`/people/${id}/stats?stats=byDateRange&group=${group}&startDate=${iso(start)}&endDate=${iso(end)}`) : Promise.resolve(null),
    isPitcher ? getPitcherZoneArsenal(id).catch(() => ({})) : Promise.resolve({}),
    isPitcher ? getSpinByPitch(id).catch(() => ({})) : Promise.resolve({}),
    isPitcher ? Promise.resolve([]) : createAdminClient().from('batter_pitch_type_splits').select('pitch_type, pitch_name, pa, whiff_percent, est_woba, computed_date').eq('player_id', id).eq('season', season).range(0, 999).then(r => (r.data ?? []) as { pitch_type: string | null; pitch_name: string | null; pa: number | string | null; whiff_percent: number | string | null; est_woba: number | string | null; computed_date: string | null }[]),
    isPitcher ? getPitcherPercentiles(id, season).catch(() => null) : Promise.resolve(null),
    isPitcher ? Promise.resolve([]) : Promise.all(BATTER_METRICS.map(k => getMetricPercentile(k, season, id, 500).catch(() => null))),
  ])

  const line = seasonResp?.stats?.[0]?.splits?.[0]?.stat ?? null
  const lineN = n(isPitcher ? line?.battersFaced : line?.plateAppearances) ?? 0

  // Game log: regular + postseason, newest first.
  const toGame = (s: Splits[number], post: boolean): GameLine => {
    const team = s.team?.name ?? '', opp = s.opponent?.name ?? s.opponent?.abbreviation ?? ''
    const home = !!s.isHome
    let slug: string | null = null
    if (team && opp && s.date) {
      try {
        slug = slugifyGame({ gamePk: s.game?.gamePk ?? 0, gameDate: s.date, officialDate: s.date, gameNumber: s.game?.gameNumber, status: { detailedState: '', abstractGameState: '' },
          teams: { away: { team: { id: 0, name: home ? opp : team } }, home: { team: { id: 0, name: home ? team : opp } } }, venue: { name: '' } })
      } catch { slug = null }
    }
    return { date: s.date ?? '', opp: s.opponent?.abbreviation ?? opp, home, stage: post ? (STAGE[String(s.gameType ?? '')] ?? 'Postseason') : null, stat: s.stat, slug }
  }
  const games = [
    ...(logReg?.stats?.[0]?.splits ?? []).map(s => toGame(s, false)),
    ...(logPost?.stats?.[0]?.splits ?? []).map(s => toGame(s, true)),
  ].filter(g => g.date).sort((a, b) => b.date.localeCompare(a.date))
  const recent = games.slice(0, 5)

  const label: Record<string, string> = { vl: 'vs left-handed', vr: 'vs right-handed', h: 'Home', a: 'Away' }
  const splits: SplitRow[] = (splitResp?.stats?.[0]?.splits ?? []).filter(s => s.split?.code && label[s.split.code]).map(s => ({
    label: label[s.split!.code!], n: n(isPitcher ? s.stat.battersFaced : s.stat.plateAppearances) ?? 0, stat: s.stat,
  }))

  const l30 = last30Resp?.stats?.[0]?.splits?.[0]?.stat
  const l30n = l30 ? n(isPitcher ? l30.battersFaced : l30.plateAppearances) ?? 0 : 0

  const { mix, mixPitches } = mixFromArsenal(arsenal)
  const vsPitch: BatterPitchRow[] = (pitchSplits as { pitch_type: string | null; pitch_name: string | null; pa: number | string | null; whiff_percent: number | string | null; est_woba: number | string | null }[])
    .filter(r => r.pitch_type)
    .map(r => ({ code: String(r.pitch_type), name: r.pitch_name ?? String(r.pitch_type), pa: Number(r.pa ?? 0), whiffPct: r.whiff_percent == null ? null : Number(r.whiff_percent), xwoba: r.est_woba == null ? null : Number(r.est_woba) }))
    .sort((a, b) => b.pa - a.pa)
  const vsPitchThrough = (pitchSplits as { computed_date: string | null }[]).reduce<string | null>((m, r) => (r.computed_date && (!m || r.computed_date > m) ? r.computed_date : m), null)

  return {
    isPitcher, season, seasonNote, line, lineN, recent, latest: games[0] ?? null, splits,
    last30: l30 && l30n >= 30 ? { stat: l30, n: l30n } : null,
    mix, mixPitches, spin, vsPitch, vsPitchThrough,
    percentiles: pct,
    batterPercentiles: isPitcher ? [] : BATTER_METRICS.flatMap((k, i) => {
      const r = (batPct as ({ percentile: number } | null)[])[i]
      const v = line?.[k]
      return r && v != null ? [{ key: k, label: LEADER_METRICS[k].label.replace(' leaders', ''), value: String(v), percentile: r.percentile }] : []
    }),
  }
}
