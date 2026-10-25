// src/components/graphics/StatCollisionCard.tsx  (template: collision)
import { GT } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import GraphicFrame from './GraphicFrame'
import { teamColor } from '@/lib/graphics/teams'
import { Avatar, byGroup, LABEL, NUM, Panel, TeamLogo, TileStrip } from './parts'

export default function StatCollisionCard({ spec, size, images }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }) {
  const portrait = size === 'portrait'
  const heroes = byGroup(spec.stats, 'hero')
  const tiles = byGroup(spec.stats, 'tile')
  const many = heroes.length > 2
  return (
    <GraphicFrame spec={spec} size={size} images={images}>
      <Panel n={1} title={spec.panels?.hero ?? 'Head to head'} hint="season to date" style={{ flex: 1 }} note={spec.notes?.hero} portrait={portrait}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', flexWrap: many ? 'wrap' : 'nowrap', alignItems: 'stretch', gap: 10, padding: '16px 20px' }}>
          {heroes.map((h, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {i > 0 && !many && <div style={{ alignSelf: 'center', ...LABEL, textTransform: 'lowercase', fontSize: 24, fontWeight: 700, color: GT.muted, flexShrink: 0, textAlign: 'center' }}>vs</div>}
              <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, background: GT.panel, borderRadius: 14, padding: portrait ? '24px 26px' : '16px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
                {((h.team && h.team !== 'neutral') || h.playerId) && (
                  <div style={{ position: 'absolute', top: 14, right: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
                    {h.team && h.team !== 'neutral' && <TeamLogo abbr={h.team} images={images} h={portrait ? 46 : 38} />}
                    {h.playerId && <Avatar playerId={h.playerId} images={images} size={portrait ? 104 : 84} ring={h.team && h.team !== 'neutral' ? teamColor(h.team) : '#12295A'} />}
                  </div>
                )}
                <div style={{ ...LABEL, fontSize: portrait ? 22 : 17, lineHeight: 1.2, paddingRight: h.playerId ? (portrait ? 190 : 170) : 64 }}>{h.label}</div>
                <div style={{ ...NUM, fontSize: (h.value?.length ?? 0) > 7 ? (portrait ? 104 : 84) : portrait ? 160 : 124, lineHeight: 1, letterSpacing: '-.03em' }}>{h.value}</div>
                <div style={{ ...LABEL, fontSize: portrait ? 22 : 18, color: GT.accent, fontWeight: 700, minHeight: 24 }}>{h.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <TileStrip tiles={tiles} portrait={portrait} inset />
      </Panel>
    </GraphicFrame>
  )
}
