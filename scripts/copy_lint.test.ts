import test from 'node:test'
import assert from 'node:assert/strict'
import { lintText, lintSource } from './checks/copy-lint'

const bad = ['6 of 9 factors lean BUF', 'Toss-up', 'projected points', 'Pick up to 3 teams']
const good = ['Choose up to 3 teams', 'receiver drops', 'recent starts', 'PP unit 1', 'forward line']

for (const s of bad) test(`flags: ${s}`, () => assert.ok(lintText(s).length > 0))
for (const s of good) test(`passes: ${s}`, () => assert.equal(lintText(s).length, 0))
test('className flex-start passes', () => {
  assert.equal(lintSource('x.tsx', 'export const A = () => <div className="flex-start">Hi</div>').length, 0)
})
test('JSX text is checked', () => {
  assert.ok(lintSource('x.tsx', 'export const A = () => <div>Our picks</div>').length > 0)
})
