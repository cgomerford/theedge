// src/lib/scout/bullpen-trends.ts
//
// Scout §3 deep layer — how a club's bullpen is used and how it is trending,
// built from every current reliever's MLB game log (one batched Stats API call).
//
// Scope, stated plainly: this is "the bullpen as constituted" — the arms on the
// club's bullpen list today, counting only their relief appearances (games
// started excluded) for THIS club. Arms who have left the club are not in the
// history. Every split carries its sample size and the UI gates thin ones.
//
// Outputs:
//   · explorer   — team-level relief stats, trailing windows over the last 45 games
//                  (strike%, walk rate, K%, LOB%, inherited runners scored, IP/game…)
//   · loadVsRuns — bullpen innings in the 3 days BEFORE a game vs runs the pen allowed IN it
//   · byRest     — runs allowed by days of rest since the arm's previous outing
//   · byPrevLoad — runs allowed by pitch count of the arm's previous outing
//   · arms       — per-arm season usage line + last 6 outings

import {
  buildRolling, ratio, sumOf, withFallbackBaselines,
  type ExplorerClub, type ExplorerStat, type StatFns,
} from './stat-explorer'
import { getStartMarkers } from './game-starts'

const MLB = 'https://statsapi.mlb.com/api/v1'
export const PEN_WINDOWS = [1, 3, 5, 7, 10, 15]
const CHART_GAMES = 45
export const MIN_SPLIT_N = 8   // fewer than this → shown faded, not read into

export type ReliefApp = {
  id: number; name: string; pk: number; date: string
  outs: number; pitches: number; strikes: number; bf: number
  bb: number; hbp: number; k: number; h: number; r: number; er: number; hr: number
  inhR: number; inhRS: number; gf: number; hold: number; save: number; bs: number
}

export type PenGame = Omit<ReliefApp, 'id' | 'name' | 'gf' | 'hold' | 'save' | 'bs'> & { apps: number }

export type SplitBucket = { label: string; n: number; outs: number; er: number; r: number; k: number; bb: number; bf: number }

export type ArmUsage = {
  id: number
  apps: number; outs: number; era: number | null
  strikePct: number | null; bbPct: number | null; kPct: number | null
  pitchesPerApp: number | null; multiInningPct: number | null
  inhR: number; inhRS: number
  gf: number; hold: number; save: number; bs: number
  recent: ReliefApp[]   // last 6, oldest → newest
}

export type BullpenTrends = {
  explorer: ExplorerClub
  loadVsRuns: SplitBucket[]
  byRest: SplitBucket[]
  byPrevLoad: SplitBucket[]
  arms: Map<number, ArmUsage>
  team: { apps: number; games: number; enterWithRunnersPct: number | null; pitchesPerApp: number | null; multiInningPct: number | null; ipPerGame: number | null }
}

// ─── Stat registry ───────────────────────────────────────────────────────

export const PEN_STATS: ExplorerStat[] = [
  { key: 'era', label: 'ERA', group: 'Results', format: 'num2', higherIsBetter: false, hint: 'Earned runs per nine innings by the bullpen.' },
  { key: 'whip', label: 'WHIP', group: 'Results', format: 'num2', higherIsBetter: false, hint: 'Walks plus hits per inning pitched.' },
  { key: 'runsPer9', label: 'Runs / 9', group: 'Results', format: 'num2', higherIsBetter: false, hint: 'All runs (earned or not) allowed per nine innings.' },
  { key: 'hrPer9', label: 'HR / 9', group: 'Results', format: 'num2', higherIsBetter: false, hint: 'Home runs allowed per nine innings.' },
  { key: 'lobPct', label: 'Strand rate (LOB%)', group: 'Results', format: 'pct', higherIsBetter: true, hint: 'Share of baserunners the pen leaves stranded — estimated from hits, walks, runs and home runs. Very high or low rates tend to drift back to normal.' },
  { key: 'strikePct', label: 'Strike%', group: 'Command', format: 'pct', higherIsBetter: true, hint: 'Share of pitches that are strikes.' },
  { key: 'bbPct', label: 'Walk rate', group: 'Command', format: 'pct', higherIsBetter: false, hint: 'Walks per batter faced.' },
  { key: 'kPct', label: 'K%', group: 'Command', format: 'pct', higherIsBetter: true, hint: 'Strikeouts per batter faced.' },
  { key: 'kbbPct', label: 'K%−BB%', group: 'Command', format: 'pct', higherIsBetter: true, hint: 'Strikeout rate minus walk rate — the cleanest single read on a pen’s stuff and control.' },
  { key: 'ipPerGame', weight: 'game' as const, label: 'Innings / game', group: 'Usage', format: 'num1', higherIsBetter: null, hint: 'Bullpen innings per game — how much of the game the pen is asked to cover.' },
  { key: 'pitchesPerApp', weight: 'game' as const, label: 'Pitches / outing', group: 'Usage', format: 'num1', higherIsBetter: null, hint: 'Average pitches per relief appearance.' },
  { key: 'appsPerGame', weight: 'game' as const, label: 'Arms used / game', group: 'Usage', format: 'num1', higherIsBetter: null, hint: 'Relief appearances per game.' },
  { key: 'inhPerGame', weight: 'game' as const, label: 'Inherited runners / game', group: 'Usage', format: 'num2', higherIsBetter: null, hint: 'Runners already on base when a reliever enters, per game.' },
  { key: 'irsPct', label: 'Inherited runners scored%', group: 'Usage', format: 'pct', higherIsBetter: false, hint: 'Share of inherited runners who come around to score.' },
]

export const PEN_TILES = ['strikePct', 'bbPct', 'irsPct']

const PEN_FNS: StatFns<PenGame> = {
  era: (g) => ratio(sumOf(g, (x) => x.er), sumOf(g, (x) => x.outs), 27),
  whip: (g) => ratio(sumOf(g, (x) => x.h + x.bb), sumOf(g, (x) => x.outs), 3),
  runsPer9: (g) => ratio(sumOf(g, (x) => x.r), sumOf(g, (x) => x.outs), 27),
  hrPer9: (g) => ratio(sumOf(g, (x) => x.hr), sumOf(g, (x) => x.outs), 27),
  lobPct: (g) => {
    const h = sumOf(g, (x) => x.h), bb = sumOf(g, (x) => x.bb), hbp = sumOf(g, (x) => x.hbp), r = sumOf(g, (x) => x.r), hr = sumOf(g, (x) => x.hr)
    const den = h + bb + hbp - 1.4 * hr
    return den > 0 ? Math.min(100, Math.max(0, ((h + bb + hbp - r) / den) * 100)) : null
  },
  strikePct: (g) => ratio(sumOf(g, (x) => x.strikes), sumOf(g, (x) => x.pitches), 100),
  bbPct: (g) => ratio(sumOf(g, (x) => x.bb), sumOf(g, (x) => x.bf), 100),
  kPct: (g) => ratio(sumOf(g, (x) => x.k), sumOf(g, (x) => x.bf), 100),
  kbbPct: (g) => ratio(sumOf(g, (x) => x.k - x.bb), sumOf(g, (x) => x.bf), 100),
  ipPerGame: (g) => ratio(sumOf(g, (x) => x.outs), g.length * 3),
  pitchesPerApp: (g) => ratio(sumOf(g, (x) => x.pitches), sumOf(g, (x) => x.apps)),
  appsPerGame: (g) => ratio(sumOf(g, (x) => x.apps), g.length),
  inhPerGame: (g) => ratio(sumOf(g, (x) => x.inhR), g.length),
  irsPct: (g) => ratio(sumOf(g, (x) => x.inhRS), sumOf(g, (x) => x.inhR), 100),
}

// ─── Fetch + parse ───────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000)
}

async function fetchReliefLogs(teamId: number, armIds: number[], gameDate: string): Promise<ReliefApp[]> {
  if (armIds.length === 0) return []
  const season = gameDate.slice(0, 4)
  try {
    const res = await fetch(
      `${MLB}/people?personIds=${armIds.join(',')}&hydrate=stats(group=[pitching],type=[gameLog],season=${season})`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) return []
    const apps: ReliefApp[] = []
    for (const p of (await res.json()).people ?? []) {
      const splits = p.stats?.find((s: { type?: { displayName?: string } }) => s.type?.displayName === 'gameLog')?.splits ?? []
      for (const s of splits) {
        const st = s.stat ?? {}
        if (s.team?.id !== teamId || (st.gamesStarted ?? 0) > 0 || !s.game?.gamePk || !s.date || s.date >= gameDate) continue
        apps.push({
          id: p.id, name: p.fullName, pk: s.game.gamePk, date: s.date,
          outs: st.outs ?? 0, pitches: st.numberOfPitches ?? 0, strikes: st.strikes ?? 0, bf: st.battersFaced ?? 0,
          bb: st.baseOnBalls ?? 0, hbp: st.hitByPitch ?? 0, k: st.strikeOuts ?? 0, h: st.hits ?? 0,
          r: st.runs ?? 0, er: st.earnedRuns ?? 0, hr: st.homeRuns ?? 0,
          inhR: st.inheritedRunners ?? 0, inhRS: st.inheritedRunnersScored ?? 0,
          gf: st.gamesFinished ?? 0, hold: st.holds ?? 0, save: st.saves ?? 0, bs: st.blownSaves ?? 0,
        })
      }
    }
    return apps.sort((a, b) => a.date.localeCompare(b.date) || a.pk - b.pk)
  } catch { return [] }
}

function toPenGames(apps: ReliefApp[]): PenGame[] {
  const byGame = new Map<number, PenGame>()
  for (const a of apps) {
    let g = byGame.get(a.pk)
    if (!g) { g = { pk: a.pk, date: a.date, apps: 0, outs: 0, pitches: 0, strikes: 0, bf: 0, bb: 0, hbp: 0, k: 0, h: 0, r: 0, er: 0, hr: 0, inhR: 0, inhRS: 0 }; byGame.set(a.pk, g) }
    g.apps += 1
    for (const k of ['outs', 'pitches', 'strikes', 'bf', 'bb', 'hbp', 'k', 'h', 'r', 'er', 'hr', 'inhR', 'inhRS'] as const) g[k] += a[k]
  }
  return [...byGame.values()].sort((a, b) => a.date.localeCompare(b.date) || a.pk - b.pk)
}

// ─── Splits ──────────────────────────────────────────────────────────────

const emptyBucket = (label: string): SplitBucket => ({ label, n: 0, outs: 0, er: 0, r: 0, k: 0, bb: 0, bf: 0 })
function addTo(b: SplitBucket, x: { outs: number; er: number; r: number; k: number; bb: number; bf: number }) {
  b.n += 1; b.outs += x.outs; b.er += x.er; b.r += x.r; b.k += x.k; b.bb += x.bb; b.bf += x.bf
}

function buildLoadVsRuns(games: PenGame[]): SplitBucket[] {
  if (games.length < 12) return []
  const prior = games.map((g) => games.filter((o) => { const d = daysBetween(o.date, g.date); return d >= 1 && d <= 3 }).reduce((a, o) => a + o.outs, 0))
  const sorted = [...prior].sort((a, b) => a - b)
  const t1 = sorted[Math.floor(sorted.length / 3)], t2 = sorted[Math.floor((sorted.length * 2) / 3)]
  const ip = (outs: number) => `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : ''}`
  const buckets = [emptyBucket(`Light · up to ${ip(t1)} IP`), emptyBucket(`Medium · ${ip(t1 + 1)}–${ip(t2)} IP`), emptyBucket(`Heavy · ${ip(t2 + 1)}+ IP`)]
  games.forEach((g, i) => addTo(buckets[prior[i] <= t1 ? 0 : prior[i] <= t2 ? 1 : 2], g))
  return buckets
}

function buildArmSplits(apps: ReliefApp[]): { byRest: SplitBucket[]; byPrevLoad: SplitBucket[] } {
  const byRest = [emptyBucket('Back-to-back (0 days rest)'), emptyBucket('1 day rest'), emptyBucket('2+ days rest')]
  const byPrev = [emptyBucket('Previous outing under 15 pitches'), emptyBucket('15–24 pitches'), emptyBucket('25+ pitches')]
  const perArm = new Map<number, ReliefApp[]>()
  for (const a of apps) perArm.set(a.id, [...(perArm.get(a.id) ?? []), a])
  for (const list of perArm.values()) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i]
      const rest = Math.max(0, daysBetween(prev.date, cur.date) - 1)
      addTo(byRest[rest === 0 ? 0 : rest === 1 ? 1 : 2], cur)
      addTo(byPrev[prev.pitches < 15 ? 0 : prev.pitches < 25 ? 1 : 2], cur)
    }
  }
  return { byRest, byPrevLoad: byPrev }
}

function buildArmUsage(id: number, apps: ReliefApp[]): ArmUsage {
  const sum = (k: keyof ReliefApp) => apps.reduce((a, x) => a + (x[k] as number), 0)
  const outs = sum('outs')
  return {
    id, apps: apps.length, outs,
    era: ratio(sum('er'), outs, 27),
    strikePct: ratio(sum('strikes'), sum('pitches'), 100),
    bbPct: ratio(sum('bb'), sum('bf'), 100),
    kPct: ratio(sum('k'), sum('bf'), 100),
    pitchesPerApp: ratio(sum('pitches'), apps.length),
    multiInningPct: ratio(apps.filter((a) => a.outs >= 4).length, apps.length, 100),
    inhR: sum('inhR'), inhRS: sum('inhRS'),
    gf: sum('gf'), hold: sum('hold'), save: sum('save'), bs: sum('bs'),
    recent: apps.slice(-6),
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────

export async function getBullpenTrends(teamId: number, abbr: string, name: string, armIds: number[], gameDate: string): Promise<BullpenTrends | null> {
  const apps = await fetchReliefLogs(teamId, armIds, gameDate)
  const games = toPenGames(apps)
  if (games.length < 5) return null

  const recentGames = games.slice(-CHART_GAMES)
  const { rolling, samples } = buildRolling(recentGames, PEN_WINDOWS, PEN_FNS, (w) => sumOf(w, (g) => g.bf))
  const season: Record<string, number | null> = {}
  for (const s of PEN_STATS) season[s.key] = PEN_FNS[s.key](games)
  const markers = await getStartMarkers(teamId, recentGames.map((g) => g.pk), recentGames.map((g) => g.date), 'ownSp')
  const { byRest, byPrevLoad } = buildArmSplits(apps)

  const arms = new Map<number, ArmUsage>()
  for (const id of new Set(apps.map((a) => a.id))) arms.set(id, buildArmUsage(id, apps.filter((a) => a.id === id)))

  const entered = apps.filter((a) => a.inhR > 0).length
  return {
    explorer: {
      abbr, name, dates: recentGames.map((g) => g.date), pks: recentGames.map((g) => g.pk), markers, windows: PEN_WINDOWS, rolling, samples,
      baseline: withFallbackBaselines(PEN_STATS.map((s) => s.key), season, 'Season (current arms)', recentGames, PEN_FNS),
    },
    loadVsRuns: buildLoadVsRuns(games),
    byRest, byPrevLoad, arms,
    team: {
      apps: apps.length, games: games.length,
      enterWithRunnersPct: ratio(entered, apps.length, 100),
      pitchesPerApp: PEN_FNS.pitchesPerApp(games),
      multiInningPct: ratio(apps.filter((a) => a.outs >= 4).length, apps.length, 100),
      ipPerGame: PEN_FNS.ipPerGame(games),
    },
  }
}
