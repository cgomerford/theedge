'use client'

import Tabs from '@/components/ui/Tabs'
import { Suspense } from 'react'
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
    <div className="mb-4">
      <Suspense fallback={null}>
        <Tabs
          sticky={false}
          label="Level"
          value={activeLevel}
          onChange={id => onSelect(id as LevelKey)}
          tabs={presentLevels.map(l => ({ id: l.key, label: l.label }))}
        />
      </Suspense>
    </div>
  )
}