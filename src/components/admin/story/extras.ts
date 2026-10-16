// src/components/admin/story/extras.ts
//
// Server helper for dashboard/page.tsx: per-game extras the scout bundle
// doesn't carry. Reads only the schedule rows the page already fetched.

import { slugifyGame } from '@/lib/mlb'
import type { MLBGame } from '@/lib/mlb'
import type { StoryExtras } from './types'

import { seriesOf } from './series'

export function buildStoryExtras(sched: MLBGame | undefined, lineupsConfirmed: boolean): StoryExtras {
  return {
    series: seriesOf(sched as unknown as Record<string, unknown> | undefined),
    ids: sched ? {
      gamePk: sched.gamePk,
      awayTeamId: sched.teams.away.team.id, homeTeamId: sched.teams.home.team.id,
      awayPitcherId: sched.teams.away.probablePitcher?.id ?? null, homePitcherId: sched.teams.home.probablePitcher?.id ?? null,
    } : null,
    slug: sched ? slugifyGame(sched) : null,
    venueName: sched?.venue?.name ?? '',
    firstPitch: sched?.gameDate
      ? `${new Date(sched.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`
      : '',
    lineupsConfirmed,
  }
}
