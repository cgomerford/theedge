'use client'

// src/components/pitch-shape/ShapeGraphicsStudio.tsx
//
// The admin page for the three pitch-shape graphics (vs the league, why, what if). Search a pitcher, choose one of his pitches, choose the graphic, and for "what if" set the changes
// (velocity, ride, run, arm angle). Everything is read through /api/admin/pitch-shape-graphic, the same tables as the Pitch Shape Lab. Download a PNG at 16:9 or 4:5.

import { useEffect, useRef, useState } from 'react'
import { SIZES } from '@/lib/graphics/constants'
import { renderOtdPng } from '@/lib/graphics/otd-export'
import type { ShapeGraphicData } from '@/lib/pitch-shape/graphic-data'
import ShapeGraphic, { type GraphicKind } from './ShapeGraphics'
import { log } from '@/lib/log'

type Hit = { id: number; name: string; team: string; hand: 'R' | 'L'; season: number; pitches: { pitchType: string; n: number }[] }
const KINDS: { id: GraphicKind; label: string; blurb: string }[] = [
  { id: 'vs', label: 'Vs the league', blurb: 'His pitch against league pitches shaped like it, and the league average.' },
  { id: 'why', label: 'Why', blurb: 'The possible reasons: platoon, velocity, extension, arm angle, location, sequencing, defense and luck.' },
  { id: 'whatif', label: 'What if', blurb: 'What league pitches have produced with his shape plus the changes you choose.' },
]
const CHANGES: { k: 'velo' | 'ivb' | 'hb' | 'slot'; label: string; unit: string; min: number; max: number; step: number }[] = [
  { k: 'velo', label: 'Velocity', unit: 'mph', min: -4, max: 4, step: 0.5 }, { k: 'ivb', label: 'Ride', unit: 'in', min: -6, max: 6, step: 0.5 },
  { k: 'hb', label: 'Run', unit: 'in', min: -6, max: 6, step: 0.5 }, { k: 'slot', label: 'Arm angle', unit: '°', min: -15, max: 15, step: 1 },
]
const btn: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 6, border: '1px solid #d8d2c4', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }
const on: React.CSSProperties = { ...btn, background: '#1A1A1A', color: '#FAF8F3', borderColor: '#1A1A1A' }

export default function ShapeGraphicsStudio() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [pid, setPid] = useState<number | null>(null)
  const [pitch, setPitch] = useState<string | null>(null)
  const [kind, setKind] = useState<GraphicKind>('vs')
  const [size, setSize] = useState<'landscape' | 'portrait'>('landscape')
  const [deltas, setDeltas] = useState({ velo: 1, ivb: 2, hb: 0, slot: 0 })
  const [data, setData] = useState<ShapeGraphicData | null | undefined>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const shownHits = q.trim().length >= 2 ? hits : []

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let live = true
    const t = setTimeout(() => {
      fetch(`/api/admin/pitch-shape-graphic?q=${encodeURIComponent(term)}`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((j: { pitchers: Hit[] }) => { if (live) setHits(j.pitchers) })
        .catch(e => { log.error('ShapeGraphicsStudio', 'search failed', e instanceof Error ? e.message : e) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    if (pid == null) return
    let live = true
    const dq = kind === 'whatif' ? `&velo=${deltas.velo}&ivb=${deltas.ivb}&hb=${deltas.hb}&slot=${deltas.slot}` : ''
    const t = setTimeout(() => {
      setData(undefined); setError('')
      fetch(`/api/admin/pitch-shape-graphic?id=${pid}${pitch ? `&type=${pitch}` : ''}${dq}`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((j: { data: ShapeGraphicData | null }) => { if (live) { setData(j.data); if (j.data && !pitch) setPitch(j.data.pitchType) } })
        .catch(e => { log.error('ShapeGraphicsStudio', 'load failed', e instanceof Error ? e.message : e); if (live) { setData(null); setError('Could not load that pitcher.') } })
    }, kind === 'whatif' ? 350 : 0)
    return () => { live = false; clearTimeout(t) }
  }, [pid, pitch, kind, deltas.velo, deltas.ivb, deltas.hb, deltas.slot])

  async function download() {
    const node = stage.current?.querySelector('[data-graphic-root]') as HTMLElement | null
    if (!node || !data) return
    setBusy(true); setError('')
    try {
      await new Promise(r => setTimeout(r, 300))   // let the map canvas finish drawing
      const url = await renderOtdPng(node, size)
      const a = document.createElement('a')
      a.href = url
      a.download = `x9lab-shape-${kind}-${data.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${data.pitchType.toLowerCase()}-${size === 'landscape' ? '16x9' : '4x5'}.png`
      a.click()
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed') } finally { setBusy(false) }
  }

  const dim = SIZES[size]
  const scale = Math.min(1, 760 / dim.w)
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 800, letterSpacing: '.06em' }}>PITCHER
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a pitcher…" style={{ ...btn, fontWeight: 500, minWidth: 260, cursor: 'text' }} />
        </label>
        {data && <span style={{ fontWeight: 800 }}>{data.name} · {data.team} · {data.hand}HP</span>}
      </div>
      {shownHits.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {shownHits.slice(0, 8).map(h => <button key={h.id} type="button" style={pid === h.id ? on : btn} onClick={() => { setPid(h.id); setPitch(null); setQ('') }}>{h.name} <small style={{ opacity: 0.7 }}>{h.team}</small></button>)}
        </div>
      )}
      {data && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.pitches.map(p => <button key={p.pitchType} type="button" style={pitch === p.pitchType ? on : btn} onClick={() => setPitch(p.pitchType)}>{p.pitchName} <small style={{ opacity: 0.7 }}>{p.n}</small></button>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {KINDS.map(k => <button key={k.id} type="button" title={k.blurb} style={kind === k.id ? on : btn} onClick={() => setKind(k.id)}>{k.label}</button>)}
        <span style={{ width: 12 }} />
        <button type="button" style={size === 'landscape' ? on : btn} onClick={() => setSize('landscape')}>16:9 · 1200×675</button>
        <button type="button" style={size === 'portrait' ? on : btn} onClick={() => setSize('portrait')}>4:5 · 1080×1350</button>
        <button type="button" disabled={!data || busy} onClick={() => void download()} style={{ ...btn, background: '#FF5722', color: '#fff', borderColor: '#FF5722', opacity: !data || busy ? 0.5 : 1 }}>{busy ? 'Exporting…' : 'Download PNG'}</button>
      </div>
      <div style={{ fontSize: 13, color: '#5b5347' }}>{KINDS.find(k => k.id === kind)?.blurb}</div>
      {kind === 'whatif' && (
        <div style={{ display: 'flex', gap: '12px 24px', flexWrap: 'wrap', background: '#F1EEE6', borderRadius: 8, padding: 12 }}>
          {CHANGES.map(c => (
            <label key={c.k} style={{ display: 'grid', gap: 2, fontSize: 12, fontWeight: 800, minWidth: 170 }}>{c.label.toUpperCase()}: {deltas[c.k] >= 0 ? '+' : '−'}{Math.abs(deltas[c.k])} {c.unit}
              <input type="range" min={c.min} max={c.max} step={c.step} value={deltas[c.k]} onChange={e => setDeltas(d => ({ ...d, [c.k]: Number(e.target.value) }))} />
            </label>
          ))}
        </div>
      )}
      {error && <div role="alert" style={{ color: '#A8391F', fontSize: 14 }}>{error}</div>}
      {pid == null && <div style={{ color: '#5b5347', fontSize: 14 }}>Search for a pitcher to begin. The graphics use the same league data as the Pitch Shape Lab.</div>}
      {data === undefined && <div style={{ color: '#8a8275', fontSize: 14 }}>Loading…</div>}
      {data === null && pid != null && !error && <div style={{ color: '#5b5347', fontSize: 14 }}>No pitch shape on record for that pitcher yet.</div>}
      {data && (
        <div style={{ width: dim.w * scale, height: dim.h * scale, border: '1px solid #d8d2c4', overflow: 'hidden', background: '#fff' }}>
          <div ref={stage} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: dim.w, height: dim.h }}>
            <ShapeGraphic key={`${kind}-${size}-${data.pitchType}`} d={data} kind={kind} size={size} />
          </div>
        </div>
      )}
    </div>
  )
}
