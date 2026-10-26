// Where this park ranks for hits (per game, among all parks) and which part of the field the hits go to.
// Data: park_hit_map (scripts/compute-park-hits.ts), Statcast hits at the park by either team, last 3 seasons.
import ThroughDate from '@/components/data/ThroughDate'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { ParkHitSummary, HitKind } from '@/lib/park-index'

const MUTE = '#8a8275'
const ROWS: { k: HitKind; label: string }[] = [
  { k: 'all', label: 'All hits' }, { k: 'single', label: 'Singles' }, { k: 'double', label: 'Doubles' }, { k: 'triple', label: 'Triples' }, { k: 'hr', label: 'Home runs' },
]
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }

export default function ParkHitTable({ s, venue }: { s: ParkHitSummary; venue: string }) {
  const total = s.direction.left + s.direction.center + s.direction.right
  const dir = [{ label: 'Left', n: s.direction.left }, { label: 'Center', n: s.direction.center }, { label: 'Right', n: s.direction.right }]
  const top = dir.reduce((a, b) => (b.n > a.n ? b : a))
  const small = ROWS.some(r => s.kinds[r.k].n < MIN_SAMPLE.sprayBBE)
  const Star = () => <span style={{ color: '#FF5722', fontWeight: 800 }}>*</span>
  return (
    <div style={{ marginTop: 14, fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTE, marginBottom: 4 }}>Hits at {venue} vs other parks</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr style={{ color: MUTE, fontSize: 12, textAlign: 'right' }}>
          <th style={{ textAlign: 'left', padding: '4px 0' }}></th><th style={{ padding: 4 }}>Per game</th><th style={{ padding: 4 }}>Rank</th>
        </tr></thead>
        <tbody>{ROWS.map(r => {
          const v = s.kinds[r.k]
          return (
            <tr key={r.k} title={`n ${v.n.toLocaleString('en-US')} hits`} style={{ borderTop: '1px solid #e7e2d8', textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: '5px 0', fontWeight: 800 }}>{r.label}{v.n < MIN_SAMPLE.sprayBBE ? <Star /> : null}</td>
              <td style={{ padding: 4 }}>{v.perGame.toFixed(2)}</td>
              <td style={{ padding: 4 }}><b>{ord(v.rank)}</b> <span style={{ color: MUTE }}>of {v.of}</span></td>
            </tr>
          )
        })}</tbody>
      </table>
      {total > 0 ? (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <b>Where hits go:</b> {dir.map(d => `${d.label} ${Math.round((d.n / total) * 100)}%`).join(' · ')}.{' '}
          <span style={{ color: MUTE }}>Most go to {top.label.toLowerCase()} field. Left, center and right are thirds of the field by direction, from the left-field line to the right-field line.</span>
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>
        Both teams' hits, regular season {s.seasons}, {s.games.toLocaleString('en-US')} games. Rank 1 = most per game.
        <ThroughDate date={s.through} />
        {small ? <div>* Small sample size: under {MIN_SAMPLE.sprayBBE} hits of that type. Read with caution.</div> : null}
      </div>
    </div>
  )
}
