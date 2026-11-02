// src/lib/team-batting.ts
//
// A club's batting across the regular season, the postseason and each postseason round, for the article writer's chart picker (admin only).
// Every line is rebuilt from raw counting stats (so a round's AVG/OBP/SLG are real sums, never an average of averages).
// Source: MLB Stats API team game logs, with the schedule's series names. Read-only; returns null when the API does not answer.

import { MLB_TEAMS } from '@/lib/teams'
import { log } from '@/lib/log'

export type BatCounts = { g: number; w: number; pa: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; hbp: number; sf: number; so: number; r: number; rbi: number; sb: number; tb: number }
export type BatLine = { g: number; w: number; r: number; hr: number; sb: number; rPerG: number | null; avg: number | null; obp: number | null; slg: number | null; ops: number | null; kPct: number | null; bbPct: number | null; pa: number }
export type BattingRound = { series: string; short: string; opp: string; line: BatLine }
export type TeamBatting = { regular: BatLine | null; post: BatLine | null; rounds: BattingRound[] }

export const zero = (): BatCounts => ({ g: 0, w: 0, pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, hbp: 0, sf: 0, so: 0, r: 0, rbi: 0, sb: 0, tb: 0 })

type Stat = Record<string, unknown>
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

/** Counting stats of one MLB Stats API stat block (a game, or a whole season). `won` adds a win for a game. */
export function countsOf(s: Stat, won = false): BatCounts {
  return { g: n(s.gamesPlayed) || 1, w: won ? 1 : 0, pa: n(s.plateAppearances), ab: n(s.atBats), h: n(s.hits), d2: n(s.doubles), d3: n(s.triples), hr: n(s.homeRuns), bb: n(s.baseOnBalls), hbp: n(s.hitByPitch), sf: n(s.sacFlies), so: n(s.strikeOuts), r: n(s.runs), rbi: n(s.rbi), sb: n(s.stolenBases), tb: n(s.totalBases) }
}
export function add(a: BatCounts, b: BatCounts): BatCounts {
  const out = zero()
  for (const k of Object.keys(out) as (keyof BatCounts)[]) out[k] = a[k] + b[k]
  return out
}
const div = (a: number, b: number) => (b > 0 ? a / b : null)

/** Rate stats from counts. null when there is no sample. */
export function lineOf(c: BatCounts): BatLine | null {
  if (c.g === 0 || c.pa === 0) return null
  const obp = div(c.h + c.bb + c.hbp, c.ab + c.bb + c.hbp + c.sf)
  const slg = div(c.tb, c.ab)
  return { g: c.g, w: c.w, r: c.r, hr: c.hr, sb: c.sb, rPerG: div(c.r, c.g), avg: div(c.h, c.ab), obp, slg, ops: obp != null && slg != null ? obp + slg : null, kPct: div(c.so, c.pa), bbPct: div(c.bb, c.pa), pa: c.pa }
}

const SHORT: Record<string, string> = {
  'Wild Card Series': 'Wild Card', 'AL Wild Card Game': 'Wild Card', 'NL Wild Card Game': 'Wild Card',
  'AL Division Series': 'ALDS', 'NL Division Series': 'NLDS', 'AL Championship Series': 'ALCS', 'NL Championship Series': 'NLCS', 'World Series': 'World Series',
}
const ORDER = ['Wild Card', 'ALDS', 'NLDS', 'ALCS', 'NLCS', 'World Series']

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) { log.error('team-batting', 'MLB API status', res.status); return null }
    return await res.json()
  } catch (e) {
    log.error('team-batting', 'failed', e instanceof Error ? e.message : e)
    return null
  }
}

type Split = { stat: Stat; isWin?: boolean; opponent?: { id: number }; game?: { gamePk: number } }
const splitsOf = (d: unknown): Split[] => ((d as { stats?: { splits?: Split[] }[] } | null)?.stats?.[0]?.splits ?? [])

export async function getTeamBatting(teamId: number, season: number): Promise<TeamBatting | null> {
  const base = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?group=hitting&season=${season}`
  const [reg, post, sched] = await Promise.all([
    getJson(`${base}&stats=gameLog&gameType=R`),
    getJson(`${base}&stats=gameLog&gameType=P`),
    getJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=F,D,L,W&fields=dates,games,gamePk,seriesDescription`),
  ])
  if (!reg && !post) return null
  const total = (sp: Split[]) => sp.reduce((a, s) => add(a, countsOf(s.stat, !!s.isWin)), zero())
  const regSplits = splitsOf(reg), postSplits = splitsOf(post)

  const seriesOf = new Map<number, string>()
  for (const d of ((sched as { dates?: { games: { gamePk: number; seriesDescription?: string }[] }[] } | null)?.dates ?? [])) for (const g of d.games) if (g.seriesDescription) seriesOf.set(g.gamePk, g.seriesDescription)

  const by = new Map<string, { series: string; counts: BatCounts; opp: number | null }>()
  for (const s of postSplits) {
    const series = seriesOf.get(s.game?.gamePk ?? 0)
    if (!series) continue
    const short = SHORT[series] ?? series
    const cur = by.get(short) ?? { series, counts: zero(), opp: s.opponent?.id ?? null }
    cur.counts = add(cur.counts, countsOf(s.stat, !!s.isWin))
    by.set(short, cur)
  }
  const rounds: BattingRound[] = []
  for (const [short, v] of by) {
    const line = lineOf(v.counts)
    if (line) rounds.push({ series: v.series, short, opp: MLB_TEAMS.find(t => t.id === v.opp)?.short ?? '', line })
  }
  rounds.sort((a, b) => ORDER.indexOf(a.short) - ORDER.indexOf(b.short))
  return { regular: lineOf(total(regSplits)), post: lineOf(total(postSplits)), rounds }
}
