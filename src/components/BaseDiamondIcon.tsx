// src/components/BaseDiamondIcon.tsx
'use client'

import type { BaseState } from '@/lib/postgame'

// Tiny inline diamond icon — 3 dots for 1st/2nd/3rd, filled when occupied.
export default function BaseDiamondIcon({ bases }: { bases: BaseState }) {
  const dot = (filled: boolean) =>
    filled ? 'bg-orange-500' : 'bg-stone-200'

  return (
    <div className="relative w-4 h-4 shrink-0" title={
      [bases.first && '1st', bases.second && '2nd', bases.third && '3rd'].filter(Boolean).join(', ') || 'Bases empty'
    }>
      {/* 2nd base — top */}
      <span className={`absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dot(bases.second)}`} />
      {/* 1st base — right */}
      <span className={`absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${dot(bases.first)}`} />
      {/* 3rd base — left */}
      <span className={`absolute top-1/2 left-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${dot(bases.third)}`} />
    </div>
  )
}