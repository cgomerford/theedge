// src/lib/pitcher-start-trends.ts
//
// "Is this the same pitcher as April?" — one real row per start, merging
// two real sources:
//   - Official box score (MLB Stats API gameLog) — IP, ER, BB, SO, HR, HBP.
//     Same endpoint already proven twice in this codebase (getPitcherRecentStarts
//     / getPitcherFullSeasonGameLog in lib/mlb.ts).
//   - Live Statcast per-pitch log (same Savant CSV endpoint already proven
//     in pitcher-statcast-profile.ts and pitcher-situational-zones.ts),
//     grouped by game_date instead of by count situation this time — avg
//     velo, pitch-type usage%, heart%/edge% zone rate, avg estimated wOBA.
//
// Per-start FIP uses a FIXED, disclosed constant (3.10 — a reasonable
// recent-MLB approximation, not season-specific lgERA-derived). Every
// input (HR/BB/HBP/K/IP) is real; the constant is a documented
// approximation, not a fabricated stat — flagged in the UI, not hidden.

import { getDebutYear } from '@/lib/venue-schedule'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const FIP_CONSTANT = 3.10
const CORE_ZONES = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
const CHASE_ZONES = new Set(['11', '12', '13', '14'])

export type StartTrendRow = {
  date: string
  opponent: string
  ip: number | null
  era: number | null
  fip: number | null
  xwoba: number | null
  avgVelo: number | null
  hits: number
  earnedRuns: number
  commandPct: number | null // Strike% — real pitches resulting in a strike (called, swinging, foul, or in play) over total pitches thrown that start
  strikesThrown: number | null // real raw count behind commandPct — how many of totalPitches were strikes
  heartPct: number | null
  edgePct: number | null
  pitchMix: Record<string, number> // pitchType -> usage% for THIS start
  totalPitches: number
}

export type PitcherStartTrends = {
  pitcherId: number
  season: number
  starts: StartTrendRow[] // chronological
  pitchTypesSeen: string[] // union across all starts, ordered by season-wide usage
  pitchNames: Record<string, string>
}

function parseIP(ip: string | undefined): number | null {
  if (!ip) return null
  const [whole, partial] = ip.split('.').map(Number)
  if (Number.isNaN(whole)) return null
  const outs = whole * 3 + (partial === 1 ? 1 : partial === 2 ? 2 : 0)
  return outs > 0 ? outs / 3 : (whole === 0 && !partial ? 0 : null)
}

type MlbGameLogSplit = {
  date?: string
  opponent?: { id?: number; name?: string }
  stat?: {
    inningsPitched?: string
    earnedRuns?: string | number
    hits?: string | number
    baseOnBalls?: string | number
    strikeOuts?: string | number
    homeRuns?: string | number
    hitBatsmen?: string | number
    wins?: string | number
    losses?: string | number
  }
}

export type OfficialStart = {
  date: string
  opponent: string
  opponentId: number | null
  ip: number | null
  er: number
  hits: number
  bb: number
  so: number
  hr: number
  hbp: number
  isWin: boolean // real stat.wins/stat.losses flags for THIS start (confirmed against a live pull — top-level isWin/isLoss aren't reliably both present)
  isLoss: boolean
}

async function getOfficialStartLogForSeason(playerId: number, season: number, cacheSeconds: number): Promise<OfficialStart[]> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}`
  try {
    const res = await fetch(url, { next: { revalidate: cacheSeconds } })
    if (!res.ok) return []
    const data = await res.json()
    const games: MlbGameLogSplit[] = data.stats?.[0]?.splits ?? []
    return games.filter(g => g.date && g.stat).map(g => ({
      date: String(g.date),
      opponent: g.opponent?.name ?? '—',
      opponentId: g.opponent?.id ?? null,
      ip: parseIP(g.stat?.inningsPitched),
      er: Number(g.stat?.earnedRuns ?? 0),
      hits: Number(g.stat?.hits ?? 0),
      bb: Number(g.stat?.baseOnBalls ?? 0),
      so: Number(g.stat?.strikeOuts ?? 0),
      hr: Number(g.stat?.homeRuns ?? 0),
      hbp: Number(g.stat?.hitBatsmen ?? 0),
      isWin: Number(g.stat?.wins ?? 0) === 1,
      isLoss: Number(g.stat?.losses ?? 0) === 1,
    }))
  } catch {
    return []
  }
}

async function getOfficialStartLog(playerId: number, season: number): Promise<OfficialStart[]> {
  return getOfficialStartLogForSeason(playerId, season, 3600)
}

// `range: 'career'` pulls one real gameLog per real season from the
// pitcher's real MLB debut year through the current season — same
// per-season-loop pattern as getPitcherVenueRecord in pitcher-venue-record.ts.
async function getOfficialStartLogForRange(playerId: number, season: number, range: 'season' | 'career'): Promise<OfficialStart[]> {
  if (range === 'season') return getOfficialStartLogForSeason(playerId, season, 3600)
  const debutYear = await getDebutYear(playerId)
  const seasons = Array.from({ length: Math.max(1, season - debutYear + 1) }, (_, i) => debutYear + i)
  const currentYear = new Date().getFullYear()
  const perSeason = await Promise.all(seasons.map(yr => getOfficialStartLogForSeason(playerId, yr, yr < currentYear ? 86400 : 3600)))
  return perSeason.flat()
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

// Real strike outcomes, same vocabulary as the zone-aggregation scripts
// elsewhere in this app (fetch_pitcher_hot_zones.py's is_swing set, plus
// called_strike) — anything here counts as a strike thrown, whether or
// not it was swung at.
const STRIKE_DESCRIPTIONS = new Set([
  'called_strike', 'swinging_strike', 'swinging_strike_blocked',
  'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'hit_into_play',
])

type StatcastByDate = Map<string, {
  pitches: number
  veloSum: number; veloCount: number
  wobaSum: number; wobaCount: number
  heartPitches: number; edgePitches: number; zonedPitches: number; strikes: number
  pitchCounts: Map<string, number>
}>

async function getStatcastByStart(playerId: number, season: number): Promise<{ byDate: StatcastByDate; pitchNames: Record<string, string> } | null> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=pitcher`,
    `&pitchers_lookup%5B%5D=${playerId}`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    })
    if (!res.ok) return null
    text = await res.text()
  } catch {
    return null
  }

  const lines = text.trim().split('\n')
  if (lines.length < 2) return null
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
  const idx = (n: string) => headers.indexOf(n)
  const iDate = idx('game_date'), iVelo = idx('release_speed'), iZone = idx('zone')
  const iPitchType = idx('pitch_type'), iPitchName = idx('pitch_name'), iEstWoba = idx('estimated_woba_using_speedangle')
  const iDesc = idx('description'), iType = idx('type')
  if (iDate === -1 || iPitchType === -1) return null

  const byDate: StatcastByDate = new Map()
  const pitchNames: Record<string, string> = {}

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
    const date = cells[iDate]
    const pitchType = cells[iPitchType]
    if (!date || !pitchType) continue
    if (iPitchName !== -1 && cells[iPitchName] && !pitchNames[pitchType]) pitchNames[pitchType] = cells[iPitchName]

    if (!byDate.has(date)) byDate.set(date, { pitches: 0, veloSum: 0, veloCount: 0, wobaSum: 0, wobaCount: 0, heartPitches: 0, edgePitches: 0, zonedPitches: 0, strikes: 0, pitchCounts: new Map() })
    const d = byDate.get(date)!
    d.pitches++
    d.pitchCounts.set(pitchType, (d.pitchCounts.get(pitchType) ?? 0) + 1)

    if (iDesc !== -1 && STRIKE_DESCRIPTIONS.has(cells[iDesc])) d.strikes++

    const velo = iVelo !== -1 ? Number(cells[iVelo]) : NaN
    if (!Number.isNaN(velo)) { d.veloSum += velo; d.veloCount++ }

    // estimated_woba_using_speedangle is only real on a batted ball —
    // Savant's raw CSV fills it with literal '0' (not blank) on every
    // other pitch, which silently dilutes the average toward zero if
    // counted unconditionally (confirmed against a real pitcher's raw
    // CSV: type='S' rows carry '0' here, not '').
    if (iType !== -1 && cells[iType] === 'X') {
      const woba = iEstWoba !== -1 ? Number(cells[iEstWoba]) : NaN
      if (!Number.isNaN(woba)) { d.wobaSum += woba; d.wobaCount++ }
    }

    if (iZone !== -1) {
      const zone = String(Math.trunc(Number(cells[iZone])))
      if (zone === '5') d.heartPitches++
      if (CHASE_ZONES.has(zone)) d.edgePitches++
      if (CORE_ZONES.has(zone) || CHASE_ZONES.has(zone)) d.zonedPitches++
    }
  }

  return { byDate, pitchNames }
}

export async function getPitcherStartTrends(playerId: number, season: number): Promise<PitcherStartTrends> {
  const [official, statcast] = await Promise.all([
    getOfficialStartLog(playerId, season),
    getStatcastByStart(playerId, season),
  ])

  const usageTotals = new Map<string, number>()
  const starts: StartTrendRow[] = official.map((g: OfficialStart) => {
    const era = g.ip != null && g.ip > 0 ? Math.round((g.er * 9 / g.ip) * 100) / 100 : null
    const fip = g.ip != null && g.ip > 0
      ? Math.round((((13 * g.hr + 3 * (g.bb + g.hbp) - 2 * g.so) / g.ip) + FIP_CONSTANT) * 100) / 100
      : null

    const sc = statcast?.byDate.get(g.date)
    const pitchMix: Record<string, number> = {}
    if (sc) {
      for (const [pt, count] of sc.pitchCounts) {
        const pct = Math.round((count / sc.pitches) * 1000) / 10
        pitchMix[pt] = pct
        usageTotals.set(pt, (usageTotals.get(pt) ?? 0) + count)
      }
    }

    return {
      date: g.date,
      opponent: g.opponent,
      ip: g.ip,
      era,
      fip,
      xwoba: sc && sc.wobaCount > 0 ? Math.round((sc.wobaSum / sc.wobaCount) * 1000) / 1000 : null,
      avgVelo: sc && sc.veloCount > 0 ? Math.round((sc.veloSum / sc.veloCount) * 10) / 10 : null,
      hits: g.hits,
      earnedRuns: g.er,
      commandPct: sc && sc.pitches > 0 ? Math.round((sc.strikes / sc.pitches) * 1000) / 10 : null,
      strikesThrown: sc ? sc.strikes : null,
      heartPct: sc && sc.zonedPitches > 0 ? Math.round((sc.heartPitches / sc.zonedPitches) * 1000) / 10 : null,
      edgePct: sc && sc.zonedPitches > 0 ? Math.round((sc.edgePitches / sc.zonedPitches) * 1000) / 10 : null,
      pitchMix,
      totalPitches: sc?.pitches ?? 0,
    }
  })

  const pitchTypesSeen = [...usageTotals.entries()].sort((a, b) => b[1] - a[1]).map(([pt]) => pt)

  return {
    pitcherId: playerId,
    season,
    starts,
    pitchTypesSeen,
    pitchNames: statcast?.pitchNames ?? {},
  }
}

export function rollingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null)
    if (slice.length === 0) return null
    return Math.round((slice.reduce((s, v) => s + v, 0) / slice.length) * 1000) / 1000
  })
}

export type TeamRecordRow = {
  opponentId: number | null
  opponent: string
  wins: number
  losses: number
  noDecisions: number
  starts: number
  era: number | null // real, computed from this pitcher's own ER/IP across every start vs this opponent
}

// "Record vs each team" — real per-start decisions (stat.wins/stat.losses,
// confirmed live — see OfficialStart's comment) grouped by real opponent
// team id. No-decision starts count toward `starts`/`era` but not
// wins/losses, same as how W-L is read anywhere else in baseball.
export async function getPitcherTeamRecord(playerId: number, season: number, range: 'season' | 'career' = 'season'): Promise<TeamRecordRow[]> {
  const official = await getOfficialStartLogForRange(playerId, season, range)
  const byOpponent = new Map<string, { opponentId: number | null; opponent: string; wins: number; losses: number; noDecisions: number; starts: number; erSum: number; ipSum: number }>()

  for (const g of official) {
    const key = g.opponentId != null ? String(g.opponentId) : g.opponent
    if (!byOpponent.has(key)) byOpponent.set(key, { opponentId: g.opponentId, opponent: g.opponent, wins: 0, losses: 0, noDecisions: 0, starts: 0, erSum: 0, ipSum: 0 })
    const row = byOpponent.get(key)!
    row.starts++
    if (g.isWin) row.wins++
    else if (g.isLoss) row.losses++
    else row.noDecisions++
    row.erSum += g.er
    if (g.ip != null) row.ipSum += g.ip
  }

  return [...byOpponent.values()]
    .map(r => ({
      opponentId: r.opponentId, opponent: r.opponent, wins: r.wins, losses: r.losses, noDecisions: r.noDecisions, starts: r.starts,
      era: r.ipSum > 0 ? Math.round((r.erSum * 9 / r.ipSum) * 100) / 100 : null,
    }))
    .sort((a, b) => b.starts - a.starts)
}
