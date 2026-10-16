import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { UsageStrip } from '../src/components/team/UsageStrip'
import type { StripData } from '../src/lib/usage-strip/types'

// Regression guard: UsageStrip is shared between NFL (snap share) and NHL
// (ice-time deployment). This renders it with a FIXED NFL 'offense' StripData
// and diffs the output against a committed snapshot. Any future edit to
// UsageStrip/METRIC_SPECS/chips.tsx that changes NFL's rendered output without
// updating the snapshot deliberately fails this test -- see N2 STOP summary:
// "Part B and N2 both edit UsageStrip. Whichever lands second rebases onto the
// other's interface." This is what catches an accidental break instead of a
// deliberate rebase.
//
// No prior UsageStrip existed in this repo before N2 (see its own header
// comment), so this snapshot is the baseline captured AT this component's
// creation, not a pre-existing NFL render -- the next edit that changes NFL
// output must update SNAPSHOT_PATH deliberately (re-run with UPDATE_SNAPSHOT=1).

const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'usage_strip_nfl_snapshot.html')

const FIXED_NFL_DATA: StripData = {
  throughLabel: 'through Wk 5',
  rows: [
    {
      playerId: 'nfl-001',
      name: 'Sample Receiver',
      position: 'WR',
      lastPct: 0.71,
      l3Pct: 0.68,
      seasonPct: 0.64,
      lastSnaps: 46,
      l3Snaps: 44,
      seasonSnaps: 41,
      n: 5,
      trend: 'up',
    },
    {
      playerId: 'nfl-002',
      name: 'Sample Back',
      position: 'RB',
      lastPct: 0.38,
      l3Pct: 0.41,
      seasonPct: 0.44,
      lastSnaps: 24,
      l3Snaps: 26,
      seasonSnaps: 28,
      n: 5,
      trend: null,
    },
  ],
}

function render(): string {
  return renderToStaticMarkup(
    UsageStrip({
      team: { id: 1, nick: 'SAMP', color: '#0C2340' },
      metric: 'offense',
      data: FIXED_NFL_DATA,
    }),
  )
}

async function main() {
  const html = render()

  if (process.env.UPDATE_SNAPSHOT === '1') {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true })
    fs.writeFileSync(SNAPSHOT_PATH, html)
    console.log('Snapshot written to', SNAPSHOT_PATH)
    return
  }

  assert.ok(fs.existsSync(SNAPSHOT_PATH), `Snapshot missing at ${SNAPSHOT_PATH} -- run with UPDATE_SNAPSHOT=1 to create it`)
  const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf8')
  assert.strictEqual(html, expected, 'UsageStrip NFL ("offense" metric) output changed -- if intentional, rerun with UPDATE_SNAPSHOT=1')
  console.log('scripts/test_usage_strip_nfl_parity.ts: NFL parity snapshot unchanged')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
