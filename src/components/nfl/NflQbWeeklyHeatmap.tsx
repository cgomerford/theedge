// src/components/nfl/NflQbWeeklyHeatmap.tsx

import type { QbWeeklyGridRow } from '@/lib/nfl/queries'

function heatColor(value: number | null, min: number, max: number): string {
  if (value == null) return '#F0EBE0'
  const t = (value - min) / (max - min || 1)
  // cream -> orange, matching brand accent instead of a generic heat palette
  const r = Math.round(250 - t * (250 - 255))
  const g = Math.round(248 - t * (248 - 87))
  const b = Math.round(243 - t * (243 - 34))
  return `rgb(${r},${g},${b})`
}

export default function NflQbWeeklyHeatmap({ rows, maxWeeks = 18 }: { rows: QbWeeklyGridRow[]; maxWeeks?: number }) {
  if (rows.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No weekly data yet.</div>
      </div>
    )
  }

  const allValues = rows.flatMap((r) => r.weeks.map((w) => w.intendedAirYards).filter((v): v is number => v != null))
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const weekNums = Array.from({ length: maxWeeks }, (_, i) => i + 1)

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20, overflowX: 'auto' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 12 }}>
        Cell = that week's average intended air yards. Darker = deeper.
      </div>
      <table style={{ borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', position: 'sticky', left: 0, background: '#fff' }}>QB</th>
            {weekNums.map((w) => (
              <th key={w} style={{ padding: '4px 4px', color: '#A3A3A3', fontWeight: 400 }}>{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const byWeek = new Map(r.weeks.map((w) => [w.week, w.intendedAirYards]))
            return (
              <tr key={r.playerId}>
                <td style={{ padding: '2px 8px', whiteSpace: 'nowrap', fontWeight: 700, color: '#1A1A1A', position: 'sticky', left: 0, background: '#fff' }}>
                  {r.playerName} <span style={{ color: '#A3A3A3', fontWeight: 400 }}>({r.teamId})</span>
                </td>
                {weekNums.map((w) => {
                  const v = byWeek.get(w) ?? null
                  return (
                    <td
                      key={w}
                      title={v != null ? `${v.toFixed(1)} yds` : 'No data'}
                      style={{ width: 26, height: 22, background: heatColor(v, min, max), border: '1px solid #F4F0E8' }}
                    />
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}