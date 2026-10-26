'use client'

// A sortable leaderboard table: rank, player (headshot, name, team chip), n, then the stat columns. Pinned player column; client-side sort.
// "Qualified only" (when the board has a qualification rule) filters the same rows without a reload.
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Headshot } from '@/components/home/Logo'
import TeamChip from '@/components/ui/TeamChip'

type Row = { id: number; name: string; team: string; n: number; qualified: boolean; v: Record<string, number | null> }
type Col = { key: string; label: string; digits?: number; pct?: boolean; lead?: boolean; asc?: boolean }

const fmt = (v: number | null, c: Col) => (v == null ? '' : c.digits === 3 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(c.digits ?? 0)) + (v != null && c.pct ? '%' : '')

export default function LeaderboardTable({ rows, cols, nLabel, nDigits = 0, sortKey, sortAsc, canFilter, minText }: {
  rows: Row[]; cols: Col[]; nLabel: string; nDigits?: number; sortKey: string; sortAsc: boolean; canFilter: boolean; minText: string | null
}) {
  const [key, setKey] = useState(sortKey)
  const [asc, setAsc] = useState(sortAsc)
  const [qual, setQual] = useState(true)
  const [shown, setShown] = useState(50)
  const sorted = useMemo(() => {
    const base = canFilter && qual ? rows.filter(r => r.qualified) : rows
    const val = (r: Row) => (key === '__n' ? r.n : r.v[key])
    return [...base].sort((a, b) => {
      const x = val(a), y = val(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return asc ? x - y : y - x
    })
  }, [rows, key, asc, qual, canFilter])
  const click = (k: string, defAsc: boolean) => { if (k === key) setAsc(a => !a); else { setKey(k); setAsc(defAsc) } }
  const th = (k: string, label: string, defAsc: boolean, left = false) => (
    <th key={k} aria-sort={key === k ? (asc ? 'ascending' : 'descending') : 'none'} style={{ padding: '8px 10px', textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap', ...(left ? { position: 'sticky', left: 0, background: '#FAF8F3', zIndex: 1 } : {}) }}>
      <button type="button" onClick={() => click(k, defAsc)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: key === k ? '#1A1A1A' : '#8a8275', cursor: 'pointer', borderBottom: key === k ? '3px solid #FF5722' : '3px solid transparent' }}>
        {label}{key === k ? (asc ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 20px', margin: '4px 0 10px' }}>
        {canFilter ? (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={qual} onChange={e => { setQual(e.target.checked); setShown(50) }} style={{ width: 18, height: 18, accentColor: '#FF5722' }} /> Qualified only
          </label>
        ) : null}
        {minText ? <span style={{ fontSize: 13, color: '#8a8275' }}>{minText}</span> : null}
        <span style={{ fontSize: 13, color: '#8a8275', marginLeft: 'auto' }}>{sorted.length.toLocaleString('en-US')} players</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr style={{ borderBottom: '1px solid #1A1A1A' }}>
            <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: '#8a8275' }}>#</th>
            {th('__player', 'Player', false, true)}
            {th('__n', nLabel, false)}
            {cols.map(c => th(c.key, c.label, !!c.asc))}
          </tr></thead>
          <tbody>{sorted.slice(0, shown).map((r, i) => (
            <tr key={r.id} style={{ borderTop: '1px solid #e7e2d8' }}>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#8a8275' }}>{i + 1}</td>
              <td style={{ padding: '4px 10px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}>
                <Link href={`/mlb/players/${r.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}>
                  <Headshot id={r.id} name={r.name} size={32} /><b>{r.name}</b><TeamChip abbr={r.team} />
                </Link>
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#57534E' }}>{nDigits ? r.n.toFixed(nDigits) : r.n}</td>
              {cols.map(c => <td key={c.key} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: c.lead ? 800 : 400 }}>{fmt(r.v[c.key], c)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {shown < sorted.length ? <button type="button" onClick={() => setShown(s => s + 50)} style={{ margin: '14px 0', background: 'none', border: '1px solid #1A1A1A', borderRadius: 2, padding: '8px 16px', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>Show 50 more</button> : null}
    </div>
  )
}
