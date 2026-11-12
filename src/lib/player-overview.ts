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
import { LEVELS, type LevelKey } from '@/lib/levels'
import { getMilbPercentiles, type MilbPercentiles } from '@/lib/milb-percentiles'
import { getMilbArsenal } from '@/lib/milb-arsenal'
import { log } from '@/lib/log'

type Splits = { split?: { code?: string }; date?: string; gameType?: string; opponent?: { name?: string; abbreviation?: string }; team?: { name?: string }; isHome?: boolean; game?: { gamePk?: number; gameNumber?: number }; stat: Record<string, string | number> }[]
type StatsResp = { stats?: { type?: { displayName: string }; splits: Splits }[] }
const n = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export type GameLine = { date: string; opp: string; home: boolean; stage: string | null; stat: Record<string, string | number>; slug: string | null; gamePk: number | null }
export type SplitRow = { label: string; n: number; stat: Record<string, string | number> }
export type BatterPitchRow = { code: string; name: string; pa: number; whiffPct: number | null; xwoba: number | null }
// League-average spin and movement per pitch type, from the heaviest-used pitcher-months in pitch_shape_monthly (kept 6 hours in memory).
// Drives the turning baseballs for a batter's vs-pitch-type table, where no single pitcher's spin applies.
const leagueSpin = new Map<string, { at: number; v: { rpm: number | null; ivb: number | null; hb: number | null } }>()
export async function getLeagueSpin(season: number, codes: string[]): Promise<Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>> {
  const out: Record<string, { rpm: number | null; ivb: number | null; hb: number | null }> = {}
  await Promise.all(codes.map(async code => {
    const key = `${season}|${code}`
    const hit = leagueSpin.get(key)
    if (hit && Date.now() - hit.at < 6 * 3600_000) { out[code] = hit.v; return }
    const { data, error } = await createAdminClient().from('pitch_shape_monthly').select('n_pitches, release_spin_rate, ivb, hb').eq('season', season).eq('pitch_type', code).order('n_pitches', { ascending: false }).limit(400)
    if (error) { log.error('getLeagueSpin', 'Supabase error', error.message); return }
    const wavg = (f: string) => { let sum = 0, n = 0; for (const r of (data ?? []) as Record<string, unknown>[]) { const v = r[f] == null ? NaN : Number(r[f]), w = Number(r.n_pitches ?? 0); if (Number.isFinite(v) && w > 0) { sum += v * w; n += w } } return n >= 100 ? sum / n : null }
    const v = { rpm: wavg('release_spin_rate'), ivb: wavg('ivb'), hb: wavg('hb') }
    leagueSpin.set(key, { at: Date.now(), v }); out[code] = v
  }))
  return out
}

/** One level the player has real games at; `season` is his latest season there. */
export type LevelChoice = { key: LevelKey; label: string; name: string; season: number; games: number }

/** One advanced rate beside the season line: computed from the same counting stats as the line, so it always agrees with it. */
export type AdvancedRate = { label: string; value: string; hint: string }

export type PlayerOverview = {
  isPitcher: boolean
  /** The level every number below is for. MLB unless the player has no MLB games in his latest season. */
  level: LevelChoice
  /** Every level he has played at, highest first. Drives the level switcher. */
  levels: LevelChoice[]
  /** false below MLB: Statcast-based sections (percentiles, arsenal, vs pitch type, zones) are not stored for those levels */
  isMlb: boolean
  season: number
  seasonNote: string | null
  line: Record<string, string | number> | null
  /** K%, BB%, ISO, BABIP (batters) or K%, BB%, K-BB%, HR/9, BABIP, FIP (pitchers) for the chosen level; empty when there is no season line */
  advanced: AdvancedRate[]
  lineN: number                       // PA (batters) or batters faced (pitchers) behind the season line
  recent: GameLine[]                  // last 5, newest first
  latest: GameLine | null
  splits: SplitRow[]
  last30: { stat: Record<string, string | number>; n: number } | null
  mix: PitchMixRow[]; mixPitches: number; spin: Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>
  vsPitch: BatterPitchRow[]; vsPitchThrough: string | null; vsPitchSpin: Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>
  percentiles: { stats: PercentileStat[]; qualified: boolean } | null
  /** batters: rank among the league's top 500 for each counting/rate stat (same method as the Batting Lab); empty when he is outside every top 500 */
  batterPercentiles: { key: string; label: string; value: string; percentile: number }[]
  /** below MLB: his ranks among everyone at his level and season (milb_stat_pool), or null when the pool has no row for him (under the minimum sample, or the nightly build has not run) */
  milbRanks: MilbPercentiles | null
}

const BATTER_METRICS = ['avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'stolenBases', 'hits', 'doubles', 'triples', 'baseOnBalls', 'totalBases'] as const

const STAGE: Record<string, string> = { W: 'World Series', L: 'Championship Series', D: 'Division Series', F: 'Wild Card' }
const iso = (d: Date) => d.toISOString().slice(0, 10)


const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '')
const dot3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.') : '')
const ipNum = (v: unknown) => { const [w, f] = String(v ?? '0').split('.'); return Number(w) + Number(f ?? 0) / 3 }

/** The league's FIP constant at one level and season, from every team's pitching totals there: lgERA - (13 HR + 3 (BB + HBP) - 2 K) / IP. Null if the totals are not returned. */
async function fipConstant(sportId: number, season: number): Promise<number | null> {
  const r = await mlb<StatsResp>(`/teams/stats?season=${season}&group=pitching&stats=season&sportId=${sportId}`, 86400)
  const sp = r?.stats?.[0]?.splits ?? []
  if (!sp.length) return null
  const t = { hr: 0, bb: 0, hbp: 0, k: 0, er: 0, ip: 0 }
  for (const x of sp) { t.hr += Number(x.stat.homeRuns ?? 0); t.bb += Number(x.stat.baseOnBalls ?? 0); t.hbp += Number(x.stat.hitByPitch ?? 0); t.k += Number(x.stat.strikeOuts ?? 0); t.er += Number(x.stat.earnedRuns ?? 0); t.ip += ipNum(x.stat.inningsPitched) }
  return t.ip > 0 ? (9 * t.er) / t.ip - (13 * t.hr + 3 * (t.bb + t.hbp) - 2 * t.k) / t.ip : null
}

function advancedRates(line: Record<string, string | number> | null, isPitcher: boolean, cFip: number | null): AdvancedRate[] {
  if (!line) return []
  const g = (k: string) => Number(line[k] ?? 0)
  if (!isPitcher) {
    const pa = g('plateAppearances')
    if (!pa) return []
    return [
      { label: 'K%', value: pct(g('strikeOuts'), pa), hint: 'strikeouts per plate appearance' },
      { label: 'BB%', value: pct(g('baseOnBalls'), pa), hint: 'walks per plate appearance' },
      { label: 'ISO', value: dot3(Number(line.slg) - Number(line.avg)), hint: 'slugging minus average: extra-base power' },
      { label: 'BABIP', value: line.babip ? String(line.babip) : '', hint: 'average on balls in play' },
    ].filter(r => r.value !== '')
  }
  const bf = g('battersFaced'), ip = ipNum(line.inningsPitched)
  if (!bf || !ip) return []
  const babipDen = g('atBats') - g('strikeOuts') - g('homeRuns') + g('sacFlies')
  const out: AdvancedRate[] = [
    { label: 'K%', value: pct(g('strikeOuts'), bf), hint: 'strikeouts per batter faced' },
    { label: 'BB%', value: pct(g('baseOnBalls'), bf), hint: 'walks per batter faced' },
    { label: 'K-BB%', value: pct(g('strikeOuts') - g('baseOnBalls'), bf), hint: 'strikeout rate minus walk rate' },
    { label: 'HR/9', value: ((g('homeRuns') * 9) / ip).toFixed(2), hint: 'home runs allowed per nine innings' },
    { label: 'BABIP', value: babipDen > 0 ? dot3((g('hits') - g('homeRuns')) / babipDen) : '', hint: 'average on balls in play against' },
  ]
  if (cFip != null) out.push({ label: 'FIP', value: ((13 * g('homeRuns') + 3 * (g('baseOnBalls') + g('hitByPitch')) - 2 * g('strikeOuts')) / ip + cFip).toFixed(2), hint: 'ERA from strikeouts, walks and home runs only, with this level\'s own constant' })
  return out.filter(r => r.value !== '')
}

export async function getPlayerOverview(data: PlayerPageData, requestedLevel?: string | null): Promise<PlayerOverview> {
  const { identity } = data
  const id = identity.id
  const isPitcher = identity.isPitcher
  const group = isPitcher ? 'pitching' : 'hitting'
  const mlbRows = isPitcher ? data.yearByYearPitching : data.yearByYearHitting
  const minorRows = isPitcher ? data.minorsPitching : data.minorsHitting

  // Every level with real games: his latest season there and the games in it (a player can have two clubs in one season at one level, so games are summed).
  const thisYear = new Date().getFullYear()
  const all = [...mlbRows.map(r => ({ ...r, level: 'mlb' as LevelKey })), ...minorRows.map(r => ({ ...r, level: r.level as LevelKey }))]
    .map(r => ({ level: r.level, season: Number(r.season), games: Number(r.stat.gamesPlayed ?? 0) }))
    .filter(r => r.games > 0 && Number.isFinite(r.season))
  const levels: LevelChoice[] = LEVELS.flatMap(l => {
    const rows = all.filter(r => r.level === l.key)
    if (!rows.length) return []
    const latest = Math.max(...rows.map(r => r.season))
    return [{ key: l.key, label: l.label, name: l.name, season: latest, games: rows.filter(r => r.season === latest).reduce((a, r) => a + r.games, 0) }]
  })
  const latestAny = levels.length ? Math.max(...levels.map(l => l.season)) : thisYear
  // Default: MLB when he has MLB games in his latest season (so MLB players see exactly what they saw before); otherwise the level where he played most in his latest season.
  const mlbLevel = levels.find(l => l.key === 'mlb')
  const fallback = levels.filter(l => l.season === latestAny).sort((a, b) => b.games - a.games)[0]
  const chosen = levels.find(l => l.key === requestedLevel) ?? (mlbLevel && mlbLevel.season === latestAny ? mlbLevel : fallback)
    ?? { key: 'mlb' as LevelKey, label: 'MLB', name: 'Major League', season: thisYear, games: 0 }
  const isMlb = chosen.key === 'mlb'
  const sportId = LEVELS.find(l => l.key === chosen.key)?.sportId ?? 1
  const season = chosen.season
  const seasonNote = levels.length && season < thisYear ? `Season hasn't started yet; showing ${season}` : null
  const lvlQ = isMlb ? '' : `&sportId=${sportId}`   // MLB calls keep their original URLs

  const end = new Date(), start = new Date(Date.now() - 30 * 86400000)
  const [seasonResp, logReg, logPost, splitResp, last30Resp, arsenal, spin, pitchSplits, pct, batPct] = await Promise.all([
    mlb<StatsResp>(`/people/${id}/stats?stats=season&group=${group}&season=${season}${lvlQ}`),
    mlb<StatsResp>(`/people/${id}/stats?stats=gameLog&group=${group}&season=${season}${lvlQ}`),
    isMlb ? mlb<StatsResp>(`/people/${id}/stats?stats=gameLog&group=${group}&season=${season}&gameType=W,L,D,F`) : Promise.resolve(null),
    mlb<StatsResp>(`/people/${id}/stats?stats=statSplits&sitCodes=vl,vr,h,a&group=${group}&season=${season}${lvlQ}`),
    season === thisYear ? mlb<StatsResp>(`/people/${id}/stats?stats=byDateRange&group=${group}&startDate=${iso(start)}&endDate=${iso(end)}${lvlQ}`) : Promise.resolve(null),
    isPitcher && isMlb ? getPitcherZoneArsenal(id).catch(() => ({})) : Promise.resolve({}),
    isPitcher && isMlb ? getSpinByPitch(id).catch(() => ({})) : Promise.resolve({}),
    isPitcher || !isMlb ? Promise.resolve([]) : createAdminClient().from('batter_pitch_type_splits').select('pitch_type, pitch_name, pa, whiff_percent, est_woba, computed_date').eq('player_id', id).eq('season', season).range(0, 999).then(r => (r.data ?? []) as { pitch_type: string | null; pitch_name: string | null; pa: number | string | null; whiff_percent: number | string | null; est_woba: number | string | null; computed_date: string | null }[]),
    isPitcher && isMlb ? getPitcherPercentiles(id, season).catch(() => null) : Promise.resolve(null),
    isPitcher || !isMlb ? Promise.resolve([]) : Promise.all(BATTER_METRICS.map(k => getMetricPercentile(k, season, id, 500).catch(() => null))),
  ])

  const line = seasonResp?.stats?.[0]?.splits?.[0]?.stat ?? null
  // Below MLB there are no Statcast percentiles; he is ranked against his own level from the nightly pool instead. Separate await, so no Promise.all index shifts.
  const milbRanks = isMlb ? null : await getMilbPercentiles(chosen.key, season, isPitcher ? 'pitcher' : 'batter', id)
  // A Triple-A or Florida State League pitcher's arsenal comes from the stored shape tables (database read); other levels have no pitch tracking.
  const milbArsenal = isMlb || !isPitcher ? null : await getMilbArsenal(chosen.key, season, id)
  const cFip = isPitcher && line ? await fipConstant(sportId, season) : null
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
    return { date: s.date ?? '', opp: s.opponent?.abbreviation ?? opp, home, stage: post ? (STAGE[String(s.gameType ?? '')] ?? 'Postseason') : null, stat: s.stat, slug, gamePk: s.game?.gamePk ?? null }
  }
  const games = [
    ...(logReg?.stats?.[0]?.splits ?? []).map(s => toGame(s, false)),
    ...(logPost?.stats?.[0]?.splits ?? []).map(s => toGame(s, true)),
  ].filter(g => g.date).sort((a, b) => b.date.localeCompare(a.date))
    // The MLB game page only knows MLB games (it reads the MLB schedule), so below MLB the link goes to the minor-league game page by gamePk.
    .map(g => (isMlb ? g : { ...g, slug: null }))
  const recent = games.slice(0, 5)

  const label: Record<string, string> = { vl: 'vs left-handed', vr: 'vs right-handed', h: 'Home', a: 'Away' }
  const splits: SplitRow[] = (splitResp?.stats?.[0]?.splits ?? []).filter(s => s.split?.code && label[s.split.code]).map(s => ({
    label: label[s.split!.code!], n: n(isPitcher ? s.stat.battersFaced : s.stat.plateAppearances) ?? 0, stat: s.stat,
  }))

  const l30 = last30Resp?.stats?.[0]?.splits?.[0]?.stat
  const l30n = l30 ? n(isPitcher ? l30.battersFaced : l30.plateAppearances) ?? 0 : 0

  const { mix: mlbMix, mixPitches: mlbMixPitches } = mixFromArsenal(arsenal)
  const mix = milbArsenal ? milbArsenal.mix : mlbMix, mixPitches = milbArsenal ? milbArsenal.pitches : mlbMixPitches
  const vsPitch: BatterPitchRow[] = (pitchSplits as { pitch_type: string | null; pitch_name: string | null; pa: number | string | null; whiff_percent: number | string | null; est_woba: number | string | null }[])
    .filter(r => r.pitch_type)
    .map(r => ({ code: String(r.pitch_type), name: r.pitch_name ?? String(r.pitch_type), pa: Number(r.pa ?? 0), whiffPct: r.whiff_percent == null ? null : Number(r.whiff_percent), xwoba: r.est_woba == null ? null : Number(r.est_woba) }))
    .sort((a, b) => b.pa - a.pa)
  const vsPitchThrough = (pitchSplits as { computed_date: string | null }[]).reduce<string | null>((m, r) => (r.computed_date && (!m || r.computed_date > m) ? r.computed_date : m), null)

  return {
    isPitcher, level: chosen, levels, isMlb, season, seasonNote, line, advanced: advancedRates(line, isPitcher, cFip), milbRanks, lineN, recent, latest: games[0] ?? null, splits,
    last30: l30 && l30n >= 30 ? { stat: l30, n: l30n } : null,
    mix, mixPitches, spin: milbArsenal ? milbArsenal.spin : spin, vsPitch, vsPitchThrough,
    vsPitchSpin: isPitcher || !isMlb ? {} : await getLeagueSpin(season, vsPitch.map(r => r.code)),
    percentiles: pct,
    batterPercentiles: isPitcher || !isMlb ? [] : BATTER_METRICS.flatMap((k, i) => {
      const r = (batPct as ({ percentile: number } | null)[])[i]
      const v = line?.[k]
      return r && v != null ? [{ key: k, label: LEADER_METRICS[k].label.replace(' leaders', ''), value: String(v), percentile: r.percentile }] : []
    }),
  }
}
