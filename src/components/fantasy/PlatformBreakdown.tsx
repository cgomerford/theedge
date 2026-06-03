'use client'

/**
 * src/components/fantasy/PlatformBreakdown.tsx
 *
 * For a single streamer, show:
 *  - The projected line (IP, K, ER, etc.)
 *  - Their projected points across all 5 platforms
 *  - The platform that rewards this stream most (winner highlight)
 *  - Tap to expand → see the per-platform points breakdown
 */

import { useState } from 'react'
import type { FantasyPick } from '@/lib/fantasy'
import { projectLineFromPick, scoreAcrossPlatforms, PLATFORM_META } from '@/lib/fantasy-platforms'

export default function PlatformBreakdown({ pick }: { pick: FantasyPick }) {
  const [open, setOpen] = useState(false)

  const line = projectLineFromPick(pick)
  const scores = scoreAcrossPlatforms(line).sort((a, b) => b.points - a.points)
  const top = scores[0]
  const range = scores[0].points - scores[scores.length - 1].points

  return (
    <div className={`bg-white rounded-lg shadow-sm border transition-colors ${
      open ? 'border-orange-500 shadow-md' : 'border-stone-200 hover:border-stone-300'
    }`}>
      {/* ── Collapsed header ─────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 sm:px-5 py-4 flex items-start gap-3"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif font-semibold text-base text-stone-900 leading-tight">
              {pick.player_name}
            </span>
            <span className="font-mono text-[10px] text-stone-500 tracking-wide shrink-0">
              {pick.team_name} vs {pick.opponent_name}
            </span>
          </div>

          {/* Projected line */}
          <div className="mt-2 flex items-center gap-3 flex-wrap font-mono text-[11px]">
            <span className="text-stone-400 tracking-wide uppercase">Projected line</span>
            <span><span className="text-stone-400">IP</span> <span className="font-bold text-stone-700">{line.ip}</span></span>
            <span><span className="text-stone-400">K</span> <span className="font-bold text-stone-700">{line.k}</span></span>
            <span><span className="text-stone-400">ER</span> <span className="font-bold text-stone-700">{line.er}</span></span>
            <span><span className="text-stone-400">BB</span> <span className="font-bold text-stone-700">{line.bb}</span></span>
            <span><span className="text-stone-400">H</span> <span className="font-bold text-stone-700">{line.h}</span></span>
          </div>

          {/* Best platform pill */}
          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-[9px] tracking-widest uppercase text-stone-400">
              Best on
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold ${PLATFORM_META[top.platform].bg} ${PLATFORM_META[top.platform].accent}`}>
              {top.platform} · {top.points} pts
            </span>
            {range > 5 && (
              <span className="font-mono text-[10px] text-stone-400">
                spread {range.toFixed(1)} pts
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <div className={`text-stone-400 transition-transform mt-1 ${open ? 'rotate-180 text-orange-500' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* ── Expanded — all 5 platforms ───────────────────────── */}
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[800px]' : 'max-h-0'}`}>
        <div className="bg-stone-50 border-t border-stone-100 px-4 sm:px-5 py-4">
          <div className="font-mono text-[8px] tracking-widest uppercase text-stone-400 mb-3">
            Points across platforms
          </div>

          <div className="space-y-3">
            {scores.map((s, i) => {
              const meta = PLATFORM_META[s.platform]
              const isTop = i === 0
              return (
                <div
                  key={s.platform}
                  className={`rounded-md border ${meta.border} ${isTop ? meta.bg : 'bg-white'} px-3 py-2.5`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${meta.color}`} />
                      <span className={`font-serif font-semibold text-sm ${meta.accent}`}>
                        {s.platform}
                      </span>
                      <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider">
                        {s.format === 'dfs' ? 'DFS' : s.format === 'h2h_points' ? 'H2H Points' : 'Roto'}
                      </span>
                    </div>
                    <div className={`font-['Bebas_Neue',sans-serif] text-2xl leading-none ${meta.accent}`}>
                      {s.points}
                    </div>
                  </div>

                  {/* Per-stat contribution breakdown */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-stone-500">
                    {s.breakdown.map((b) => (
                      <span key={b.label} className="whitespace-nowrap">
                        <span className="text-stone-400">{b.label}</span>{' '}
                        <span className={b.contribution >= 0 ? 'text-stone-700' : 'text-red-600'}>
                          {b.contribution >= 0 ? '+' : ''}{b.contribution}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-stone-400 italic mt-3 font-serif">
            Projections based on season averages, opponent quality, and the streamer's Edge signal. Default scoring rules per platform — your league may vary.
          </p>
        </div>
      </div>
    </div>
  )
}
