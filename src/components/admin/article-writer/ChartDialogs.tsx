'use client'

// src/components/admin/article-writer/ChartDialogs.tsx
//
// The two dialogs for the article chart block:
//   ChartInsertModal      build or edit one chart: type, title, labels, one row per series, y-axis unit, caption and alt text, a live preview drawn by the same component the public article uses, inline errors, and a
//                         "Paste marker" field that parses a [CHART: ...] line into the form.
//   ConvertMarkersModal   finds every [CHART: ...] paragraph in the body, previews each chart, flags any that do not parse (the text stays as it is), and only converts them after the author confirms.
// Parsing, validation and the stored shape live in src/lib/article-chart.ts.

import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import ArticleChart from '@/components/article/ArticleChart'
import { EMPTY_CHART, autoAlt, findChartMarkers, parseChartMarker, validateChart, type ChartBlock, type ChartType } from '@/lib/article-chart'
import { fillFromFixtures } from '@/lib/article-chart-fixtures'

const line = '#e7e2d8'
const input: React.CSSProperties = { border: `1px solid ${line}`, borderRadius: 6, padding: '7px 9px', fontSize: 13.5, background: '#faf8f3', width: '100%', fontFamily: 'inherit' }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b6355', display: 'block', margin: '12px 0 4px' }
const btn = (on = false): React.CSSProperties => ({ border: `1px solid ${on ? '#1A1A1A' : line}`, background: on ? '#1A1A1A' : '#fff', color: on ? '#fff' : '#1A1A1A', borderRadius: 6, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' })

const toNums = (s: string) => s.split(',').map(x => x.trim()).filter(x => x !== '').map(x => Number(x.replace(/%$/, '').replace(/^\+/, '').replace(/−/g, '-')))
const toList = (s: string) => s.split(',').map(x => x.trim()).filter(x => x !== '')
const fromBlock = (b: ChartBlock) => ({ labels: b.labels.join(', '), series: b.series.map(s => ({ name: s.name, values: s.values.join(', ') })) })

function Shell({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(26,26,26,.45)', display: 'grid', placeItems: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', border: `1px solid ${line}`, borderRadius: 8, width: wide ? 'min(1180px, 100%)' : 'min(1100px, 100%)', maxHeight: '92vh', overflow: 'auto', padding: '16px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <b style={{ fontSize: 18 }}>{title}</b>
          <button type="button" style={btn()} onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ChartInsertModal({ initial, onSave, onClose }: { initial: ChartBlock | null; onSave: (b: ChartBlock) => void; onClose: () => void }) {
  const start = initial ?? EMPTY_CHART
  const f0 = fromBlock(start)
  const [type, setType] = useState<ChartType>(start.type)
  const [title, setTitle] = useState(start.title)
  const [labels, setLabels] = useState(f0.labels)
  const [series, setSeries] = useState(f0.series.length ? f0.series : [{ name: '', values: '' }])
  const [yUnit, setYUnit] = useState(start.yUnit ?? '')
  const [caption, setCaption] = useState(start.caption ?? '')
  const [alt, setAlt] = useState(start.alt)
  const [source, setSource] = useState(start.source ?? '')
  const [marker, setMarker] = useState('')
  const [markerMsg, setMarkerMsg] = useState('')

  const block: ChartBlock = useMemo(() => ({ type, title, labels: toList(labels), series: series.map(s => ({ name: s.name.trim(), values: toNums(s.values) })), yUnit: yUnit.trim(), source: source.trim(), caption: caption.trim(), alt: alt.trim() }), [type, title, labels, series, yUnit, source, caption, alt])
  const errors = validateChart(block)
  const drawable = block.title.trim() && block.labels.length > 0 && block.series.length > 0 && block.series.every(s => s.values.length === block.labels.length && s.values.every(Number.isFinite))

  const fillFrom = (text: string) => {
    setMarker(text)
    if (!text.trim()) { setMarkerMsg(''); return }
    const r = parseChartMarker(text)
    if (!r.ok) { setMarkerMsg(r.error); return }
    const b = fillFromFixtures(r.block)
    const f = fromBlock(b)
    setType(b.type); setTitle(b.title); setLabels(f.labels); setSeries(f.series); setYUnit(b.yUnit ?? ''); setCaption(b.caption ?? '')
    setAlt(b.alt || autoAlt(b))
    setMarkerMsg('Filled from the marker. Check the alt text and caption.')
  }

  return (
    <Shell title={initial ? 'Edit chart' : 'Insert chart'} onClose={onClose}>
      <div className="cd-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,420px) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        <style>{'@media(max-width:900px){.cd-grid{grid-template-columns:1fr !important}}'}</style>
        <div>
          <span style={label}>Paste marker</span>
          <textarea value={marker} onChange={e => fillFrom(e.target.value)} placeholder="[CHART: bar | Title | labels: a, b, c | Series = 1, 2, 3 | series: Series]" style={{ ...input, minHeight: 64, fontSize: 12.5 }} aria-label="Paste a CHART marker" />
          {markerMsg && <div style={{ fontSize: 12, marginTop: 4, color: markerMsg.startsWith('Filled') ? '#5b5347' : '#A8391F' }}>{markerMsg}</div>}

          <span style={label}>Chart type</span>
          <div role="group" aria-label="Chart type" style={{ display: 'flex', gap: 6 }}>
            <button type="button" aria-pressed={type === 'bar'} style={btn(type === 'bar')} onClick={() => setType('bar')}>Bar</button>
            <button type="button" aria-pressed={type === 'line'} style={btn(type === 'line')} onClick={() => setType('line')}>Line</button>
          </div>

          <span style={label}>Title</span>
          <input style={input} value={title} onChange={e => setTitle(e.target.value)} />

          <span style={label}>Labels (comma separated)</span>
          <input style={input} value={labels} onChange={e => setLabels(e.target.value)} placeholder="2021, 2024, 2025, 2026" />

          <span style={label}>Series: a name and comma separated values</span>
          {series.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) auto', gap: 6, marginBottom: 6 }}>
              <input style={input} value={s.name} onChange={e => setSeries(x => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Series name" aria-label={`Series ${i + 1} name`} />
              <input style={input} value={s.values} onChange={e => setSeries(x => x.map((y, j) => (j === i ? { ...y, values: e.target.value } : y)))} placeholder="2.64, 4.92, -1.5" aria-label={`Series ${i + 1} values`} />
              <button type="button" style={btn()} disabled={series.length === 1} onClick={() => setSeries(x => x.filter((_, j) => j !== i))} aria-label={`Remove series ${i + 1}`}>✕</button>
            </div>
          ))}
          <button type="button" style={btn()} disabled={series.length >= 4} onClick={() => setSeries(x => [...x, { name: '', values: '' }])}>+ New series</button>

          <span style={label}>Y-axis unit (optional: mph, runs, %)</span>
          <input style={input} value={yUnit} onChange={e => setYUnit(e.target.value)} />

          <span style={label}>Caption (shown under the chart)</span>
          <input style={input} value={caption} onChange={e => setCaption(e.target.value)} />

          <span style={label}>Alt text (required)</span>
          <textarea style={{ ...input, minHeight: 56, borderColor: alt.trim() ? line : '#FF5722' }} value={alt} onChange={e => setAlt(e.target.value)} />

          <span style={label}>Source (kept internally, not drawn on the chart)</span>
          <input style={input} value={source} onChange={e => setSource(e.target.value)} />
        </div>

        <div style={{ minWidth: 0 }}>
          <span style={{ ...label, marginTop: 0 }}>Live preview</span>
          {drawable ? <ArticleChart chart={block} /> : <div style={{ border: `1px dashed ${line}`, borderRadius: 6, padding: 24, color: '#6b6355', fontSize: 14 }}>The preview appears once the title, labels and values line up.</div>}
          {errors.length > 0 && <ul role="alert" style={{ margin: '10px 0 0', paddingLeft: 18, color: '#A8391F', fontSize: 13, lineHeight: 1.5 }}>{errors.map(e => <li key={e}>{e}</li>)}</ul>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button type="button" style={btn()} onClick={onClose}>Cancel</button>
            <button type="button" style={{ ...btn(true), background: '#FF5722', borderColor: '#FF5722', opacity: errors.length ? 0.5 : 1 }} disabled={errors.length > 0} onClick={() => onSave(block)}>{initial ? 'Save chart' : 'Insert chart'}</button>
          </div>
        </div>
      </div>
    </Shell>
  )
}

export function ConvertMarkersModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const hits = useMemo(() => findChartMarkers(editor.getJSON() as { content?: unknown[] }), [editor])
  const prepared = hits.map(h => {
    if (!h.result.ok) return { hit: h, block: null as ChartBlock | null, errors: [h.result.error] }
    const b = fillFromFixtures(h.result.block)
    const withAlt = b.alt ? b : { ...b, alt: autoAlt(b) }
    return { hit: h, block: withAlt, errors: validateChart(withAlt) }
  })
  const good = prepared.filter(p => p.block && p.errors.length === 0)

  const apply = () => {
    const wanted = new Map(good.map(p => [p.hit.index, p.block as ChartBlock]))
    editor.chain().command(({ tr, state }) => {
      const spots: { pos: number; size: number; block: ChartBlock }[] = []
      state.doc.forEach((node, offset, index) => { const b = wanted.get(index); if (b) spots.push({ pos: offset, size: node.nodeSize, block: b }) })
      const type = state.schema.nodes.chartBlock
      for (const s of spots.reverse()) tr.replaceWith(s.pos, s.pos + s.size, type.create({ type: s.block.type, title: s.block.title, labels: s.block.labels, series: s.block.series, yUnit: s.block.yUnit ?? '', source: s.block.source ?? '', caption: s.block.caption ?? '', alt: s.block.alt }))
      return true
    }).run()
    onClose()
  }

  return (
    <Shell title="Convert chart markers" onClose={onClose} wide>
      {hits.length === 0 ? <p style={{ fontSize: 14, color: '#5b5347' }}>No [CHART: ...] lines were found in the body. A marker must be on a paragraph of its own.</p> : (
        <>
          <p style={{ fontSize: 13.5, color: '#5b5347', margin: '0 0 10px' }}>{hits.length} marker{hits.length === 1 ? '' : 's'} found. Look over each chart below. Nothing changes until you confirm, and a marker that does not read stays as text.</p>
          <div style={{ display: 'grid', gap: 18 }}>
            {prepared.map((p, i) => (
              <div key={i} style={{ border: `1px solid ${line}`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 11.5, color: '#6b6355', marginBottom: 6, wordBreak: 'break-word' }}>Marker {i + 1}: {p.hit.text.slice(0, 140)}{p.hit.text.length > 140 ? '…' : ''}</div>
                {p.block && p.errors.length === 0 ? <ArticleChart chart={p.block} /> : (
                  <div role="alert" style={{ color: '#A8391F', fontSize: 13.5 }}>{p.block ? 'This chart needs fixing before it can be converted:' : 'This marker could not be read and will stay as text:'}<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{p.errors.map(e => <li key={e}>{e}</li>)}</ul></div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" style={btn()} onClick={onClose}>Cancel</button>
            <button type="button" style={{ ...btn(true), background: '#FF5722', borderColor: '#FF5722', opacity: good.length ? 1 : 0.5 }} disabled={good.length === 0} onClick={apply}>Convert {good.length} chart{good.length === 1 ? '' : 's'}</button>
          </div>
        </>
      )}
    </Shell>
  )
}
