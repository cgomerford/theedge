// src/components/team/UsageStrip.tsx
//
// "N game average usage" card, shared by NFL (snap share) and NHL (ice-time
// deployment). Reads METRIC_SPECS for label/unit/window/foot so this component
// never needs to know a new metric's formatting rules -- adding one is a types.ts
// change, not a component change. See src/lib/usage-strip/types.ts for the
// full field-naming rationale.
//
// Server-safe: no hooks, no client JS, plain divs.

import { Card, Foot, Empty, C, SANS, MONO } from './ui'
import { TeamChip, PlayerChip } from './chips'
import { METRIC_SPECS, type UsageStripProps } from '@/lib/usage-strip/types'

function formatValue(value: number | null, kind: 'share' | 'count' | 'seconds'): string {
  if (value == null) return '—'
  if (kind === 'share') return `${Math.round(value * 100)}%`
  if (kind === 'seconds') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  return String(Math.round(value))
}

function formatRaw(raw: number | null, rawUnit: 'snaps' | 'min' | 'shifts' | 's'): string {
  if (raw == null) return '—'
  if (rawUnit === 'min') {
    const m = Math.floor(raw / 60)
    const s = Math.round(raw % 60)
    return `${m}:${String(s).padStart(2, '0')} min`
  }
  if (rawUnit === 's') return `${Math.round(raw)}s`
  return String(Math.round(raw))
}

export function UsageStrip({ team, title, metric, data, limit }: UsageStripProps) {
  const spec = METRIC_SPECS[metric]
  const rows = limit ? data.rows.slice(0, limit) : data.rows
  const windowLabel = `L${spec.windowN}`

  return (
    <Card
      title={team ? undefined : title}
      note={data.throughLabel}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {team && <TeamChip team={{ id: team.id, abbrev: team.nick, color: team.color }} size="sm" />}
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14, color: C.ink }}>{spec.label}</span>
        </div>
        {!data.throughLabel && team && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{windowLabel} average</span>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty>{spec.emptyCopy}</Empty>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'right', color: C.faint, borderBottom: `1px solid ${C.line}` }}>
              <th style={{ padding: '4px 6px', textAlign: 'left' }}>Player</th>
              <th style={{ padding: '4px 6px' }}>Last</th>
              <th style={{ padding: '4px 6px' }}>{windowLabel}</th>
              <th style={{ padding: '4px 6px' }}>Season</th>
              <th style={{ padding: '4px 6px' }}>Raw ({windowLabel})</th>
              <th style={{ padding: '4px 6px' }}>n</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId} style={{ borderBottom: `1px solid ${C.soft}` }}>
                <td style={{ padding: '6px 6px' }}>
                  <PlayerChip player={{ id: row.playerId, name: row.name, position: row.position }} />
                  {row.teamAbbr && (
                    <span style={{ marginLeft: 6, fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{row.teamAbbr}</span>
                  )}
                  {row.trend && (
                    <span style={{ marginLeft: 6, color: row.trend === 'up' ? C.good : C.bad }}>
                      {row.trend === 'up' ? '▲' : '▼'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '6px 6px', textAlign: 'right' }}>{formatValue(row.lastPct, spec.valueKind)}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right' }}>{formatValue(row.l3Pct, spec.valueKind)}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right' }}>{formatValue(row.seasonPct, spec.valueKind)}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right' }}>{formatRaw(row.l3Snaps, spec.rawUnit)}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right', color: C.faint }}>{row.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Foot>{[...spec.foot, data.extraFoot].filter(Boolean).join(' ')}</Foot>
    </Card>
  )
}

export default UsageStrip
