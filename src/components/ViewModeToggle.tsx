'use client'

export default function ViewModeToggle({
  mode, onChange, offenseLabel = 'Core',
}: {
  mode: 'core' | 'advanced'
  onChange: (m: 'core' | 'advanced') => void
  offenseLabel?: string
}) {
  return (
    <div className="flex gap-1 text-[9px] font-mono uppercase tracking-widest">
      <button
        type="button"
        onClick={() => onChange('core')}
        className={`px-2 py-1 border ${mode === 'core' ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500'}`}
      >
        {offenseLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('advanced')}
        className={`px-2 py-1 border ${mode === 'advanced' ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500'}`}
      >
        Advanced
      </button>
    </div>
  )
}