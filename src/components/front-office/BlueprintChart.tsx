// Roster Blueprint chart: one stacked bar per club, segments = share of the
// club's positive WAR by how the player was acquired. Server-rendered, plain
// divs (no client JS) so it is also what the PNG export captures.

import Link from 'next/link'
import { C, MONO, SANS } from '@/components/team/ui'
import { ACQ_COLOR, ACQ_LABEL, ACQ_TYPES, type AcqKey, type BlueprintTeam } from '@/lib/front-office/blueprint'
import { MLB_TEAMS } from '@/lib/teams'

const TEAM = new Map(MLB_TEAMS.map(t => [t.id, t]))
const ORDER: AcqKey[] = [...ACQ_TYPES, 'unclassified']

export function Legend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 14 }}>
      {ORDER.map(k => (
        <span key={k} style={{ fontFamily: SANS, fontSize: 11.5, color: '#5b5347', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: ACQ_COLOR[k], display: 'inline-block', border: k === 'unclassified' ? `1px solid ${C.line}` : 0 }} />{ACQ_LABEL[k]}
        </span>
      ))}
    </div>
  )
}

export default function BlueprintChart({ rows, selectedTeamId, hrefFor }: { rows: BlueprintTeam[]; selectedTeamId?: number | null; hrefFor: (teamId: number) => string }) {
  return (
    <div>
      {rows.map(r => {
        const team = TEAM.get(r.teamId)
        if (!team || r.totalWar <= 0) return null
        return (
          <Link key={r.teamId} href={hrefFor(r.teamId)} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 70px', alignItems: 'center', gap: 12, padding: '5px 8px', margin: '0 -8px', borderRadius: 8, textDecoration: 'none', background: selectedTeamId === r.teamId ? C.soft : 'transparent' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {/* colour chip, not a logo image: cross-origin images can break the PNG export */}
              <span style={{ width: 30, height: 20, borderRadius: 5, background: team.primary_color, color: team.text_on_primary, fontFamily: MONO, fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{team.abbrev}</span>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.short}</span>
            </span>
            <span style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: C.soft }}>
              {ORDER.map(k => r.war[k] > 0 && (
                <span key={k} title={`${ACQ_LABEL[k]}: ${r.war[k].toFixed(1)} WAR, ${r.counts[k]} players`} style={{ width: `${(r.war[k] / r.totalWar) * 100}%`, background: ACQ_COLOR[k] }} />
              ))}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.mute, textAlign: 'right' }}>{r.totalWar.toFixed(0)} WAR</span>
          </Link>
        )
      })}
    </div>
  )
}
