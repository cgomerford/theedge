'use client'

// A sortable leaderboard table: rank, player (headshot, name, team chip), n, then the stat columns. Pinned player column; client-side sort.
// "Qualified only" (when the board has a qualification rule) filters the same rows without a reload.
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { headshotUrl } from '@/lib/mlb-assets'
import { MLB_TEAMS } from '@/lib/teams'
import { Bar, BarChart, Cell, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Legend, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
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

/** A lighter, softer version of a colour (mixed with white) for the overlaid year, so it always reads as the same hue. */
function shift(hex: string, amt = 0.55): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#bdb6a6'
  const n = parseInt(m[1], 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => mix(c).toString(16).padStart(2, '0')).join('')}`
}

export default function LeaderboardTable({ rows, cols: baseCols, moreCols = [], nLabel, nDigits = 0, sortKey, sortAsc, canFilter, minText, isPro = false, exportName = 'x9lab-stats', group, ctx, seasons = [] }: {
  rows: Row[]; cols: Col[]; moreCols?: Col[]; nLabel: string; nDigits?: number; sortKey: string; sortAsc: boolean; canFilter: boolean; minText: string | null; isPro?: boolean; exportName?: string; group?: 'batting' | 'pitching'; ctx?: { season: number; sportId: number; gameType: string }; seasons?: number[]
}) {
  const [extra, setExtra] = useState<string[]>([])
  const cols = useMemo(() => [...baseCols, ...extra.map(k => moreCols.find(c => c.key === k)).filter((c): c is Col => !!c)], [baseCols, moreCols, extra])
  const [view, setView] = useState<'table' | 'chart'>('table')
  const [kind, setKind] = useState<'hbar' | 'vbar' | 'line' | 'scatter'>('hbar')
  const [yKey, setYKey] = useState<string>('')
  const [xKey, setXKey] = useState<string>('')
  const [topN, setTopN] = useState(15)
  const [color, setColor] = useState('#FF5722')
  const [heads, setHeads] = useState(false)
  const [byTeam, setByTeam] = useState(false)
  const teamFill = (abbr: string) => MLB_TEAMS.find(t => t.abbrev === abbr)?.primary_color ?? color
  const [headUris, setHeadUris] = useState<Record<number, string>>({})
  const [cmpYear, setCmpYear] = useState('')
  const [cmp, setCmp] = useState<Record<number, Record<string, number | null>> | null>(null)
  const [cmpErr, setCmpErr] = useState('')
  async function pickYear(y: string) {
    setCmpYear(y); setCmp(null); setCmpErr('')
    if (!y || !ctx || !group) return
    try {
      const r = await fetch(`/api/stats/compare?group=${group}&season=${y}&level=${ctx.sportId}&type=${ctx.gameType}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'failed')
      setCmp(j.rows)
    } catch (e) { console.error('[LeaderboardTable] compare failed', e); setCmpErr(`No ${y} data loaded.`) }
  }
  async function loadHeads(ids: number[]) {
    // Headshots go through the image proxy so the downloaded picture includes them (cross-origin images are otherwise left blank).
    for (const id of ids) {
      if (headUris[id]) continue
      try {
        const u = headshotUrl(id, 120)
        const r = await fetch(`/api/image-proxy?url=${encodeURIComponent(u)}`)
        const j = await r.json()
        if (j.dataUri) setHeadUris(h => ({ ...h, [id]: j.dataUri }))
      } catch (e) { console.error('[LeaderboardTable] headshot failed', id, e) }
    }
  }
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
            <button type="button" onClick={() => setView(v => (v === 'table' ? 'chart' : 'table'))} style={{ background: 'none', border: 0, borderBottom: '3px solid #FF5722', padding: '2px 0', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>{view === 'table' ? 'Show as a graph' : 'Show as table'}</button>
            <button type="button" onClick={download} disabled={busy} style={{ background: 'none', border: '1px solid #1A1A1A', borderRadius: 2, padding: '5px 12px', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>{busy ? 'Preparing…' : 'Download image'}</button>
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, alignItems: 'center', fontSize: 13, color: '#8a8275' }}>
            <a href="/pricing" aria-label="Show as a graph, locked: Pro members only" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px dashed #a89e8c', borderRadius: 2, padding: '5px 12px', fontWeight: 800, color: '#57534E', textDecoration: 'none' }}>
              <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><rect x="1" y="6" width="10" height="7" rx="1.5" fill="#57534E" /><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="#57534E" strokeWidth="1.6" /></svg>
              Graphs and image download
            </a>
            <span>Pro members only, signed in or not. <a href="/pricing" style={{ color: '#FF5722', fontWeight: 800 }}>See Pro</a></span>
          </span>
        )}
      </div>
      <div ref={area}>
      {view === 'chart' && isPro ? (() => {
        const all = [...baseCols, ...moreCols]
        const colY = all.find(c => c.key === (yKey || (key === '__n' ? baseCols[0].key : key))) ?? baseCols[0]
        const colX = all.find(c => c.key === (xKey || baseCols[1]?.key)) ?? baseCols[1] ?? baseCols[0]
        const pool = sorted.filter(r => r.v[colY.key] != null).sort((a, b) => (colY.asc ? 1 : -1) * ((a.v[colY.key] as number) - (b.v[colY.key] as number)))
        const data = pool.slice(0, topN).map(r => ({ id: r.id, fill: byTeam ? teamFill(r.team) : color, name: r.name, v: r.v[colY.key] as number, x: r.v[colX.key] as number, o: cmp?.[r.id]?.[colY.key] ?? null }))
        const overlay = !!cmp && kind !== 'scatter'
        const swatches = ['#FF5722', '#6CABDD', '#1A1A1A', '#1D9E75', '#7C3AED', '#FDE047']
        const sc = kind === 'scatter' ? pool.slice(0, topN).filter(r => r.v[colX.key] != null).map(r => ({ name: r.name, fill: byTeam ? teamFill(r.team) : color, x: r.v[colX.key] as number, y: r.v[colY.key] as number })) : []
        const sel: React.CSSProperties = { height: 32, border: '1px solid #e7e2d8', borderRadius: 2, padding: '0 8px', background: '#fff', font: 'inherit' }
        const lab: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }
        const title = overlay ? `${colY.label}: top ${data.length}, ${ctx?.season} against ${cmpYear}` : kind === 'scatter' ? `${colY.label} against ${colX.label}: top ${sc.length} by ${colY.label}` : `${colY.label}: top ${data.length}`
        const f = (v: unknown, c: Col) => fmt(Number(v), c)
        return (
          <div>
            <div data-noexport="1" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', margin: '0 0 8px' }}>
              <label style={lab}>Chart<select style={sel} value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="hbar">Horizontal bars</option><option value="vbar">Vertical bars</option><option value="line">Line</option><option value="scatter">Scatter (two stats)</option></select></label>
              <label style={lab}>{kind === 'scatter' ? 'Up' : 'Stat'}<select style={sel} value={colY.key} onChange={e => setYKey(e.target.value)}>{all.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
              {kind === 'scatter' ? <label style={lab}>Across<select style={sel} value={colX.key} onChange={e => setXKey(e.target.value)}>{all.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label> : null}
              <label style={lab}>Colour
                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {swatches.map(c => <button key={c} type="button" aria-label={`Bar colour ${c}`} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 11, background: c, border: color === c ? '3px solid #1A1A1A' : '1px solid #e7e2d8', cursor: 'pointer', padding: 0 }} />)}
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Choose any bar colour" style={{ width: 28, height: 28, border: 0, padding: 0, background: 'none', cursor: 'pointer' }} />
                </span>
              </label>
              <label style={lab}><input type="checkbox" checked={byTeam} onChange={e => setByTeam(e.target.checked)} />Team colours</label>
              {kind === 'hbar' ? <label style={lab}><input type="checkbox" checked={heads} onChange={e => { setHeads(e.target.checked); if (e.target.checked) loadHeads(data.map(d => d.id)) }} />Headshots</label> : null}
              {ctx && group && seasons.length ? (
                <label style={lab}>Overlay a year
                  <select style={sel} value={cmpYear} onChange={e => pickYear(e.target.value)}>
                    <option value="">None</option>
                    {seasons.filter(y => y !== ctx.season).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
              ) : null}
              {cmpErr ? <span style={{ fontSize: 13, color: '#D4533B' }}>{cmpErr}</span> : null}
              <label style={lab}>Top<select style={sel} value={topN} onChange={e => setTopN(Number(e.target.value))}>{[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, margin: '4px 0' }}>{title}</div>
            <div style={{ width: '100%', height: kind === 'hbar' ? Math.max(220, data.length * 30) : 380 }}>
              <ResponsiveContainer>
                {kind === 'hbar' ? (
                  <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="#e7e2d8" />
                    <XAxis type="number" hide domain={[0, 'dataMax']} />
                    <YAxis type="category" dataKey="name" width={heads ? 190 : 150} axisLine={false} tickLine={false}
                      tick={(p: { x?: number | string; y?: number | string; payload?: { value?: string | number; index?: number } }) => {
                        const d = data[p.payload?.index ?? -1]
                        return (
                          <g transform={`translate(${p.x},${p.y})`}>
                            {heads && d && headUris[d.id] ? <image href={headUris[d.id]} x={-190} y={-13} width={26} height={26} /> : null}
                            <text x={-6} y={0} dy={4} textAnchor="end" fontSize={13} fill="#1A1A1A">{p.payload?.value}</text>
                          </g>
                        )
                      }} />
                    {overlay ? <Legend verticalAlign="top" /> : null}
                    <Bar dataKey="v" name={String(ctx?.season ?? 'Now')} fill={color} radius={[0, 3, 3, 0]} isAnimationActive={false}>{data.map(d => <Cell key={d.id} fill={d.fill} />)}<LabelList dataKey="v" position="right" formatter={(v: unknown) => f(v, colY)} style={{ fontSize: 13, fontWeight: 800, fill: '#1A1A1A' }} /></Bar>
                    {overlay ? <Bar dataKey="o" name={cmpYear} fill={shift(color)} radius={[0, 3, 3, 0]} isAnimationActive={false}>{data.map(d => <Cell key={d.id} fill={shift(d.fill)} />)}<LabelList dataKey="o" position="right" formatter={(v: unknown) => (v == null ? '' : f(v, colY))} style={{ fontSize: 12, fill: '#8a8275' }} /></Bar> : null}
                  </BarChart>
                ) : kind === 'vbar' ? (
                  <BarChart data={data} margin={{ left: 0, right: 8, top: 22, bottom: 70 }}>
                    <CartesianGrid vertical={false} stroke="#e7e2d8" />
                    <XAxis dataKey="name" interval={0} angle={-40} textAnchor="end" height={80} tick={{ fontSize: 12, fill: '#1A1A1A' }} />
                    <YAxis tick={{ fontSize: 12 }} width={46} />
                    {overlay ? <Legend verticalAlign="top" /> : null}
                    <Bar dataKey="v" name={String(ctx?.season ?? 'Now')} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false}>{data.map(d => <Cell key={d.id} fill={d.fill} />)}{data.length <= 25 ? <LabelList dataKey="v" position="top" formatter={(v: unknown) => f(v, colY)} style={{ fontSize: 11, fontWeight: 800, fill: '#1A1A1A' }} /> : null}</Bar>
                    {overlay ? <Bar dataKey="o" name={cmpYear} fill={shift(color)} radius={[3, 3, 0, 0]} isAnimationActive={false}>{data.map(d => <Cell key={d.id} fill={shift(d.fill)} />)}</Bar> : null}
                  </BarChart>
                ) : kind === 'line' ? (
                  <LineChart data={data} margin={{ left: 0, right: 16, top: 12, bottom: 70 }}>
                    <CartesianGrid stroke="#e7e2d8" />
                    <XAxis dataKey="name" interval={0} angle={-40} textAnchor="end" height={80} tick={{ fontSize: 12, fill: '#1A1A1A' }} />
                    <YAxis tick={{ fontSize: 12 }} width={46} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v: unknown) => f(v, colY)} />
                    {overlay ? <Legend verticalAlign="top" /> : null}
                    <Line type="monotone" dataKey="v" name={String(ctx?.season ?? 'Now')} stroke={color} strokeWidth={2} dot={{ r: 3, fill: '#1A1A1A' }} isAnimationActive={false} />
                    {overlay ? <Line type="monotone" dataKey="o" name={cmpYear} stroke={shift(color)} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: shift(color) }} isAnimationActive={false} connectNulls /> : null}
                  </LineChart>
                ) : (
                  <ScatterChart margin={{ left: 0, right: 24, top: 12, bottom: 24 }}>
                    <CartesianGrid stroke="#e7e2d8" />
                    <XAxis type="number" dataKey="x" name={colX.label} domain={['auto', 'auto']} tick={{ fontSize: 12 }} label={{ value: colX.label, position: 'insideBottom', offset: -12, fontSize: 12 }} />
                    <YAxis type="number" dataKey="y" name={colY.label} domain={['auto', 'auto']} tick={{ fontSize: 12 }} width={46} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => payload && payload[0] ? <div style={{ background: '#1A1A1A', color: '#fff', padding: '6px 10px', fontSize: 12, borderRadius: 4 }}><b>{(payload[0].payload as { name: string }).name}</b><br />{colX.label} {f((payload[0].payload as { x: number }).x, colX)} · {colY.label} {f((payload[0].payload as { y: number }).y, colY)}</div> : null} />
                    <Scatter data={sc} fill={color} isAnimationActive={false}>{sc.map(d => <Cell key={d.name} fill={d.fill} />)}</Scatter>
                  </ScatterChart>
                )}
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
