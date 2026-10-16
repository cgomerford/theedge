import type { GameWithReport } from '@/components/admin/AllGamesStorySlideshow'
import type { FormRow, StoryExtras } from '../types'

export const bauers: FormRow = { player_id: 1, player_name: 'Jake Bauers', signal: 'cooling', signal_quality: 'validated', metric: 'ops', current_value: 0.7451, extreme_value: 0.9644, magnitude: 0.2193, recentGameLog: [.9, .85, .8, .78, .76, .75, .74, .745], games: 15 }
export const chourio: FormRow = { player_id: 2, player_name: 'Jackson Chourio', signal: 'cooling', signal_quality: 'validated', metric: 'slg', current_value: 0.4464, extreme_value: 0.5862, magnitude: 0.1398, games: 15 }
export const turang: FormRow = { player_id: 3, player_name: 'Brice Turang', signal: 'heating', signal_quality: 'trending', metric: 'avg', current_value: 0.3774, extreme_value: 0.2642, magnitude: 0.1132, recentGameLog: [.25, .26, .28, .3, .33, .35, .36, .377], games: 15 }
export const machado: FormRow = { player_id: 4, player_name: 'Manny Machado', signal: 'heating', signal_quality: 'validated', metric: 'ops', current_value: 0.6101, extreme_value: 0.4578, magnitude: 0.1523, games: 15 }

export const extras: StoryExtras = { slug: 'milwaukee-brewers-vs-san-diego-padres-2026-10-07', venueName: 'Petco Park', firstPitch: '9:40 PM ET', lineupsConfirmed: true }

/** Bare game: no workloads, fielders, streaks or form, TBD starters. */
export function emptyGame(over: Partial<GameWithReport> = {}): GameWithReport {
  return {
    game_pk: 1, matchup: 'MIL @ SD', lean_team: '', factor_count: 0, dominant_factor: '', report: null,
    awayAbbr: 'MIL', homeAbbr: 'SD', awayName: 'Milwaukee Brewers', homeName: 'San Diego Padres',
    awayColor: '#12284B', homeColor: '#2F241D',
    awayPitcherName: 'TBD', homePitcherName: 'TBD', awayPitcherId: null, homePitcherId: null,
    awayPitcherStats: null, homePitcherStats: null,
    awayWorkload: null, homeWorkload: null, awayFieldingAlignment: [], homeFieldingAlignment: [],
    awayLiteralBatters: [], homeLiteralBatters: [], awayPitcherTrend: null, homePitcherTrend: null,
    awayHotStreaks: [], homeHotStreaks: [], awayLineupBatters: [], homeLineupBatters: [],
    ...over,
  }
}

const fielders = (prefix: string) =>
  ['CF', 'LF', 'RF', 'SS', '2B', '3B', '1B', 'C'].map((position, i) => ({ position, playerId: 100 + i, playerName: `${prefix} Player${i}`, totalRuns: i - 3 }))

const workload = (names: string[]) => ({
  dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'],
  pitchers: names.map((n, i) => ({ playerId: 500 + i, playerName: n, totalPitches: 0, byDate: i === 5 ? {} : { '2026-10-05': 10 + i, '2026-10-06': 8 } })),
})

/** Everything present, so all 8 segments appear and the story is 32.0s. */
export function fullGame(): GameWithReport {
  return emptyGame({
    awayPitcherName: 'Freddy Peralta', homePitcherName: 'Dylan Cease', awayPitcherId: 10, homePitcherId: 11,
    awayPitcherStats: { era: 3.1, fip: 3.63, whip: 1.1, k_per_9: 10, bb_per_9: 3, l3_era: 2.5 },
    homePitcherStats: { era: 3.9, fip: 2.19, whip: 1.2, k_per_9: 11, bb_per_9: 3.3, l3_era: 4.1 },
    awayWorkload: workload(['Trevor Megill', 'Joel Payamps', 'Abner Uribe', 'Aaron Ashby', 'Nick Mears', 'Rest Guy', 'Bob Heavy']),
    homeWorkload: workload(['Robert Suarez', 'Jason Adam', 'Adrian Morejon']),
    awayFieldingAlignment: fielders('Away'), homeFieldingAlignment: fielders('Home'),
    awayLiteralBatters: [{ player_id: 20, player_name: 'William Contreras', position: 'C', on_base_streak: 8, hit_streak: 2 },
      { player_id: 22, player_name: 'Willy Adames', position: 'SS', on_base_streak: 9, hit_streak: 1 }],
    homeLiteralBatters: [{ player_id: 21, player_name: 'Fernando Tatis Jr.', position: 'RF', on_base_streak: 7, hit_streak: 5 }],
    awayHotStreaks: [bauers, turang], homeHotStreaks: [machado],
    awayPitcherTTO: { tto1_woba: 0.29, tto2_woba: 0.31, tto3_woba: 0.36, tto1_pa: 300, tto2_pa: 280, tto3_pa: 150 },
    homePitcherTTO: { tto1_woba: 0.27, tto2_woba: 0.3, tto3_woba: 0.33, tto1_pa: 310, tto2_pa: 290, tto3_pa: 150 },
    awayLineupBatters: [{ player_id: 20, player_name: 'William Contreras', position: 'C', batting_order: 1, season_avg: 0.28, season_slg: 0.45, season_ops: 0.81, season_rbi: 60 }],
    homeLineupBatters: [],
  })
}

import type { ScoutExtras } from '../types'
/** Desk cards: only defense (OAA for the 8 fixture fielders) is populated. */
export function fullScout(): ScoutExtras {
  const card = (abbr: string) => ({ abbr, oaa: 6, rank: 3, of: 30, oaaById: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [100 + i, i - 3])), best: [], worst: [] })
  return {
    arsenal: { away: null, home: null }, run: { away: null, home: null }, abs: { away: null, home: null },
    club: { away: null, home: null }, late: { away: null, home: null }, defdesk: { away: card('MIL'), home: card('SD') },
  }
}

import type { PenTeam } from '../bullpenModel'
export function penGridFixture(): { away: PenTeam; home: PenTeam } {
  const team = (teamId: number): PenTeam => ({
    teamId, dates: ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'], last3: 58,
    rows: Array.from({ length: 6 }, (_, i) => ({ id: teamId * 10 + i, name: `Reliever Number${i}`, hand: 'R' as const, days: [0, i, 10, 12], total: 22 + i, tag: null })),
  })
  return { away: team(1), home: team(2) }
}

export const CANON_ALL = ['hook','sp','sp-arsenal','sp-tto','lineup-away','lineup-home','bullpen-avail','late','run-game','abs','club-status','defense-away','defense-home','streaks','form','close'] as const as unknown as import('../types').SegmentId[]
