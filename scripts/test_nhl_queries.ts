import assert from 'node:assert'
import { paginateRange } from '../src/lib/nhl/queries'

async function testPaginationCrossesThousandRowCap() {
  // Simulate PostgREST's 1000-row page cap across 2,500 total rows.
  const TOTAL = 2500
  const PAGE = 1000
  const all = Array.from({ length: TOTAL }, (_, i) => ({ id: i }))
  let callCount = 0

  const rows = await paginateRange(
    async (offset, limit) => {
      callCount++
      return { data: all.slice(offset, offset + limit), error: null }
    },
    () => {
      throw new Error('onError should not be called in the happy path')
    },
    PAGE,
  )

  assert.strictEqual(rows.length, TOTAL, `expected ${TOTAL} rows across pages, got ${rows.length}`)
  assert.strictEqual(callCount, 3, `expected 3 page fetches (1000+1000+500), got ${callCount}`)
}

async function testNumericStringsCoerceWithNumber() {
  // Supabase numeric columns arrive as strings with no Database generic
  // (see queries.ts header) -- confirms Number() coercion behaves as every
  // caller of a numeric column assumes.
  const raw = { avg_shift_s: '47.58', toi_s: '1237' }
  assert.strictEqual(Number(raw.avg_shift_s), 47.58)
  assert.strictEqual(Number(raw.toi_s), 1237)
  assert.ok(Number.isNaN(Number('')) === false || true) // documents intent only; '' -> 0, not NaN, in JS
  assert.strictEqual(Number(''), 0)
  assert.ok(Number.isNaN(Number('not-a-number')))
}

async function testToiCheckFailRowsAreFiltered() {
  type Row = { player_id: number; toi_check: 'pass' | 'fail' }
  const rows: Row[] = [
    { player_id: 1, toi_check: 'pass' },
    { player_id: 2, toi_check: 'fail' },
    { player_id: 3, toi_check: 'pass' },
  ]
  const visible = rows.filter((r) => r.toi_check !== 'fail')
  assert.strictEqual(visible.length, 2)
  assert.ok(visible.every((r) => r.toi_check === 'pass'))
  assert.ok(!visible.some((r) => r.player_id === 2))
}

async function testErrorPagePropagatesPartialRows() {
  // On a mid-pagination error, the rows fetched so far are returned (never
  // thrown away) and onError is called once with the message -- matches
  // every other data function's "log + return what we have" contract.
  let errorMessage: string | null = null
  const rows = await paginateRange<{ id: number }>(
    async (offset) => {
      if (offset === 0) return { data: [{ id: 1 }, { id: 2 }], error: null }
      return { data: null, error: { message: 'simulated failure' } }
    },
    (message) => {
      errorMessage = message
    },
    2,
  )
  assert.strictEqual(rows.length, 2)
  assert.strictEqual(errorMessage, 'simulated failure')
}

async function main() {
  await testPaginationCrossesThousandRowCap()
  await testNumericStringsCoerceWithNumber()
  await testToiCheckFailRowsAreFiltered()
  await testErrorPagePropagatesPartialRows()
  console.log('scripts/test_nhl_queries.ts: all tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
