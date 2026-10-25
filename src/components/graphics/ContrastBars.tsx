// src/components/graphics/ContrastBars.tsx  (template: contrast)
import { GT } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import GraphicFrame from './GraphicFrame'
import { byGroup, LABEL, NUM, Panel, PitchTable, specColor, TileStrip } from './parts'

export default function ContrastBars({ spec, size, images }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }) {
  const portrait = size === 'portrait'
  const rows = byGroup(spec.stats, 'contrast')
  const pitches = byGroup(spec.stats, 'pitch')
  const tiles = byGroup(spec.stats, 'tile')
  // Each row has its own scale (rows are different units); 10% headroom keeps the longest bar off the edge.
  const scaleOf = (r: { n?: number; vs?: { n: number } }) => (Math.max(r.n ?? 0, r.vs?.n ?? 0) || 1) * 1.1
  const cols = spec.columns ?? ['Usage', 'Whiff', 'xwOBA']
  // Type and gaps shrink as rows are added so extra content still fits the panel.
  const d = Math.max(0.65, Math.min(1, 3 / Math.max(rows.length, 1)))
  const bar = (label: string, value: string, n: number, scale: number, color: string, big: boolean) => (
    <div style={{ display: 'grid', gridTemplateColumns: '118px minmax(0,1fr) 100px', alignItems: 'center', gap: 12, marginTop: 3 }}>
      <span style={{ ...LABEL, fontSize: 14, color: big ? GT.accent : GT.muted }}>{label}</span>
      <div style={{ height: 12 * d + 2, borderRadius: 8, background: GT.panel }}><div style={{ height: '100%', borderRadius: 8, width: `${Math.min(100, (n / scale) * 100)}%`, background: color }} /></div>
      <span style={{ ...NUM, textAlign: 'right', fontSize: (big ? (portrait ? 30 : 26) : portrait ? 24 : 21) * d, color: big ? GT.ink : GT.muted, fontWeight: big ? 800 : 500, lineHeight: 1.1 }}>{value}</span>
    </div>
  )
  return (
    <GraphicFrame spec={spec} size={size} images={images}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 14 }}>
        <Panel n={1} title={spec.panels?.contrast ?? 'October vs season'} style={{ flex: 1 }} note={spec.notes?.contrast} portrait={portrait}>
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: (portrait ? 18 : 8) * d }}>
            {rows.map((r, i) => (
              <div key={i}>
                <div style={{ ...LABEL, fontSize: 15, lineHeight: 1.1 }}>{r.label}</div>
                {bar(r.sub ?? 'October', r.value ?? '', r.n ?? 0, scaleOf(r), GT.accent, true)}
                {r.vs && bar(r.vs.label, r.vs.value, r.vs.n, scaleOf(r), specColor(spec.chips, spec.player), false)}
              </div>
            ))}
          </div>
        </Panel>
        {pitches.length > 0 && (
          <Panel n={2} title={spec.panels?.pitch ?? 'Arsenal'} style={{ flex: 1 }} note={spec.notes?.pitch} portrait={portrait}>
            <PitchTable rows={pitches} columns={cols} portrait={portrait} color={specColor(spec.chips, spec.player)} />
          </Panel>
        )}
      </div>
      <TileStrip tiles={tiles} portrait={portrait} />
    </GraphicFrame>
  )
}
