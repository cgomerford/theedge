import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const lib = fs.readFileSync('src/lib/nfl-edge/postgame.ts', 'utf8')
const ui = fs.readFileSync('src/components/nfl-edge/postgame/GamePostgame.tsx', 'utf8')
const chart = fs.readFileSync('src/components/nfl-edge/postgame/PostgameClient.tsx', 'utf8')

test('ScoreRow has avgBefore/avgGames and no hit/expected', () => {
  const line = lib.split('\n').find(l => l.startsWith('export type ScoreRow'))!
  assert.match(line, /avgBefore: number/)
  assert.match(line, /avgGames: number/)
  assert.doesNotMatch(line, /\bhit\b|\bexpected\b/)
})
test('postgame copy has no "% ... win", verdicts or tick marks', () => {
  for (const src of [ui, chart]) {
    assert.doesNotMatch(src, /win probability moved/i)
    assert.doesNotMatch(src, /%[^'"`\n]{0,20}\bwin\b/i)
    for (const w of ['Called it', 'Missed', '✓', '✗', 'Above avg', 'Below avg']) assert.ok(!src.includes(w), w)
  }
})
test('sections are renamed', () => {
  assert.ok(ui.includes('title="Biggest swings"'))
  assert.ok(ui.includes('title="Key players vs their own average"'))
})
