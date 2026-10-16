import assert from 'node:assert'
import { toAvailabilityCopy, type NhlAvailabilityRow } from '../src/lib/nhl/availability'

function baseRow(overrides: Partial<NhlAvailabilityRow>): NhlAvailabilityRow {
  return {
    season: 20262027,
    team_id: 1,
    player_id: 999,
    status: 'not_listed',
    last_game_id: 123,
    dressed_last10: 0,
    team_games_last10: 10,
    consecutive_missed: 1,
    on_current_roster: true,
    roster_change: null,
    roster_change_date: null,
    ...overrides,
  }
}

function testDressedSevenOfTenButMissedLastGame() {
  const row = baseRow({ status: 'not_listed', dressed_last10: 7 })
  const result = toAvailabilityCopy(row)
  assert.strictEqual(result.copy, 'Not in the last lineup')
}

function testFewerThanSevenOfTenAndMissedLastGame() {
  const row = baseRow({ status: 'not_listed', dressed_last10: 3 })
  const result = toAvailabilityCopy(row)
  assert.strictEqual(result.copy, 'Not regularly in the lineup')
}

function testScratchedTakesPriority() {
  const row = baseRow({ status: 'scratched', dressed_last10: 9 })
  const result = toAvailabilityCopy(row)
  assert.strictEqual(result.copy, 'Scratched')
}

function testRosterChangeAdded() {
  const row = baseRow({ roster_change: 'added', roster_change_date: '2026-10-02' })
  const result = toAvailabilityCopy(row)
  assert.ok(result.roosterChangeCopy?.startsWith('Added to roster'), `got: ${result.roosterChangeCopy}`)
}

function testRosterChangeRemoved() {
  const row = baseRow({ roster_change: 'removed', roster_change_date: '2026-10-02' })
  const result = toAvailabilityCopy(row)
  assert.ok(result.roosterChangeCopy?.startsWith('Removed from roster'), `got: ${result.roosterChangeCopy}`)
}

function testNoForbiddenWords() {
  const forbidden = ['injured', 'injury', 'out', 'day-to-day', 'questionable', 'doubtful']
  for (const status of ['dressed', 'scratched', 'not_listed'] as const) {
    for (const dressed of [0, 5, 7, 10]) {
      const row = baseRow({ status, dressed_last10: dressed, roster_change: 'added', roster_change_date: '2026-10-02' })
      const result = toAvailabilityCopy(row)
      const combined = `${result.copy} ${result.roosterChangeCopy ?? ''}`.toLowerCase()
      for (const word of forbidden) {
        assert.ok(!combined.includes(word), `forbidden word "${word}" found in: ${combined}`)
      }
    }
  }
}

function main() {
  testDressedSevenOfTenButMissedLastGame()
  testFewerThanSevenOfTenAndMissedLastGame()
  testScratchedTakesPriority()
  testRosterChangeAdded()
  testRosterChangeRemoved()
  testNoForbiddenWords()
  console.log('scripts/test_nhl_availability.ts: all tests passed')
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
