'use client'

// src/components/admin/story/reel/ReelParts.tsx
//
// Small UI pieces shared by the Postgame and Batter reels (date bar + slide picker), styled the
// same as PitcherReel's.

import type { ReactNode } from 'react'
import type { Segment } from '../types'

export const shiftDay = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function ReelDateBar({ date, setDate, slateDate, label }: { date: string; setDate: (d: string) => void; slateDate: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Game date</span>
      <button onClick={() => setDate(shiftDay(date, -1))} className="rounded border border-stone-300 px-2 py-1 font-mono text-xs" aria-label="Previous day">←</button>
      <input type="date" value={date} onChange={e => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setDate(e.target.value)} className="rounded border border-stone-300 px-2 py-1 font-mono text-xs" aria-label={label} />
      <button onClick={() => setDate(shiftDay(date, 1))} className="rounded border border-stone-300 px-2 py-1 font-mono text-xs" aria-label="Next day">→</button>
      <button onClick={() => setDate(shiftDay(slateDate, -1))} className="rounded-sm border border-stone-300 px-3 py-1 font-mono text-[11px] text-stone-700 hover:bg-stone-100">Yesterday</button>
      {date !== slateDate && <button onClick={() => setDate(slateDate)} className="rounded-sm border border-stone-300 px-3 py-1 font-mono text-[11px] text-stone-500 hover:bg-stone-100">Back to slate</button>}
    </div>
  )
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-2">{children}</div>
}

export function chipClass(active: boolean) {
  return `px-3 py-1.5 rounded-sm text-xs font-mono whitespace-nowrap transition-colors ${active ? 'bg-[#FF5722] text-white font-bold' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'}`
}

export function Msg({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`p-6 text-center font-mono text-xs ${error ? 'text-red-600' : 'text-stone-500'}`}>{children}</div>
}

export function SlidePicker<T extends string>({ list, available, on, segments, toggle, totalS, maxS, notes, unavailable }: {
  list: { id: T; label: string; blurb: string; pinned?: 'first' | 'last' }[]
  available: T[]
  on: T[]
  segments: Segment[]
  toggle: (id: T) => void
  totalS: number
  maxS: number
  notes: string[]
  unavailable: string
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Slides</p>
        <p className={`font-mono text-[11px] ${totalS > maxS ? 'text-red-600 font-bold' : 'text-stone-500'}`}>{totalS.toFixed(1)}s total</p>
      </div>
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {list.map(m => {
          const ready = available.includes(m.id)
          const pinned = !!m.pinned
          const seg = segments.find(s => s.id === m.id)
          return (
            <label key={m.id} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${ready ? 'border-stone-200' : 'border-stone-100 opacity-50'}`}>
              <input type="checkbox" className="mt-1" checked={pinned ? true : on.includes(m.id) && ready} disabled={!ready || pinned} onChange={() => toggle(m.id)} />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-stone-900">{m.label}{seg ? <span className="font-mono text-[10px] font-normal text-stone-500"> · {seg.duration.toFixed(1)}s</span> : null}</span>
                <span className="block text-[11px] text-stone-500 leading-snug">{ready ? m.blurb : unavailable}</span>
              </span>
            </label>
          )
        })}
      </div>
      {notes.length > 0 && <p className="mt-2 font-mono text-[10px] text-stone-400">{notes.join(' · ')}</p>}
    </div>
  )
}
