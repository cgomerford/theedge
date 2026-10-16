'use server'

// src/components/admin/story/batter/load.ts
//
// Server actions for the Batter Reel (admin dashboard, behind the /admin proxy). Read-only.
//
//   listGameBatters(gamePk)          → the hitters of one finished game, in batting order
//   loadBatterReel(gamePk, batterId) → one BatterReelData
//
// Sources: MLB live feed (plate appearances, pitch log, batted balls) and the box score (line,
// season slash line). No Supabase, no Savant. Anything missing is [] / null and its slide drops out.

import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { getGameBoxScore } from '@/lib/game-boxscore'
import { getLiveFeed } from '@/lib/mlb-live-feed'
import { findTeamByName } from '@/lib/teams'
import { fmtShortDate } from '../copy'
import { shortName } from '../names'
import { ballsInPlay, contactSummary, pitchesSeen, plateAppearances } from './calc'
import type { BatterReelData } from './types'

export type ReelBatterOption = { batterId: number; name: string; teamAbbr: string; pos: string; line: string }

export async function listGameBatters(gamePk: number): Promise<ReelBatterOption[]> {
  const box = await getGameBoxScore(gamePk, { fresh: true })
  if (!box) { console.error('[listGameBatters] box score unavailable for', gamePk); return [] }
  return [box.away, box.home].flatMap(t =>
    t.batters.filter(b => b.ab + b.bb > 0).map(b => ({ batterId: b.id, name: b.name, teamAbbr: t.abbr, pos: b.position, line: `${b.h}-${b.ab}` })))
}

export async function loadBatterReel(gamePk: number, batterId: number): Promise<BatterReelData | null> {
  const [box, feed] = await Promise.all([getGameBoxScore(gamePk, { fresh: true }), getLiveFeed(gamePk)])
  if (!box || !feed) { console.error('[loadBatterReel] box score or live feed unavailable for', gamePk); return null }
  const agg = aggregateGameFeed(feed, `game-${gamePk}`)
  if (!agg) { console.error('[loadBatterReel] feed did not aggregate for', gamePk); return null }

  const isAway = box.away.batters.some(b => b.id === batterId)
  const side = isAway ? box.away : box.home
  const oppSide = isAway ? box.home : box.away
  const b = side.batters.find(x => x.id === batterId)
  if (!b) { console.error('[loadBatterReel] batter', batterId, 'not in game', gamePk); return null }
  const l = (isAway ? agg.batters.away : agg.batters.home).find(x => x.batterId === batterId)

  const slateDate = feed.gameData.datetime.officialDate
  const notes: string[] = []
  const pas = plateAppearances(agg.atBats, agg.pitchLog, batterId)
  const balls = ballsInPlay(agg.battedBalls, batterId)
  const seen = pitchesSeen(agg.pitchLog, batterId)
  if (balls.length === 0) notes.push('No located balls in play')
  if (seen.length === 0) notes.push('No pitch locations in the feed')
  const season = b.avg || b.obp || b.ops ? { avg: b.avg, obp: b.obp, ops: b.ops } : null

  return {
    gamePk, slateDate, dateLabel: fmtShortDate(slateDate),
    batter: { id: batterId, name: b.name, short: shortName(b.name), pos: b.position },
    team: { abbr: side.abbr, color: findTeamByName(side.teamName)?.primary_color ?? '#FF5722' },
    opp: { abbr: oppSide.abbr, color: findTeamByName(oppSide.teamName)?.primary_color ?? '#8a8275' },
    home: !isAway,
    score: { team: side.score, opp: oppSide.score },
    line: { pa: l?.plateAppearances ?? pas.length, ab: b.ab, h: b.h, r: b.r, rbi: b.rbi, hr: b.hr, bb: b.bb, k: b.k, doubles: l?.doubles ?? 0, triples: l?.triples ?? 0, sb: l?.stolenBases ?? 0, pitches: l?.pitchesSeen ?? seen.length },
    season,
    pas, balls, contact: contactSummary(agg.battedBalls, batterId), pitchesSeen: seen,
    notes,
  }
}
