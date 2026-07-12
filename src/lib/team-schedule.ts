// src/lib/team-schedule.ts
//
// Upcoming schedule with probable starters. Confirmed MLB data first;
// falls back to the rotation-pattern projection (team-rotation.ts) for
// games not yet announced — each unconfirmed game gets the NEXT pitcher
// in the projected 5-man cycle, not the same repeated guess.

import { getRecentStarters, projectRotation } from './team-rotation'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type ScheduleRow = {
  gamePk: number
  date: string
  opponent: string
  opponentAbbrev: string
  isHome: boolean
  teamProbable: { personId: number; name: string } | null
  teamProbableSource: 'mlb_confirmed' | 'rotation_pattern' | null
  opponentProbable: { personId: number; name: string } | null
}

export function pitcherHeadshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

export async function getTeamUpcomingSchedule(mlbTeamId: number, days = 10): Promise<ScheduleRow[]> {
  try {
    const start = new Date().toISOString().split('T')[0]
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const url = `${MLB_API}/schedule?sportId=1&teamId=${mlbTeamId}&startDate=${start}&endDate=${end}&hydrate=team,probablePitcher&gameType=R`
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return []
    const json = await res.json()
    const games = (json.dates ?? []).flatMap((d: any) => d.games ?? [])

    const unconfirmedCount = games.filter((g: any) => {
      const isHome = g.teams?.home?.team?.id === mlbTeamId
      const mySide = isHome ? g.teams.home : g.teams.away
      return !mySide?.probablePitcher?.id
    }).length

    const projection = unconfirmedCount > 0
      ? projectRotation(await getRecentStarters(mlbTeamId), unconfirmedCount)
      : []

    let projectionIdx = 0

    return games.map((g: any) => {
      const isHome = g.teams?.home?.team?.id === mlbTeamId
      const mySide = isHome ? g.teams.home : g.teams.away
      const oppSide = isHome ? g.teams.away : g.teams.home

      const confirmedTeamPP = mySide?.probablePitcher
      let teamProbable: ScheduleRow['teamProbable'] = null
      let teamProbableSource: ScheduleRow['teamProbableSource'] = null

      if (confirmedTeamPP?.id) {
        teamProbable = { personId: confirmedTeamPP.id, name: confirmedTeamPP.fullName }
        teamProbableSource = 'mlb_confirmed'
      } else if (projection[projectionIdx]) {
        teamProbable = projection[projectionIdx]
        teamProbableSource = 'rotation_pattern'
        projectionIdx++
      }

      const confirmedOppPP = oppSide?.probablePitcher
      const opponentProbable = confirmedOppPP?.id ? { personId: confirmedOppPP.id, name: confirmedOppPP.fullName } : null

      return {
        gamePk: g.gamePk,
        date: g.officialDate ?? g.gameDate?.split('T')[0] ?? '',
        opponent: oppSide?.team?.name ?? '',
        opponentAbbrev: oppSide?.team?.abbreviation ?? '',
        isHome,
        teamProbable,
        teamProbableSource,
        opponentProbable,
      }
    })
  } catch (e) {
    console.error('getTeamUpcomingSchedule error:', e)
    return []
  }
}