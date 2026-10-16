'use server'

// src/components/admin/story/bullpenGrid.ts
//
// "Who's available": per-reliever pitch counts for the 4 calendar days before
// the slate, from the MLB game feeds (final games only, postseason included).
// Re-requests the SAME endpoints and fetch options src/lib/pitcher-workload.ts
// uses (schedule + v1.1 live feed, revalidate 1800) so the Next data cache is
// shared; that file is not edited. Never reads bullpen_availability or
// pitcher_workload_daily.
//
// Verified field paths (feed 849819, 7 Oct):
//   liveData.boxscore.teams.{away|home}.pitchers / .bullpen
//   ...players['ID'+id].stats.pitching.numberOfPitches            (that game)
//   gameData.players['ID'+id].pitchHand.code / .fullName
//   gameData.game.type  ('R' regular; 'F','D','L','W' postseason)

import { buildPenTeam, windowDates, type FeedArm, type FeedGame, type PenTeam } from './bullpenModel'

const MLB_V1 = 'https://statsapi.mlb.com/api/v1'
const MLB_V11 = 'https://statsapi.mlb.com/api/v1.1'

type Req = { slateDate: string; awayTeamId: number; homeTeamId: number; awayPitcherId: number | null; homePitcherId: number | null }

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function getJson(url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) { console.error('[bullpenGrid] HTTP', res.status, url); return null }
    return await res.json()
  } catch (err) {
    console.error('[bullpenGrid] fetch failed:', url, err)
    return null
  }
}

function toFeedGame(feed: Json, teamId: number, date: string): FeedGame | null {
  const teams = feed?.liveData?.boxscore?.teams
  if (!teams) return null
  const side: 'away' | 'home' | null = teams.away?.team?.id === teamId ? 'away' : teams.home?.team?.id === teamId ? 'home' : null
  if (!side) return null
  const t = teams[side]
  const ids: number[] = t.pitchers ?? []
  const arms: FeedArm[] = ids.map(id => {
    const p = t.players?.[`ID${id}`]
    const gp = feed.gameData?.players?.[`ID${id}`]
    return {
      id, name: String(gp?.fullName ?? p?.person?.fullName ?? ''),
      hand: gp?.pitchHand?.code === 'L' ? 'L' : gp?.pitchHand?.code === 'R' ? 'R' : null,
      pitches: Number(p?.stats?.pitching?.numberOfPitches ?? 0),
    }
  })
  return { gamePk: Number(feed.gamePk), date, type: String(feed.gameData?.game?.type ?? 'R'), teamId, starterId: ids[0] ?? null, arms, unused: t.bullpen ?? [] }
}

async function teamGames(teamId: number, dates: string[]): Promise<FeedGame[]> {
  const sched = await getJson(`${MLB_V1}/schedule?sportId=1&teamId=${teamId}&startDate=${dates[0]}&endDate=${dates[dates.length - 1]}`)
  const games: { gamePk: number; officialDate: string; state: string }[] = (sched?.dates ?? []).flatMap((d: Json) =>
    (d.games ?? []).map((g: Json) => ({ gamePk: g.gamePk, officialDate: g.officialDate ?? d.date, state: g.status?.abstractGameState })))
  const finals = games.filter(g => g.state === 'Final')
  const feeds = await Promise.all(finals.map(async g => ({ g, feed: await getJson(`${MLB_V11}/game/${g.gamePk}/feed/live`) })))
  return feeds.map(({ g, feed }) => (feed ? toFeedGame(feed, teamId, g.officialDate) : null)).filter((x): x is FeedGame => !!x)
}

export async function loadBullpenGrid(r: Req): Promise<{ away: PenTeam | null; home: PenTeam | null }> {
  const dates = windowDates(r.slateDate)
  const tonight = [r.awayPitcherId, r.homePitcherId].filter((x): x is number => !!x)
  const build = async (teamId: number): Promise<PenTeam | null> => {
    const games = await teamGames(teamId, dates)
    if (games.length === 0) return null
    const team = buildPenTeam({ slate: r.slateDate, teamId, games, tonightStarters: tonight })
    return team.rows.length ? team : null
  }
  const [away, home] = await Promise.all([build(r.awayTeamId), build(r.homeTeamId)])
  return { away, home }
}
