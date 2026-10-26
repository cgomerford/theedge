// src/lib/mlb-home-dashboard.ts
//
// Loaders for the /mlb dashboard. Free data only: the MLB Stats API (statsapi.mlb.com) and the Supabase tables the repo already
// fills (pitcher_stats, pitcher_zone_arsenal). Public loaders are cached 5 minutes; live scores come from /api/mlb/live, uncached.
// Every loader returns null / [] on failure with a prefixed log, never a made-up value.

import { createAdminClient } from '@/lib/supabase'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getBattersFaced, getSpinByPitch } from '@/lib/mlb-homepage'
import { slugifyGame, type MLBGame } from '@/lib/mlb'
import { PITCH_NAME } from '@/lib/lab/pitch-meta'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { findTeamByName } from '@/lib/teams'

const API = 'https://statsapi.mlb.com/api/v1'
const REVALIDATE = 300
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

async function getJson(url: string, label: string, revalidate: number | false = REVALIDATE): Promise<any | null> {
  try {
    const res = await fetch(url, revalidate === false ? { cache: 'no-store' } : { next: { revalidate } })
    if (!res.ok) { console.error(`[${label}] HTTP ${res.status}`); return null }
    return await res.json()
  } catch (e) {
    console.error(`[${label}] failed:`, e instanceof Error ? e.message : e)
    return null
  }
}

export const etDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// ─── Season state ─────────────────────────────────────────────────────────────

export type SeasonState = {
  state: 'regular' | 'postseason' | 'offseason' | 'preseason'
  year: number
  today: string
  nextStart: string | null
  lastFinal: { date: string; away: string; home: string; awayScore: number; homeScore: number; note: string | null } | null
}

export async function getSeasonState(date = etDate()): Promise<SeasonState> {
  const year = Number(date.slice(0, 4))
  const s = (await getJson(`${API}/seasons/${year}?sportId=1`, 'getSeasonState'))?.seasons?.[0]
  const regStart: string | undefined = s?.regularSeasonStartDate, regEnd: string | undefined = s?.regularSeasonEndDate
  const postStart: string | undefined = s?.postSeasonStartDate, postEnd: string | undefined = s?.postSeasonEndDate
  let state: SeasonState['state'] = 'offseason'
  if (regStart && date < regStart) state = date >= addDays(regStart, -30) ? 'preseason' : 'offseason'
  else if (postStart && date >= postStart && (!postEnd || date <= addDays(postEnd, 2))) state = 'postseason'
  else if (regStart && regEnd && date >= regStart && (!postStart || date < postStart)) state = 'regular'
  else if (postEnd && date > addDays(postEnd, 2)) state = 'offseason'
  // Today's schedule settles the edge days (a game of type F/D/L/W means postseason).
  const today = await getJson(`${API}/schedule?sportId=1&date=${date}`, 'getSeasonState schedule')
  const types: string[] = (today?.dates?.[0]?.games ?? []).map((g: any) => g.gameType)
  if (types.some(t => ['F', 'D', 'L', 'W'].includes(t))) state = 'postseason'
  else if (types.includes('R') && state !== 'regular') state = 'regular'

  let nextStart: string | null = null
  let lastFinal: SeasonState['lastFinal'] = null
  if (state === 'offseason' || state === 'preseason') {
    const nextYear = state === 'offseason' && postEnd && date > postEnd ? year + 1 : year
    nextStart = (await getJson(`${API}/seasons/${nextYear}?sportId=1`, 'getSeasonState next'))?.seasons?.[0]?.regularSeasonStartDate ?? null
    const back = await getJson(`${API}/schedule?sportId=1&startDate=${addDays(date, -60)}&endDate=${date}&hydrate=team`, 'getSeasonState lastFinal')
    const games = (back?.dates ?? []).flatMap((d: any) => d.games).filter((g: any) => g.status?.abstractGameState === 'Final')
    const g = games[games.length - 1]
    if (g) lastFinal = { date: g.officialDate, away: g.teams.away.team.name, home: g.teams.home.team.name, awayScore: g.teams.away.score, homeScore: g.teams.home.score, note: g.seriesDescription ?? null }
  }
  return { state, year, today: date, nextStart, lastFinal }
}

// ─── Today's games ────────────────────────────────────────────────────────────

export type GameGroup = 'live' | 'upcoming' | 'final'
export type DashSide = { id: number; name: string; abbr: string; score: number | null; record: string | null }
export type DashStarter = {
  id: number; name: string; hand: string | null
  era: number | null; w: number | null; l: number | null; ip: string | null; k: number | null; postseason: boolean
  xwoba: number | null; bf: number | null; through: string | null
  mix: { code: string; label: string; pct: number }[]
  spin: Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>   // average spin and movement per pitch, for the turning baseballs
} | null
export type DashGame = {
  gamePk: number; slug: string; group: GameGroup
  state: string        // "Top 7 · 1 out", "Final", "Delayed", "Postponed" ...
  startUtc: string; venue: string
  away: DashSide; home: DashSide
  awayStarter: DashStarter; homeStarter: DashStarter
  series: { label: string | null; result: string | null; gameNumber: number | null; gamesInSeries: number | null } | null
  doubleHeader: boolean; gameNumber: number; startsAfterGame1: boolean
  order: number
}

function inningText(ls: any): string {
  const ord = ls?.currentInningOrdinal
  const half = ls?.inningState // Top | Middle | Bottom | End
  if (!ord) return 'Live'
  if (half === 'Middle') return `Mid ${ord.replace(/\D/g, '')}`
  if (half === 'End') return `End ${ord.replace(/\D/g, '')}`
  const outs = num(ls?.outs)
  return `${half === 'Bottom' ? 'Bottom' : 'Top'} ${ord.replace(/\D/g, '')}${outs != null ? ` · ${outs} out${outs === 1 ? '' : 's'}` : ''}`
}

/** group + label for one raw schedule game (also used by /api/mlb/live). */
export function gameState(g: any): { group: GameGroup; state: string; order: number } {
  const abs: string = g.status?.abstractGameState ?? ''
  const det: string = g.status?.detailedState ?? ''
  const ls = g.linescore
  if (/postponed|cancelled/i.test(det)) return { group: 'final', state: g.rescheduleGameDate ? `${det} · moved to ${g.rescheduleGameDate}` : det, order: 0 }
  if (/suspended/i.test(det)) return { group: 'final', state: `Suspended${g.resumeDate ? ` · resumes ${g.resumeDate.slice(0, 10)}` : ''}`, order: 0 }
  if (abs === 'Live' && !/delay/i.test(det)) return { group: 'live', state: inningText(ls), order: -(num(ls?.currentInning) ?? 0) * 2 - (ls?.inningState === 'Bottom' ? 1 : 0) }
  if (abs === 'Live') return { group: 'live', state: `Delayed · ${inningText(ls)}`, order: 0 }
  if (abs === 'Final') return { group: 'final', state: /game over|completed early/i.test(det) ? (det === 'Game Over' ? 'Final' : det) : (num(ls?.currentInning) && num(ls?.currentInning)! > 9 ? `Final/${ls.currentInning}` : 'Final'), order: 0 }
  return { group: 'upcoming', state: /delay/i.test(det) ? 'Delayed' : det === 'Warmup' ? 'Warm-up' : 'Scheduled', order: 0 }
}

async function starter(id: number, name: string, season: number, postseason: boolean): Promise<DashStarter> {
  const stat = async (gameType: 'R' | 'P') => {
    const j = await getJson(`${API}/people/${id}?hydrate=stats(group=[pitching],type=[season],season=${season},gameType=[${gameType}])`, 'dash starter stats')
    const p = j?.people?.[0]
    return { hand: (p?.pitchHand?.code as string | undefined) ?? null, s: p?.stats?.[0]?.splits?.[0]?.stat ?? null }
  }
  let used = postseason ? await stat('P') : null
  let isPost = !!used?.s
  if (!used?.s) used = await stat('R')
  const s = used?.s
  const supa = createAdminClient()
  const [arsenal, bf, ps, through, spin] = await Promise.all([
    getPitcherZoneArsenal(id).catch(() => ({} as Record<string, never>)),
    getBattersFaced(id),
    supa.from('pitcher_stats').select('xwoba_allowed').eq('player_id', id).eq('season', season).limit(1),
    supa.from('pitcher_zone_arsenal').select('updated_at').eq('player_id', id).eq('season', season).order('updated_at', { ascending: false }).limit(1),
    getSpinByPitch(id).catch(() => ({})),
  ])
  if (ps.error) console.error('[dash starter] pitcher_stats error:', ps.error.message)
  const all = (arsenal as any)?.all?.arsenal as Record<string, { usage_pct: number | null }> | undefined
  const mix = Object.entries(all ?? {}).map(([code, p]) => ({ code, label: PITCH_NAME[code] ?? code, pct: Number(p.usage_pct ?? 0) })).filter(m => m.pct > 0).sort((a, b) => b.pct - a.pct)
  return {
    id, name, hand: used?.hand ?? null,
    era: num(s?.era), w: num(s?.wins), l: num(s?.losses), ip: s?.inningsPitched ?? null, k: num(s?.strikeOuts), postseason: isPost,
    xwoba: num((ps.data?.[0] as { xwoba_allowed?: unknown } | undefined)?.xwoba_allowed), bf,
    through: (through.data?.[0] as { updated_at?: string } | undefined)?.updated_at?.slice(0, 10) ?? null,
    mix, spin,
  }
}

export async function getDashboardGames(date: string, postseason: boolean): Promise<DashGame[]> {
  const j = await getJson(`${API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore,team,venue,seriesStatus`, 'getDashboardGames')
  const raw: any[] = j?.dates?.[0]?.games ?? []
  const season = Number(date.slice(0, 4))
  const ids = new Map<number, string>()
  for (const g of raw) for (const side of ['away', 'home'] as const) { const p = g.teams[side].probablePitcher; if (p) ids.set(p.id, p.fullName) }
  // MLB's API rejects big bursts from one process: small batches (CLAUDE.md).
  const cards = new Map<number, DashStarter>()
  const list = [...ids.entries()]
  for (let i = 0; i < list.length; i += 6) {
    const rs = await Promise.all(list.slice(i, i + 6).map(([id, nm]) => starter(id, nm, season, postseason).catch(() => null)))
    list.slice(i, i + 6).forEach(([id], k) => cards.set(id, rs[k]))
  }
  const side = (t: any): DashSide => ({ id: t.team.id, name: t.team.name, abbr: t.team.abbreviation ?? t.team.name, score: num(t.score), record: t.leagueRecord ? `${t.leagueRecord.wins}-${t.leagueRecord.losses}` : null })
  const out: DashGame[] = raw.map(g => {
    const st = gameState(g)
    const asMlb: MLBGame = { gamePk: g.gamePk, gameDate: g.gameDate, officialDate: g.officialDate, doubleHeader: g.doubleHeader, gameNumber: g.gameNumber, status: g.status, teams: g.teams, venue: g.venue }
    const ss = g.seriesStatus
    return {
      gamePk: g.gamePk, slug: slugifyGame(asMlb), group: st.group, state: st.state, order: st.order,
      startUtc: g.gameDate, venue: g.venue?.name ?? '',
      away: side(g.teams.away), home: side(g.teams.home),
      awayStarter: g.teams.away.probablePitcher ? cards.get(g.teams.away.probablePitcher.id) ?? null : null,
      homeStarter: g.teams.home.probablePitcher ? cards.get(g.teams.home.probablePitcher.id) ?? null : null,
      series: ['F', 'D', 'L', 'W'].includes(g.gameType) ? { label: g.seriesDescription ?? null, result: ss?.result ?? null, gameNumber: num(g.seriesGameNumber), gamesInSeries: num(g.gamesInSeries) } : null,
      doubleHeader: g.doubleHeader === 'Y' || g.doubleHeader === 'S', gameNumber: g.gameNumber ?? 1,
      startsAfterGame1: g.doubleHeader === 'Y' && (g.gameNumber ?? 1) > 1,
    }
  })
  // Live: furthest along first; Upcoming: start time; Final: newest start first.
  return out.sort((a, b) => (a.group === b.group ? (a.group === 'live' ? a.order - b.order || a.startUtc.localeCompare(b.startUtc) : a.group === 'upcoming' ? a.startUtc.localeCompare(b.startUtc) : b.startUtc.localeCompare(a.startUtc)) : 0))
}

// ─── Postseason bracket ───────────────────────────────────────────────────────

export type BracketSeries = {
  round: 'WC' | 'DS' | 'LCS' | 'WS'; label: string; firstTo: number
  a: { id: number; abbr: string; wins: number }; b: { id: number; abbr: string; wins: number }
  status: 'final' | 'live' | 'upcoming'; text: string
}
const ROUND: Record<string, BracketSeries['round']> = { F: 'WC', D: 'DS', L: 'LCS', W: 'WS' }

export async function getPostseasonBracket(year: number): Promise<BracketSeries[]> {
  const s = (await getJson(`${API}/seasons/${year}?sportId=1`, 'getPostseasonBracket seasons'))?.seasons?.[0]
  if (!s?.postSeasonStartDate) return []
  const j = await getJson(`${API}/schedule?sportId=1&startDate=${s.postSeasonStartDate}&endDate=${s.postSeasonEndDate ?? `${year}-12-31`}&gameType=F,D,L,W&hydrate=team`, 'getPostseasonBracket')
  const games: any[] = (j?.dates ?? []).flatMap((d: any) => d.games)
  const by = new Map<string, any[]>()
  for (const g of games) {
    const ids = [g.teams.away.team.id, g.teams.home.team.id].sort((x, y) => x - y)
    const k = `${g.gameType}|${ids.join('-')}`
    by.set(k, [...(by.get(k) ?? []), g])
  }
  const series: BracketSeries[] = []
  for (const [, gs] of by) {
    const first = gs[0]
    const tA = first.teams.away.team, tH = first.teams.home.team
    const wins = (id: number) => gs.filter(g => g.status?.abstractGameState === 'Final' && ((g.teams.away.team.id === id && g.teams.away.isWinner) || (g.teams.home.team.id === id && g.teams.home.isWinner))).length
    const total = num(first.gamesInSeries) ?? 5
    const firstTo = Math.ceil(total / 2)
    const a = { id: tA.id, abbr: tA.abbreviation ?? tA.name, wins: wins(tA.id) }, b = { id: tH.id, abbr: tH.abbreviation ?? tH.name, wins: wins(tH.id) }
    const done = a.wins >= firstTo || b.wins >= firstTo
    const live = gs.some(g => g.status?.abstractGameState === 'Live')
    const lead = a.wins === b.wins ? null : a.wins > b.wins ? [a, b] : [b, a]
    series.push({
      round: ROUND[first.gameType], label: first.seriesDescription ?? '', firstTo, a, b,
      status: done ? 'final' : live || a.wins + b.wins > 0 ? 'live' : 'upcoming',
      text: !lead ? (a.wins + b.wins === 0 ? `${a.abbr} vs ${b.abbr}` : `Series tied ${a.wins}–${b.wins}`) : done ? `${lead[0].abbr} d. ${lead[1].abbr} ${lead[0].wins}–${lead[1].wins}` : `${lead[0].abbr} leads ${lead[1].abbr} ${lead[0].wins}–${lead[1].wins}`,
    })
  }
  const order = ['WC', 'DS', 'LCS', 'WS']
  return series.sort((x, y) => order.indexOf(x.round) - order.indexOf(y.round))
}

// ─── Standings with run differential, last 10 and wild card ─────────────────

export type DashTeam = { id: number; abbr: string; name: string; w: number; l: number; gb: string; rd: number; l10: string | null; wcRank: number | null; wcGb: string | null; divRank: number }
export type DashDivision = { name: string; league: 'AL' | 'NL'; teams: DashTeam[] }
const DIV: Record<number, string> = { 200: 'AL West', 201: 'AL East', 202: 'AL Central', 203: 'NL West', 204: 'NL East', 205: 'NL Central' }
const DIV_ORDER = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West']

export async function getStandingsDash(date: string): Promise<DashDivision[]> {
  const season = Number(date.slice(0, 4))
  const j = await getJson(`${API}/standings?leagueId=103,104&season=${season}&date=${date}&hydrate=team`, 'getStandingsDash')
  const divs: DashDivision[] = (j?.records ?? []).map((r: any) => {
    const name = DIV[r.division?.id] ?? 'Division'
    return {
      name, league: name.startsWith('AL') ? 'AL' : 'NL',
      teams: (r.teamRecords ?? []).map((tr: any): DashTeam => {
        const l10 = (tr.records?.splitRecords ?? []).find((s: any) => s.type === 'lastTen')
        return { id: tr.team.id, abbr: tr.team.abbreviation ?? tr.team.name, name: tr.team.name, w: tr.wins, l: tr.losses, gb: tr.gamesBack === '-' || tr.gamesBack === '0' ? '—' : tr.gamesBack, rd: num(tr.runDifferential) ?? 0, l10: l10 ? `${l10.wins}-${l10.losses}` : null, wcRank: num(tr.wildCardRank), wcGb: tr.wildCardGamesBack ?? null, divRank: num(tr.divisionRank) ?? 0 }
      }),
    }
  })
  return divs.sort((a, b) => DIV_ORDER.indexOf(a.name) - DIV_ORDER.indexOf(b.name))
}

// ─── Hot this week ────────────────────────────────────────────────────────────

export type HotRow = { id: number; name: string; team: string; n: number; nLabel: 'PA' | 'IP'; line: string; spark: number[]; sparkLabel: string; small: boolean }

export async function getHotThisWeek(group: 'hitting' | 'pitching', postseason: boolean, date: string): Promise<HotRow[]> {
  const season = Number(date.slice(0, 4))
  const gameType = postseason ? 'P' : 'R'
  const start = addDays(date, -7), end = addDays(date, -1)
  const j = await getJson(`${API}/stats?stats=byDateRange&group=${group}&startDate=${start}&endDate=${end}&season=${season}&gameType=${gameType}&sportId=1&playerPool=ALL&limit=2000`, `getHotThisWeek ${group}`)
  const splits: any[] = j?.stats?.[0]?.splits ?? []
  const minPa = postseason ? 7 : 20
  let rows = splits.map(sp => ({ sp, st: sp.stat }))
  if (group === 'hitting') rows = rows.filter(r => (num(r.st.plateAppearances) ?? 0) >= minPa).sort((a, b) => (num(b.st.ops) ?? 0) - (num(a.st.ops) ?? 0))
  else rows = rows.filter(r => (num(r.st.inningsPitched) ?? 0) >= 3).sort((a, b) => (num(b.st.inningsPitched) ?? 0) - (num(a.st.inningsPitched) ?? 0) || (num(a.st.era) ?? 99) - (num(b.st.era) ?? 99))
  const top = rows.slice(0, 6)
  const out: HotRow[] = []
  for (let i = 0; i < top.length; i += 6) {
    const rs = await Promise.all(top.slice(i, i + 6).map(async ({ sp, st }) => {
      const id = sp.player?.id as number
      const gl = await getJson(`${API}/people/${id}/stats?stats=gameLog&group=${group}&season=${season}&gameType=${gameType}`, 'getHotThisWeek gameLog')
      const games = (gl?.stats?.[0]?.splits ?? []).filter((g: any) => g.date >= start && g.date <= end)
      const spark = games.map((g: any) => num(group === 'hitting' ? g.stat.hits : g.stat.strikeOuts) ?? 0)
      const n = group === 'hitting' ? num(st.plateAppearances) ?? 0 : num(st.inningsPitched) ?? 0
      return {
        id, name: sp.player?.fullName ?? '—', team: sp.team?.abbreviation ?? findTeamByName(sp.team?.name ?? '')?.abbrev ?? sp.team?.name ?? '—', n, nLabel: group === 'hitting' ? 'PA' : 'IP',
        line: group === 'hitting' ? `${st.avg} AVG · ${st.ops} OPS` : `${st.era} ERA · ${st.strikeOuts} K`,
        spark, sparkLabel: group === 'hitting' ? 'Hits per game' : 'K per outing',
        small: group === 'hitting' ? n < MIN_SAMPLE.splitPA : n < 5,
      } as HotRow
    }))
    out.push(...rs)
  }
  return out
}

export const WEEK_LABEL = (date: string) => {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${f(addDays(date, -7))} to ${f(addDays(date, -1))}`
}

// ─── Postseason leaders ───────────────────────────────────────────────────────

export type PostLeader = { id: number; name: string; team: string; value: number; games: number }
export type PostLeaderGroup = { label: string; unit: string; rows: PostLeader[] }

/** Top 3 in the postseason so far: home runs and RBI (hitting), strikeouts (pitching). `games` is the sample behind each number. */
export async function getPostseasonLeaders(year: number): Promise<PostLeaderGroup[]> {
  const one = async (group: 'hitting' | 'pitching', sortStat: string, field: string): Promise<PostLeader[]> => {
    const j = await getJson(`${API}/stats?stats=season&group=${group}&gameType=P&season=${year}&sportId=1&playerPool=ALL&sortStat=${sortStat}&order=desc&limit=3`, `getPostseasonLeaders ${sortStat}`)
    return ((j?.stats?.[0]?.splits ?? []) as any[]).map(sp => ({
      id: sp.player?.id, name: sp.player?.fullName ?? '—', team: sp.team?.abbreviation ?? findTeamByName(sp.team?.name ?? '')?.abbrev ?? sp.team?.name ?? '—',
      value: num(sp.stat?.[field]) ?? 0, games: num(sp.stat?.gamesPlayed) ?? 0,
    })).filter(r => r.value > 0)
  }
  const [hr, rbi, so] = await Promise.all([one('hitting', 'homeRuns', 'homeRuns'), one('hitting', 'rbi', 'rbi'), one('pitching', 'strikeOuts', 'strikeOuts')])
  return [{ label: 'Home runs', unit: 'HR', rows: hr }, { label: 'RBI', unit: 'RBI', rows: rbi }, { label: 'Strikeouts', unit: 'K', rows: so }]
}

// ─── Stat of the day ──────────────────────────────────────────────────────────

export type StatOfDay = {
  date: string; n: number; games: number
  hardest: { mph: number; feet: number | null; batter: string; batterId: number; team: string; event: string } | null
  longestHr: { feet: number; mph: number | null; batter: string; batterId: number; team: string } | null
}

/** The hardest-hit ball (and longest home run) of the latest day with finished games, from the league's play-by-play tracking. */
export async function getStatOfTheDay(today: string): Promise<StatOfDay | null> {
  for (let back = 1; back <= 7; back++) {
    const date = addDays(today, -back)
    const j = await getJson(`${API}/schedule?sportId=1&date=${date}&hydrate=team`, 'getStatOfTheDay schedule')
    const finals: any[] = (j?.dates?.[0]?.games ?? []).filter((g: any) => g.status?.abstractGameState === 'Final' && g.status?.detailedState !== 'Postponed')
    if (finals.length === 0) continue
    let n = 0
    let hardest: StatOfDay['hardest'] = null
    let longest: StatOfDay['longestHr'] = null
    for (let i = 0; i < finals.length; i += 6) {
      const feeds = await Promise.all(finals.slice(i, i + 6).map(g => getJson(`${API}/game/${g.gamePk}/playByPlay`, 'getStatOfTheDay pbp', 3600)))
      feeds.forEach((f, k) => {
        const g = finals[i + k]
        for (const p of f?.allPlays ?? []) {
          for (const e of p.playEvents ?? []) {
            const h = e.hitData
            const mph = num(h?.launchSpeed)
            if (!h || mph == null) continue
            n++
            const bat = p.matchup?.batter
            const team = p.about?.isTopInning ? g.teams.away.team.abbreviation : g.teams.home.team.abbreviation
            if (!hardest || mph > hardest.mph) hardest = { mph, feet: num(h.totalDistance), batter: bat?.fullName ?? '—', batterId: bat?.id, team, event: p.result?.event ?? '' }
            const ft = num(h.totalDistance)
            if (p.result?.eventType === 'home_run' && ft != null && (!longest || ft > longest.feet)) longest = { feet: ft, mph, batter: bat?.fullName ?? '—', batterId: bat?.id, team }
          }
        }
      })
    }
    return { date, n, games: finals.length, hardest, longestHr: longest }
  }
  return null
}
