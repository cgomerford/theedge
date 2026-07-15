'use client'

import { useState } from 'react'
import ChartBuilderModal from './ChartBuilderModal'

type ChartCategory = { key: string; label: string; description: string }

const BATTER_CATEGORIES: ChartCategory[] = [
  { key: 'rate', label: 'Rate stats', description: 'AVG, OBP, SLG, OPS — rolling window' },
  { key: 'power', label: 'Power', description: 'HR/G, ISO-style extra-base rate' },
  { key: 'discipline', label: 'Discipline', description: 'BB/G, K/G' },
]

const PITCHER_CATEGORIES: ChartCategory[] = [
  { key: 'rate', label: 'Rate stats', description: 'ERA, WHIP — rolling window' },
  { key: 'strikeouts', label: 'Strikeouts', description: 'K/9, BB/9' },
]

export default function ChartLabRail({ playerId, isPitcher }: { playerId: number; isPitcher: boolean }) {
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const categories = isPitcher ? PITCHER_CATEGORIES : BATTER_CATEGORIES

  return (
    <>
      <div className="sticky top-6 bg-white border border-stone-200 rounded-xl p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">
          ⊕ Chart Lab
        </div>
        <p className="text-[10px] font-serif italic text-stone-400 mb-4">
          Pick a category to build and save a custom chart.
        </p>

        <div className="space-y-2">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setOpenCategory(cat.key)}
              className="w-full text-left bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-900 rounded-lg px-3.5 py-3 transition-colors group"
            >
              <div className="font-mono text-[11px] uppercase tracking-widest text-stone-900 group-hover:text-[#FF5722] transition-colors">
                {cat.label} →
              </div>
              <div className="text-[10px] font-serif italic text-stone-400 mt-0.5">
                {cat.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {openCategory && (
        <ChartBuilderModal
          playerId={playerId}
          isPitcher={isPitcher}
          category={openCategory}
          onClose={() => setOpenCategory(null)}
        />
      )}
    </>
  )
}