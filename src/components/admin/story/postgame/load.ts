'use server'

// src/components/admin/story/postgame/load.ts
//
// Server actions for the Postgame Reel (admin dashboard, behind the /admin proxy). Read-only.
//
//   listReelGames(date)        → every Final game on a date (also used by the Batter Reel)
//   loadPostgameReel(gamePk)   → one PostgameReelData
//
// Sources: MLB live feed (linescore, key plays, win probability, batted balls) and the box score
// (lines). No Supabase, no Savant. Anything missing is [] / null and its slide drops out.

import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { getGameBoxScore } from '@/lib/game-boxscore'
import { getLiveFeed } from '@/lib/mlb-live-feed'
import { attachWinProbability } from '@/lib/mlb-win-probability'
import { findTeamByName } from '@/lib/teams'
import { fmtShortDate } from '../copy'
import { shortName } from '../names'
import { flowPoints, hitsOnField, keyPlaysInOrder, linescoreRows, topHitters } from './calc'
import type { PgPitcher, PgSide, PostgameReelData } from './types'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type ReelGameOption = { gamePk: number; awayAbbr: string; homeAbbr: string; awayScore: number; homeScore: number }

export async function listReelGames(date: string): Promise<ReelGameOption[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${date}`, { cache: 'no-store' })
    if (!res.ok) { console.error('[listReelGames] schedule HTTP', res.status); return [] }
    const data = await res.json()
    return (data.dates?.[0]?.games ?? [])
      .filter((g: { status?: { abstractGameState?: string } }) => g.status?.abstractGameState === 'Final')
      .map((g: { gamePk: number; teams: { away: { team: { abbreviation?: string; name: string }; score?: number }; home: { team: { abbreviation?: string; name: string }; score?: number } } }) => ({
        gamePk: g.gamePk,
        awayAbbr: g.teams.away.team.abbreviation ?? findTeamByName(g.teams.away.team.name)?.abbrev ?? g.teams.away.team.name,
        homeAbbr: g.teams.home.team.abbreviation ?? findTeamByName(g.teams.home.team.name)?.abbrev ?? g.teams.home.team.name,
        awayScore: g.teams.away.score ?? 0,
        homeScore: g.teams.home.score ?? 0,
      }))
  } catch (err) {
    console.error('[listReelGames] failed:', err)
    return []
  }
}

type Decisions = { winner?: { id: number; fullName: string }; loser?: { id: number; fullName: string }; save?: { id: number; fullName: string } }

export async function loadPostgameReel(gamePk: number): Promise<PostgameReelData | null> {
  const [box, feed] = await Promise.all([getGameBoxScore(gamePk, { fresh: true }), getLiveFeed(gamePk)])
  if (!box || !feed) { console.error('[loadPostgameReel] box score or live feed unavailable for', gamePk); return null }
  const agg = aggregateGameFeed(feed, `game-${gamePk}`)
  if (!agg) { console.error('[loadPostgameReel] feed did not aggregate for', gamePk); return null }

  await attachWinProbability(agg, gamePk)    // separate endpoint; [] when unavailable
  const slateDate = feed.gameData.datetime.officialDate
  const notes: string[] = []
  const dec = ((feed.liveData as unknown as { decisions?: Decisions }).decisions) ?? {}
  const color = (name: string, fallback: string) => findTeamByName(name)?.primary_color ?? fallback
  const team = (t: typeof box.away, fallback: string) => ({ abbr: t.abbr, name: t.teamName, color: color(t.teamName, fallback), score: t.score, hits: t.hits, errors: t.errors })
  const away = team(box.away, '#FF5722'), home = team(box.home, '#8a8275')
  const winner: PgSide | null = away.score === home.score ? null : away.score > home.score ? 'away' : 'home'

  const pitching: PgPitcher[] = []
  for (const [side, t] of [['away', box.away], ['home', box.home]] as const) {
    t.pitchers.forEach((p, idx) => {
      const tag = dec.winner?.id === p.id ? 'W' : dec.loser?.id === p.id ? 'L' : dec.save?.id === p.id ? 'S' : null
      if (idx !== 0 && !tag) return
      pitching.push({ side, id: p.id, name: p.name, ip: p.ip, h: p.h, er: p.er, bb: p.bb, k: p.k, tag, starter: idx === 0 })
    })
  }

  const flow = flowPoints(agg.winProbability)
  if (flow.length === 0) notes.push('No win-probability data in the feed')
  const hits = hitsOnField(agg.battedBalls, agg.away.teamId)
  if (hits.length === 0) notes.push('No located hits in the feed')

  return {
    gamePk, slateDate, dateLabel: fmtShortDate(slateDate), away, home, winner,
    linescore: linescoreRows(agg.linescore, agg.away.teamId),
    decisions: { w: dec.winner ? shortName(dec.winner.fullName) : null, l: dec.loser ? shortName(dec.loser.fullName) : null, s: dec.save ? shortName(dec.save.fullName) : null },
    flow,
    plays: keyPlaysInOrder(agg.keyPlays),
    hitters: [...topHitters('away', box.away.batters, agg.batters.away), ...topHitters('home', box.home.batters, agg.batters.home)],
    pitching,
    hits,
    notes,
  }
}
