// src/components/graphics/TextListCard.tsx  (template: textlist)
import { GT } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import GraphicFrame from './GraphicFrame'
import { NUM, Panel } from './parts'

export default function TextListCard({ spec, size, images }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }) {
  const portrait = size === 'portrait'
  const n = spec.stats.length
  // Type shrinks as the list grows so more items fit without clipping.
  const head = (portrait ? 34 : 28) - Math.max(0, n - 5) * 2
  const body = (portrait ? 25 : 20) - Math.max(0, n - 5)
  return (
    <GraphicFrame spec={spec} size={size} images={images}>
      <Panel n={1} title={spec.panels?.item ?? `${n} triggers`} style={{ flex: 1 }} note={spec.notes?.item} portrait={portrait}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '6px 22px 2px' }}>
          {spec.stats.map((s, i) => (
            <div key={i} style={{ flex: '1 1 0', minHeight: 0, display: 'flex', alignItems: 'flex-start', gap: 18, padding: '10px 0', borderBottom: i < n - 1 ? `1px solid ${GT.panel}` : undefined, overflow: 'hidden' }}>
              <span style={{ ...NUM, flex: '0 0 auto', width: portrait ? 62 : 52, height: portrait ? 62 : 52, background: GT.ink, color: GT.paper, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: portrait ? 34 : 29 }}>{s.value}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: Math.max(head, 18), lineHeight: 1.12, letterSpacing: '-.01em' }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: Math.max(body, 15), lineHeight: 1.25, color: '#5b5347', marginTop: 3 }}>{s.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </GraphicFrame>
  )
}
