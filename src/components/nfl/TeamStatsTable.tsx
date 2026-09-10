// src/components/nfl/TeamStatsTable.tsx

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { TeamStatsTableRow } from '@/lib/nfl/queries'

const MONO = "'JetBrains Mono', monospace"

type SortKey = keyof Omit<TeamStatsTableRow, 'teamId' | 'logoUrl' | 'record'>

const COLUMNS: { key: SortKey; label: string; higherIsBetter: boolean; unit?: string }[] = [
  { key: 'pointsPerGame', label: 'PPG', higherIsBetter: true },
  { key: 'pointsAllowedPerGame', label: 'PA', higherIsBetter: false },
  { key: 'offEpaPerPlay', label: 'Off EPA', higherIsBetter: true },
  { key: 'defEpaPerPlay', label: 'Def EPA', higherIsBetter: false },
  { key: 'blitzRate', label: 'Blitz %', higherIsBetter: true, unit: '%' },
  { key: 'playActionRate', label: 'PA %', higherIsBetter: true, unit: '%' },
  { key: 'shotgunRate', label: 'Gun %', higherIsBetter: true, unit: '%' },
]

export function TeamStatsTable({ rows }: { rows: TeamStatsTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pointsPerGame')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })
    return copy
  }, [rows, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (rows.length === 0) {
    return <p className="nh-empty">No team stats synced for this season yet.</p>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(26,26,26,0.15)', color: '#78716C' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 400 }}>Team</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 400 }}>Record</th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                style={{ textAlign: 'right', padding: '6px 8px', fontWeight: sortKey === c.key ? 700 : 400, cursor: 'pointer', color: sortKey === c.key ? '#FF5722' : '#78716C' }}
              >
                {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.teamId} style={{ borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
              <td style={{ padding: '5px 8px' }}>
                <Link href={`/nfl/teams/${r.teamId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#1A1A1A' }}>
                  {r.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logoUrl} alt="" loading="lazy" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  ) : null}
                  <b style={{ fontFamily: 'Inter, sans-serif' }}>{r.teamId}</b>
                </Link>
              </td>
              <td style={{ textAlign: 'right', padding: '5px 8px', color: '#4B4B4B' }}>{r.record ?? '—'}</td>
              {COLUMNS.map((c) => {
                const v = r[c.key]
                return (
                  <td key={c.key} style={{ textAlign: 'right', padding: '5px 8px', color: '#4B4B4B' }}>
                    {v != null ? `${(v as number).toFixed(c.unit ? 0 : 2)}${c.unit ?? ''}` : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
