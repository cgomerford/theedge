'use client'

// src/components/graphics/creator/GraphicCreator.tsx
//
// Graphic Creator (/admin/creator, mockups/graphics-studio.html): a free-form canvas. Start from a layout or a blank page, place text, stats, bars,
// headshots, team logos and pictures, drag and resize them, switch between X landscape, X portrait, square and story, and export a PNG.
// Graphic Blocks (/admin/graphics) is the other tool: fixed templates filled from the game data. Nothing here is filled from data automatically.
// Undo and redo, arrow-key nudging, snapping to the canvas centre and edges, live checks, and a saved library (graphics_library, kind = creator).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import { loadGraphicImages } from '@/lib/graphics/images'
import { MLB_TEAMS } from '@/lib/teams'
import {
  CREATOR_SIZES, FOOTER_H, INK, ORANGE, STARTS, checkCreator, layerId, newBars, newStat, newText, parseDoc, resizeDoc, startDoc, emptyDoc,
  type Background, type CreatorDoc, type CreatorSize, type Layer, type StartId,
} from '@/lib/graphics/creator'
import { uploadImage } from '@/components/admin/article-writer/upload'
import CanvasView, { bgColor, pictureKey, type PictureMap } from './CanvasView'

const C = { line: '#e7e2d8', soft: '#f1eee6', mute: '#8a8275', orange: ORANGE, good: '#1D9E75', cream: '#FAF8F3' }
const inp: React.CSSProperties = { width: '100%', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 9px', fontSize: 13, background: C.cream, fontFamily: 'inherit' }
const lab: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, margin: '12px 0 5px' }
const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12, fontWeight: 700, border: `1px solid ${on ? C.orange : C.line}`, background: on ? C.orange : '#fff', color: on ? '#fff' : INK, borderRadius: 999, padding: '5px 10px', cursor: 'pointer' })
const btn: React.CSSProperties = { border: `1px solid ${INK}`, background: '#fff', borderRadius: 8, padding: '8px 13px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }
const SWATCHES = [INK, '#FFFFFF', ORANGE, '#FAF8F3', '#5C5A55', '#1D9E75', '#D4533B', '#12295A']

// ---- pictures: logos, cutout headshots and uploaded images, all turned into data URLs once so the export never waits on the network ----------------
const dataCache = new Map<string, string | null>()
async function fetchDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url
  if (dataCache.has(url)) return dataCache.get(url) ?? null
  try {
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(12000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const out = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(blob) })
    dataCache.set(url, out)
    return out
  } catch (e) {
    console.warn('[GraphicCreator] picture failed to load:', url, e)
    dataCache.set(url, null)
    return null
  }
}
async function loadPictures(doc: CreatorDoc): Promise<PictureMap> {
  const out: PictureMap = {}
  const teams = new Set<string>()
  const jobs: Promise<void>[] = []
  for (const l of doc.layers) {
    const k = pictureKey(l)
    if (!k) continue
    if (l.kind === 'logo') teams.add(l.team)
    else if (l.kind === 'headshot') jobs.push(fetchDataUrl(headshotCutoutUrl(l.playerId, 480)).then(d => { if (d) out[k] = d }))
    else if (l.kind === 'image') jobs.push(fetchDataUrl(l.src).then(d => { if (d) out[k] = d }))
  }
  if (teams.size) { const m = await loadGraphicImages([...teams].map(t => `team:${t}`)); Object.assign(out, m) }
  await Promise.all(jobs)
  return out
}

type Hist = { past: CreatorDoc[]; future: CreatorDoc[] }
type Drag = { id: string; mode: 'move' | 'resize'; sx: number; sy: number; o: { x: number; y: number; w: number; h: number }; before: CreatorDoc; moved: boolean }
type Person = { id: number; fullName: string; primaryPosition: string }
interface LibItem { id: string; name: string; updated_at: string }

export default function GraphicCreator() {
  const [doc, setDoc] = useState<CreatorDoc>(() => startDoc('bigNumber', 'landscape'))
  const [hist, setHist] = useState<Hist>({ past: [], future: [] })
  const [sel, setSel] = useState<string | null>(null)
  const [pics, setPics] = useState<PictureMap>({})
  const [boxW, setBoxW] = useState(760)
  const [tab, setTab] = useState<'edit' | 'checks' | 'library'>('edit')
  const [caption, setCaption] = useState('')
  const [name, setName] = useState('')
  const [libId, setLibId] = useState<string | null>(null)
  const [items, setItems] = useState<LibItem[] | null>(null)
  const [msg, setMsg] = useState('')
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [safe, setSafe] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exportDoc, setExportDoc] = useState<CreatorDoc | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Person[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const docRef = useRef(doc)
  const coalesce = useRef<{ key: string; at: number } | null>(null)
  docRef.current = doc

  const { w: W, h: H } = CREATOR_SIZES[doc.size]
  const scale = Math.min(1, boxW / W)
  const selected = doc.layers.find(l => l.id === sel) ?? null
  const checks = useMemo(() => checkCreator(doc, caption), [doc, caption])
  const warns = checks.filter(c => c.level === 'warn').length

  // measure the stage column
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(Math.max(280, el.clientWidth)))
    ro.observe(el); setBoxW(Math.max(280, el.clientWidth))
    return () => ro.disconnect()
  }, [])

  // load the pictures the document needs (and the export copy's)
  const picKey = JSON.stringify(doc.layers.map(pictureKey).filter(Boolean))
  useEffect(() => { let live = true; void loadPictures(doc).then(m => { if (live) setPics(p => ({ ...p, ...m })) }); return () => { live = false } }, [picKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- history ---------------------------------------------------------------------------------------------------------------------------
  /** Replace the document and remember the old one. Typing in the same field within 1 second is one undo step. */
  const commit = useCallback((next: CreatorDoc, key?: string) => {
    const now = Date.now()
    const same = !!key && coalesce.current?.key === key && now - coalesce.current.at < 1000
    coalesce.current = key ? { key, at: now } : null
    if (!same) setHist(h => ({ past: [...h.past.slice(-80), docRef.current], future: [] }))
    setDoc(next)
  }, [])
  const undo = useCallback(() => setHist(h => { const p = h.past[h.past.length - 1]; if (!p) return h; setDoc(p); return { past: h.past.slice(0, -1), future: [docRef.current, ...h.future] } }), [])
  const redo = useCallback(() => setHist(h => { const n = h.future[0]; if (!n) return h; setDoc(n); return { past: [...h.past, docRef.current], future: h.future.slice(1) } }), [])

  const patch = useCallback((id: string, p: Partial<Layer>, key?: string) => {
    commit({ ...docRef.current, layers: docRef.current.layers.map(l => (l.id === id ? ({ ...l, ...p } as Layer) : l)) }, key ? `${id}:${key}` : undefined)
  }, [commit])
  const addLayer = useCallback((l: Layer) => { commit({ ...docRef.current, layers: [...docRef.current.layers, l] }); setSel(l.id); setTab('edit') }, [commit])
  const removeLayer = useCallback((id: string) => { commit({ ...docRef.current, layers: docRef.current.layers.filter(l => l.id !== id) }); setSel(null) }, [commit])
  const duplicate = useCallback((id: string) => {
    const l = docRef.current.layers.find(x => x.id === id)
    if (l) addLayer({ ...l, id: layerId(), x: l.x + 24, y: l.y + 24 } as Layer)
  }, [addLayer])
  const move = useCallback((id: string, dir: 1 | -1) => {
    const a = [...docRef.current.layers]; const i = a.findIndex(l => l.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    commit({ ...docRef.current, layers: a })
  }, [commit])

  // ---- drag and resize on the stage ----------------------------------------------------------------------------------------------------
  const down = (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
    e.stopPropagation()
    const l = docRef.current.layers.find(x => x.id === id)
    if (!l) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSel(id); setTab('edit')
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, o: { x: l.x, y: l.y, w: l.w, h: l.h }, before: docRef.current, moved: false }
  }
  const moveEv = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale
    if (Math.abs(dx) + Math.abs(dy) < 2 && !d.moved) return
    d.moved = true
    let { x, y, w, h } = d.o
    let gx: number | null = null, gy: number | null = null
    if (d.mode === 'move') {
      x = Math.round(d.o.x + dx); y = Math.round(d.o.y + dy)
      const T = 8
      for (const [target, off] of [[0, 0], [W / 2, w / 2], [W, w]] as [number, number][]) if (Math.abs(x + off - target) < T) { x = Math.round(target - off); gx = target }
      for (const [target, off] of [[0, 0], [H / 2, h / 2], [H - FOOTER_H, h]] as [number, number][]) if (Math.abs(y + off - target) < T) { y = Math.round(target - off); gy = target }
    } else {
      w = Math.max(24, Math.round(d.o.w + dx)); h = Math.max(24, Math.round(d.o.h + dy))
      const cur = docRef.current.layers.find(l => l.id === d.id)
      if (cur && (cur.kind === 'headshot' || cur.kind === 'logo') || e.shiftKey) { const s = Math.max(w, h); w = s; h = s }
    }
    setGuides({ x: gx, y: gy })
    setDoc({ ...d.before, layers: d.before.layers.map(l => (l.id === d.id ? ({ ...l, x, y, w, h } as Layer) : l)) })
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    setGuides({ x: null, y: null })
    if (d?.moved) setHist(h => ({ past: [...h.past.slice(-80), d.before], future: [] }))
  }

  // ---- keyboard --------------------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicate(sel); return }
      if (!sel) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeLayer(sel); return }
      const step = e.shiftKey ? 10 : 1
      const l = docRef.current.layers.find(x => x.id === sel)
      if (!l) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); patch(sel, { x: l.x - step }, 'nudge') }
      if (e.key === 'ArrowRight') { e.preventDefault(); patch(sel, { x: l.x + step }, 'nudge') }
      if (e.key === 'ArrowUp') { e.preventDefault(); patch(sel, { y: l.y - step }, 'nudge') }
      if (e.key === 'ArrowDown') { e.preventDefault(); patch(sel, { y: l.y + step }, 'nudge') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, undo, redo, duplicate, removeLayer, patch])

  // ---- adding things ---------------------------------------------------------------------------------------------------------------------
  const startFrom = (id: StartId) => { commit(startDoc(id, doc.size)); setSel(null) }
  const changeSize = (s: CreatorSize) => { commit(resizeDoc(doc, s)); setSel(null) }
  const setBg = (bg: Background) => commit({ ...doc, bg })

  async function addPicture(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true); setMsg('Uploading…')
    try {
      const url = await uploadImage(file)
      const dims = await new Promise<{ w: number; h: number }>(ok => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => ok({ w: 4, h: 3 }); im.src = url })
      const fit = Math.min((W * 0.6) / dims.w, (H * 0.5) / dims.h)
      addLayer({ id: layerId(), kind: 'image', src: url, fit: 'cover', radius: 12, alt: '', x: Math.round(W * 0.2), y: Math.round(H * 0.15), w: Math.round(dims.w * fit), h: Math.round(dims.h * fit) })
      setMsg('')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Upload failed') }
    setBusy(false)
  }
  const findTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const search = (v: string) => {
    setQuery(v)
    if (findTimer.current) clearTimeout(findTimer.current)
    if (v.trim().length < 2) { setFound([]); return }
    findTimer.current = setTimeout(async () => { try { setFound(((await (await fetch(`/api/lab/search?q=${encodeURIComponent(v.trim())}`)).json()) as { people: Person[] }).people.slice(0, 6)) } catch { setFound([]) } }, 250)
  }

  // ---- export ----------------------------------------------------------------------------------------------------------------------------
  async function exportNow(d: CreatorDoc, fileTag: string) {
    const node = exportRef.current
    if (!node) return
    const { toPng } = await import('html-to-image')
    const { w, h } = CREATOR_SIZES[d.size]
    const url = await toPng(node, { cacheBust: true, backgroundColor: bgColor(d.bg), width: w, height: h, pixelRatio: 1 })
    const a = document.createElement('a')
    a.href = url; a.download = `creator-${fileTag}-${d.size}.png`; a.click()
  }
  async function download(all: boolean) {
    setBusy(true); setMsg('')
    try {
      const sizes = all ? (Object.keys(CREATOR_SIZES) as CreatorSize[]) : [doc.size]
      const tag = (name || 'graphic').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      for (const s of sizes) {
        const d = s === doc.size ? doc : resizeDoc(doc, s)
        setExportDoc(d)
        const m = await loadPictures(d); setPics(p => ({ ...p, ...m }))
        await new Promise(r => setTimeout(r, 700))
        await exportNow(d, tag)
        await new Promise(r => setTimeout(r, 400))
      }
    } catch (e) { console.error('[GraphicCreator] export failed:', e); setMsg('Export failed. Check the console.') }
    setExportDoc(null); setBusy(false)
  }

  // ---- library ---------------------------------------------------------------------------------------------------------------------------
  const loadLib = useCallback(async () => {
    try { setItems(((await (await fetch('/api/admin/graphics-library?kind=creator')).json()) as { items?: LibItem[] }).items ?? []) } catch { setItems([]) }
  }, [])
  useEffect(() => { void loadLib() }, [loadLib])
  async function save(asNew: boolean) {
    setMsg('Saving…')
    try {
      const res = await fetch('/api/admin/graphics-library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'creator', id: asNew ? undefined : libId ?? undefined, name: name || 'Untitled graphic', spec: doc, caption }) })
      const d = (await res.json()) as { id?: string; name?: string; error?: string }
      if (!res.ok || !d.id) throw new Error(d.error ?? 'Save failed')
      setLibId(d.id); setMsg(`Saved "${d.name}".`); void loadLib()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed') }
  }
  async function openSaved(id: string) {
    try {
      const res = await fetch(`/api/admin/graphics-library?id=${id}`)
      const d = (await res.json()) as { id: string; name: string; spec: unknown; caption: string; error?: string }
      const parsed = parseDoc(d.spec)
      if (!res.ok || !parsed) throw new Error(d.error ?? 'That is not a creator graphic')
      commit(parsed); setLibId(d.id); setName(d.name); setCaption(d.caption ?? ''); setSel(null); setMsg(`Opened "${d.name}".`)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not open it') }
  }
  async function removeSaved(id: string) {
    const res = await fetch(`/api/admin/graphics-library?id=${id}`, { method: 'DELETE' })
    if (res.ok) { if (libId === id) setLibId(null); void loadLib() } else setMsg('Delete failed')
  }

  // ---- property editors ------------------------------------------------------------------------------------------------------------------
  const num = (label: string, v: number, onChange: (n: number) => void) => (
    <label style={{ flex: 1, minWidth: 60 }}><span style={{ ...lab, margin: '8px 0 3px' }}>{label}</span><input style={inp} type="number" value={Math.round(v)} onChange={e => onChange(Number(e.target.value) || 0)} /></label>
  )
  const color = (v: string, onChange: (c: string) => void) => (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
      {SWATCHES.map(s => <button key={s} type="button" aria-label={`Colour ${s}`} onClick={() => onChange(s)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${v.toLowerCase() === s.toLowerCase() ? C.orange : C.line}`, background: s, cursor: 'pointer' }} />)}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#1A1A1A'} onChange={e => onChange(e.target.value)} style={{ width: 28, height: 26, border: 0, background: 'none' }} />
    </div>
  )

  // Called as a plain function (not rendered as <Props />): a component defined inside this one is a new type on every render, which remounts the inputs and drops focus after each character.
  function renderProps(l: Layer) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={chip(false)} onClick={() => duplicate(l.id)}>Duplicate</button>
          <button style={chip(false)} onClick={() => move(l.id, 1)}>Forward</button>
          <button style={chip(false)} onClick={() => move(l.id, -1)}>Back</button>
          <button style={{ ...chip(false), color: '#D4533B' }} onClick={() => removeLayer(l.id)}>Delete</button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>{num('X', l.x, v => patch(l.id, { x: v }, 'x'))}{num('Y', l.y, v => patch(l.id, { y: v }, 'y'))}</div>
        <div style={{ display: 'flex', gap: 6 }}>{num('Width', l.w, v => patch(l.id, { w: v }, 'w'))}{num('Height', l.h, v => patch(l.id, { h: v }, 'h'))}</div>

        {l.kind === 'text' && <>
          <span style={lab}>Text</span><textarea style={{ ...inp, minHeight: 70 }} value={l.text} onChange={e => patch(l.id, { text: e.target.value }, 'text')} />
          <div style={{ display: 'flex', gap: 6 }}>{num('Size', l.size, v => patch(l.id, { size: Math.max(8, v) }, 'size'))}</div>
          <span style={lab}>Weight</span><div style={{ display: 'flex', gap: 5 }}>{([400, 700, 800] as const).map(w => <button key={w} style={chip(l.weight === w)} onClick={() => patch(l.id, { weight: w })}>{w === 400 ? 'Regular' : w === 700 ? 'Bold' : 'Heavy'}</button>)}</div>
          <span style={lab}>Align</span><div style={{ display: 'flex', gap: 5 }}>{(['left', 'center', 'right'] as const).map(a => <button key={a} style={chip(l.align === a)} onClick={() => patch(l.id, { align: a })}>{a}</button>)}<button style={chip(l.caps)} onClick={() => patch(l.id, { caps: !l.caps })}>CAPS</button></div>
          <span style={lab}>Colour</span>{color(l.color, c => patch(l.id, { color: c }))}
        </>}
        {l.kind === 'stat' && <>
          <span style={lab}>Number</span><input style={inp} value={l.value} onChange={e => patch(l.id, { value: e.target.value }, 'v')} />
          <span style={lab}>Label</span><input style={inp} value={l.label} onChange={e => patch(l.id, { label: e.target.value }, 'l')} />
          <span style={lab}>Sample (always show one)</span><input style={{ ...inp, borderColor: l.sample.trim() ? C.line : C.orange }} value={l.sample} onChange={e => patch(l.id, { sample: e.target.value }, 's')} placeholder="n = 212 pitches" />
          <span style={lab}>Tile</span><div style={{ display: 'flex', gap: 5 }}>{(['light', 'dark', 'accent'] as const).map(t => <button key={t} style={chip(l.tone === t)} onClick={() => patch(l.id, { tone: t })}>{t}</button>)}</div>
        </>}
        {l.kind === 'bars' && <>
          <span style={lab}>Rows</span>
          {l.rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 62px 52px 24px', gap: 4, marginBottom: 4 }}>
              <input style={inp} value={r.label} onChange={e => patch(l.id, { rows: l.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }, `r${i}l`)} />
              <input style={inp} value={r.value} onChange={e => patch(l.id, { rows: l.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }, `r${i}v`)} />
              <input style={inp} type="number" value={r.pct} onChange={e => patch(l.id, { rows: l.rows.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) || 0 } : x)) }, `r${i}p`)} />
              <button style={{ border: 0, background: 'none', cursor: 'pointer', color: C.mute }} onClick={() => patch(l.id, { rows: l.rows.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          {l.rows.length < 8 && <button style={chip(false)} onClick={() => patch(l.id, { rows: [...l.rows, { label: 'New', value: '0%', pct: 0 }] })}>+ Row</button>}
          <span style={lab}>Bar colour</span>{color(l.color, c => patch(l.id, { color: c }))}
        </>}
        {l.kind === 'rect' && <><span style={lab}>Colour</span>{color(l.color, c => patch(l.id, { color: c }))}<div style={{ display: 'flex', gap: 6 }}>{num('Corner', l.radius, v => patch(l.id, { radius: Math.max(0, v) }, 'rad'))}</div></>}
        {l.kind === 'logo' && <><span style={lab}>Team</span><select style={inp} value={l.team} onChange={e => patch(l.id, { team: e.target.value })}>{[...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map(t => <option key={t.abbrev} value={t.abbrev}>{t.name}</option>)}</select></>}
        {l.kind === 'headshot' && <>
          <span style={lab}>Player</span>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{l.name || 'None chosen'}</div>
          <input style={inp} placeholder="Search a player by name" value={query} onChange={e => search(e.target.value)} />
          {found.map(p => <button key={p.id} style={{ ...chip(false), display: 'block', margin: '5px 0 0', borderRadius: 8 }} onClick={() => { patch(l.id, { playerId: p.id, name: p.fullName }); setQuery(''); setFound([]) }}>{p.fullName} · {p.primaryPosition}</button>)}
          <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>Transparent cut-out, no circle crop.</div>
        </>}
        {l.kind === 'image' && <>
          <span style={lab}>Description (alt text)</span><input style={{ ...inp, borderColor: l.alt.trim() ? C.line : C.orange }} value={l.alt} onChange={e => patch(l.id, { alt: e.target.value }, 'alt')} />
          <span style={lab}>Fit</span><div style={{ display: 'flex', gap: 5 }}>{(['cover', 'contain'] as const).map(f => <button key={f} style={chip(l.fit === f)} onClick={() => patch(l.id, { fit: f })}>{f === 'cover' ? 'Fill (crop)' : 'Whole picture'}</button>)}</div>
          <div style={{ display: 'flex', gap: 6 }}>{num('Corner', l.radius, v => patch(l.id, { radius: Math.max(0, v) }, 'rad'))}</div>
        </>}
      </div>
    )
  }

  const bgKinds: { id: Background['kind']; label: string }[] = [{ id: 'cream', label: 'Cream' }, { id: 'white', label: 'White' }, { id: 'dark', label: 'Dark' }, { id: 'team', label: 'Team colour' }, { id: 'color', label: 'Custom' }]
  const bgTeam = doc.bg.kind === 'team' ? doc.bg.team : 'PHI'

  return (
    <div style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', color: INK, background: C.cream, minHeight: '100vh' }}>
      <style>{`
        .gc-app{display:grid;grid-template-columns:260px minmax(0,1fr) 340px;min-height:calc(100vh - 54px)}
        @media (max-width:1100px){.gc-app{grid-template-columns:1fr}.gc-left,.gc-right{border:0!important;border-top:1px solid ${C.line}!important}}
        .gc-handle{position:absolute;right:-9px;bottom:-9px;width:18px;height:18px;border-radius:5px;background:${C.orange};border:2px solid #fff;cursor:nwse-resize;touch-action:none}
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: '#fff', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        <a href="/admin" style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none' }}>← Admin</a>
        <b>Graphic Creator</b>
        <input aria-label="Name" style={{ ...inp, width: 200 }} placeholder="Name this graphic" value={name} onChange={e => setName(e.target.value)} />
        <span style={{ fontSize: 12, color: C.mute }}>{msg}</span>
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={undo} disabled={!hist.past.length}>Undo</button>
        <button style={btn} onClick={redo} disabled={!hist.future.length}>Redo</button>
        <button style={btn} onClick={() => void save(false)}>{libId ? 'Update saved' : 'Save'}</button>
        <button style={btn} disabled={busy} onClick={() => void download(true)}>All sizes</button>
        <button style={{ ...btn, background: C.orange, borderColor: C.orange, color: '#fff' }} disabled={busy} onClick={() => void download(false)}>{busy ? 'Working…' : 'Download PNG'}</button>
      </div>

      <div className="gc-app">
        <aside className="gc-left" style={{ background: '#fff', borderRight: `1px solid ${C.line}`, padding: 14, overflow: 'auto' }}>
          <span style={{ ...lab, marginTop: 0 }}>Layouts</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {STARTS.map(s => <button key={s.id} onClick={() => startFrom(s.id)} style={{ textAlign: 'left', border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, background: C.cream, cursor: 'pointer', fontSize: 12.5, fontWeight: 800 }}>{s.name}<span style={{ display: 'block', fontWeight: 400, color: C.mute, fontSize: 11 }}>{s.blurb}</span></button>)}
          </div>
          <span style={lab}>Size</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{(Object.keys(CREATOR_SIZES) as CreatorSize[]).map(s => <button key={s} style={{ ...chip(doc.size === s), textAlign: 'left', borderRadius: 8 }} onClick={() => changeSize(s)}>{CREATOR_SIZES[s].label}</button>)}</div>
          <span style={lab}>Background</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{bgKinds.map(b => <button key={b.id} style={chip(doc.bg.kind === b.id)} onClick={() => setBg(b.id === 'team' ? { kind: 'team', team: bgTeam } : b.id === 'color' ? { kind: 'color', color: '#12295A' } : ({ kind: b.id } as Background))}>{b.label}</button>)}</div>
          {doc.bg.kind === 'team' && <select style={{ ...inp, marginTop: 6 }} value={doc.bg.team} onChange={e => setBg({ kind: 'team', team: e.target.value })}>{[...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map(t => <option key={t.abbrev} value={t.abbrev}>{t.name}</option>)}</select>}
          {doc.bg.kind === 'color' && <div style={{ marginTop: 6 }}>{color(doc.bg.color, c => setBg({ kind: 'color', color: c }))}</div>}
          <span style={lab}>Place</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <button style={chip(false)} onClick={() => addLayer(newText({ x: Math.round(W * 0.07), y: Math.round(H * 0.3), w: Math.round(W * 0.6) }))}>Text</button>
            <button style={chip(false)} onClick={() => addLayer(newStat({ x: Math.round(W * 0.07), y: Math.round(H * 0.3) }))}>Stat</button>
            <button style={chip(false)} onClick={() => addLayer(newBars({ x: Math.round(W * 0.07), y: Math.round(H * 0.25), w: Math.round(W * 0.86), h: Math.round(H * 0.4) }))}>Bars</button>
            <button style={chip(false)} onClick={() => addLayer({ id: layerId(), kind: 'rect', color: '#F1EEE6', radius: 16, x: Math.round(W * 0.07), y: Math.round(H * 0.3), w: Math.round(W * 0.3), h: Math.round(H * 0.25) })}>Box</button>
            <button style={chip(false)} onClick={() => addLayer({ id: layerId(), kind: 'headshot', playerId: 0, name: '', x: Math.round(W * 0.07), y: Math.round(H * 0.2), w: Math.round(H * 0.3), h: Math.round(H * 0.3) })}>Headshot</button>
            <button style={chip(false)} onClick={() => addLayer({ id: layerId(), kind: 'logo', team: 'PHI', x: Math.round(W * 0.07), y: Math.round(H * 0.2), w: Math.round(H * 0.2), h: Math.round(H * 0.2) })}>Team logo</button>
            <label style={{ ...chip(false), display: 'inline-block' }}>Picture<input type="file" accept="image/*" hidden onChange={e => { void addPicture(e.target.files?.[0]); e.target.value = '' }} /></label>
          </div>
          <span style={lab}>Layers (front first)</span>
          <div>{[...doc.layers].reverse().map(l => (
            <div key={l.id} onClick={() => { setSel(l.id); setTab('edit') }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: `1px solid ${l.id === sel ? C.orange : C.line}`, background: l.id === sel ? '#fff7f3' : '#fff', borderRadius: 8, marginBottom: 4, fontSize: 12.5, cursor: 'pointer' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b style={{ color: C.mute, textTransform: 'uppercase', fontSize: 10 }}>{l.kind}</b> {l.kind === 'text' ? l.text : l.kind === 'stat' ? `${l.value} ${l.label}` : l.kind === 'headshot' ? l.name : l.kind === 'logo' ? l.team : ''}</span>
            </div>
          ))}</div>
          {!doc.layers.length && <div style={{ fontSize: 12, color: C.mute }}>Nothing yet. Choose a layout or use Place.</div>}
        </aside>

        <main style={{ padding: 18, background: '#efeade', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.mute }}>
            <button style={chip(safe)} onClick={() => setSafe(s => !s)}>Footer line</button>
            <span>{CREATOR_SIZES[doc.size].label} · drag to move, corner to resize, Shift keeps it square, arrows nudge</span>
          </div>
          <div ref={boxRef} style={{ width: '100%' }}>
            <div style={{ width: W * scale, height: H * scale, margin: '0 auto', boxShadow: '0 10px 36px rgba(0,0,0,.2)' }} onPointerDown={() => setSel(null)} onPointerMove={moveEv} onPointerUp={up}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: W, height: H, position: 'relative' }}>
                <CanvasView doc={doc} pics={pics} edit />
                {doc.layers.map(l => (
                  <div key={l.id} onPointerDown={e => down(e, l.id, 'move')} style={{ position: 'absolute', left: l.x, top: l.y, width: l.w, height: l.h, outline: l.id === sel ? `2px solid ${C.orange}` : 'none', outlineOffset: 2, cursor: 'move', touchAction: 'none' }}>
                    {l.id === sel && <div className="gc-handle" onPointerDown={e => down(e, l.id, 'resize')} />}
                  </div>
                ))}
                {guides.x != null && <div style={{ position: 'absolute', left: guides.x, top: 0, bottom: 0, width: 1, background: C.orange, pointerEvents: 'none' }} />}
                {guides.y != null && <div style={{ position: 'absolute', top: guides.y, left: 0, right: 0, height: 1, background: C.orange, pointerEvents: 'none' }} />}
                {safe && <div style={{ position: 'absolute', left: 0, right: 0, bottom: FOOTER_H, borderTop: `2px dashed ${C.orange}`, pointerEvents: 'none' }} />}
              </div>
            </div>
          </div>
        </main>

        <aside className="gc-right" style={{ background: '#fff', borderLeft: `1px solid ${C.line}`, minWidth: 0 }}>
          <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 54, background: '#fff', zIndex: 5 }}>
            {(['edit', 'checks', 'library'] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ flex: 1, border: 0, background: 'none', padding: '13px 4px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: tab === t ? INK : C.mute, borderBottom: `2px solid ${tab === t ? C.orange : 'transparent'}`, cursor: 'pointer' }}>{t === 'edit' ? 'Edit' : t === 'checks' ? `Checks${warns ? ` · ${warns}` : ''}` : 'Library'}</button>
            ))}
          </div>
          <div style={{ padding: 14 }}>
            {tab === 'edit' && (selected ? renderProps(selected) : <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.6 }}>Select a layer on the canvas or in the list to edit it.<br />Undo is Cmd Z, duplicate Cmd D, delete removes.</div>)}
            {tab === 'checks' && (
              <div>
                {[...checks].sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1)).map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '8px 0', borderBottom: `1px solid ${C.soft}` }}>
                    <b style={{ width: 14, color: c.level === 'ok' ? C.good : C.orange }}>{c.level === 'ok' ? '✓' : '!'}</b>
                    <div>{c.text}{c.detail && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{c.detail}</div>}</div>
                  </div>
                ))}
                <span style={lab}>Post caption</span>
                <textarea style={{ ...inp, minHeight: 70 }} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption for the post. Checked with the same word list." />
                <div style={{ fontSize: 11, color: caption.length > 280 ? '#D4533B' : C.mute, textAlign: 'right' }}>{caption.length} / 280</div>
                <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>Checks warn but never block. The footer strip is always on the picture.</div>
              </div>
            )}
            {tab === 'library' && (
              <div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={btn} onClick={() => void save(false)}>{libId ? 'Update saved' : 'Save to library'}</button>
                  {libId && <button style={btn} onClick={() => void save(true)}>Save as new</button>}
                  <button style={btn} onClick={() => { commit(emptyDoc(doc.size)); setLibId(null); setName(''); setSel(null) }}>New blank</button>
                </div>
                <div style={{ marginTop: 10 }}>{items === null ? <div style={{ fontSize: 12, color: C.mute }}>Loading…</div> : items.length === 0 ? <div style={{ fontSize: 12, color: C.mute }}>Nothing saved yet.</div> : items.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', border: `1px solid ${i.id === libId ? C.orange : C.line}`, borderRadius: 8, marginBottom: 5, fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}><b>{i.name}</b> <span style={{ color: C.mute }}>· {new Date(i.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></span>
                    <button style={chip(false)} onClick={() => void openSaved(i.id)}>Open</button>
                    <button style={{ border: 0, background: 'none', cursor: 'pointer', color: C.mute }} onClick={() => void removeSaved(i.id)} aria-label="Delete">×</button>
                  </div>
                ))}</div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Full-size copy for export, offscreen and never scaled. */}
      <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        <div ref={exportRef} style={{ width: CREATOR_SIZES[(exportDoc ?? doc).size].w, height: CREATOR_SIZES[(exportDoc ?? doc).size].h }}><CanvasView doc={exportDoc ?? doc} pics={pics} /></div>
      </div>
    </div>
  )
}
