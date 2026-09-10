// src/components/nfl/QbPercentileCarousel.tsx
//
// Replaces QbRadarCarousel with the Savant-style horizontal
// percentile-bar pattern (POOR/AVERAGE/GREAT track, colored dot at
// the percentile). Reuses PercentileDial from getPlayerPercentiles --
// the same query already powering the player page's percentile rail
// -- so this is real, previously-validated data, not a new model.

'use client'

import { useEffect, useState } from 'react'
import type { PercentileDial } from '@/lib/nfl/queries'

export interface QbPercentileEntry {
  playerId: string
  name: string
  dials: PercentileDial[]
}

function dotColor(pct: number): string {
  if (pct >= 67) return '#16A34A'
  if (pct >= 34) return '#D97706'
  return '#DC2626'
}

export function QbPercentileCarousel({ entries, intervalMs = 6000 }: { entries: QbPercentileEntry[]; intervalMs?: number }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (entries.length <= 1) return
    const id = setInterval(() => setActive((a) => (a + 1) % entries.length), intervalMs)
    return () => clearInterval(id)
  }, [entries.length, intervalMs])

  if (entries.length === 0) return null

  const current = entries[Math.min(active, entries.length - 1)]

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{current.name}</h3>
      </div>
      <p className="panel-note">Percentile vs. same-position peers with a reliable sample this season.</p>

      {current.dials.length === 0 ? (
        <p className="nh-empty tight">Not enough data to rank yet.</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', marginBottom: 8 }}>
            <span>POOR</span>
            <span>AVERAGE</span>
            <span>GREAT</span>
          </div>
          {current.dials.map((d) => (
            <div key={d.key} style={{ marginBottom: 10 }}>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4B4B4B', margin: '0 0 3px' }}>{d.key}</p>
              <div style={{ position: 'relative', height: 6, background: '#EFECE6' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '100%', background: 'linear-gradient(90deg,#DC2626,#D97706,#16A34A)' }} />
                <div
                  style={{
                    position: 'absolute',
                    left: `calc(${d.percentile}% - 8px)`,
                    top: -5,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: dotColor(d.percentile),
                    color: '#fff',
                    fontSize: 8,
                    fontFamily: "'JetBrains Mono', monospace",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1.5px solid #fff',
                  }}
                >
                  {d.percentile}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
        {entries.map((e, i) => (
          <button
            key={e.playerId}
            onClick={() => setActive(i)}
            aria-label={`Show ${e.name}`}
            style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: i === active ? '#FF5722' : '#E7E5E4' }}
          />
        ))}
      </div>
    </div>
  )
}