'use client'

// A sortable leaderboard table: rank, player (headshot, name, team chip), n, then the stat columns. Pinned player column; client-side sort.
// "Qualified only" (when the board has a qualification rule) filters the same rows without a reload.
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Headshot } from '@/components/home/Logo'
import TeamChip from '@/components/ui/TeamChip'

type Row = { id: number; name: string; team: string; n: number; qualified: boolean; v: Record<string, number | null> }
type Col = { key: string; label: string; digits?: number; pct?: boolean; lead?: boolean; asc?: boolean; signed?: boolean; tip?: string }

const fmt = (v: number | null, c: Col) => {
  if (v == null) return ''
  const body = c.digits === 3 ? Math.abs(v).toFixed(3).replace(/^0/, '') : Math.abs(v).toFixed(c.digits ?? 0)
  const sign = c.signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''
  return sign + body + (c.pct ? '%' : '')
}

export default function LeaderboardTable({ rows, cols: baseCols, moreCols = [], nLabel, nDigits = 0, sortKey, sortAsc, canFilter, minText, isPro = false, exportName = 'x9lab-stats' }: {
  rows: Row[]; cols: Col[]; moreCols?: Col[]; nLabel: string; nDigits?: number; sortKey: string; sortAsc: boolean; canFilter: boolean; minText: string | null; isPro?: boolean; exportName?: string
}) {
  const [extra, setExtra] = useState<string[]>([])
  const cols = useMemo(() => [...baseCols, ...extra.map(k => moreCols.find(c => c.key === k)).filter((c): c is Col => !!c)], [baseCols, moreCols, extra])
  const [view, setView] = useState<'table' | 'chart'>('table')
  const area = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  async function download() {
    if (!area.current) return
    setBusy(true)
    try {
      const url = await toPng(area.current, { backgroundColor: '#FAF8F3', pixelRatio: 2, cacheBust: true, filter: n => !(n instanceof HTMLElement && n.dataset.noexport) })
      const a = document.createElement('a'); a.href = url; a.download = `${exportName}.png`; a.click()
    } catch (e) { console.error('[LeaderboardTable] export failed', e) } finally { setBusy(false) }
  }
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
  // Percentile of each value among the players in the table now (qualified only when that toggle is on): 100th = best, so low-is-better columns count backwards.
  const ranks = useMemo(() => {
    const pool = canFilter && qual ? rows.filter(r => r.qualified) : rows
    const m: Record<string, { sorted: number[]; asc: boolean }> = {}
    for (const c of cols) m[c.key] = { sorted: pool.map(r => r.v[c.key]).filter((v): v is number => v != null).sort((a, b) => a - b), asc: !!c.asc }
    return m
  }, [rows, cols, qual, canFilter])
  const tip = (c: Col, v: number | null) => {
    const r = ranks[c.key]
    if (v == null || !r || r.sorted.length < 2) return undefined
    const below = r.sorted.filter(x => (r.asc ? x > v : x < v)).length
    const pct = Math.round((below / (r.sorted.length - 1)) * 100)
    const better = r.sorted.filter(x => (r.asc ? x < v : x > v)).length
    return `${pct}${['th', 'st', 'nd', 'rd'][pct % 100 > 10 && pct % 100 < 14 ? 0 : pct % 10 < 4 ? pct % 10 : 0]} percentile · ${better + 1} of ${r.sorted.length}`
  }
  const click = (k: string, defAsc: boolean) => { if (k === key) setAsc(a => !a); else { setKey(k); setAsc(defAsc) } }
  const th = (k: string, label: string, defAsc: boolean, left = false, tipText?: string) => (
    <th key={k} title={tipText} aria-sort={key === k ? (asc ? 'ascending' : 'descending') : 'none'} style={{ padding: '8px 10px', textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap', ...(left ? { position: 'sticky', left: 0, background: '#FAF8F3', zIndex: 1 } : {}) }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', margin: '0 0 10px' }}>
        {moreCols.length ? (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}>
            Extra column
            <select value="" onChange={e => { if (e.target.value) setExtra(x => [...x, e.target.value]) }} style={{ height: 34, border: '1px solid #e7e2d8', borderRadius: 2, padding: '0 8px', background: '#fff', font: 'inherit', fontWeight: 400 }}>
              <option value="">Choose a stat</option>
              {moreCols.filter(c => !extra.includes(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        ) : null}
        {extra.map(k => { const c = moreCols.find(x => x.key === k); return c ? <button key={k} type="button" onClick={() => setExtra(x => x.filter(y => y !== k))} aria-label={`Remove ${c.label}`} style={{ border: '1px solid #e7e2d8', background: '#fff', borderRadius: 2, padding: '4px 8px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{c.label} ×</button> : null })}
        {isPro ? (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 14, alignItems: 'center' }}>
            <button type="button" onClick={() => setView(v => (v === 'table' ? 'chart' : 'table'))} style={{ background: 'none', border: 0, borderBottom: '3px solid #FF5722', padding: '2px 0', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>{view === 'table' ? 'Show as bar chart' : 'Show as table'}</button>
            <button type="button" onClick={download} disabled={busy} style={{ background: 'none', border: '1px solid #1A1A1A', borderRadius: 2, padding: '5px 12px', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>{busy ? 'Preparing…' : 'Download image'}</button>
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#8a8275' }}>Pro members can export these results as an image or a bar chart. <a href="/pricing" style={{ color: '#FF5722', fontWeight: 800 }}>See Pro</a></span>
        )}
      </div>
      <div ref={area}>
      {view === 'chart' && isPro ? (() => {
        const col = key === '__n' ? null : cols.find(c => c.key === key) ?? cols[0]
        const data = sorted.slice(0, 15).map(r => ({ name: r.name, v: col ? r.v[col.key] : r.n })).filter(d => d.v != null)
        const label = col ? col.label : nLabel
        return (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, margin: '4px 0' }}>{label}: top {data.length}</div>
            <div style={{ width: '100%', height: Math.max(220, data.length * 30) }}>
              <ResponsiveContainer>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="#e7e2d8" />
                  <XAxis type="number" hide domain={[0, 'dataMax']} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 13, fill: '#1A1A1A' }} axisLine={false} tickLine={false} />
                  <Bar dataKey="v" fill="#FF5722" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                    <LabelList dataKey="v" position="right" formatter={(v: unknown) => (col ? fmt(Number(v), col) : String(v))} style={{ fontSize: 13, fontWeight: 800, fill: '#1A1A1A' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 12, color: '#8a8275' }}>x9Lab · {exportName}{canFilter && qual ? ' · qualified only' : ''}</div>
          </div>
        )
      })() : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr style={{ borderBottom: '1px solid #1A1A1A' }}>
            <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: '#8a8275' }}>#</th>
            {th('__player', 'Player', false, true)}
            {th('__n', nLabel, false)}
            {cols.map(c => th(c.key, c.label, !!c.asc, false, c.tip))}
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
              {cols.map(c => <td key={c.key} title={tip(c, r.v[c.key])} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: c.lead ? 800 : 400, cursor: 'default' }}>{fmt(r.v[c.key], c)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      )}
      </div>
      {shown < sorted.length && view === 'table' ? <button type="button" data-noexport="1" onClick={() => setShown(s => s + 50)} style={{ margin: '14px 0', background: 'none', border: '1px solid #1A1A1A', borderRadius: 2, padding: '8px 16px', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>Show 50 more</button> : null}
    </div>
  )
}
