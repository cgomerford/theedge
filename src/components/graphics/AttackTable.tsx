// src/components/graphics/AttackTable.tsx  (template: attack)
import { SANS } from '@/components/team/ui'
import { GT } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey, Stat } from '@/lib/graphics/types'
import GraphicFrame from './GraphicFrame'
import { byGroup, density, Dot, LABEL, NUM, Panel, TileStrip } from './parts'

function HitterTable({ rows, columns, portrait, d }: { rows: Stat[]; columns: string[]; portrait: boolean; d: number }) {
  const grid = `1.25fr 1.3fr ${columns.slice(1).map(() => '.9fr').join(' ')}`
  return (
    <div style={{ padding: portrait ? '12px 20px' : '8px 18px' }}>
      <div style={{ ...LABEL, fontSize: 12, color: GT.muted, display: 'grid', gridTemplateColumns: grid, gap: 6, paddingBottom: 6, borderBottom: '1px solid #e7e2d8' }}>
        <span>Hitter</span><span>{columns[0] ?? 'Pitch'}</span>{columns.slice(1).map(c => <span key={c} style={{ textAlign: 'right' }}>{c}</span>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, gap: 6, alignItems: 'center', padding: `${(portrait ? 8 : 4) * d}px 0`, lineHeight: 1.1, borderBottom: `1px solid ${GT.panel}` }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: (portrait ? 26 : 23) * d, lineHeight: 1.25, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <span style={{ fontFamily: SANS, fontSize: 18 * d, lineHeight: 1.25, color: GT.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cells?.[0]}</span>
          {columns.slice(1).map((_, ci) => { const v = r.cells?.[ci + 1]; return <span key={ci} style={{ ...NUM, textAlign: 'right', fontSize: (portrait ? 26 : 23) * d }}>{v ? v : <Dot />}</span> })}
        </div>
      ))}
    </div>
  )
}

export default function AttackTable({ spec, size, images }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }) {
  const portrait = size === 'portrait'
  const cols = spec.columns ?? ['Pitch', 'xwOBA', 'Whiff']
  // Two tables, one per real team chip (first two); falls back to the TB / MIL groups the Game 1 preset uses.
  const teams = spec.chips.filter(c => c.team !== 'neutral').slice(0, 2).map(c => c.team)
  const groups = teams.length === 2 ? teams : ['TB', 'MIL']
  const d = density(Math.max(...groups.map(g => byGroup(spec.stats, g).length)), portrait ? 5.5 : 6)
  return (
    <GraphicFrame spec={spec} size={size} images={images}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 14 }}>
        {groups.map((g, i) => (
          <Panel key={g} n={i + 1} title={spec.panels?.[g] ?? `${g} hitters`} style={{ flex: 1 }} note={spec.notes?.[g]} portrait={portrait}>
            <HitterTable rows={byGroup(spec.stats, g)} columns={cols} portrait={portrait} d={d} />
          </Panel>
        ))}
      </div>
      <TileStrip tiles={byGroup(spec.stats, 'oaa')} portrait={portrait} />
    </GraphicFrame>
  )
}
