'use client'

// src/components/graphics/StudioExtras.tsx
//
// The graphics studio's workflow boxes (mockups/graphics-studio.html): Checks (flagged words, hand-edited values, empty rows), Post (caption with
// the same word check, a reminder time; nothing posts by itself), Library (save, reopen, delete) and the slate batch. The drawing and export stay in
// GraphicsStudio.tsx; this file only holds the extra controls and their saved-graphics calls.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { checkGraphic } from '@/lib/graphics/checks'
import type { GraphicSpec } from '@/lib/graphics/types'

const input = 'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm'
const lab = 'text-[11px] uppercase tracking-widest text-stone-500'
const box = 'rounded-xl border border-stone-200 bg-white p-3'

interface Item { id: string; name: string; template: string; caption: string; post_at: string | null; updated_at: string }

export interface BatchState { running: boolean; done: number; total: number; message: string }

function toLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function StudioExtras({ spec, snapshot, caption, setCaption, postAt, setPostAt, libId, setLibId, onOpen, canExport, exporting, onDownloadBoth, batch, onBatch, onStopBatch, batchLabel, canBatch, hasDraft, onResume }: {
  spec: GraphicSpec
  snapshot: Record<string, string> | null
  caption: string; setCaption: (v: string) => void
  postAt: string; setPostAt: (v: string) => void
  libId: string | null; setLibId: (v: string | null) => void
  onOpen: (spec: GraphicSpec, caption: string, postAt: string) => void
  canExport: boolean; exporting: boolean; onDownloadBoth: () => void
  batch: BatchState; onBatch: () => void; onStopBatch: () => void; batchLabel: string; canBatch: boolean
  hasDraft: boolean; onResume: () => void
}) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [msg, setMsg] = useState('')
  const [name, setName] = useState('')
  const checks = useMemo(() => checkGraphic(spec, caption, snapshot), [spec, caption, snapshot])
  const warns = checks.filter(c => c.level === 'warn').length

  const load = useCallback(async () => {
    try {
      const d = (await (await fetch('/api/admin/graphics-library')).json()) as { items?: Item[]; missingTable?: boolean }
      setItems(d.items ?? [])
      if (d.missingTable) setMsg('The library table is not set up yet. Run supabase/migrations/20261030210000_graphics_library.sql in Supabase.')
    } catch { setItems([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function save(asNew: boolean) {
    setMsg('Saving…')
    try {
      const res = await fetch('/api/admin/graphics-library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: asNew ? undefined : libId ?? undefined, name: name || spec.title, spec, caption, post_at: postAt ? new Date(postAt).toISOString() : null }),
      })
      const d = (await res.json()) as Item & { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setLibId(d.id); setMsg(`Saved "${d.name}".`); void load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed') }
  }
  async function open(id: string) {
    setMsg('Opening…')
    try {
      const res = await fetch(`/api/admin/graphics-library?id=${id}`)
      const d = (await res.json()) as { id: string; name: string; spec: GraphicSpec; caption: string; post_at: string | null; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Could not open it')
      setLibId(d.id); setName(d.name); onOpen(d.spec, d.caption, toLocal(d.post_at)); setMsg(`Opened "${d.name}".`)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not open it') }
  }
  async function remove(id: string) {
    const res = await fetch(`/api/admin/graphics-library?id=${id}`, { method: 'DELETE' })
    if (res.ok) { if (libId === id) setLibId(null); void load() } else setMsg('Delete failed')
  }

  return (
    <>
      <div className={box}>
        <p className={`mb-2 ${lab}`}>Checks · {warns ? `${warns} to review` : 'all clear'}</p>
        <ul className="flex flex-col gap-1 text-[12px]">
          {checks.map(c => (
            <li key={c.id} className="flex gap-2">
              <b style={{ width: 14, color: c.level === 'ok' ? '#1D9E75' : '#FF5722' }}>{c.level === 'ok' ? '✓' : '!'}</b>
              <span>{c.text}{c.detail && <span className="block text-[11px] text-stone-500">{c.detail}</span>}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-stone-500">These warn but never block: your own presets may use flagged words on purpose. Anything the data did not have is listed under the auto-fill as &quot;Not in the data&quot;.</p>
      </div>

      <div className={box}>
        <p className={`mb-2 ${lab}`}>Post · caption and reminder</p>
        <textarea className={`${input} w-full`} rows={3} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption for the post. Checked with the same word list." />
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-stone-500">
          <span style={{ color: caption.length > 280 ? '#D4533B' : undefined }}>{caption.length} / 280</span>
          <label className="flex items-center gap-2">Reminder
            <input type="datetime-local" className={input} value={postAt} onChange={e => setPostAt(e.target.value)} />
          </label>
          <span>A reminder only. Nothing posts by itself.</span>
        </div>
      </div>

      <div className={box}>
        <p className={`mb-2 ${lab}`}>Library · saved graphics</p>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} w-56`} value={name} onChange={e => setName(e.target.value)} placeholder={spec.title || 'Name'} />
          <button className="gs-btn" style={{ minHeight: 36 }} onClick={() => void save(false)}>{libId ? 'Update saved' : 'Save to library'}</button>
          {libId && <button className="gs-btn" style={{ minHeight: 36, background: '#1A1A1A' }} onClick={() => void save(true)}>Save as new</button>}
          {hasDraft && <button className="gs-btn" style={{ minHeight: 36, background: '#1A1A1A' }} onClick={onResume}>Resume last unsaved draft</button>}
        </div>
        {msg && <p className="mt-1 text-[11px] text-stone-600" role="status">{msg}</p>}
        <div className="mt-2 flex flex-col gap-1">
          {items === null ? <p className="text-[11px] text-stone-500">Loading…</p> : items.length === 0 ? <p className="text-[11px] text-stone-500">Nothing saved yet.</p> : items.map(i => (
            <div key={i.id} className="flex items-center gap-2 rounded-md border border-stone-200 px-2 py-1 text-[12px]" style={{ background: i.id === libId ? '#fff7f3' : undefined }}>
              <span className="flex-1"><b>{i.name}</b> <span className="text-stone-500">· {i.template} · {new Date(i.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{i.post_at ? ` · remind ${new Date(i.post_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</span></span>
              <button className="underline" onClick={() => void open(i.id)}>Open</button>
              <button className="text-stone-400 hover:text-red-600" onClick={() => void remove(i.id)} title="Delete">×</button>
            </div>
          ))}
        </div>
      </div>

      <div className={box}>
        <p className={`mb-2 ${lab}`}>Download</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="gs-btn" disabled={!canExport || exporting} onClick={onDownloadBoth}>Download both sizes</button>
          <button className="gs-btn" style={{ background: '#1A1A1A' }} disabled={!canBatch || batch.running} onClick={onBatch}>{batch.running ? `Making ${batch.done + 1} of ${batch.total}…` : `Make ${batchLabel} for the whole slate`}</button>
          {batch.running && <button className="text-[12px] underline" onClick={onStopBatch}>Stop</button>}
        </div>
        {batch.message && <p className="mt-1 text-[11px] text-stone-600" role="status">{batch.message}</p>}
        <p className="mt-1 text-[11px] text-stone-500">The slate batch fills the chosen template for each game on the date above and downloads a PNG per game. Your browser may ask to allow multiple downloads.</p>
      </div>
    </>
  )
}
