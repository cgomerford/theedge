// src/components/BatterPitchCountChart.tsx
'use client'

import type { BatterPitchCountRow } from '@/lib/postgame-batter-adapt'

export default function BatterPitchCountChart({ rows, teamColor }: { rows: BatterPitchCountRow[]; teamColor: string }) {
  if (rows.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 p-4 text-center">No pitch data by inning.</p>
  }
  const max = Math.max(...rows.map(r => r.pitches), 1)

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Pitches seen by inning</span>
      </div>
      <div className="p-3 flex items-end gap-2" style={{ height: 120 }}>
        {rows.map(r => (
          <div key={r.inning} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="font-mono text-[10px] font-bold text-stone-700 mb-1">{r.pitches}</span>
            <div
              className="w-full rounded-t"
              style={{ height: `${(r.pitches / max) * 80}px`, background: teamColor, opacity: 0.75 }}
            />
            <span className="font-mono text-[8px] text-stone-400 mt-1">{r.inning}</span>
          </div>
        ))}
      </div>
    </div>
  )
}