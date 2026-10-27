'use client'

// src/components/scout/lab/LineupDesk.tsx
//
// Scout Report → Lineups (was §10 Lineup vs SP deep). Choose a lineup, then any hitter in it, and see tonight's opposing starter against him:
// where the starter throws by count next to where that hitter has the least to show, with the hitter's numbers taken only against pitches
// that look like the starter's (speed, spin and break). It is the Pitching Lab's Hot Zone Overlay with the lineup one click away.

import { useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import OverlayExplorer from '@/components/pitching-lab/OverlayExplorer'
import { Pills } from '@/components/pitching-lab/LocationExplorer'

export type LineupSide = { label: string; pitcher: { id: number; name: string } | null; lineup: { id: number; name: string; order: number }[]; source: string }

const SOURCE: Record<string, string> = { confirmed: 'confirmed lineup', projected_from_previous_game: 'taken from the last game', unavailable: 'lineup not available' }

export default function LineupDesk({ sides }: { sides: LineupSide[] }) {
  const [i, setI] = useState(0)
  const s = sides[i]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
      <Pills items={sides.map((x, k) => [String(k), x.label] as [string, string])} value={String(i)} onChange={v => setI(Number(v))} />
      {!s.pitcher ? <p style={{ fontSize: 14, color: C.mute }}>The opposing starter has not been announced yet.</p> : (
        <OverlayExplorer key={`${i}-${s.pitcher.id}`} id={s.pitcher.id} role="pitcher" lineup={s.lineup} lineupLabel={`${s.label}, ${SOURCE[s.source] ?? s.source}`} />
      )}
    </div>
  )
}
