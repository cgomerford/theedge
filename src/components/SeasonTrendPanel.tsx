// src/components/SeasonTrendPanel.tsx
'use client'

// Post-game "Trends vs Season" — this outing vs. season baseline, plus
// this outing's raw break numbers (no season break baseline exists yet,
// see postgame-trend.ts header note — displayed as fact, not comparison).

import { pitchColor } from '@/lib/mlb'
import type { SeasonTrendResult } from '@/lib/postgame-trend'

export default function SeasonTrendPanel({ trend }: { trend: SeasonTrendResult }) {
  const { flags, standoutFlags, gameBreakByPitch } = trend

  if (flags.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-stone-400 font-serif italic text-sm">
        Not enough season baseline data yet to compare against.
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden p-4 space-y-4">
      {/* Standout callout — the "highlight if something stood out" ask */}
      {standoutFlags.length > 0 && (
        <div className="px-4 py-3 rounded-lg border-l-[3px] border-yellow-400"
          style={{ background: 'rgba(253,224,71,0.08)' }}>
          {standoutFlags.map((f, i) => (
            <p key={i} className="font-serif italic text-stone-700 text-sm leading-relaxed">
              {f.pitchName} {f.kind === 'velo' ? 'velocity' : 'usage'}: {f.detail}
            </p>
          ))}
        </div>
      )}

      {/* Full flag list */}
      <div className="space-y-2">
        {flags.map((f, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColor(f.pitchType) }} />
            <span className="font-serif text-stone-800 w-28 shrink-0 truncate">{f.pitchName}</span>
            <span className="font-mono text-[10px] uppercase text-stone-400 w-12 shrink-0">{f.kind}</span>
            <span className={`font-mono text-xs ${f.standout ? 'font-bold text-orange-600' : 'text-stone-600'}`}>
              {f.detail}
            </span>
          </div>
        ))}
      </div>

      {/* This-game break — no season comparison available, shown as fact */}
      <div className="pt-3 border-t border-stone-100">
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">
          Break tonight (no season baseline stored yet)
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(gameBreakByPitch).map(([pt, b]) => (
            <div key={pt} className="bg-stone-50 rounded-lg p-2.5 text-xs">
              <span className="font-serif font-semibold text-stone-800">{pt}</span>
              <div className="font-mono text-[10px] text-stone-500 mt-1">
                {b.breakVerticalInduced != null && `IVB ${b.breakVerticalInduced.toFixed(1)}" `}
                {b.breakHorizontal != null && `HB ${b.breakHorizontal.toFixed(1)}" `}
                {b.spinRate != null && `${Math.round(b.spinRate)} rpm`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}