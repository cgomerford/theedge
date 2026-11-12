'use client'

// src/components/player-page/CareerTableClient.tsx
//
// The player page's Career table with a club logo on every row. A season in which he changed clubs at one level is one row (the season total, with the logos of each club side by side) that opens to
// show a row per club; a season with one club shows that club's logo and name. Rows arrive already grouped from CareerTable (server), as plain data.
import { useState } from 'react'
import { teamLogoUrl } from '@/lib/mlb-assets'

export type CareerTeam = { id: number | null; name: string }
export type CareerLine = { key: string; season: string; level: string; teams: CareerTeam[]; cells: string[]; kids: CareerLine[] }

const LINE = '#e7e2d8', MUTE = '#8a8275'

function Logos({ teams }: { teams: CareerTeam[] }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center' }}>{teams.map((t, i) => t.id == null ? null : (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={`${t.id}-${i}`} src={teamLogoUrl(t.id)} alt="" width={22} height={22} loading="lazy" style={{ width: 22, height: 22, objectFit: 'contain', marginLeft: i ? -5 : 0, background: '#fff', borderRadius: 11 }} />
  ))}</span>
}

export default function CareerTableClient({ head, lines }: { head: string[]; lines: CareerLine[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const td = (i: number): React.CSSProperties => ({ padding: '6px 8px', textAlign: i <= 1 ? 'left' : 'right', whiteSpace: 'nowrap' })
  const row = (l: CareerLine, kid: boolean) => {
    const many = l.kids.length > 0
    const label = many ? `${l.teams.length} teams` : l.teams[0]?.name ?? ''
    return (
      <tr key={l.key} style={{ borderTop: `1px solid ${LINE}`, background: kid ? '#FAF8F3' : undefined }}>
        <td style={{ ...td(0), fontWeight: kid ? 400 : 800, color: kid ? MUTE : undefined }}>{kid ? '' : l.season}</td>
        <td style={td(1)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingLeft: kid ? 16 : 0 }}>
            {many
              ? <button type="button" aria-expanded={!!open[l.key]} aria-label={`${open[l.key] ? 'Hide' : 'Show'} the ${l.teams.length} clubs in ${l.season}`} onClick={() => setOpen(o => ({ ...o, [l.key]: !o[l.key] }))} style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: '#FF5722', fontWeight: 800, padding: 0, width: 14 }}>{open[l.key] ? '▾' : '▸'}</button>
              : kid ? null : <span style={{ width: 14 }} />}
            <Logos teams={l.teams} />
            <span><b style={{ fontWeight: 800 }}>{l.level}</b> · {label}</span>
          </span>
        </td>
        {l.cells.map((c, i) => <td key={i} style={td(i + 2)}>{c}</td>)}
      </tr>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr style={{ color: MUTE, fontSize: 12 }}>{head.map((h, i) => <th key={h} style={{ ...td(i), padding: '6px 8px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
        <tbody>{lines.flatMap(l => [row(l, false), ...(open[l.key] ? l.kids.map(k => row(k, true)) : [])])}</tbody>
      </table>
    </div>
  )
}
