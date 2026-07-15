'use client'

import { pitchColor } from '@/lib/mlb'
import type { PitchMovementRow } from '@/lib/pitcher-full-stats'

const W = 320, H = 320
const scale = (v: number) => 160 + (v / 24) * 130

export default function PitchMovementChart({ rows }: { rows: PitchMovementRow[] }) {
  const withMovement = rows.filter(r => r.avgHBreak !== null && r.avgVBreak !== null)

  if (withMovement.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 py-10 text-center">No movement data on record yet.</p>
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">Movement profile</p>
      <p className="text-[10px] font-mono text-stone-400 mb-3">Horizontal / vertical break, pitcher's-eye view — inches</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <line x1={0} y1={160} x2={W} y2={160} stroke="#e7e2d6" strokeWidth={1} />
        <line x1={160} y1={0} x2={160} y2={H} stroke="#e7e2d6" strokeWidth={1} />
        <text x={W - 4} y={172} textAnchor="end" fontFamily="JetBrains Mono" fontSize="9" fill="#a8a29e">Glove side</text>
        <text x={4} y={172} textAnchor="start" fontFamily="JetBrains Mono" fontSize="9" fill="#a8a29e">Arm side</text>
        <text x={164} y={12} fontFamily="JetBrains Mono" fontSize="9" fill="#a8a29e">Rise</text>
        <text x={164} y={H - 4} fontFamily="JetBrains Mono" fontSize="9" fill="#a8a29e">Drop</text>
        {withMovement.map((r, i) => (
          <g key={i}>
            <circle
              cx={scale(r.avgHBreak ?? 0)}
              cy={scale(-(r.avgVBreak ?? 0))}
              r={7}
              fill={pitchColor(r.pitchType)}
              fillOpacity={0.8}
              stroke="#fff"
              strokeWidth={1.5}
            />
            <text x={scale(r.avgHBreak ?? 0) + 10} y={scale(-(r.avgVBreak ?? 0)) + 4} fontFamily="JetBrains Mono" fontSize="10" fill="#1A1A1A">
              {r.pitchName}
            </text>
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {withMovement.map(r => (
          <div key={r.pitchType} className="flex items-center gap-2 text-[10px] font-mono">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColor(r.pitchType) }} />
            <span className="text-stone-600 flex-1 truncate">{r.pitchName}</span>
            <span className="text-stone-900 font-bold">{r.avgVelocity ?? '—'} mph</span>
          </div>
        ))}
      </div>
    </div>
  )
}