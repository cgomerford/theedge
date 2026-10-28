'use client'

// src/components/graphics/otd/OtdForm.tsx
//
// The form for the "On this day" and "Stat of the day" cards: the event date (free text, shown in caps), headline, subline, the sections
// (add, remove, reorder; each edited with plain row inputs for its type), the width ratios, and up to four stat tiles.
// There is deliberately no logo, team or headshot control here.

import type { GraphicSpec } from '@/lib/graphics/types'
import { SECTION_TYPES, type OtdBody, type OtdSectionData, type OtdTileData, type TimelinePoint } from '@/lib/graphics/otd-types'

const input = 'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm'
const lab = 'text-[11px] uppercase tracking-widest text-stone-500'
const box = 'rounded-xl border border-stone-200 bg-white p-3'
const mini = 'rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs'
const link = 'text-[11px] text-stone-600 underline'

const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? 0 : Number(v))
const list = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean)

function blank(type: OtdSectionData['type']): OtdSectionData {
  switch (type) {
    case 'kv': return { type, label: 'Label', rows: [{ label: '', value: '' }] }
    case 'linescore': return { type, label: 'Linescore', innings: 9, highlight: [], rows: [{ team: 'AAA', runs: Array(9).fill(0), total: '0' }, { team: 'BBB', runs: Array(9).fill(0), total: '0' }] }
    case 'timeline': return { type, label: 'Timeline', points: [{ date: '', label: '' }, { date: '', label: '' }] }
    case 'vbars': return { type, label: 'By season', bars: [{ label: '', value: 0, tone: 'orange' }] }
    case 'hbars': return { type, label: 'Comparison', rows: [{ label: '', value: 0, display: '', tone: 'orange' }] }
    case 'games': return { type, label: 'Series by game', games: [{ n: 1, score: '', winner: '', won: true }] }
    case 'trade': return { type, label: 'The trade', groups: [{ label: 'TO ...', names: [] }] }
    case 'slash': return { type, label: 'Slash line', line: '', caption: 'AVG / OBP / SLG' }
  }
}

function Rows<T>({ items, set, make, render, max }: { items: T[]; set: (n: T[]) => void; make: () => T; render: (it: T, patch: (p: Partial<T>) => void) => React.ReactNode; max?: number }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1">
          {render(it, p => set(items.map((x, j) => (j === i ? { ...x, ...p } : x))))}
          <button type="button" className="px-1 text-stone-400 hover:text-red-600" aria-label="Remove row" onClick={() => set(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {(max == null || items.length < max) && <button type="button" className={`${link} w-fit`} onClick={() => set([...items, make()])}>+ new row</button>}
    </div>
  )
}

function Editor({ s, set }: { s: OtdSectionData; set: (n: OtdSectionData) => void }) {
  switch (s.type) {
    case 'kv': return <Rows items={s.rows} set={rows => set({ ...s, rows })} make={() => ({ label: '', value: '' })} max={8} render={(r, p) => <><input className={`${mini} w-40`} placeholder="Label" value={r.label} onChange={e => p({ label: e.target.value })} /><input className={`${mini} w-32`} placeholder="Figure" value={r.value} onChange={e => p({ value: e.target.value })} /></>} />
    case 'linescore': return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">Innings <input className={`${mini} w-14`} inputMode="numeric" value={s.innings} onChange={e => set({ ...s, innings: Math.max(1, Math.min(18, num(e.target.value))) })} /> Highlight innings <input className={`${mini} w-28`} placeholder="8, 10" value={s.highlight.join(', ')} onChange={e => set({ ...s, highlight: list(e.target.value).map(Number).filter(Number.isFinite) })} /></div>
        <Rows items={s.rows} set={rows => set({ ...s, rows })} make={() => ({ team: '', runs: [], total: '' })} max={3} render={(r, p) => <><input className={`${mini} w-16`} placeholder="Team" value={r.team} onChange={e => p({ team: e.target.value })} /><input className={`${mini} w-56`} placeholder="Runs by inning: 1, 0, 0, 2" value={r.runs.join(', ')} onChange={e => p({ runs: list(e.target.value).map(Number).filter(Number.isFinite) })} /><input className={`${mini} w-14`} placeholder="R" value={r.total} onChange={e => p({ total: e.target.value })} /></>} />
      </div>
    )
    case 'timeline': return <Rows items={s.points} set={points => set({ ...s, points })} make={(): TimelinePoint => ({ date: '', label: '' })} max={5} render={(r, p) => <><input className={`${mini} w-24`} placeholder="Date" value={r.date} onChange={e => p({ date: e.target.value })} /><input className={`${mini} w-40`} placeholder="Label" value={r.label} onChange={e => p({ label: e.target.value })} /><input className={`${mini} w-40`} placeholder="Detail (optional)" value={r.detail ?? ''} onChange={e => p({ detail: e.target.value || undefined })} /></>} />
    case 'vbars': return (
      <div className="flex flex-col gap-1">
        <Rows items={s.bars} set={bars => set({ ...s, bars })} make={() => ({ label: '', value: 0, tone: 'orange' as const })} max={12} render={(r, p) => <><input className={`${mini} w-20`} placeholder="Category" value={r.label} onChange={e => p({ label: e.target.value })} /><input className={`${mini} w-16`} inputMode="decimal" placeholder="Figure" value={r.value} onChange={e => p({ value: num(e.target.value) })} /><input className={`${mini} w-16`} placeholder="Shown" value={r.display ?? ''} onChange={e => p({ display: e.target.value || undefined })} /><select className={mini} value={r.tone} onChange={e => p({ tone: e.target.value as 'orange' | 'grey' })}><option value="orange">orange</option><option value="grey">grey</option></select></>} />
        <div className="flex flex-wrap items-center gap-2 text-xs">Marker before bar <input className={`${mini} w-12`} inputMode="numeric" value={s.marker?.before ?? ''} onChange={e => set({ ...s, marker: e.target.value === '' ? undefined : { before: num(e.target.value), label: s.marker?.label ?? 'TRADE' } })} /> label <input className={`${mini} w-24`} value={s.marker?.label ?? ''} onChange={e => set({ ...s, marker: s.marker ? { ...s.marker, label: e.target.value } : undefined })} /> Note <input className={`${mini} w-56`} value={s.note ?? ''} onChange={e => set({ ...s, note: e.target.value || undefined })} /> Scale max <input className={`${mini} w-16`} value={s.max ?? ''} onChange={e => set({ ...s, max: e.target.value ? num(e.target.value) : undefined })} /></div>
      </div>
    )
    case 'hbars': return (
      <div className="flex flex-col gap-1">
        <Rows items={s.rows} set={rows => set({ ...s, rows })} make={() => ({ label: '', value: 0, display: '', tone: 'orange' as const })} max={6} render={(r, p) => <><input className={`${mini} w-20`} placeholder="Label" value={r.label} onChange={e => p({ label: e.target.value })} /><input className={`${mini} w-20`} inputMode="decimal" placeholder="Figure" value={r.value} onChange={e => p({ value: num(e.target.value) })} /><input className={`${mini} w-20`} placeholder="Shown" value={r.display} onChange={e => p({ display: e.target.value })} /><select className={mini} value={r.tone} onChange={e => p({ tone: e.target.value as 'orange' | 'grey' })}><option value="orange">orange</option><option value="grey">grey</option></select></>} />
        <div className="text-xs">Scale max <input className={`${mini} w-20`} value={s.max ?? ''} onChange={e => set({ ...s, max: e.target.value ? num(e.target.value) : undefined })} /></div>
      </div>
    )
    case 'games': return <Rows items={s.games} set={games => set({ ...s, games })} make={() => ({ n: 1, score: '', winner: '', won: true })} max={7} render={(r, p) => <><input className={`${mini} w-12`} inputMode="numeric" value={r.n} onChange={e => p({ n: num(e.target.value) })} /><input className={`${mini} w-16`} placeholder="Score" value={r.score} onChange={e => p({ score: e.target.value })} /><input className={`${mini} w-24`} placeholder="Winner" value={r.winner} onChange={e => p({ winner: e.target.value })} /><label className="text-xs"><input type="checkbox" checked={r.won} onChange={e => p({ won: e.target.checked })} /> featured team won</label></>} />
    case 'trade': return (
      <div className="flex flex-col gap-1">
        <Rows items={s.groups} set={groups => set({ ...s, groups })} make={() => ({ label: '', names: [] })} max={4} render={(r, p) => <><input className={`${mini} w-32`} placeholder="TO ..." value={r.label} onChange={e => p({ label: e.target.value })} /><input className={`${mini} w-64`} placeholder="Names, separated by commas" value={r.names.join(', ')} onChange={e => p({ names: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></>} />
        <div className="flex flex-wrap items-center gap-1 text-xs">Note <input className={`${mini} w-44`} placeholder="Subtitle" value={s.note?.title ?? ''} onChange={e => set({ ...s, note: e.target.value || s.note?.value ? { title: e.target.value, value: s.note?.value ?? '', detail: s.note?.detail } : undefined })} /><input className={`${mini} w-20`} placeholder="Big figure" value={s.note?.value ?? ''} onChange={e => set({ ...s, note: { title: s.note?.title ?? '', value: e.target.value, detail: s.note?.detail } })} /><input className={`${mini} w-44`} placeholder="Detail" value={s.note?.detail ?? ''} onChange={e => set({ ...s, note: { title: s.note?.title ?? '', value: s.note?.value ?? '', detail: e.target.value || undefined } })} /></div>
      </div>
    )
    case 'slash': return <div className="flex flex-wrap items-center gap-1"><input className={`${mini} w-44`} placeholder=".400 / .423 / .600" value={s.line} onChange={e => set({ ...s, line: e.target.value })} /><input className={`${mini} w-36`} placeholder="Caption" value={s.caption} onChange={e => set({ ...s, caption: e.target.value })} /><input className={`${mini} w-44`} placeholder="Orange line" value={s.detail ?? ''} onChange={e => set({ ...s, detail: e.target.value || undefined })} /></div>
  }
}

export default function OtdForm({ spec, onChange }: { spec: GraphicSpec; onChange: (s: GraphicSpec) => void }) {
  const otd = spec.otd ?? { date: '', body: { sections: [] } as OtdBody }
  const body = otd.body
  const setBody = (b: OtdBody) => onChange({ ...spec, otd: { ...otd, body: b } })
  const setSections = (sections: OtdSectionData[]) => setBody({ ...body, sections })
  const move = (i: number, d: -1 | 1) => { const a = [...body.sections]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; setSections(a) }
  const tiles = body.tiles ?? []
  const setTiles = (t: OtdTileData[]) => setBody({ ...body, tiles: t.length ? t : undefined })
  return (
    <div className="flex flex-col gap-4">
      <div className={box}>
        <p className={`mb-2 ${lab}`}>Headline</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={input} value={otd.date} onChange={e => onChange({ ...spec, otd: { ...otd, date: e.target.value } })} placeholder="Event date, e.g. 2 Nov 2016 or 3 Nov 1981 and 1982" />
          <input className={input} value={spec.id} onChange={e => onChange({ ...spec, id: e.target.value.replace(/[^a-z0-9-]+/g, '-').toLowerCase() })} placeholder="file name, e.g. 2026-11-02-cubs-game7" />
          <input className={`${input} sm:col-span-2 font-bold`} value={spec.title} onChange={e => onChange({ ...spec, title: e.target.value })} placeholder="Headline (one line)" />
          <input className={`${input} sm:col-span-2`} value={spec.subtitle ?? ''} onChange={e => onChange({ ...spec, subtitle: e.target.value })} placeholder="Subline" />
        </div>
        <p className="mt-2 text-[11px] text-stone-500">The kicker is built for you: ON THIS DAY (or STAT OF THE DAY), a dot, then the date in capitals. This card never shows a team logo, headshot or team mark.</p>
      </div>

      <div className={box}>
        <p className={`mb-2 ${lab}`}>Sections · up to three, numbered in order</p>
        {body.sections.map((s, i) => (
          <div key={i} className="mb-3 rounded-lg border border-stone-200 p-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <b className="text-xs text-[#FF5722]">{String(i + 1).padStart(2, '0')}</b>
              <select className={mini} value={s.type} onChange={e => setSections(body.sections.map((x, j) => (j === i ? { ...blank(e.target.value as OtdSectionData['type']), label: x.label } : x)))}>
                {SECTION_TYPES.map(t => <option key={t.type} value={t.type}>{t.name}</option>)}
              </select>
              <input className={`${mini} w-56`} value={s.label} onChange={e => setSections(body.sections.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Section label" />
              <button type="button" className={link} onClick={() => move(i, -1)} disabled={i === 0}>up</button>
              <button type="button" className={link} onClick={() => move(i, 1)} disabled={i === body.sections.length - 1}>down</button>
              <button type="button" className={link} onClick={() => setSections(body.sections.filter((_, j) => j !== i))}>remove</button>
            </div>
            <Editor s={s} set={n => setSections(body.sections.map((x, j) => (j === i ? n : x)))} />
          </div>
        ))}
        {body.sections.length < 3 && <button type="button" className={link} onClick={() => setSections([...body.sections, blank('kv')])}>+ new section</button>}
        {body.sections.length > 1 && (
          <p className="mt-2 text-xs">Width ratios, side by side in 16:9 <input className={`${mini} w-32`} placeholder="600, 508" value={(body.widths ?? []).join(', ')} onChange={e => setBody({ ...body, widths: list(e.target.value).map(Number).filter(n => n > 0) })} /> <span className="text-stone-500">(stacked in 4:5)</span></p>
        )}
      </div>

      <div className={box}>
        <p className={`mb-2 ${lab}`}>Stat tiles · 2 to 4 (leave empty for none)</p>
        <Rows items={tiles} set={setTiles} make={(): OtdTileData => ({ label: '', value: '' })} max={4} render={(t, p) => <><input className={`${mini} w-40`} placeholder="Label" value={t.label} onChange={e => p({ label: e.target.value })} /><input className={`${mini} w-24`} placeholder="Figure" value={t.value} onChange={e => p({ value: e.target.value })} /><input className={`${mini} w-52`} placeholder="Detail (optional)" value={t.detail ?? ''} onChange={e => p({ detail: e.target.value || undefined })} /></>} />
      </div>
    </div>
  )
}
