// src/lib/postgame/next.ts
//
// Postgame §13 Next up — for each club, its next scheduled game (MLB schedule, team + 8-day
// window, hydrate=team,probablePitcher,seriesStatus — all three confirmed on the live response):
// opponent, first pitch, series game N of M, the club's probable starter, and a small "count ×
// pitch" teaser for that starter from pitcher_count_tendency (split `all`: what he throws first
// pitch, and what he goes to with two strikes). The full count map lives in the Scout Report.
// Empty states, never guesses: no game found → no tile; probable not announced → says so.
// Read-only: pitcher_count_tendency is written by fetch_pitcher_hot_zones.py.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { slugifyGame, type MLBGame } from '@/lib/mlb'
import type { PostData } from './data'
import type { Side } from './recap'
import { shiftDate } from './bullpen'

type SchedGame = MLBGame & { seriesStatus?: { gameNumber?: number; totalGames?: number; result?: string } }
export type Teaser = { firstPitch: { name: string; pct: number } | null; twoStrike: { name: string; pct: number } | null }
export type NextGame = {
  side: Side
  club: { id: number; abbr: string }
  opp: { id: number; abbr: string; name: string }
  atHome: boolean
  firstPitch: string             // ISO
  slug: string
  final: boolean
  sameSeries: boolean            // same opponent as tonight
  seriesGame: { n: number; of: number } | null
  starter: { id: number; name: string } | null
  teaser: Teaser | null
}

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

async function nextGameFor(teamId: number, currentPk: number, currentStart: string, gameDate: string): Promise<SchedGame | null> {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${gameDate}&endDate=${shiftDate(gameDate, 8)}&hydrate=team,probablePitcher,seriesStatus`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) { console.error('[nextGameFor] schedule HTTP', res.status); return null }
    const json = (await res.json()) as { dates?: { games?: SchedGame[] }[] }
    const games = (json.dates ?? []).flatMap((d) => d.games ?? [])
      .filter((g) => g.gamePk !== currentPk && g.gameDate > currentStart)
      .sort((a, b) => (a.gameDate < b.gameDate ? -1 : 1))
    return games[0] ?? null
  } catch (err) {
    console.error('[nextGameFor] failed:', err instanceof Error ? err.message : err)
    return null
  }
}

type CountBuckets = Record<string, { pitches?: { pitch_name?: string; count_n?: number }[] }>
async function getTeaser(pitcherId: number, year: number): Promise<Teaser | null> {
  const { data, error } = await createAdminClient().from('pitcher_count_tendency').select('counts').eq('player_id', pitcherId).eq('season', year).eq('split', 'all').maybeSingle()
  if (error) { console.error('[getTeaser] Supabase error:', error.message); return null }
  const counts = (data as { counts?: CountBuckets } | null)?.counts
  if (!counts) return null
  const top = (keys: string[]) => {
    const tally = new Map<string, number>()
    let total = 0
    for (const k of keys) for (const p of counts[k]?.pitches ?? []) { const c = n(p.count_n); tally.set(p.pitch_name ?? '?', (tally.get(p.pitch_name ?? '?') ?? 0) + c); total += c }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
    return best && total >= 30 ? { name: best[0], pct: (best[1] / total) * 100 } : null
  }
  const t = { firstPitch: top(['0-0']), twoStrike: top(['0-2', '1-2', '2-2']) }
  return t.firstPitch || t.twoStrike ? t : null
}

export const getNextUp = cache(async (d: PostData, gameDate: string, startIso: string): Promise<NextGame[]> => {
  const gd = d.feed.gameData
  const year = Number(gameDate.slice(0, 4))
  const out = await Promise.all((['away', 'home'] as Side[]).map(async (side): Promise<NextGame | null> => {
    const club = gd.teams[side], opp = gd.teams[side === 'away' ? 'home' : 'away']
    const g = await nextGameFor(club.id, d.feed.gamePk, startIso, gameDate)
    if (!g) return null
    const atHome = g.teams.home.team.id === club.id
    const me = atHome ? g.teams.home : g.teams.away, them = atHome ? g.teams.away : g.teams.home
    const starter = me.probablePitcher ? { id: me.probablePitcher.id, name: me.probablePitcher.fullName } : null
    const ss = g.seriesStatus
    return {
      side, club: { id: club.id, abbr: club.abbreviation ?? '' },
      opp: { id: them.team.id, abbr: them.team.abbreviation ?? '', name: them.team.name },
      atHome, firstPitch: g.gameDate, slug: slugifyGame(g), final: g.status.abstractGameState === 'Final',
      sameSeries: them.team.id === opp.id,
      seriesGame: ss?.gameNumber && ss?.totalGames ? { n: ss.gameNumber, of: ss.totalGames } : null,
      starter, teaser: starter ? await getTeaser(starter.id, year) : null,
    }
  }))
  return out.filter((x): x is NextGame => x !== null)
})
