// src/components/graphics/ScoreboardCard.tsx  (template: scoreboard)
import { GT } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import GraphicFrame from './GraphicFrame'
import { teamColor } from '@/lib/graphics/teams'
import { Avatar, byGroup, density, LABEL, NUM, Panel, TeamChip } from './parts'

export default function ScoreboardCard({ spec, size, images }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }) {
  const portrait = size === 'portrait'
  const catchers = byGroup(spec.stats, 'catcher')
  const run = byGroup(spec.stats, 'run')
  const abs = byGroup(spec.stats, 'abs')
  const dr = density(run.length, 8)
  const da = density(abs.length, 4)
  return (
    <GraphicFrame spec={spec} size={size} images={images}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 14 }}>
        <Panel n={1} title={spec.panels?.catcher ?? 'Catchers'} style={{ flex: portrait ? '0 0 auto' : '0 0 27%' }} note={spec.notes?.catcher} portrait={portrait}>
          <div style={{ display: portrait ? 'grid' : 'flex', gridTemplateColumns: '1fr 1fr', flexDirection: 'column', flex: 1, gap: 10, padding: 12 }}>
            {catchers.map((c, i) => (
              <div key={i} style={{ background: GT.panel, borderRadius: 10, padding: '12px 14px', flex: 1, minHeight: 0, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {c.playerId && <Avatar playerId={c.playerId} images={images} size={portrait ? 60 : 52} ring={c.team && c.team !== 'neutral' ? teamColor(c.team) : '#12295A'} />}
                    <span style={{ ...LABEL, fontSize: 17, fontWeight: 800 }}>{c.label}</span>
                  </span>
                  {c.team && <TeamChip chip={{ text: c.team, team: c.team }} size={13} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ ...NUM, fontSize: portrait ? 60 : 54, lineHeight: 1.05 }}>{c.value}</span>
                  <span style={{ ...LABEL, fontSize: 12, color: GT.muted, lineHeight: 1.2 }}>Caught<br />stealing</span>
                </div>
                <div style={{ fontSize: 15, color: GT.muted }}>{c.sub}</div>
                {c.cells && <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>{c.cells[0]} <span style={{ ...NUM, color: GT.accent }}>{c.cells[1]}</span></div>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel n={2} title={spec.panels?.run ?? 'Running game'} style={{ flex: 1.45 }} note={spec.notes?.run} portrait={portrait}>
          <div style={{ padding: '6px 20px', display: 'flex', flexDirection: 'column' }}>
            {run.map((r, i) => {
              const lead = i === 0 && !!r.sub
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: `${(lead ? 8 : portrait ? 9 : 6) * dr}px 0`, borderBottom: `1px solid ${GT.panel}`, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {r.team && <TeamChip chip={{ text: r.team, team: r.team }} size={13} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: (lead ? 24 : 22) * dr, lineHeight: 1.1 }}>{r.label}</div>
                      {lead && <div style={{ ...LABEL, fontSize: 12, color: GT.accent }}>{r.sub}</div>}
                    </div>
                  </div>
                  <span style={{ ...NUM, fontWeight: lead ? 800 : 600, fontSize: (lead ? 34 : 24) * dr, lineHeight: 1.1, color: lead ? GT.accent : GT.ink }}>{r.value}</span>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel n={3} title={spec.panels?.abs ?? 'Strike zone challenges won'} style={{ flex: 1.05 }} note={spec.notes?.abs} portrait={portrait}>
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 14 * da }}>
            {abs.map((a, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {a.team && <TeamChip chip={{ text: a.team, team: a.team }} size={12} />}
                    <span style={{ fontWeight: 800, fontSize: 21 * da, lineHeight: 1.1 }}>{a.label}</span>
                  </span>
                  <span style={{ ...NUM, fontSize: 21 * da, lineHeight: 1.1, fontWeight: 500 }}>{a.value} <span style={{ color: GT.accent, fontWeight: 800, fontSize: 18 }}>{a.sub}</span></span>
                </div>
                <div style={{ height: 10, borderRadius: 6, background: GT.panel, marginTop: 6 }}><div style={{ height: '100%', borderRadius: 6, width: `${a.n ?? 0}%`, background: GT.accent }} /></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </GraphicFrame>
  )
}
