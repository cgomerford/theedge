'use client'

// src/components/admin/article-writer/extensions.tsx
//
// The writer's custom Tiptap blocks: figure (image with caption, credit, width, ratio, focal point), pullQuote, statRow, playerCard, dataTable,
// gallery and xEmbed. Each draws the same markup and classes as src/components/ArticleRenderer.tsx (styled by article-css.ts), plus small
// controls that only show in the editor. Attributes are plain JSON so the stored document needs no Tiptap to display.

import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useRef, useState } from 'react'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import { parseTable, safeHttpUrl } from '@/lib/article-blocks'
import { uploadImage } from './upload'

const small: React.CSSProperties = { border: '1px solid #e7e2d8', borderRadius: 8, padding: '6px 9px', fontSize: 13, background: '#faf8f3', width: '100%', fontFamily: 'inherit' }
const chip = (on: boolean): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 700, border: `1px solid ${on ? '#FF5722' : '#e7e2d8'}`, background: on ? '#FF5722' : '#fff', color: on ? '#fff' : '#1A1A1A', borderRadius: 999, padding: '3px 9px', cursor: 'pointer' })
const bar: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 0' }
const kicker: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a8275' }
const frame = (selected: boolean): React.CSSProperties => ({ outline: selected ? '2px solid #FF5722' : '1px dashed transparent', outlineOffset: 4, borderRadius: 10 })

// ---- Figure --------------------------------------------------------------------------------------------------------------------------

function FigureView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const a = node.attrs as { src: string; alt: string; caption: string; credit: string; width: string; ratio: string; focalX: number; focalY: number }
  const ar = a.ratio && a.ratio !== 'auto' ? a.ratio.replace(':', '/') : null
  const setFocal = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!ar) return
    const r = e.currentTarget.getBoundingClientRect()
    updateAttributes({ focalX: Math.round(((e.clientX - r.left) / r.width) * 100), focalY: Math.round(((e.clientY - r.top) / r.height) * 100) })
  }
  return (
    <NodeViewWrapper as="figure" className={`w-${a.width}${ar ? ' ar' : ''}`} style={frame(selected)} data-drag-handle>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.src} alt={a.alt} onClick={setFocal} style={ar ? { aspectRatio: ar, objectPosition: `${a.focalX}% ${a.focalY}%`, cursor: 'crosshair' } : undefined} />
      <figcaption contentEditable={false}>
        <input style={small} placeholder="Caption" value={a.caption} onChange={e => updateAttributes({ caption: e.target.value })} />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input style={small} placeholder="Credit, e.g. MLB / Statcast" value={a.credit} onChange={e => updateAttributes({ credit: e.target.value })} />
          <input style={{ ...small, borderColor: a.alt ? '#e7e2d8' : '#FF5722' }} placeholder="Alt text (describe the image)" value={a.alt} onChange={e => updateAttributes({ alt: e.target.value })} />
        </div>
        <div style={bar}>
          <span style={kicker}>Width</span>
          {(['inline', 'wide', 'full'] as const).map(w => <button key={w} type="button" style={chip(a.width === w)} onClick={() => updateAttributes({ width: w })}>{w}</button>)}
          <span style={{ ...kicker, marginLeft: 8 }}>Shape</span>
          {['auto', '16:9', '4:3', '1:1', '4:5'].map(r => <button key={r} type="button" style={chip((a.ratio || 'auto') === r)} onClick={() => updateAttributes({ ratio: r })}>{r}</button>)}
          <button type="button" style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => deleteNode()}>Remove</button>
        </div>
        {ar && <div style={{ ...kicker, marginTop: 6 }}>Click the image to choose what stays in frame</div>}
      </figcaption>
    </NodeViewWrapper>
  )
}

export const Figure = Node.create({
  name: 'figure', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() {
    return { src: { default: '' }, alt: { default: '' }, caption: { default: '' }, credit: { default: '' }, width: { default: 'wide' }, ratio: { default: 'auto' }, focalX: { default: 50 }, focalY: { default: 50 } }
  },
  parseHTML() { return [{ tag: 'figure[data-x9="figure"]' }] },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes({ 'data-x9': 'figure' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(FigureView) },
})

// ---- Pull quote (editable text inside) -------------------------------------------------------------------------------------------------

export const PullQuote = Node.create({
  name: 'pullQuote', group: 'block', content: 'inline*', defining: true,
  parseHTML() { return [{ tag: 'div[data-x9="pull"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-x9': 'pull', class: 'pull' }, HTMLAttributes), 0] },
  addNodeView() { return ReactNodeViewRenderer(() => <NodeViewWrapper className="pull"><NodeViewContent /></NodeViewWrapper>) },
})

// ---- Stat row --------------------------------------------------------------------------------------------------------------------------

type Stat = { value: string; label: string; sample: string }

function StatRowView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const items = (node.attrs.items as Stat[]) ?? []
  const set = (i: number, patch: Partial<Stat>) => updateAttributes({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  return (
    <NodeViewWrapper style={{ margin: '1.8em 0', ...frame(selected) }} data-drag-handle>
      <div className="stats">
        {items.map((it, i) => (
          <div key={i} contentEditable={false}>
            <input style={{ ...small, textAlign: 'center', fontSize: 22, fontWeight: 800 }} placeholder=".231" value={it.value} onChange={e => set(i, { value: e.target.value })} />
            <input style={{ ...small, textAlign: 'center', marginTop: 4 }} placeholder="xwOBA against" value={it.label} onChange={e => set(i, { label: e.target.value })} />
            <input style={{ ...small, textAlign: 'center', marginTop: 4, borderColor: it.sample ? '#e7e2d8' : '#FF5722' }} placeholder="Sample, e.g. n = 212" value={it.sample} onChange={e => set(i, { sample: e.target.value })} />
            <button type="button" style={{ ...chip(false), marginTop: 4 }} onClick={() => updateAttributes({ items: items.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
      </div>
      <div style={bar} contentEditable={false}>
        {items.length < 4 && <button type="button" style={chip(false)} onClick={() => updateAttributes({ items: [...items, { value: '', label: '', sample: '' }] })}>+ Another number</button>}
        <span style={kicker}>Every number needs its sample</span>
        <button type="button" style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => deleteNode()}>Remove row</button>
      </div>
    </NodeViewWrapper>
  )
}

export const StatRow = Node.create({
  name: 'statRow', group: 'block', atom: true, draggable: true,
  addAttributes() { return { items: { default: [{ value: '', label: '', sample: '' }, { value: '', label: '', sample: '' }, { value: '', label: '', sample: '' }] } } },
  parseHTML() { return [{ tag: 'div[data-x9="statRow"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-x9': 'statRow' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(StatRowView) },
})

// ---- Player card ----------------------------------------------------------------------------------------------------------------------

type Person = { id: number; fullName: string; primaryPosition: string }

function PlayerCardView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const a = node.attrs as { playerId: number | null; name: string; team: string; line: string }
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Person[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const search = (v: string) => {
    setQ(v)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) { setFound([]); return }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/lab/search?q=${encodeURIComponent(v.trim())}`)
        setFound(((await r.json()) as { people: Person[] }).people.slice(0, 6))
      } catch { setFound([]) }
    }, 250)
  }
  return (
    <NodeViewWrapper style={{ margin: '1.8em 0', ...frame(selected) }} data-drag-handle>
      <div contentEditable={false}>
        {a.playerId ? (
          <div className="pcard" style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={headshotCutoutUrl(a.playerId, 240)} alt={a.name} />
            <div style={{ flex: 1 }}>
              <b>{a.name}</b>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input style={{ ...small, width: 70 }} placeholder="PHI" value={a.team} onChange={e => updateAttributes({ team: e.target.value.toUpperCase().slice(0, 4) })} />
                <input style={small} placeholder=".865 OPS in 2026 (n = 693 PA)" value={a.line} onChange={e => updateAttributes({ line: e.target.value })} />
              </div>
            </div>
            <button type="button" style={chip(false)} onClick={() => updateAttributes({ playerId: null, name: '' })}>Change</button>
          </div>
        ) : (
          <div style={{ border: '1px solid #e7e2d8', borderRadius: 14, padding: 12, background: '#fff' }}>
            <div style={kicker}>Player card</div>
            <input style={{ ...small, marginTop: 6 }} placeholder="Search a player by name" value={q} onChange={e => search(e.target.value)} autoFocus />
            {found.map(p => <button key={p.id} type="button" style={{ ...chip(false), display: 'block', margin: '6px 0 0', borderRadius: 8 }} onClick={() => updateAttributes({ playerId: p.id, name: p.fullName })}>{p.fullName} · {p.primaryPosition}</button>)}
          </div>
        )}
        <div style={bar}><button type="button" style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => deleteNode()}>Remove card</button></div>
      </div>
    </NodeViewWrapper>
  )
}

export const PlayerCard = Node.create({
  name: 'playerCard', group: 'block', atom: true, draggable: true,
  addAttributes() { return { playerId: { default: null }, name: { default: '' }, team: { default: '' }, line: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-x9="playerCard"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-x9': 'playerCard' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(PlayerCardView) },
})

// ---- Data table ------------------------------------------------------------------------------------------------------------------------

function DataTableView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const rows = String(node.attrs.rows ?? '')
  const { head, rows: body } = parseTable(rows)
  return (
    <NodeViewWrapper style={{ margin: '1.8em 0', ...frame(selected) }} data-drag-handle>
      <div contentEditable={false}>
        <div style={kicker}>Table: first line is the header, one row per line, columns split with |</div>
        <textarea style={{ ...small, minHeight: 90, marginTop: 6, fontFamily: 'inherit' }} value={rows} onChange={e => updateAttributes({ rows: e.target.value })} />
        {head.length > 0 && (
          <div className="tbl-wrap" style={{ marginTop: 8 }}>
            <table><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{body.map((r, i) => <tr key={i}>{head.map((_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>)}</tbody></table>
          </div>
        )}
        <input style={{ ...small, marginTop: 6 }} placeholder="Note under the table: source and sample" value={String(node.attrs.caption ?? '')} onChange={e => updateAttributes({ caption: e.target.value })} />
        <div style={bar}><button type="button" style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => deleteNode()}>Remove table</button></div>
      </div>
    </NodeViewWrapper>
  )
}

export const DataTable = Node.create({
  name: 'dataTable', group: 'block', atom: true, draggable: true,
  addAttributes() { return { rows: { default: 'Pitch | Use | Whiff\nFour-seam | 46% | 27%\nSweeper | 24% | 38%' }, caption: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-x9="dataTable"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-x9': 'dataTable' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(DataTableView) },
})

// ---- Gallery ---------------------------------------------------------------------------------------------------------------------------

type GImg = { src: string; alt: string }

function GalleryView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const images = (node.attrs.images as GImg[]) ?? []
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const add = async (files: FileList | null) => {
    if (!files) return
    setBusy(true); setErr('')
    try {
      const urls: GImg[] = []
      for (const f of Array.from(files).slice(0, 4 - images.length)) urls.push({ src: await uploadImage(f), alt: '' })
      updateAttributes({ images: [...images, ...urls] })
    } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed') }
    setBusy(false)
  }
  return (
    <NodeViewWrapper style={{ margin: '1.8em 0', ...frame(selected) }} data-drag-handle>
      <div contentEditable={false}>
        <div className={`gallery n${Math.max(2, images.length)}`}>
          {images.map((im, i) => (
            <div key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.src} alt={im.alt} />
              <input style={{ ...small, marginTop: 4, borderColor: im.alt ? '#e7e2d8' : '#FF5722' }} placeholder="Alt text" value={im.alt} onChange={e => updateAttributes({ images: images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
              <button type="button" style={{ ...chip(false), marginTop: 4 }} onClick={() => updateAttributes({ images: images.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
        </div>
        <input style={{ ...small, marginTop: 6 }} placeholder="One caption for the gallery" value={String(node.attrs.caption ?? '')} onChange={e => updateAttributes({ caption: e.target.value })} />
        <div style={bar}>
          {images.length < 4 && <label style={{ ...chip(false), display: 'inline-block' }}>{busy ? 'Uploading…' : '+ Upload images'}<input type="file" accept="image/*" multiple hidden onChange={e => add(e.target.files)} /></label>}
          <span style={kicker}>2 to 4 images</span>
          {err && <span style={{ color: '#D4533B', fontSize: 12 }}>{err}</span>}
          <button type="button" style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => deleteNode()}>Remove gallery</button>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export const Gallery = Node.create({
  name: 'gallery', group: 'block', atom: true, draggable: true,
  addAttributes() { return { images: { default: [] }, caption: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-x9="gallery"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-x9': 'gallery' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(GalleryView) },
})

// ---- X post link ----------------------------------------------------------------------------------------------------------------------

function XEmbedView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const url = String(node.attrs.url ?? '')
  const ok = !url || /^https?:\/\/(x|twitter)\.com\//i.test(url)
  return (
    <NodeViewWrapper style={{ margin: '1.8em 0', ...frame(selected) }} data-drag-handle>
      <div contentEditable={false}>
        <div style={kicker}>Post on X (shown as a link card; no script is loaded)</div>
        <input style={{ ...small, marginTop: 6, borderColor: ok ? '#e7e2d8' : '#FF5722' }} placeholder="https://x.com/..." value={url} onChange={e => updateAttributes({ url: e.target.value.trim() })} />
        {!ok && <div style={{ fontSize: 12, color: '#D4533B', marginTop: 4 }}>That is not an x.com link.</div>}
        {safeHttpUrl(url) && ok && <a className="xlink" href={url} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}><b>Post on X</b><span>{url}</span></a>}
        <div style={bar}><button type="button" style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => deleteNode()}>Remove</button></div>
      </div>
    </NodeViewWrapper>
  )
}

export const XEmbed = Node.create({
  name: 'xEmbed', group: 'block', atom: true, draggable: true,
  addAttributes() { return { url: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-x9="xEmbed"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-x9': 'xEmbed' }, HTMLAttributes)] },
  addNodeView() { return ReactNodeViewRenderer(XEmbedView) },
})

export const WRITER_BLOCKS = [Figure, PullQuote, StatRow, PlayerCard, DataTable, Gallery, XEmbed]
