'use client'

import { LEVELS, type LevelKey, type LevelStatLine } from '@/lib/player-levels'

export default function LevelSelector({
  available, activeLevel, onSelect,
}: {
  available: Partial<Record<LevelKey, LevelStatLine>>
  activeLevel: LevelKey
  onSelect: (level: LevelKey) => void
}) {
  const presentLevels = LEVELS.filter(l => available[l.key])
  if (presentLevels.length <= 1) return null // nothing to toggle if only one level has data

  return (
    <div className="flex gap-1 bg-stone-100 p-1 rounded-full w-fit mb-4">
      {presentLevels.map(l => {
        const line = available[l.key]!
        return (
          <button
            key={l.key}
            onClick={() => onSelect(l.key)}
            title={`${line.teamName} · ${line.gamesPlayed} G`}
            className={`px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest rounded-full transition ${
              activeLevel === l.key ? 'bg-[#1A1A1A] text-[#FAF8F3]' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            {l.label}
          </button>
        )
      })}
    </div>
  )
}