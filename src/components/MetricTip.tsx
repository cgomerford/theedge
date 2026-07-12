'use client'

import { useState, useRef, useEffect } from 'react'

export type StatTooltip = string | {
  description: string
  howToRead?: string
  formula?: string
  related?: string[]
}

export default function MetricTip({ tip, children }: { tip: StatTooltip; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const rich = typeof tip !== 'string'

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="underline decoration-dotted decoration-stone-400 underline-offset-2 hover:text-stone-900"
      >
        {children}
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-2 w-72 bg-[#1A1A1A] text-[#FAF8F3] p-4 rounded-lg shadow-xl normal-case">
          <div className="font-serif font-bold text-sm mb-2 tracking-normal">{children}</div>
          <p className="text-xs text-stone-300 leading-relaxed font-sans tracking-normal mb-3">
            {rich ? (tip as { description: string }).description : tip}
          </p>
          {rich && (tip as any).howToRead && (
            <div className="bg-white/5 rounded-md p-3 mb-3">
              <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FDE047] mb-1">How to read it</div>
              <p className="text-xs text-stone-300 leading-relaxed font-sans">{(tip as any).howToRead}</p>
            </div>
          )}
          {rich && (tip as any).formula && (
            <div className="mb-3">
              <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#60A5FA] mb-1">Formula</div>
              <code className="text-[10px] font-mono text-stone-300 block">{(tip as any).formula}</code>
            </div>
          )}
          {rich && (tip as any).related?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(tip as any).related.map((r: string) => (
                <span key={r} className="text-[9px] font-mono uppercase tracking-wider bg-white/10 px-2 py-1 rounded-full text-stone-300">{r}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  )
}