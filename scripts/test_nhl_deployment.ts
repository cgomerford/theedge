import assert from 'node:assert'
import { toNhlStripData, PP_PK_FLOOR_S } from '../src/lib/nhl/deployment'

function player(name: string) {
  return { full_name: name, position_code: 'D', sweater_number: 4 }
}

function testL5HiddenBelowThreeGames() {
  const rows = [
    {
      team_id: 1,
      player_id: 100,
      metric: 'nhl_toi_5v5' as const,
      through_date: '2026-10-10',
      last_value: '0.5',
      last_raw: '600',
      l5_games: 2, // below the 3-game honest-n threshold
      l5_value: '0.45',
      l5_raw: '550',
      season_games: 2,
      season_value: '0.45',
      season_raw: '550',
      excluded_games: 0,
    },
  ]
  const players = new Map([[100, player('Two Game Player')]])
  const result = toNhlStripData(rows, players, { metric: 'nhl_toi_5v5' })
  assert.strictEqual(result.rows[0].l3Pct, null, 'L5 value should be hidden below 3 played games')
  assert.strictEqual(result.rows[0].l3Snaps, null, 'L5 raw should be hidden below 3 played games')
  assert.ok(result.extraFoot?.includes('last game'), `expected "last game" fallback label, got: ${result.extraFoot}`)
}

function testL5ShownAtThreeGames() {
  const rows = [
    {
      team_id: 1,
      player_id: 101,
      metric: 'nhl_toi_5v5' as const,
      through_date: '2026-10-10',
      last_value: '0.5',
      last_raw: '600',
      l5_games: 3,
      l5_value: '0.48',
      l5_raw: '580',
      season_games: 3,
      season_value: '0.48',
      season_raw: '580',
      excluded_games: 0,
    },
  ]
  const players = new Map([[101, player('Three Game Player')]])
  const result = toNhlStripData(rows, players, { metric: 'nhl_toi_5v5' })
  assert.strictEqual(result.rows[0].l3Pct, 0.48)
  assert.ok(result.extraFoot?.includes('3 games'), `expected "3 games" label, got: ${result.extraFoot}`)
}

function testExcludedGamesCountedInFoot() {
  const rows = [
    {
      team_id: 1,
      player_id: 102,
      metric: 'nhl_toi_5v5' as const,
      through_date: '2026-10-10',
      last_value: '0.5',
      last_raw: '600',
      l5_games: 4,
      l5_value: '0.48',
      l5_raw: '580',
      season_games: 4,
      season_value: '0.48',
      season_raw: '580',
      excluded_games: 1,
    },
  ]
  const players = new Map([[102, player('Player With Excluded Game')]])
  const result = toNhlStripData(rows, players, { metric: 'nhl_toi_5v5' })
  assert.ok(
    result.extraFoot?.includes('1 game excluded (ice-time check failed)'),
    `expected excluded-game note, got: ${result.extraFoot}`,
  )
}

function testFloorNullMeansSortedNotRankedForPpPk() {
  assert.strictEqual(PP_PK_FLOOR_S, null, 'PP_PK_FLOOR_S must stay null until George sets it (open question 2)')
  const rows = [
    {
      team_id: 1,
      player_id: 200,
      metric: 'nhl_toi_pp' as const,
      through_date: '2026-10-10',
      last_value: '0.1',
      last_raw: '60',
      l5_games: 5,
      l5_value: '0.1',
      l5_raw: '60',
      season_games: 5,
      season_value: '0.1',
      season_raw: '60',
      excluded_games: 0,
    },
    {
      team_id: 1,
      player_id: 201,
      metric: 'nhl_toi_pp' as const,
      through_date: '2026-10-10',
      last_value: '0.3',
      last_raw: '200',
      l5_games: 5,
      l5_value: '0.3',
      l5_raw: '200',
      season_games: 5,
      season_value: '0.3',
      season_raw: '200',
      excluded_games: 0,
    },
  ]
  const players = new Map([
    [200, player('Low PP Seconds')],
    [201, player('High PP Seconds')],
  ])
  const result = toNhlStripData(rows, players, { metric: 'nhl_toi_pp' })
  // Sorted by raw season seconds descending -- the higher-usage player first,
  // with no rank number attached anywhere in StripRow.
  assert.strictEqual(result.rows[0].playerId, 201)
  assert.strictEqual(result.rows[1].playerId, 200)
  for (const row of result.rows) {
    assert.ok(!('rank' in row), 'StripRow must never carry a rank field while PP_PK_FLOOR_S is null')
  }
}

function main() {
  testL5HiddenBelowThreeGames()
  testL5ShownAtThreeGames()
  testExcludedGamesCountedInFoot()
  testFloorNullMeansSortedNotRankedForPpPk()
  console.log('scripts/test_nhl_deployment.ts: all tests passed')
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
