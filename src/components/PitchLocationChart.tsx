'use client'

import { pitchColor } from '@/lib/mlb'
import type { PitchRecord } from '@/lib/series-pitches'

// Feet-to-pixel mapping matching Statcast's plate_x/plate_z convention —
// plate_x roughly -2..2 (catcher's view), plate_z roughly 0..5 (height).
const W = 180, H = 220
const xScale = (ft: number) => 20 + ((ft + 2) / 4) * (W - 40)
const zScale = (ft: number) => H - 10 - (ft / 5) * (H - 30)

export default function PitchLocationChart({ pitches }: { pitches: PitchRecord[] }) {
  if (pitches.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 text-center py-6">No tracked pitches in this window.</p>
  }

  const szTops = pitches.map(p => p.szTop).filter((v): v is number => v !== null)
  const szBots = pitches.map(p => p.szBot).filter((v): v is number => v !== null)
  const szTop = szTops.length ? szTops.reduce((a, b) => a + b, 0) / szTops.length : 3.5
  const szBot = szBots.length ? szBots.reduce((a, b) => a + b, 0) / szBots.length : 1.5

  const byType = new Map<string, string>()
  for (const p of pitches) if (!byType.has(p.pitchName)) byType.set(p.pitchName, pitchColor(p.pitchType))

  return (
    <div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect
          x={xScale(-0.83)} y={zScale(szTop)}
          width={xScale(0.83) - xScale(-0.83)} height={zScale(szBot) - zScale(szTop)}
          fill="none" stroke="#1A1A1A" strokeWidth={1} strokeDasharray="3 2"
        />
        {pitches.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.plateX ?? 0)}
            cy={zScale(p.plateZ ?? 0)}
            r={4}
            fill={pitchColor(p.pitchType)}
            fillOpacity={0.75}
            stroke="#fff"
            strokeWidth={0.5}
          >
            <title>{p.pitchName} — {p.description || '—'} ({p.gameDate})</title>
          </circle>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {[...byType.entries()].map(([name, color]) => (
          <span key={name} className="flex items-center gap-1 text-[9px] font-mono text-stone-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}