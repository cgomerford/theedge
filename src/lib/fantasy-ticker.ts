/**
 * src/lib/fantasy-ticker.ts
 *
 * Fetches ALL probable pitchers for tonight's MLB slate,
 * cross-referenced with edge_predictions for scores.
 * Powers the FTSE-style ticker on /fantasy.
 */

import { createAdminClient } from '@/lib/supabase'

export type TickerPitcher = {
  name: string
  team: string
  opponent: string
  edgeScore: number | null   // game-level edge score (positive = home favored)
  isHome: boolean
  signalScore: number | null // from fantasy picks if this pitcher is a pick
  pickType: 'streamer' | 'faller' | 'sleeper' | null
}

const MLB_SCHEDULE = 'https://statsapi.mlb.com/api/v1/schedule'

function shortName(teamName: string): string {
  const parts = (teamName ?? '').split(' ')
  return parts[parts.length - 1] || teamName
}

/**
 * Get every probable pitcher for tonight with their edge context.
 * Merges MLB schedule API (pitcher names) with edge_predictions (scores)
 * and daily_fantasy_picks (pick tags).
 */
export async function getTonightAllPitchers(): Promise<TickerPitcher[]> {
  const today = new Date().toISOString().split('T')[0]

  // 1. Fetch tonight's MLB schedule with probable pitchers
  let games: any[] = []
  try {
    const res = await fetch(
      `${MLB_SCHEDULE}?sportId=1&date=${today}&hydrate=probablePitcher`,
      { next: { revalidate: 1800 } }
    )
    if (res.ok) {
      const data = await res.json()
      for (const d of data.dates ?? []) {
        for (const g of d.games ?? []) {
          if (['S', 'P', 'I'].includes(g.status?.codedGameState)) {
            games.push(g)
          }
        }
      }
    }
  } catch (e) {
    console.error('Ticker: schedule fetch failed', e)
  }

  if (games.length === 0) return []

  // 2. Fetch edge predictions for today
  const supa = createAdminClient()
  const gamePks = games.map((g: any) => g.gamePk)

  const { data: predictions } = await supa
    .from('edge_predictions')
    .select('game_pk, edge_score')
    .in('game_pk', gamePks)

  const predMap = new Map<number, number>()
  for (const p of predictions ?? []) {
    predMap.set(p.game_pk, p.edge_score)
  }

  // 3. Fetch today's fantasy picks to tag special players
  const { data: picks } = await supa
    .from('daily_fantasy_picks')
    .select('player_id, pick_type, signal_score')
    .eq('game_date', today)

  const pickMap = new Map<number, { pickType: string; signalScore: number | null }>()
  for (const pk of picks ?? []) {
    if (pk.player_id) {
      pickMap.set(pk.player_id, { pickType: pk.pick_type, signalScore: pk.signal_score })
    }
  }

  // 4. Build the full pitcher list
  const pitchers: TickerPitcher[] = []

  for (const game of games) {
    const homeName = game.teams?.home?.team?.name ?? ''
    const awayName = game.teams?.away?.team?.name ?? ''
    const edgeScore = predMap.get(game.gamePk) ?? null

    // Home pitcher
    const hp = game.teams?.home?.probablePitcher
    if (hp?.fullName) {
      const pickInfo = hp.id ? pickMap.get(hp.id) : null
      pitchers.push({
        name: hp.fullName,
        team: shortName(homeName),
        opponent: shortName(awayName),
        edgeScore,
        isHome: true,
        signalScore: pickInfo?.signalScore ?? null,
        pickType: (pickInfo?.pickType as any) ?? null,
      })
    }

    // Away pitcher
    const ap = game.teams?.away?.probablePitcher
    if (ap?.fullName) {
      const pickInfo = ap.id ? pickMap.get(ap.id) : null
      pitchers.push({
        name: ap.fullName,
        team: shortName(awayName),
        opponent: shortName(homeName),
        edgeScore: edgeScore != null ? -edgeScore : null, // flip for away
        isHome: false,
        signalScore: pickInfo?.signalScore ?? null,
        pickType: (pickInfo?.pickType as any) ?? null,
      })
    }
  }

  return pitchers
}