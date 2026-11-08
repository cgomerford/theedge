// Fixtures for the minor-league importer tests: a small league registry (real club ids and league ids from the MLB Stats API, 2026), and synthetic Savant rows and CSV text.
// Not a test file, and nothing here is imported by the app.

import type { ApiGame, ApiTeam } from './league'

const L = (id: number, name: string) => ({ id, name })
export const IL = L(117, 'International League'), PCL = L(112, 'Pacific Coast League')
export const FSL = L(123, 'Florida State League'), CAR = L(122, 'Carolina League'), CAL = L(110, 'California League')

export const TEAMS_AAA: ApiTeam[] = [
  { id: 234, abbreviation: 'DUR', name: 'Durham Bulls', league: IL }, { id: 431, abbreviation: 'GWN', name: 'Gwinnett Stripers', league: IL },
  { id: 2310, abbreviation: 'RNO', name: 'Reno Aces', league: PCL },
]
export const TEAMS_A: ApiTeam[] = [
  { id: 479, abbreviation: 'JUP', name: 'Jupiter Hammerheads', league: FSL }, { id: 566, abbreviation: 'CLW', name: 'Clearwater Threshers', league: FSL },
  { id: 3712, abbreviation: 'FAY', name: 'Fayetteville Woodpeckers', league: CAR }, { id: 259, abbreviation: 'FRE', name: 'Fresno Grizzlies', league: CAL },
]

const game = (gamePk: number, home: number, away: number, date: string): ApiGame => ({ gamePk, gameType: 'R', officialDate: date, teams: { home: { team: { id: home } }, away: { team: { id: away } } } })
export const GAMES_AAA: ApiGame[] = [game(1001, 234, 431, '2026-08-01'), game(1002, 2310, 234, '2026-08-02'), game(1003, 431, 234, '2026-08-03')]
export const GAMES_A: ApiGame[] = [game(2001, 479, 566, '2026-08-01'), game(2002, 3712, 259, '2026-08-01'), game(2003, 566, 479, '2026-08-02')]

export type Row = Record<string, string | number>

/** One synthetic pitch. i makes the identity unique; overrides replace fields. */
export function row(o: { game: number; ab: number; pn: number } & Partial<Record<string, string | number>>): Row {
  const home = { 1001: 'DUR', 1002: 'RNO', 1003: 'GWN', 1004: 'DUR', 1005: 'DUR', 2001: 'JUP', 2002: 'FAY', 2003: 'CLW' }[o.game] ?? 'XXX'
  const away = { 1001: 'GWN', 1002: 'DUR', 1003: 'DUR', 1004: 'GWN', 1005: 'GWN', 2001: 'CLW', 2002: 'FRE', 2003: 'JUP' }[o.game] ?? 'YYY'
  const { game, ab, pn, ...rest } = o
  const date = ({ 1001: '2026-08-01', 1002: '2026-08-02', 1003: '2026-08-03', 1004: '2026-08-04', 1005: '2026-08-05', 2001: '2026-08-01', 2002: '2026-08-01', 2003: '2026-08-02' } as Record<number, string>)[game] ?? '2026-08-01'
  return {
    pitch_type: 'FF', game_date: date, release_speed: 94.4, release_pos_x: -1.8, release_pos_z: 5.9, player_name: 'Arm, Test', batter: 7, pitcher: 100, events: '', description: 'ball',
    zone: 12, game_type: 'R', stand: 'R', p_throws: 'R', home_team: home, away_team: away, type: 'B', bb_type: '', balls: 0, strikes: 0, pfx_x: -0.7, pfx_z: 1.3, plate_x: 0.2, plate_z: 2.8,
    inning_topbot: 'Top', launch_speed: '', release_extension: 6.4, release_spin_rate: 2200, estimated_woba_using_speedangle: '', woba_value: '', delta_run_exp: 0.01,
    arm_angle: 38.5, game_pk: game, at_bat_number: ab, pitch_number: pn, ...rest,
  }
}

const HEAD = ['pitch_type', 'game_date', 'release_speed', 'release_pos_x', 'release_pos_z', 'player_name', 'batter', 'pitcher', 'events', 'description', 'zone', 'game_type', 'stand', 'p_throws', 'home_team', 'away_team', 'type', 'bb_type', 'balls', 'strikes', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z', 'inning_topbot', 'launch_speed', 'release_extension', 'release_spin_rate', 'estimated_woba_using_speedangle', 'woba_value', 'delta_run_exp', 'arm_angle', 'game_pk', 'at_bat_number', 'pitch_number']

/** CSV text the way Savant sends it: a BOM, every field quoted. */
export function csvText(rows: Row[]): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return '﻿' + [HEAD.map(q).join(','), ...rows.map(r => HEAD.map(h => q(r[h])).join(','))].join('\n') + '\n'
}
