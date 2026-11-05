'use client'

// src/app/admin/calendar/ItemDrawer.tsx
//
// The panel that opens when an item on the calendar is clicked: title, status, notes, the full brief or script (with Copy) and the item's images.
// Desktop: a 480px panel on the right. Phone: full screen. Esc or the close button shuts it. The brief is read when the drawer opens, not carried by the page.
// Images are in a private bucket and arrive as signed links that last an hour. Fields save when you click out of them.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'
import { ASSET_ROLES, MAX_ASSETS, MAX_BRIEF, STATUSES, kindOf, sourceLabel, type Asset, type Entry, type Status } from '@/lib/content-plan-core'

type Full = { id: string; plan_date: string; kind: string; title: string; notes: string; status: Status; brief: string; source: string; url: string }
type Shown = Asset & { url: string | null }
const API = '/api/admin/content-plan'
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontFamily: SANS, fontSize: 14, boxSizing: 'border-box', color: C.ink }
const lite: React.CSSProperties = { padding: '5px 11px', border: `1px solid ${C.line}`, borderRadius: 999, background: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 12, cursor: 'pointer', color: C.ink }
const label: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, margin: '16px 0 5px' }
const dayText = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

export default function ItemDrawer({ entry, onClose, onChanged }: { entry: Entry; onClose: () => void; onChanged: () => void }) {
  const id = entry.itemId as string
  const [item, setItem] = useState<Full | null>(null)
  const [title, setTitle] = useState(entry.title)
  const [notes, setNotes] = useState('')
  const [brief, setBrief] = useState('')
  const [status, setStatus] = useState<Status>(entry.status)
  const [saved, setSaved] = useState('')
  const [err, setErr] = useState('')
  const [assets, setAssets] = useState<Shown[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<Asset['role']>('graphic')
  const [imgLabel, setImgLabel] = useState('')
  const [copied, setCopied] = useState(false)
  const last = useRef({ title: entry.title, notes: '', brief: '' })
  const closeBtn = useRef<HTMLButtonElement>(null)

  const loadAssets = useCallback(async () => {
    try {
      const r = await fetch(`${API}/assets?id=${id}`)
      const j = (await r.json()) as { ok?: boolean; assets?: Shown[]; error?: string }
      if (r.ok && j.ok) setAssets(j.assets ?? []); else { setAssets([]); if (r.status !== 503) setErr(j.error ?? 'Could not load the images.') }
    } catch { setAssets([]); setErr('Could not load the images.') }
  }, [id])

  useEffect(() => {
    let live = true
    // the drawer is remounted for each item (key={itemId}), so its state is already fresh here
    fetch(`${API}?id=${id}`).then(async r => { const j = (await r.json()) as { ok?: boolean; item?: Full; error?: string }; if (!live) return; if (!r.ok || !j.item) { setErr(j.error ?? 'Could not open this item.'); return } const it = j.item; setItem(it); setTitle(it.title); setNotes(it.notes ?? ''); setBrief(it.brief ?? ''); setStatus(it.status); last.current = { title: it.title, notes: it.notes ?? '', brief: it.brief ?? '' } }).catch(() => live && setErr('Could not open this item.'))
    queueMicrotask(loadAssets) // after the first paint, so the images load without a synchronous state update in the effect
    return () => { live = false }
  }, [id, loadAssets])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    closeBtn.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function patch(body: Record<string, unknown>, what: string) {
    setErr('')
    try {
      const r = await fetch(API, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!r.ok || !j.ok) { setErr(j.error ?? 'Could not save. Try again.'); return false }
      setSaved(`${what} saved`); onChanged(); setTimeout(() => setSaved(''), 2000)
      return true
    } catch { setErr('Could not reach the server.'); return false }
  }
  const saveTitle = async () => { const t = title.trim(); if (!t) { setTitle(last.current.title); return } if (t !== last.current.title && (await patch({ title: t }, 'Title'))) last.current.title = t }
  const saveNotes = async () => { if (notes !== last.current.notes && (await patch({ notes }, 'Notes'))) last.current.notes = notes }
  const saveBrief = async () => { if (brief !== last.current.brief && (await patch({ brief }, 'Brief'))) last.current.brief = brief }
  const changeStatus = async (s: Status) => { const before = status; setStatus(s); if (!(await patch({ status: s }, 'Status'))) setStatus(before) }

  async function copy() {
    try { await navigator.clipboard.writeText(brief); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setErr('Could not copy. Select the text and copy it by hand.') }
  }
  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const f = new FormData(); f.append('id', id); f.append('file', file); f.append('role', role); f.append('label', imgLabel || file.name)
      const r = await fetch(`${API}/assets`, { method: 'POST', body: f })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!r.ok || !j.ok) setErr(j.error ?? 'Upload failed.'); else { setImgLabel(''); await loadAssets(); onChanged() }
    } catch { setErr('Upload failed. Try again.') } finally { setBusy(false) }
  }
  async function remove(a: Shown) {
    if (!window.confirm(`Remove "${a.label}"? The file is deleted.`)) return
    setBusy(true)
    try {
      const r = await fetch(`${API}/assets?id=${id}&path=${encodeURIComponent(a.path)}`, { method: 'DELETE' })
      if (!r.ok) setErr('Could not remove the image.'); else { await loadAssets(); onChanged() }
    } finally { setBusy(false) }
  }

  const k = kindOf(entry.kind)
  const hero = entry.kind === 'video' ? assets?.find(a => a.role === 'thumbnail' && a.url) : undefined

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,.35)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}>
      <style>{'.cal-drawer{width:480px}@media (max-width: 700px){.cal-drawer{width:100% !important}}'}</style>
      <aside className="cal-drawer" role="dialog" aria-modal="true" aria-label={`${k.label}: ${entry.title}`} onClick={e => e.stopPropagation()}
        style={{ height: '100%', overflowY: 'auto', background: '#FAF8F3', borderLeft: `1px solid ${C.line}`, boxShadow: '-8px 0 30px rgba(0,0,0,.12)', padding: '18px 20px 40px', boxSizing: 'border-box', fontFamily: SANS, color: C.ink }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: k.color, color: '#fff', fontWeight: 800, fontSize: 12, padding: '3px 10px', borderRadius: 999 }}>{k.label}</span>
          <span style={{ fontSize: 13, color: '#5B5347', fontWeight: 700 }}>{dayText(entry.day)}</span>
          <button ref={closeBtn} type="button" onClick={onClose} style={{ ...lite, marginLeft: 'auto' }} aria-label="Close">Close</button>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, marginTop: 10 }}>From {sourceLabel(item?.source ?? entry.from ?? 'george')}</div>

        {/* eslint-disable-next-line @next/next/no-img-element -- private signed links cannot go through the image optimiser */}
        {hero && hero.url && <a href={hero.url} target="_blank" rel="noopener noreferrer"><img src={hero.url} alt={hero.label} style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.line}`, marginTop: 12, display: 'block' }} /></a>}

        <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} maxLength={200} aria-label="Title" style={{ ...field, marginTop: 12, fontSize: 18, fontWeight: 800 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <select value={status} onChange={e => changeStatus(e.target.value as Status)} aria-label="Status" style={{ ...field, width: 'auto', fontWeight: 700 }}>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          {entry.href && <Link href={entry.href} target={entry.href.startsWith('http') ? '_blank' : undefined} style={{ fontSize: 12.5, color: C.orange, fontWeight: 800 }}>Open the piece →</Link>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#12714F', fontWeight: 700, minHeight: 16 }} aria-live="polite">{saved}</span>
        </div>

        <label style={label} htmlFor="drawer-notes">Notes</label>
        <textarea id="drawer-notes" value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} rows={3} maxLength={2000} placeholder="Angle, data, who does what" style={{ ...field, resize: 'vertical' }} />

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <label style={label} htmlFor="drawer-brief">Brief or script</label>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0 5px' }}>
            <span style={{ fontSize: 11.5, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{brief.length.toLocaleString()} / {MAX_BRIEF.toLocaleString()}</span>
            <button type="button" onClick={copy} disabled={!brief} style={{ ...lite, opacity: brief ? 1 : 0.5 }}>{copied ? 'Copied' : 'Copy'}</button>
          </span>
        </div>
        <textarea id="drawer-brief" value={brief} onChange={e => setBrief(e.target.value.slice(0, MAX_BRIEF))} onBlur={saveBrief} rows={16} placeholder="Paste or write the full brief or script here. It saves when you click away." style={{ ...field, resize: 'vertical', whiteSpace: 'pre-wrap', lineHeight: 1.55, minHeight: 220 }} />

        <label style={label}>Images ({assets?.length ?? 0} of {MAX_ASSETS})</label>
        {assets === null ? <div style={{ fontSize: 13, color: '#5B5347' }}>Loading…</div> : assets.length === 0 ? <div style={{ fontSize: 13, color: '#5B5347' }}>No images yet.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {assets.map(a => (
              <figure key={a.path} style={{ margin: 0, border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private signed links cannot go through the image optimiser */}
                {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" title="Open full size"><img src={a.url} alt={a.label} loading="lazy" style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block' }} /></a> : <div style={{ aspectRatio: '16 / 10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.mute }}>Link unavailable</div>}
                <figcaption style={{ padding: '6px 8px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.label}>{a.label}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}><span style={{ color: C.mute, textTransform: 'capitalize' }}>{a.role}</span><button type="button" onClick={() => remove(a)} disabled={busy} style={{ all: 'unset', cursor: 'pointer', color: '#B23A24', fontWeight: 700 }}>Remove</button></div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, padding: 10, border: `1px dashed ${C.line}`, borderRadius: 8, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <select value={role} onChange={e => setRole(e.target.value as Asset['role'])} aria-label="What the image is" style={{ ...field, width: 'auto' }}>{ASSET_ROLES.map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select>
            <input value={imgLabel} onChange={e => setImgLabel(e.target.value)} placeholder="Label (optional)" maxLength={80} aria-label="Label" style={field} />
          </div>
          <label style={{ ...lite, display: 'inline-block', opacity: busy || (assets?.length ?? 0) >= MAX_ASSETS ? 0.5 : 1 }}>
            {busy ? 'Uploading…' : 'Upload an image'}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || (assets?.length ?? 0) >= MAX_ASSETS} onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} />
          </label>
          <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>PNG, JPEG or WebP, up to 8 MB. Images are private: they show here through a link that expires after an hour.</div>
        </div>
        {err && <div role="alert" style={{ marginTop: 12, fontSize: 13, color: C.bad }}>{err}</div>}
      </aside>
    </div>
  )
}
