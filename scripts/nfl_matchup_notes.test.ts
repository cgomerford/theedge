import test from 'node:test'
import assert from 'node:assert/strict'
import { getMatchupNotes, formatNote } from '../src/lib/nfl-edge/matchup-notes'
import { lintText } from './checks/copy-lint'
import type { LeagueForm, FormRow } from '../src/lib/nfl-edge/form'
import type { NflGame } from '../src/lib/nfl-edge/games'

function row(id: string, i: number, games: number): FormRow {
  const w = {
    games,
    off: { plays: 600, dropbacks: 300, rushes: 250, pass_epa: 0.02 * i * 300, rush_epa: -0.01 * i * 250, sacks: 15 + i % 7, rz_td: 20 + i % 5, rz_trips: 40, epa: 5 },
    def: { plays: 600, dropbacks: 300, rushes: 250, pass_epa: 0.01 * i * 300, rush_epa: 0.005 * i * 250, sacks: 20, rz_td: 22, rz_trips: 40, epa: 5 },
    ftn_off: {}, ftn_def: {},
  }
  return { team_id: id, season: 2026, through_week: games, games, season_sum: w, l3: null, l5: null }
}
function lf(games: number): LeagueForm {
  const cur = new Map<string, FormRow>()
  for (let i = 0; i < 32; i++) cur.set(`T${i}`, row(`T${i}`, i, games))
  return { season: 2026, cur, prior: new Map() }
}
const game = { homeId: 'T1', awayId: 'T2' } as unknown as NflGame

test('returns 4-6 rows', () => {
  const n = getMatchupNotes({ game, lf: lf(6) })
  assert.ok(n.length >= 4 && n.length <= 6, `got ${n.length}`)
})
test('no banned words in any output string', () => {
  const n = getMatchupNotes({ game, lf: lf(6) })
  const strings = n.flatMap(r => [r.label, r.foot, formatNote(r.home.value, r.unit), formatNote(r.away.value, r.unit)])
  for (const s of strings) assert.equal(lintText(s).length, 0, s)
})
test('rank is a number from 6 games and null under 3 games', () => {
  assert.equal(typeof getMatchupNotes({ game, lf: lf(6) })[0].home.rank, 'number')
  for (const r of getMatchupNotes({ game, lf: lf(2) })) { assert.equal(r.home.rank, null); assert.equal(r.away.rank, null) }
})
test('no key totals or compares the sides', () => {
  const banned = /^(count|winner|tilt|lean|total|homeCount|awayCount|strength)$/i
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => [k, ...(v && typeof v === 'object' ? keys(v) : [])])
  for (const r of getMatchupNotes({ game, lf: lf(6) })) for (const k of keys(r)) assert.ok(!banned.test(k), k)
})
