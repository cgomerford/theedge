'use client'

// src/app/admin/scatter/ScatterBuilder.tsx
//
// The scatter chart builder: load a player table, choose two stats and a minimum sample, name a few dots, download a PNG (1200x675 by default).
// Logic is in src/lib/graphics/scatter.ts; the tables come from /api/admin/scatter-data (public Savant leaderboards). Pasted columns stay in this browser tab.

import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { C, SANS } from '@/components/team/ui'
import { FOOTER_TEXT, GT, HANDLE } from '@/lib/graphics/constants'
import {
  DATASET_CHOICES, checkScatter, fmt, layoutLabels, mergeColumn, niceTicks, parsePasted, pickHighlights,
  type HighlightMode, type PastedColumn, type ScatterDataset,
} from '@/lib/graphics/scatter'

const SEASON = new Date().getFullYear()
const SIZES = { landscape: { w: 1200, h: 675, head: 150, label: 'Landscape 1200×675' }, square: { w: 1080, h: 1080, head: 170, label: 'Square 1080×1080' }, portrait: { w: 1080, h: 1350, head: 190, label: 'Portrait 1080×1350' } } as const
type SizeId = keyof typeof SIZES
const STORE = 'x9_scatter_v1'

type Saved = { datasetId: string; xKey: string; yKey: string; xLabel: string; yLabel: string; filterKey: string; filterMin: string; title: string; subtitle: string; kicker: string; diagonal: boolean; diagLabel: string; zeroLines: boolean; equal: boolean; mode: HighlightMode; count: number; names: string[]; size: SizeId; signedX: boolean | null; signedY: boolean | null }
const DEFAULTS: Saved = { datasetId: 'frv', xKey: 'range_runs', yKey: 'total_runs', xLabel: '', yLabel: '', filterKey: 'innings', filterMin: '700', title: '', subtitle: '', kicker: '', diagonal: true, diagLabel: '', zeroLines: false, equal: true, mode: 'gap', count: 12, names: [], size: 'landscape', signedX: null, signedY: null }

function load(): Saved {
  try { const r = localStorage.getItem(STORE); return r ? { ...DEFAULTS, ...(JSON.parse(r) as Partial<Saved>) } : DEFAULTS } catch { return DEFAULTS }
}

const lab: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, margin: '12px 0 4px' }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontFamily: SANS, fontSize: 13.5, boxSizing: 'border-box', color: C.ink }

export default function ScatterBuilder() {
  const [s, setS] = useState<Saved>(DEFAULTS)
  const [ready, setReady] = useState(false)
  const [base, setBase] = useState<ScatterDataset | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [pastes, setPastes] = useState<PastedColumn[]>([])
  const [pasteText, setPasteText] = useState('')
  const [pasteMsg, setPasteMsg] = useState('')
  const [nameIn, setNameIn] = useState('')
  const [hi, setHi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exportErr, setExportErr] = useState('')
  const frame = useRef<HTMLDivElement>(null)
  const holder = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)

  useEffect(() => { setS(load()); setReady(true) }, [])
  useEffect(() => { if (ready) try { localStorage.setItem(STORE, JSON.stringify(s)) } catch { /* private window */ } }, [s, ready])
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setS(p => ({ ...p, [k]: v }))

  // Load the table whenever the choice changes. Pasted columns belong to a table, so they are cleared with it.
  useEffect(() => {
    if (!ready) return
    let live = true
    setState('loading'); setErr('')
    fetch(`/api/admin/scatter-data?dataset=${s.datasetId}&season=${SEASON}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`); return j as ScatterDataset })
      .then(d => {
        if (!live) return
        setBase(d); setPastes([]); setState('idle')
        setS(p => {
          const keys = d.columns.map(c => c.key)
          const x = keys.includes(p.xKey) ? p.xKey : keys[0], y = keys.includes(p.yKey) && p.yKey !== x ? p.yKey : keys.find(k => k !== x) ?? x
          const f = keys.includes(p.filterKey) ? p.filterKey : keys[0]
          return { ...p, xKey: x, yKey: y, filterKey: f }
        })
      })
      .catch(e => { if (live) { setState('error'); setErr(e instanceof Error ? e.message : 'Could not load'); setBase(null) } })
    return () => { live = false }
  }, [s.datasetId, ready])

  // The dataset with every pasted column joined on.
  const merged = useMemo(() => {
    if (!base) return null
    let ds = base; const unmatched: string[] = []
    for (const c of pastes) { const r = mergeColumn(ds, c); ds = r.dataset; unmatched.push(...r.unmatched) }
    return { ds, unmatched }
  }, [base, pastes])
  const ds = merged?.ds ?? null
  const col = (k: string) => ds?.columns.find(c => c.key === k)
  const xc = col(s.xKey), yc = col(s.yKey)
  const xLabel = s.xLabel || xc?.label || '', yLabel = s.yLabel || yc?.label || ''

  const plotted = useMemo(() => {
    if (!ds || !xc || !yc) return { pts: [] as { name: string; x: number; y: number }[], left: 0 }
    const min = s.filterMin.trim() === '' ? null : Number(s.filterMin)
    const rows = ds.rows.filter(r => min == null || !Number.isFinite(min) || (r.v[s.filterKey] ?? -Infinity) >= min)
    const pts = rows.flatMap(r => { const x = r.v[s.xKey], y = r.v[s.yKey]; return x != null && y != null ? [{ name: r.name, x, y }] : [] })
    return { pts, left: rows.length - pts.length }
  }, [ds, xc, yc, s.xKey, s.yKey, s.filterKey, s.filterMin])

  const picks = useMemo(() => pickHighlights(plotted.pts, s.mode, s.count, s.names), [plotted.pts, s.mode, s.count, s.names])
  const signedX = s.signedX ?? plotted.pts.some(p => p.x < 0)
  const signedY = s.signedY ?? plotted.pts.some(p => p.y < 0)

  const size = SIZES[s.size]
  const fixed = s.diagonal && s.equal
  const geo = useMemo(() => {
    const xs = plotted.pts.map(p => p.x), ys = plotted.pts.map(p => p.y)
    if (!xs.length) return null
    const pad = (a: number[]) => { const lo = Math.min(...a), hi = Math.max(...a), d = (hi - lo || 1) * 0.04; return [lo - d, hi + d] as const }
    let [x0, x1] = pad(xs), [y0, y1] = pad(ys)
    if (fixed) { x0 = y0 = Math.min(x0, y0); x1 = y1 = Math.max(x1, y1) }
    const tx = niceTicks(x0, x1, s.size === 'landscape' ? 7 : 6), ty = niceTicks(y0, y1, s.size === 'landscape' ? 6 : 8)
    if (fixed) { const lo = Math.min(tx.lo, ty.lo), hi = Math.max(tx.hi, ty.hi); const a = niceTicks(lo, hi, 7); return { tx: a, ty: a } }
    return { tx, ty }
  }, [plotted.pts, fixed, s.size])

  const W = size.w - 80, H = size.h - size.head - 56 - 40
  const M = { l: 62, r: 26, t: 12, b: 50 }
  const pw = W - M.l - M.r, ph = H - M.t - M.b
  const sx = (v: number) => (geo ? M.l + ((v - geo.tx.lo) / (geo.tx.hi - geo.tx.lo)) * pw : 0)
  const sy = (v: number) => (geo ? M.t + ph - ((v - geo.ty.lo) / (geo.ty.hi - geo.ty.lo)) * ph : 0)
  const fs = s.size === 'landscape' ? 14 : 15
  const labels = useMemo(() => {
    if (!geo || !xc || !yc) return []
    const items = picks.picked.map(p => ({ px: sx(p.x), py: sy(p.y), text: `${p.name} (${fmt(p.x, xc.decimals, signedX)}, ${fmt(p.y, yc.decimals, signedY)})` }))
    return layoutLabels(items, { x0: M.l, y0: M.t, x1: M.l + pw, y1: M.t + ph }, fs, 7, 0.64)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, geo, xc, yc, signedX, signedY, s.size])

  // Fit the preview to the column it sits in.
  useEffect(() => {
    const el = holder.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 2) / size.w)))
    ro.observe(el); setScale(Math.min(1, (el.clientWidth - 2) / size.w))
    return () => ro.disconnect()
  }, [size.w])

  const kicker = s.kicker || (xc && yc ? `${xLabel} vs ${yLabel}, ${SEASON}`.toUpperCase() : '')
  const diagLabel = s.diagLabel || `${xLabel.replace(/\s*\(.*\)/, '')} = ${yLabel.replace(/\s*\(.*\)/, '')}`
  const warnings = checkScatter({ title: s.title, subtitle: s.subtitle, xKey: s.xKey, yKey: s.yKey, points: plotted.pts.length, missing: picks.missing, unmatched: merged?.unmatched ?? [] })

  function autoSubtitle() {
    const f = s.filterMin.trim() && col(s.filterKey) ? ` with ${s.filterMin}+ ${col(s.filterKey)!.label.toLowerCase().replace(/\s*\(.*\)/, '')}` : ''
    const diag = s.diagonal ? ` Below the line: ${xLabel.replace(/\s*\(.*\)/, '')} is higher. Above: ${yLabel.replace(/\s*\(.*\)/, '')} is higher.` : ''
    set('subtitle', `${plotted.pts.length} players${f}.${diag}`)
  }
  function includePaste() {
    const r = parsePasted(pasteText, `p${pastes.length + 1}_`)
    if (r.error) { setPasteMsg(r.error); return }
    setPastes(p => [...p, ...r.columns.filter(c => !p.some(q => q.key === c.key))])
    setPasteMsg(`${r.columns.map(c => c.label).join(', ')} added: ${r.names} names read. Choose the new stat in the lists above.`.replace('added', 'included'))
    setPasteText('')
  }
  function includeName(n: string) {
    const t = n.trim()
    if (t && !s.names.some(x => x.toLowerCase() === t.toLowerCase())) set('names', [...s.names, t])
    setNameIn('')
  }
  async function download(copy = false) {
    if (!frame.current) return
    setBusy(true); setExportErr('')
    try {
      const url = await toPng(frame.current, { pixelRatio: hi ? 2 : 1, cacheBust: true, backgroundColor: GT.paper, style: { transform: 'none' } })
      if (copy) {
        const blob = await (await fetch(url)).blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      } else {
        const a = document.createElement('a'); a.href = url; a.download = `${(s.title || 'scatter').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scatter'}-${size.w}x${size.h}.png`; a.click()
      }
    } catch (e) {
      console.error('[ScatterBuilder] export failed:', e instanceof Error ? e.message : e)
      setExportErr(copy ? 'Could not copy the picture. Download it instead.' : 'Could not make the picture. Try again.')
    } finally { setBusy(false) }
  }

  const ticksX = geo?.tx.ticks ?? [], ticksY = geo?.ty.ticks ?? []
  const colOpts = (ds?.columns ?? []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)

  return (
    <div className="sb-grid" style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
      <style>{'@media (max-width: 980px){.sb-grid{grid-template-columns:1fr !important}}'}</style>

      <aside style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '4px 16px 16px' }}>
        <label style={lab}>Table</label>
        <select style={inp} value={s.datasetId} onChange={e => set('datasetId', e.target.value)}>{DATASET_CHOICES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>{DATASET_CHOICES.find(d => d.id === s.datasetId)?.blurb} · {SEASON}</div>
        {state === 'loading' && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8 }}>Loading the table from Baseball Savant…</div>}
        {state === 'error' && <div role="alert" style={{ fontSize: 12.5, color: C.bad, marginTop: 8 }}>{err}</div>}

        {ds && (
          <>
            <label style={lab}>Across (x axis)</label>
            <select style={inp} value={s.xKey} onChange={e => { set('xKey', e.target.value); set('xLabel', ''); set('signedX', null) }}>{colOpts}</select>
            <input style={{ ...inp, marginTop: 6 }} placeholder="Axis label (optional)" value={s.xLabel} onChange={e => set('xLabel', e.target.value)} />
            <label style={lab}>Up (y axis)</label>
            <select style={inp} value={s.yKey} onChange={e => { set('yKey', e.target.value); set('yLabel', ''); set('signedY', null) }}>{colOpts}</select>
            <input style={{ ...inp, marginTop: 6 }} placeholder="Axis label (optional)" value={s.yLabel} onChange={e => set('yLabel', e.target.value)} />

            <label style={lab}>Minimum sample</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ ...inp, flex: 2 }} value={s.filterKey} onChange={e => set('filterKey', e.target.value)}>{colOpts}</select>
              <input style={{ ...inp, flex: 1 }} inputMode="decimal" placeholder="at least" value={s.filterMin} onChange={e => set('filterMin', e.target.value)} aria-label="Minimum" />
            </div>
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>{plotted.pts.length} players plotted{plotted.left > 0 ? ` · ${plotted.left} left off (no number for one of the two stats)` : ''}</div>

            <label style={lab}>Text</label>
            <input style={inp} placeholder="Headline" value={s.title} onChange={e => set('title', e.target.value)} />
            <textarea style={{ ...inp, marginTop: 6, minHeight: 56, resize: 'vertical' }} placeholder="Subtitle" value={s.subtitle} onChange={e => set('subtitle', e.target.value)} />
            <button type="button" onClick={autoSubtitle} style={{ ...btnLite, marginTop: 6 }}>Write the subtitle for me</button>
            <input style={{ ...inp, marginTop: 6 }} placeholder={`Top-right label (${kicker || 'optional'})`} value={s.kicker} onChange={e => set('kicker', e.target.value)} />

            <label style={lab}>Line and grid</label>
            <label style={chk}><input type="checkbox" checked={s.diagonal} onChange={e => set('diagonal', e.target.checked)} /> Diagonal line (where the two stats are equal)</label>
            {s.diagonal && <input style={{ ...inp, margin: '4px 0 6px' }} placeholder={`Line label (${diagLabel})`} value={s.diagLabel} onChange={e => set('diagLabel', e.target.value)} />}
            {s.diagonal && <label style={chk}><input type="checkbox" checked={s.equal} onChange={e => set('equal', e.target.checked)} /> Same scale on both axes</label>}
            <label style={chk}><input type="checkbox" checked={s.zeroLines} onChange={e => set('zeroLines', e.target.checked)} /> Darker lines at zero</label>
            <label style={chk}><input type="checkbox" checked={signedX} onChange={e => set('signedX', e.target.checked)} /> Show + and − on the x axis</label>
            <label style={chk}><input type="checkbox" checked={signedY} onChange={e => set('signedY', e.target.checked)} /> Show + and − on the y axis</label>

            <label style={lab}>Players to name</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ ...inp, flex: 2 }} value={s.mode} onChange={e => set('mode', e.target.value as HighlightMode)}>
                <option value="gap">Furthest from the diagonal</option><option value="top-y">Highest up</option><option value="bottom-y">Lowest down</option>
                <option value="top-x">Furthest right</option><option value="bottom-x">Furthest left</option><option value="none">None (only my list)</option>
              </select>
              <input style={{ ...inp, flex: 1 }} type="number" min={0} max={30} value={s.count} onChange={e => set('count', Math.max(0, Math.min(30, Number(e.target.value) || 0)))} aria-label="How many" />
            </div>
            <input style={{ ...inp, marginTop: 6 }} list="sb-names" placeholder="Include a player by name, then Enter" value={nameIn} onChange={e => setNameIn(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); includeName(nameIn) } }} />
            <datalist id="sb-names">{plotted.pts.map(p => <option key={p.name} value={p.name} />)}</datalist>
            {s.names.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {s.names.map(n => <button key={n} type="button" onClick={() => set('names', s.names.filter(x => x !== n))} style={{ ...btnLite, padding: '3px 10px' }} aria-label={`Remove ${n}`}>{n} ×</button>)}
              </div>
            )}

            <label style={lab}>Your own numbers</label>
            <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 4 }}>Paste a table with the player name in the first column and a header row (for example Name, DRS). It is matched to players by name and becomes a stat you can choose above.</div>
            <textarea style={{ ...inp, minHeight: 80, fontFamily: SANS, resize: 'vertical' }} placeholder={'Name\tDRS\nPete Crow-Armstrong\t16\nJJ Wetherholt\t12'} value={pasteText} onChange={e => setPasteText(e.target.value)} />
            <button type="button" onClick={includePaste} disabled={!pasteText.trim()} style={{ ...btnLite, marginTop: 6, opacity: pasteText.trim() ? 1 : 0.5 }}>Use these numbers</button>
            {pasteMsg && <div style={{ fontSize: 12, color: '#5B5347', marginTop: 6 }}>{pasteMsg}</div>}
            {pastes.length > 0 && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>Pasted: {pastes.map(p => p.label).join(', ')} · <button type="button" onClick={() => { setPastes([]); setPasteMsg('') }} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>clear</button></div>}

            <label style={lab}>Picture</label>
            <select style={inp} value={s.size} onChange={e => set('size', e.target.value as SizeId)}>{(Object.keys(SIZES) as SizeId[]).map(k => <option key={k} value={k}>{SIZES[k].label}</option>)}</select>
            <label style={{ ...chk, marginTop: 8 }}><input type="checkbox" checked={hi} onChange={e => setHi(e.target.checked)} /> Double resolution (2×)</label>
          </>
        )}
      </aside>

      <section style={{ minWidth: 0 }}>
        {warnings.length > 0 && ds && (
          <ul style={{ margin: '0 0 12px', padding: '10px 14px 10px 30px', background: '#FEF9C3', border: '1px solid #e8dc7a', borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>{warnings.map(w => <li key={w}>{w}</li>)}</ul>
        )}
        <div ref={holder} style={{ border: `1px dashed ${C.line}`, borderRadius: 10, background: '#fff', padding: 0, overflow: 'hidden' }}>
          {!ds ? <div style={{ padding: 40, textAlign: 'center', color: C.mute, fontSize: 14 }}>{state === 'loading' ? 'Loading…' : 'Choose a table to begin.'}</div> : (
            <div style={{ width: size.w * scale, height: size.h * scale }}>
              <div ref={frame} style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: 'top left', background: GT.paper, color: GT.ink, fontFamily: SANS, boxSizing: 'border-box', padding: '36px 40px 0', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>x9<span style={{ color: GT.accent }}>Lab</span></div>
                  <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.12em', color: GT.muted, textTransform: 'uppercase' }}>{kicker}</div>
                </div>
                <div style={{ height: size.head - 62, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ fontSize: s.size === 'landscape' ? 38 : 44, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.08 }}>{s.title || 'Your headline here'}</div>
                  <div style={{ fontSize: 17, color: OT_SUB, marginTop: 8, lineHeight: 1.35 }}>{s.subtitle}</div>
                </div>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', fontFamily: SANS }} role="img" aria-label={`${xLabel} against ${yLabel}`}>
                  {geo && (
                    <>
                      {ticksY.map(t => <line key={`gy${t}`} x1={M.l} x2={M.l + pw} y1={sy(t)} y2={sy(t)} stroke={s.zeroLines && t === 0 ? '#8A8275' : '#E7E2D8'} strokeWidth={s.zeroLines && t === 0 ? 1.5 : 1} />)}
                      {ticksX.map(t => <line key={`gx${t}`} y1={M.t} y2={M.t + ph} x1={sx(t)} x2={sx(t)} stroke={s.zeroLines && t === 0 ? '#8A8275' : '#E7E2D8'} strokeWidth={s.zeroLines && t === 0 ? 1.5 : 1} />)}
                      <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke="#BDB9AF" />
                      {ticksX.map(t => <text key={`tx${t}`} x={sx(t)} y={M.t + ph + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill="#8A8275">{fmt(t, xc && xc.decimals > 0 && !Number.isInteger(t) ? xc.decimals : 0, signedX)}</text>)}
                      {ticksY.map(t => <text key={`ty${t}`} x={M.l - 10} y={sy(t) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="#8A8275">{fmt(t, yc && yc.decimals > 0 && !Number.isInteger(t) ? yc.decimals : 0, signedY)}</text>)}
                      <text x={M.l + pw / 2} y={H - 8} textAnchor="middle" fontSize={15} fontWeight={800}>{xLabel}</text>
                      <text transform={`translate(16 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={15} fontWeight={800}>{yLabel}</text>
                      {s.diagonal && (() => {
                        const lo = Math.max(geo.tx.lo, geo.ty.lo), hi = Math.min(geo.tx.hi, geo.ty.hi)
                        if (!(hi > lo)) return null
                        return (
                          <>
                            <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke="#1A1A1A" strokeWidth={1.2} strokeDasharray="5 4" />
                            <text x={sx(hi) - 6} y={sy(hi) + 16} textAnchor="end" fontSize={13} fontWeight={700} fill="#1A1A1A">{diagLabel}</text>
                          </>
                        )
                      })()}
                      {plotted.pts.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={5} fill="#8A8275" opacity={0.55} />)}
                      {picks.picked.map((p, i) => <circle key={`h${i}`} cx={sx(p.x)} cy={sy(p.y)} r={7} fill={GT.accent} />)}
                      {picks.picked.map((p, i) => {
                        const l = labels[i]; if (!l || !xc || !yc) return null
                        return <text key={`l${i}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={fs} fontWeight={800} fill="#1A1A1A" stroke={GT.paper} strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">{`${p.name} (${fmt(p.x, xc.decimals, signedX)}, ${fmt(p.y, yc.decimals, signedY)})`}</text>
                      })}
                    </>
                  )}
                </svg>
                <div style={{ position: 'absolute', left: 40, right: 40, bottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: GT.muted }}>
                  <span>{FOOTER_TEXT}</span><span style={{ fontWeight: 800, color: GT.accent }}>{HANDLE}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => download(false)} disabled={!ds || busy} style={{ ...btn, background: C.orange, color: '#1A1A1A', opacity: !ds || busy ? 0.5 : 1 }}>{busy ? 'Making the picture…' : `Download PNG (${hi ? size.w * 2 : size.w}×${hi ? size.h * 2 : size.h})`}</button>
          <button type="button" onClick={() => download(true)} disabled={!ds || busy} style={{ ...btn, background: '#fff', color: C.ink, border: `1px solid ${C.ink}`, opacity: !ds || busy ? 0.5 : 1 }}>Copy picture</button>
        </div>
        {exportErr && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: C.bad }}>{exportErr}</div>}
        <div style={{ fontSize: 12, color: C.mute, marginTop: 10, lineHeight: 1.5 }}>
          The footer and handle are fixed. Settings are remembered in this browser. Every number is from the table shown (Baseball Savant, {SEASON}) or from what you pasted, so check pasted figures against their source before you publish.
        </div>
      </section>
    </div>
  )
}

const OT_SUB = '#5B5347'
const btn: React.CSSProperties = { padding: '11px 18px', border: 'none', borderRadius: 6, fontFamily: SANS, fontWeight: 800, fontSize: 12.5, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer' }
const btnLite: React.CSSProperties = { padding: '6px 12px', border: `1px solid ${C.line}`, borderRadius: 999, background: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', color: C.ink }
const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '5px 0', cursor: 'pointer' }
