'use client'

// src/components/postgame/report/TipLayer.tsx
//
// A hover card for server-rendered SVG charts. Each hoverable mark carries data-tip="<index>"; this wraps
// the chart, finds the mark under the pointer and shows the matching Tip beside the cursor: who pitched,
// who batted, the inning, outs and count, the runners on a small diamond, mph and pitch type, and the result.
// Works on touch too (tap a mark). The tips array is plain JSON handed down from the server component.

import { useRef, useState } from 'react'
import type { Tip } from '@/lib/postgame/tip'

export function BasesDiamond({ bases, size = 46 }: { bases: [boolean, boolean, boolean]; size?: number }) {
  // 1B right, 2B top, 3B left, home at the bottom
  const base = (cx: number, cy: number, on: boolean) => <rect x={cx - 8} y={cy - 8} width={16} height={16} transform={`rotate(45 ${cx} ${cy})`} fill={on ? '#FF5722' : '#fff'} stroke={on ? '#1A1A1A' : '#a8a29e'} strokeWidth={1.6} />
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={`Runners on: ${[bases[0] && 'first', bases[1] && 'second', bases[2] && 'third'].filter(Boolean).join(', ') || 'none'}`}>
      <path d="M40 66 L66 40 L40 14 L14 40 Z" fill="#f5f5f4" stroke="#d6d3d1" />
      {base(66, 40, bases[0])}{base(40, 14, bases[1])}{base(14, 40, bases[2])}
      <path d="M40 60 l7 7 l-7 6 l-7 -6 z" fill="#fff" stroke="#78716c" strokeWidth={1.4} />
    </svg>
  )
}

export default function TipLayer({ tips, children }: { tips: Tip[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ i: number; x: number; y: number; w: number } | null>(null)

  function onMove(e: React.PointerEvent) {
    const el = (e.target as Element).closest('[data-tip]')
    const box = ref.current?.getBoundingClientRect()
    if (!el || !box) { setAt(null); return }
    setAt({ i: Number(el.getAttribute('data-tip')), x: e.clientX - box.left, y: e.clientY - box.top, w: box.width })
  }
  const tip = at ? tips[at.i] : null
  const flip = at != null && at.x > at.w * 0.55           // near the right edge, open the card to the left of the cursor

  return (
    <div ref={ref} className="relative" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setAt(null)}>
      {children}
      {tip && at && (
        <div role="tooltip" className="pointer-events-none absolute z-20 w-[228px] border border-stone-900 bg-[#FAF8F3] shadow-lg p-2.5"
          style={{ top: Math.max(0, at.y - 12), left: flip ? at.x - 240 : at.x + 14 }}>
          <div className="flex items-start gap-2.5">
            <BasesDiamond bases={tip.bases} />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-mono uppercase tracking-wider text-orange-600 font-bold">{tip.when} · {tip.outs} out · {tip.count}</p>
              <p className="text-[11.5px] font-sans text-stone-900 leading-tight mt-0.5"><span className="font-mono text-[9px] text-stone-400">P </span><b>{tip.pitcher}</b></p>
              <p className="text-[11.5px] font-sans text-stone-900 leading-tight"><span className="font-mono text-[9px] text-stone-400">B </span><b>{tip.batter}</b></p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-stone-300">
            <p className="text-[11px] font-mono text-stone-800">{tip.pitch}{tip.velo != null ? ` · ${tip.velo.toFixed(1)} mph` : ''}</p>
            <p className="text-[12px] font-sans font-bold text-stone-900 mt-0.5">{tip.result}</p>
            {tip.detail && <p className="text-[10.5px] font-mono text-stone-600 mt-0.5">{tip.detail}</p>}
            {tip.flag && <p className="text-[10.5px] font-mono font-bold text-orange-600 mt-1 leading-snug">{tip.flag}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
