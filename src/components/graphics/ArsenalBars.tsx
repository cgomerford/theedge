// src/components/graphics/ArsenalBars.tsx  (template: arsenal)
import { GT } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import GraphicFrame from './GraphicFrame'
import { byGroup, LABEL, NUM, Panel, PitchTable, specColor, TileStrip } from './parts'

export default function ArsenalBars({ spec, size, images }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }) {
  const portrait = size === 'portrait'
  const pitches = byGroup(spec.stats, 'pitch')
  const ks = byGroup(spec.stats, 'ks')
  const tiles = byGroup(spec.stats, 'tile')
  const top = Math.max(1, ...ks.map(k => k.n ?? 0))
  const cols = spec.columns ?? ['Usage', 'Whiff', 'xwOBA']
  return (
    <GraphicFrame spec={spec} size={size} images={images}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 14 }}>
        <Panel n={1} title={spec.panels?.pitch ?? 'Arsenal'} style={{ flex: portrait ? '1 1 0' : 1.7 }} note={spec.notes?.pitch} portrait={portrait}>
          <PitchTable rows={pitches} columns={cols} portrait={portrait} color={specColor(spec.chips, spec.player)} />
        </Panel>
        {ks.length > 0 && (
          <Panel n={2} title={spec.panels?.ks ?? 'Strikeouts by pitch'} style={{ flex: 1 }} note={spec.notes?.ks} portrait={portrait}>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {ks.map((k, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ ...LABEL, fontSize: 16, minWidth: 0 }}>{k.label}</span>
                    <span style={{ ...NUM, fontSize: 36, lineHeight: 1 }}>{k.value}</span>
                  </div>
                  <div style={{ height: 12, borderRadius: 6, background: GT.panel, marginTop: 4 }}><div style={{ height: '100%', borderRadius: 6, width: `${((k.n ?? 0) / top) * 100}%`, background: GT.accent }} /></div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
      <TileStrip tiles={tiles} portrait={portrait} />
    </GraphicFrame>
  )
}
