// src/lib/scout/defense.ts
//
// Scout §6 (Defense & alignment) — how one club's DEFENSE lines up, and how that
// meets the opposing lineup.
//
//   Alignment mix — from Savant pitch data filtered to the club FIELDING (each
//                   pitch carries if_fielding_alignment: Standard / Strategic /
//                   Infield shade, and of_fielding_alignment: Standard /
//                   Strategic). The full shift is banned, so the question is how
//                   often the club stays Standard, plays a Strategic look, or
//                   shades the infield toward the pull side. Shares are of PITCHES
//                   over the last ~40 days, split by the batter's side of the
//                   plate. The ~3MB CSV is aggregated to small per-game and
//                   per-batter tallies and cached in Supabase (savant-cache.ts).
//   Matchup       — for each hitter in the opposing lineup: his pull rate (from
//                   the season spray table) next to how this defense has aligned
//                   against his side of the plate, and against him personally
//                   where it has seen him enough.
//   Fielders      — tonight's fielders' Outs Above Average, plus the club's OAA
//                   by unit.
// Shade direction is a convention, not a measurement: an infield shade moves the
// infielders toward the hitter's pull side. Exact fielder coordinates are not
// published in this data.

import { withSavantCache } from '@/lib/savant-cache'
import { createAdminClient } from '@/lib/supabase'
import { getProjectedLineup, type LineupBatter } from '@/lib/lineups'
import { getLineupSpray, computePullProfile } from '@/lib/batter-spray'
import { getLeagueOaa } from '@/lib/batter-fielding'
import { fetchPitcherHands } from '@/lib/pitcher-hands'

const SAVANT = 'https://baseballsavant.mlb.com'
const LOOKBACK_DAYS = 40
export const MIN_ALIGN_PITCHES = 60      // pitches vs a side of the plate / a hitter before a share is read
export const MIN_VS_HITTER = 25

type Side = 'L' | 'R'
export type Tally = { n: number; ifStd: number; ifStrat: number; ifShade: number; ofStd: number; ofStrat: number }
const empty = (): Tally => ({ n: 0, ifStd: 0, ifStrat: 0, ifShade: 0, ofStd: 0, ofStrat: 0 })

type GameLine = { pk: number; date: string } & Tally
type AlignmentPayload = { games: GameLine[]; bySide: Record<Side, Tally>; byBatter: Record<string, Tally> }   // byBatter key = `${id}:${side}`

export type FielderLine = { id: number; name: string; pos: string; oaa: number | null; frp: number | null }
export type MatchupHitter = {
  id: number; name: string; order: number; stand: Side
  switchHitter: boolean
  pullPct: number | null; gbPct: number | null; bip: number
  vsSide: Tally
  vsHim: Tally
}

export type DefenseDesk = {
  alignment: { all: Tally; L: Tally; R: Tally; games: GameLine[] }
  matchup: MatchupHitter[]
  fielders: FielderLine[]
  team: { oaa: number | null; infield: number | null; outfield: number | null; rank: number | null; of: number }
  lineupSource: string
}

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q } else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur); return out
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}

async function fetchAlignment(abbr: string, gameDate: string): Promise<AlignmentPayload> {
  const params = new URLSearchParams({
    all: 'true', hfGT: 'R|', hfSea: `${gameDate.slice(0, 4)}|`, player_type: 'pitcher', type: 'details', team: abbr,
    game_date_gt: shiftDays(gameDate, -LOOKBACK_DAYS), game_date_lt: shiftDays(gameDate, -1),
    min_pitches: '0', min_results: '0', group_by: 'name', sort_col: 'pitches', sort_order: 'desc',
  })
  const res = await fetch(`${SAVANT}/statcast_search/csv?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(25000) })
  const out: AlignmentPayload = { games: [], bySide: { L: empty(), R: empty() }, byBatter: {} }
  if (!res.ok) return out
  const lines = (await res.text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return out
  const h = splitCsv(lines[0]); const col = (k: string) => h.indexOf(k)
  const [cPk, cDate, cStand, cBatter, cIf, cOf] = ['game_pk', 'game_date', 'stand', 'batter', 'if_fielding_alignment', 'of_fielding_alignment'].map(col)
  if ([cPk, cDate, cStand, cBatter, cIf].some((i) => i < 0)) return out

  const games = new Map<number, GameLine>()
  const bump = (t: Tally, ifa: string, ofa: string) => {
    t.n += 1
    if (ifa === 'Standard') t.ifStd += 1; else if (ifa === 'Strategic') t.ifStrat += 1; else if (ifa === 'Infield shade') t.ifShade += 1
    if (ofa === 'Standard') t.ofStd += 1; else if (ofa === 'Strategic') t.ofStrat += 1
  }
  for (const l of lines.slice(1)) {
    const c = splitCsv(l)
    const ifa = c[cIf], ofa = cOf >= 0 ? c[cOf] : ''
    const stand = c[cStand] as Side
    if (!ifa || (stand !== 'L' && stand !== 'R')) continue
    const pk = Number(c[cPk])
    let g = games.get(pk); if (!g) { g = { pk, date: c[cDate], ...empty() }; games.set(pk, g) }
    bump(g, ifa, ofa); bump(out.bySide[stand], ifa, ofa)
    const key = `${c[cBatter]}:${stand}`
    bump((out.byBatter[key] ??= empty()), ifa, ofa)
  }
  out.games = [...games.values()].sort((a, b) => a.date.localeCompare(b.date))
  return out
}

function add(a: Tally, b: Tally): Tally {
  return { n: a.n + b.n, ifStd: a.ifStd + b.ifStd, ifStrat: a.ifStrat + b.ifStrat, ifShade: a.ifShade + b.ifShade, ofStd: a.ofStd + b.ofStd, ofStrat: a.ofStrat + b.ofStrat }
}

// ─── Entry point ─────────────────────────────────────────────────────────

export async function getDefenseDesk(defenseId: number, defenseAbbr: string, offenseId: number, gameDate: string, gamePk: number, defenseProbableId: number | null): Promise<DefenseDesk | null> {
  const season = Number(gameDate.slice(0, 4))
  try {
    const [payload, defLineup, offLineup, oaaLeague, hands] = await Promise.all([
      withSavantCache<AlignmentPayload>(`scout-alignment:v1:${defenseAbbr}:${gameDate}`, 6 * 3600, () => fetchAlignment(defenseAbbr, gameDate)),
      getProjectedLineup(defenseId, gameDate, gamePk),
      getProjectedLineup(offenseId, gameDate, gamePk),
      getLeagueOaa(season),
      defenseProbableId ? fetchPitcherHands([defenseProbableId]) : Promise.resolve(new Map<number, 'L' | 'R'>()),
    ])
    if (!payload || payload.games.length === 0) return null
    const pitcherHand = defenseProbableId ? hands.get(defenseProbableId) ?? null : null

    // opposing hitters: pull profile + alignment vs his side / vs him
    const spray = await getLineupSpray(offLineup.batters.map((b) => b.player_id))
    const matchup: MatchupHitter[] = offLineup.batters.map((b: LineupBatter) => {
      const isSwitch = !!b.switch_hitter || b.bat_side == null
      // a switch hitter bats from the side opposite the pitcher's hand; default to R if unknown
      const stand: Side = isSwitch ? (pitcherHand === 'R' ? 'L' : 'R') : (b.bat_side as Side)
      const sp = spray.find((s) => s.player_id === b.player_id)
      const pull = sp ? computePullProfile(sp.plays, stand, pitcherHand) : null
      return {
        id: b.player_id, name: b.player_name, order: b.batting_order, stand, switchHitter: isSwitch,
        pullPct: pull?.pullPct ?? null, gbPct: pull?.gbPct ?? null, bip: pull?.bip ?? 0,
        vsSide: payload.bySide[stand] ?? empty(), vsHim: payload.byBatter[`${b.player_id}:${stand}`] ?? empty(),
      }
    })

    // tonight's fielders: the defense's lineup at real fielding positions
    const fielders: FielderLine[] = defLineup.batters.filter((b) => b.position && b.position !== 'DH').map((b) => {
      const o = oaaLeague[String(b.player_id)]
      return { id: b.player_id, name: b.player_name, pos: b.position, oaa: o ? o.outsAboveAverage : null, frp: o ? o.fieldingRunsPrevented : null }
    }).sort((a, b) => (b.oaa ?? -99) - (a.oaa ?? -99))

    const { data: td } = await createAdminClient().from('team_defense').select('team_id, oaa, infield_oaa, outfield_oaa').eq('season', season)
    const mine = (td ?? []).find((t) => t.team_id === defenseId)
    const ranked = [...(td ?? [])].sort((a, b) => Number(b.oaa) - Number(a.oaa))

    return {
      alignment: { all: add(payload.bySide.L, payload.bySide.R), L: payload.bySide.L, R: payload.bySide.R, games: payload.games },
      matchup, fielders,
      team: {
        oaa: mine?.oaa != null ? Number(mine.oaa) : null, infield: mine?.infield_oaa != null ? Number(mine.infield_oaa) : null, outfield: mine?.outfield_oaa != null ? Number(mine.outfield_oaa) : null,
        rank: mine ? ranked.findIndex((t) => t.team_id === defenseId) + 1 : null, of: ranked.length,
      },
      lineupSource: offLineup.source,
    }
  } catch (err) {
    console.error('[scout] defense desk failed:', defenseAbbr, err)
    return null
  }
}
