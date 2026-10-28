'use client'

// src/components/graphics/otd/OtdBodyView.tsx
//
// Lays an OtdBody out inside the shell: one full-width section, several side by side with set width ratios (landscape) or stacked (portrait),
// with an optional tile row under them, or tiles only. Section numbers are assigned here from the position, zero-padded by OtdSection.

import type { OtdBody, OtdSectionData } from '@/lib/graphics/otd-types'
import type { OtdSize } from '@/lib/graphics/otd-export'
import type { FitInfo } from './FitLine'
import { OtdSection, OtdTileRow } from './parts'
import { GamesBody, HBarsBody, KvBody, LinescoreBody, SlashBody, TimelineBody, TradeBody, VBarsBody } from './sections'

export function SectionBody({ s, portrait }: { s: OtdSectionData; portrait: boolean }) {
  switch (s.type) {
    case 'kv': return <KvBody rows={s.rows} portrait={portrait} />
    case 'linescore': return <LinescoreBody innings={s.innings} highlight={s.highlight} rows={s.rows} portrait={portrait} />
    case 'timeline': return <TimelineBody points={s.points} portrait={portrait} />
    case 'vbars': return <VBarsBody bars={s.bars} marker={s.marker} note={s.note} max={s.max} portrait={portrait} />
    case 'hbars': return <HBarsBody rows={s.rows} max={s.max} portrait={portrait} />
    case 'games': return <GamesBody games={s.games} portrait={portrait} />
    case 'trade': return <TradeBody groups={s.groups} note={s.note} portrait={portrait} />
    case 'slash': return <SlashBody line={s.line} caption={s.caption} detail={s.detail} portrait={portrait} />
  }
}

export default function OtdBodyView({ body, size, onTileFit }: { body: OtdBody; size: OtdSize; onTileFit?: (i: number, f: FitInfo) => void }) {
  const portrait = size === 'portrait'
  const sections = body.sections
  const tiles = body.tiles ?? []
  return (
    <>
      {sections.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 12 }}>
          {sections.map((s, i) => (
            <OtdSection key={i} n={i + 1} label={s.label} portrait={portrait} style={{ flex: portrait ? 1 : `${body.widths?.[i] ?? 1} 1 0`, minHeight: 0 }}>
              <SectionBody s={s} portrait={portrait} />
            </OtdSection>
          ))}
        </div>
      )}
      {tiles.length > 0 && <OtdTileRow tiles={tiles} portrait={portrait} onFit={onTileFit} />}
    </>
  )
}
