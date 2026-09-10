// src/components/nfl/QbSprayChart.tsx
//
// Honest version of "spray chart of every throw" -- nflreadpy has no
// per-play x/y throw coordinates (verified: load_nextgen_stats is
// aggregate-only), so a real spray chart isn't buildable. What IS
// real here: dot COUNT per zone matches real attempts, dot
// green/red split matches the real completion rate exactly. What's
// synthetic: the exact pixel position of an individual dot within
// its zone -- same honesty line as a beeswarm/jittered strip plot.
//
// Uses a seeded PRNG (not Math.random()) so the jitter is IDENTICAL
// on server and client render -- Math.random() here would cause a
// React hydration mismatch (SSR dots land in different spots than
// the client re-render).

'use client'

import type { QbZoneProfile } from '@/lib/nfl/queries'

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const ROWS: { length: string; yTop: number; yBottom: number; inset: number }[] = [
  { length: 'deep', yTop: 6, yBottom: 46, inset: 20 },
  { length: 'short', yTop: 52, yBottom: 92, inset: 4 },
]
const COLS: { location: string; xLeft: number; xRight: number }[] = [
  { location: 'left', xLeft: 0, xRight: 33 },
  { location: 'middle', xLeft: 33, xRight: 66 },
  { location: 'right', xLeft: 66, xRight: 100 },
]

export function QbSprayChart({ profile, qbName }: { profile: QbZoneProfile; qbName: string }) {
  const cellByZone = new Map(profile.cells.map((c) => [`${c.passLocation}|${c.passLength}`, c]))

  const dots: { cx: number; cy: number; complete: boolean; key: string }[] = []
  for (const row of ROWS) {
    for (const col of COLS) {
      const cell = cellByZone.get(`${col.location}|${row.length}`)
      if (!cell || cell.attempts === 0) continue

      const xInset = row.inset * (1 - (col.xRight - col.xLeft) / 100) // keep dots off the trapezoid rails
      const xMin = col.xLeft + xInset + 2
      const xMax = col.xRight - xInset - 2
      const completions = Math.round((cell.compPct ?? 0) / 100 * cell.attempts)

      const rand = seededRandom(cell.attempts * 7919 + col.xLeft * 131 + (row.length === 'deep' ? 1 : 0))
      for (let i = 0; i < cell.attempts; i++) {
        const cx = xMin + rand() * Math.max(1, xMax - xMin)
        const cy = row.yTop + rand() * (row.yBottom - row.yTop)
        dots.push({ cx, cy, complete: i < completions, key: `${col.location}-${row.length}-${i}` })
      }
    }
  }

  return (
    <div style={{ background: '#0A0A0A', borderRadius: 4, padding: 12 }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.5)', margin: '0 0 8px' }}>
        {qbName} — every charted attempt this season, jittered within its real zone (not a real throw location)
      </p>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '62%', borderRadius: 4, overflow: 'hidden' }}>
        <svg viewBox="0 0 100 98" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="100" height="98" fill="#16351f" />
          <line x1="0" y1="49" x2="100" y2="49" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" />
          {dots.map((d) => (
            <circle key={d.key} cx={d.cx} cy={d.cy} r={0.6} fill={d.complete ? '#22C55E' : '#DC2626'} fillOpacity={0.8} />
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.6)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} /> Complete
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.6)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} /> Incomplete
        </span>
      </div>
    </div>
  )
}
