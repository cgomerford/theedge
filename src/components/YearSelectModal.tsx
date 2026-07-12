'use client'

import { useState } from 'react'

export type YearSelection = { mode: 'single' | 'multi' | 'career'; years: number[] }

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - i)

export default function YearSelectModal({
  initial, onConfirm, onClose,
}: {
  initial: YearSelection
  onConfirm: (sel: YearSelection) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'single' | 'multi' | 'career'>(initial.mode)
  const [picked, setPicked] = useState<number[]>(initial.years)

  function toggleYear(y: number) {
    if (tab === 'single') { setPicked([y]); return }
    setPicked(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y])
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="font-serif font-bold text-lg">Select year</span>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-900">✕</button>
        </div>

        <div className="flex border-b border-stone-200 mb-4 text-[10px] font-mono uppercase tracking-widest">
          {(['single', 'multi', 'career'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 border-b-2 ${tab === t ? 'border-[#FF5722] text-[#1A1A1A]' : 'border-transparent text-stone-400'}`}
            >
              {t === 'single' ? 'Single year' : t === 'multi' ? 'Multiple years' : 'Career'}
            </button>
          ))}
        </div>

        {tab === 'career' ? (
          <p className="font-serif italic text-stone-500 text-sm mb-4">Full career totals, every season on record.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {YEARS.map(y => (
              <button
                key={y}
                type="button"
                onClick={() => toggleYear(y)}
                className={`py-2 text-sm font-mono border ${picked.includes(y) ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 hover:border-stone-900'}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setPicked([])} className="text-[10px] font-mono uppercase tracking-widest text-stone-400 px-3 py-2">Clear</button>
          <button
            type="button"
            onClick={() => onConfirm({ mode: tab, years: tab === 'career' ? [] : picked })}
            disabled={tab !== 'career' && picked.length === 0}
            className="text-[10px] font-mono uppercase tracking-widest bg-[#FF5722] text-white px-4 py-2 disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}