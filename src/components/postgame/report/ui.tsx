// src/components/postgame/report/ui.tsx — small pieces shared by the Postgame section bodies.

import { CHART_BLUE, CHART_ORANGE } from '@/components/scout/charts/LineChart'
import type { PostgameContext } from './types'

/** away = orange, home = blue — the same pairing the win-probability chart uses. */
export const SIDE_COLOR = { away: CHART_ORANGE, home: CHART_BLUE } as const
export const clubOf = (ctx: PostgameContext, side: 'away' | 'home') => ctx[side]

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">{children}</p>
}
export function Foot({ children }: { children: React.ReactNode }) {
  return <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">{children}</p>
}
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-2">{children}</p>
}
/** a labelled number: big mono value, small caption */
export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
      <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{label}</p>
      <p className="text-[18px] font-mono font-bold text-stone-900 leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[10px] font-mono text-stone-500 mt-0.5">{sub}</p>}
    </div>
  )
}
export const fmtPct = (v: number, d = 0) => `${v.toFixed(d)}%`
export const ordinal = (i: number) => { const v = i % 100; return `${i}${v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[i % 10] ?? 'th'}` }

/** Admin-only: downloads this section's X graphic (1600×900 PNG) from /api/postgame-card. */
export function CardLink({ gamePk, card }: { gamePk: number; card: string }) {
  return (
    <div className="flex justify-end mb-2">
      <a href={`/api/postgame-card/${gamePk}?card=${card}&download=1`} download
        className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 bg-[#1A1A1A] text-[#FAF8F3] border border-[#1A1A1A] hover:bg-[#FF5722] hover:border-[#FF5722] transition">
        ↓ X graphic (PNG)
      </a>
    </div>
  )
}
