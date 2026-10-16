'use server'

// src/components/admin/story/pitcher/load.ts
//
// Server actions for the Pitcher Reel (called from the admin dashboard, which sits
// behind the /admin basic-auth proxy). Read-only: nothing here writes to Supabase.
//
//   listReelPitchers(date)        → the starter of every finished game on a date
//   loadPitcherReel(gamePk, id)   → one PitcherReelData
//
// Sources, each isolated so one failure blanks only its own slide:
//   MLB live feed + box score   → score, line, pitch log, arsenal, hits, through-the-order
//   Baseball Savant (pitch log) → arm angle (can lag a finished game; labelled when it is season-wide)
//   Supabase pitcher_stats       → season ERA/WHIP/K9/BB9 and AVG-against by time through
//   Supabase pitch_arsenals      → season usage and velocity per pitch
//   MLB schedule                 → next start (announced probable, else earliest turn on normal rest)

import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { getGameBoxScore } from '@/lib/game-boxscore'
import { getLiveFeed } from '@/lib/mlb-live-feed'
import { getPitcherGameArmAngle } from '@/lib/pitcher-game-arm-angle'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { createAdminClient } from '@/lib/supabase'
import { findTeamByName } from '@/lib/teams'
import { fmtShortDate } from '../copy'
import { shortPitch } from './copy'
import { shortName } from '../names'
import { pitchColor } from '../pitchColors'
import { hitsAllowed, pitchDots, ipToOuts, nextStart, per9, throughTheOrder, whip, type FutureGame } from './calc'
import type { PitcherReelData, ReelPitch, ReelSeasonRow } from './types'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type ReelPitcherOption = {
  gamePk: number
  pitcherId: number
  name: string
  teamAbbr: string
  oppAbbr: string
  ip: string
  /** 'SP' for the starter, 'RP' for relievers who threw at least 3 outs */
  role: 'SP' | 'RP'
}

/** Starters (and any reliever with 3+ outs) from every Final game on a date. */
export async function listReelPitchers(date: string): Promise<ReelPitcherOption[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${date}`, { cache: 'no-store' })
    if (!res.ok) { console.error('[listReelPitchers] schedule HTTP', res.status); return [] }
    const data = await res.json()
    const finals: number[] = (data.dates?.[0]?.games ?? [])
      .filter((g: { status?: { abstractGameState?: string } }) => g.status?.abstractGameState === 'Final')
      .map((g: { gamePk: number }) => g.gamePk)

    const out: ReelPitcherOption[] = []
    // Box scores in batches of 4: the MLB API resets connections on bigger bursts (CLAUDE.md §4).
    for (let i = 0; i < finals.length; i += 4) {
      const boxes = await Promise.all(finals.slice(i, i + 4).map(pk => getGameBoxScore(pk)))
      for (const box of boxes) {
        if (!box) continue
        for (const [side, other] of [[box.away, box.home], [box.home, box.away]] as const) {
          side.pitchers.forEach((p, idx) => {
            if (idx !== 0 && ipToOuts(p.ip) < 3) return
            out.push({ gamePk: box.gamePk, pitcherId: p.id, name: p.name, teamAbbr: side.abbr, oppAbbr: other.abbr, ip: p.ip, role: idx === 0 ? 'SP' : 'RP' })
          })
        }
      }
    }
    return out
  } catch (err) {
    console.error('[listReelPitchers] failed:', err)
    return []
  }
}

async function pitchHand(pitcherId: number): Promise<'L' | 'R' | null> {
  try {
    const res = await fetch(`${MLB_API}/people/${pitcherId}`, { cache: 'no-store' })
    if (!res.ok) return null
    const code = (await res.json()).people?.[0]?.pitchHand?.code
    return code === 'L' || code === 'R' ? code : null
  } catch (err) {
    console.error('[pitchHand] failed:', err)
    return null
  }
}

async function seasonArsenal(pitcherId: number, season: number): Promise<Map<string, { usage: number | null; velo: number | null }>> {
  const out = new Map<string, { usage: number | null; velo: number | null }>()
  const { data, error } = await createAdminClient()
    .from('pitch_arsenals')
    .select('pitch_type, percentage, avg_velocity')
    .eq('player_id', pitcherId).eq('season', season)
  if (error) { console.error('[loadPitcherReel] pitch_arsenals error:', error.message); return out }
  for (const r of (data ?? []) as { pitch_type: string; percentage: unknown; avg_velocity: unknown }[]) {
    const num = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))   // numeric columns arrive as strings
    out.set(String(r.pitch_type).toUpperCase(), { usage: num(r.percentage), velo: num(r.avg_velocity) })
  }
  return out
}

async function futureGames(teamId: number, from: string): Promise<FutureGame[]> {
  const add = (n: number) => {
    const [y, m, d] = from.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
  }
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${add(1)}&endDate=${add(12)}&hydrate=probablePitcher,team`, { cache: 'no-store' })
    if (!res.ok) { console.error('[futureGames] HTTP', res.status); return [] }
    const data = await res.json()
    const out: FutureGame[] = []
    for (const day of data.dates ?? []) {
      for (const g of day.games ?? []) {
        if (g.status?.abstractGameState === 'Final') continue
        const isHome = g.teams?.home?.team?.id === teamId
        const mine = isHome ? g.teams.home : g.teams.away
        const theirs = isHome ? g.teams.away : g.teams.home
        out.push({ date: day.date, oppAbbr: theirs?.team?.abbreviation ?? '', home: isHome, probablePitcherId: mine?.probablePitcher?.id ?? null })
      }
    }
    return out
  } catch (err) {
    console.error('[futureGames] failed:', err)
    return []
  }
}

export async function loadPitcherReel(gamePk: number, pitcherId: number): Promise<PitcherReelData | null> {
  const [box, feed] = await Promise.all([getGameBoxScore(gamePk, { fresh: true }), getLiveFeed(gamePk)])
  if (!box || !feed) { console.error('[loadPitcherReel] box score or live feed unavailable for', gamePk); return null }
  const agg = aggregateGameFeed(feed, `game-${gamePk}`)
  if (!agg) { console.error('[loadPitcherReel] feed did not aggregate for', gamePk); return null }

  const line = agg.pitchers.find(p => p.pitcherId === pitcherId)
  const isAway = box.away.pitchers.some(p => p.id === pitcherId)
  const side = isAway ? box.away : box.home
  const oppSide = isAway ? box.home : box.away
  const boxP = side.pitchers.find(p => p.id === pitcherId)
  if (!line || !boxP) { console.error('[loadPitcherReel] pitcher', pitcherId, 'not in game', gamePk); return null }

  const slateDate = feed.gameData.datetime.officialDate
  const season = Number(slateDate.slice(0, 4))
  const notes: string[] = []

  // Independent sources in one block (no positional destructuring risk across the other fetches).
  const [hand, arm, full, seasonMix, games] = await Promise.all([
    pitchHand(pitcherId),
    getPitcherGameArmAngle(pitcherId, gamePk, season).catch(err => { console.error('[loadPitcherReel] arm angle failed:', err); return null }),
    getPitcherStatsFull(pitcherId).catch(() => null),
    seasonArsenal(pitcherId, season),
    futureGames(side.teamId, slateDate),
  ])

  const arsenal: ReelPitch[] = [...line.arsenal]
    .sort((a, b) => b.count - a.count)
    .map(p => {
      const s = seasonMix.get(p.typeCode.toUpperCase())
      return {
        code: p.typeCode, name: p.typeDescription, color: pitchColor(p.typeCode), count: p.count, usagePct: p.usagePct,
        avgVelo: p.avgVelo, maxVelo: p.maxVelo, whiffPct: p.whiffPct, seasonUsagePct: s?.usage ?? null, seasonVelo: s?.velo ?? null,
      }
    })

  const outs = ipToOuts(boxP.ip)
  const top = arsenal[0]
  const row = (label: string, game: number | null, seasonV: number | null | undefined, decimals: number, lowerBetter: boolean): ReelSeasonRow =>
    ({ label, game, season: seasonV ?? null, decimals, lowerBetter })
  const seasonRows: ReelSeasonRow[] = full ? [
    row('ERA', per9(boxP.er, outs), full.era, 2, true),
    row('WHIP', whip(boxP.h, boxP.bb, outs), full.whip, 2, true),
    row('K/9', per9(boxP.k, outs), full.k_per_9, 1, false),
    row('BB/9', per9(boxP.bb, outs), full.bb_per_9, 1, true),
    ...(top && top.avgVelo != null && top.seasonVelo != null ? [row(`${shortPitch(top.name)} MPH`, top.avgVelo, top.seasonVelo, 1, false)] : []),
  ] : []
  if (!full) notes.push('No season line in pitcher_stats for this pitcher')

  const armOut: PitcherReelData['arm'] = arm && arm.overallAvgArmAngle != null
    ? { overall: arm.overallAvgArmAngle, source: arm.source, byType: arm.byPitchType.map(t => ({ code: t.typeCode, name: t.typeName, deg: t.avgArmAngle, count: t.count, color: pitchColor(t.typeCode) })) }
    : null
  if (!armOut) notes.push('Arm angle not on Savant yet')

  const team = findTeamByName(side.teamName)
  const opp = findTeamByName(oppSide.teamName)
  const score = { team: side.score, opp: oppSide.score }

  return {
    gamePk, slateDate, dateLabel: fmtShortDate(slateDate),
    pitcher: { id: pitcherId, name: boxP.name, short: shortName(boxP.name), throws: hand },
    team: { abbr: side.abbr, color: team?.primary_color ?? '#FF5722' },
    opp: { abbr: oppSide.abbr, color: opp?.primary_color ?? '#8a8275' },
    home: !isAway,
    score,
    decision: boxP.isWinner ? 'W' : boxP.isLoser ? 'L' : boxP.isSave ? 'S' : null,
    line: { ip: boxP.ip, h: boxP.h, r: boxP.r, er: boxP.er, bb: boxP.bb, k: boxP.k, hr: boxP.hr, pitches: line.pitchesThrown, strikes: line.strikesThrown, bf: line.battersFaced },
    arsenal,
    arm: armOut,
    pitchDots: pitchDots(agg.pitchLog, pitcherId),
    hits: hitsAllowed(agg.battedBalls, pitcherId),
    tto: throughTheOrder(agg.atBats, pitcherId, [full?.tto1_avg ?? null, full?.tto2_avg ?? null, full?.tto3_avg ?? null]),
    season: seasonRows,
    next: nextStart(slateDate, pitcherId, games),
    notes,
  }
}
