'use client'

// src/app/admin/calendar/CalendarBoard.tsx
//
// The calendar screen: roadmap report, month grid and the selected day's panel. Changes go to /api/admin/content-plan and the page is refreshed from the
// server afterwards, so what is on screen is always what is saved.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { C, SANS } from '@/components/team/ui'
import ItemDrawer from './ItemDrawer'
import {
  KINDS, OPEN, STATUSES, addDays, kindOf, repeatDays, shiftMonth,
  type ArticleRef, type Entry, type Kind, type Roadmap, type Status, type Targets,
} from '@/lib/content-plan-core'

const lab: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, margin: '12px 0 4px' }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontFamily: SANS, fontSize: 13.5, boxSizing: 'border-box', color: C.ink }
const btn: React.CSSProperties = { padding: '9px 16px', border: 'none', borderRadius: 6, fontFamily: SANS, fontWeight: 800, fontSize: 12.5, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer' }
const lite: React.CSSProperties = { padding: '5px 11px', border: `1px solid ${C.line}`, borderRadius: 999, background: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 12, cursor: 'pointer', color: C.ink }
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }
const VERDICT: Record<Roadmap['verdict'], { bg: string; fg: string }> = { 'On track': { bg: '#E3F5EC', fg: '#12714F' }, Watch: { bg: '#FEF3C7', fg: '#8A5A00' }, Behind: { bg: '#FBE4DF', fg: '#B23A24' } }
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const dayLabel = (d: string, o: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
const monthLabel = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

type Form = { id: string | null; kind: Kind; title: string; notes: string; status: Status; article_id: string; url: string; every: 'none' | 'day' | 'week'; count: number }
const blank = (): Form => ({ id: null, kind: 'article', title: '', notes: '', status: 'planned', article_id: '', url: '', every: 'none', count: 5 })

export default function CalendarBoard(p: { ym: string; today: string; selected: string; grid: { day: string; inMonth: boolean }[][]; entries: Entry[]; report: Roadmap; targets: Targets; linkable: ArticleRef[]; missing: boolean }) {
  const router = useRouter()
  const [sel, setSel] = useState(p.selected)
  const [form, setForm] = useState<Form>(blank())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState<Targets>(p.targets)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<Entry | null>(null)

  const byDay = useMemo(() => { const m = new Map<string, Entry[]>(); for (const e of p.entries) (m.get(e.day) ?? m.set(e.day, []).get(e.day)!).push(e); return m }, [p.entries])
  const dayEntries = byDay.get(sel) ?? []
  const r = p.report

  async function call(method: string, url: string, body?: unknown): Promise<boolean> {
    setBusy(true); setErr('')
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !j.ok) { setErr(j.error ?? 'Could not save. Try again.'); return false }
      router.refresh()
      return true
    } catch { setErr('Could not reach the server. Try again.'); return false } finally { setBusy(false) }
  }

  async function save() {
    if (!form.title.trim()) { setErr('A title is needed.'); return }
    const base = { kind: form.kind, title: form.title, notes: form.notes, status: form.status, article_id: form.article_id || null, url: form.url }
    const ok = form.id ? await call('PATCH', '/api/admin/content-plan', { id: form.id, plan_date: sel, ...base }) : await call('POST', '/api/admin/content-plan', { items: repeatDays(sel, form.every, form.count).map(d => ({ plan_date: d, ...base })) })
    if (ok) setForm(blank())
  }
  const setStatus = (e: Entry, status: Status) => e.itemId && call('PATCH', '/api/admin/content-plan', { id: e.itemId, status })
  const edit = (e: Entry) => e.itemId && setForm({ id: e.itemId, kind: e.kind, title: e.title, notes: e.notes ?? '', status: e.status === 'published' && !e.articleId ? 'published' : e.status, article_id: e.articleId ?? '', url: e.url ?? '', every: 'none', count: 1 })
  async function saveTargets() { if (await call('PUT', '/api/admin/content-plan', { targets: draft })) setMsg('Targets saved.') }

  /** "Brief" and the image count, shown on an item that has them. */
  const tags = (e: Entry) => (e.hasBrief || (e.assetCount ?? 0) > 0) ? <span style={{ fontWeight: 800, opacity: 0.85 }}>{e.hasBrief ? ' · Brief' : ''}{(e.assetCount ?? 0) > 0 ? ` · ${e.assetCount} img` : ''}</span> : null
  const openItem = (e: Entry, ev: React.SyntheticEvent) => { ev.stopPropagation(); if (e.itemId) setOpen(e); else setSel(e.day) }

  const chip = (e: Entry, small = false): React.CSSProperties => {
    const k = kindOf(e.kind)
    const done = e.status === 'published', skipped = e.status === 'skipped'
    return { display: 'block', width: '100%', textAlign: 'left', boxSizing: 'border-box', padding: small ? '1px 5px' : '3px 8px', borderRadius: 4, fontSize: small ? 11 : 12.5, fontWeight: 700, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${skipped ? C.line : k.color}`, background: done ? k.color : '#fff', color: done ? '#fff' : skipped ? C.mute : k.color, textDecoration: skipped ? 'line-through' : undefined, fontFamily: SANS }
  }

  return (
    <div>
      <style>{'@media (max-width: 980px){.cal-cols{grid-template-columns:1fr !important}.cal-cell{min-height:70px !important}.cal-chip-text{display:none}}'}</style>

      {p.missing && (
        <div role="note" style={{ ...card, background: '#FEF9C3', borderColor: '#e8dc7a', marginBottom: 16, fontSize: 13.5, lineHeight: 1.55 }}>
          <b>One step to switch the plan on.</b> The calendar needs two small tables. In Supabase, open the SQL editor and run <code>supabase/migrations/20261105100000_content_plan.sql</code>, then reload this page. Until then you can browse, but nothing can be saved. Articles you have published still show on their days.
        </div>
      )}

      {/* ── Roadmap report ─────────────────────────────────────────────── */}
      <section style={{ ...card, marginBottom: 18 }} aria-label="Roadmap report">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ background: VERDICT[r.verdict].bg, color: VERDICT[r.verdict].fg, fontWeight: 800, fontSize: 15, padding: '6px 14px', borderRadius: 999 }}>{r.verdict}</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Roadmap: week of {dayLabel(r.weekStart, { month: 'short', day: 'numeric' })} to {dayLabel(r.weekEnd, { month: 'short', day: 'numeric' })}</div>
              <div style={{ fontSize: 12.5, color: '#5B5347' }}>{r.streak > 0 ? `${r.streak}-day streak of days with something published.` : 'No streak running: nothing published today or yesterday.'}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
          {r.kinds.filter(k => k.target > 0).map(k => {
            const col = kindOf(k.kind).color, pct = (n: number) => `${Math.min(100, (n / k.target) * 100)}%`
            return (
              <div key={k.kind} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span>{k.label}</span><span style={{ color: k.verdict === 'behind' ? '#B23A24' : k.verdict === 'done' ? '#12714F' : C.ink }}>{k.done} of {k.target}</span></div>
                <div style={{ position: 'relative', height: 10, background: '#F1EEE6', borderRadius: 5, margin: '8px 0 6px', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: pct(k.done + k.upcoming), background: `${col}44` }} />
                  <div style={{ position: 'absolute', inset: 0, width: pct(k.done), background: col }} />
                </div>
                <div style={{ fontSize: 11.5, color: '#5B5347' }}>{k.upcoming} still planned this week · {k.verdict === 'done' ? 'target met' : k.verdict === 'behind' ? `about ${k.expected} should be out by now` : 'on pace'}</div>
              </div>
            )
          })}
          {r.kinds.every(k => k.target === 0) && <div style={{ fontSize: 13, color: '#5B5347' }}>No weekly targets are set. Set them below to measure the plan against.</div>}
        </div>

        {r.reasons.length > 0 && <ul style={{ margin: '14px 0 0', paddingLeft: 20, fontSize: 13.5, lineHeight: 1.55 }}>{r.reasons.map(x => <li key={x}>{x}</li>)}</ul>}

        {(r.overdue.length > 0 || r.gaps.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 12 }}>
            {r.overdue.length > 0 && (
              <div>
                <div style={{ ...lab, margin: '0 0 6px' }}>Planned but not marked published or skipped</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{r.overdue.slice(0, 12).map(e => <button key={e.key} type="button" onClick={() => setSel(e.day)} style={{ ...lite, borderColor: '#E5B4A8' }}>{dayLabel(e.day, { month: 'short', day: 'numeric' })}: {e.title.slice(0, 28)}</button>)}</div>
              </div>
            )}
            {r.gaps.length > 0 && (
              <div>
                <div style={{ ...lab, margin: '0 0 6px' }}>Next 7 days with nothing planned</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{r.gaps.map(d => <button key={d} type="button" onClick={() => setSel(d)} style={lite}>{dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</button>)}</div>
              </div>
            )}
          </div>
        )}

        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>Last five weeks and weekly targets</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 10 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: C.mute }}>Week of</th>{KINDS.map(k => <th key={k.id} style={{ padding: '4px 10px', color: C.mute, textAlign: 'right' }}>{k.plural}</th>)}</tr></thead>
              <tbody>
                {r.weeks.map(w => (
                  <tr key={w.weekStart} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: '4px 12px 4px 0', fontWeight: 700 }}>{dayLabel(w.weekStart, { month: 'short', day: 'numeric' })}</td>
                    {KINDS.map(k => { const t = p.targets[k.id]; const met = t > 0 && w.done[k.id] >= t; return <td key={k.id} style={{ padding: '4px 10px', textAlign: 'right', color: t > 0 ? (met ? '#12714F' : '#B23A24') : C.mute, fontWeight: 700 }}>{w.done[k.id]}{t > 0 ? ` / ${t}` : ''}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <div style={{ fontSize: 12, color: C.mute, marginBottom: 6 }}>How many should go out each week (0 for no target):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {KINDS.map(k => <label key={k.id} style={{ fontSize: 12, fontWeight: 700 }}>{k.plural}<input type="number" min={0} max={50} value={draft[k.id]} onChange={e => setDraft(d => ({ ...d, [k.id]: Math.max(0, Math.min(50, Math.floor(Number(e.target.value) || 0))) }))} style={{ ...inp, width: 70, display: 'block', marginTop: 3 }} /></label>)}
              </div>
              <button type="button" onClick={saveTargets} disabled={busy || p.missing} style={{ ...btn, background: C.ink, color: '#fff', marginTop: 10, opacity: busy || p.missing ? 0.5 : 1 }}>Save targets</button>
              {msg && <span style={{ fontSize: 12, color: '#12714F', marginLeft: 10 }}>{msg}</span>}
            </div>
          </div>
        </details>
      </section>

      <div className="cal-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 18, alignItems: 'start' }}>
        {/* ── Month grid ─────────────────────────────────────────────── */}
        <section aria-label="Month">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <Link href={`/admin/calendar?m=${shiftMonth(p.ym, -1)}`} style={{ ...lite, textDecoration: 'none' }} aria-label="Previous month">←</Link>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, minWidth: 190, textAlign: 'center' }}>{monthLabel(p.ym)}</h2>
            <Link href={`/admin/calendar?m=${shiftMonth(p.ym, 1)}`} style={{ ...lite, textDecoration: 'none' }} aria-label="Next month">→</Link>
            <Link href="/admin/calendar" style={{ ...lite, textDecoration: 'none' }}>Today</Link>
            <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto', fontSize: 11.5, color: '#5B5347' }}>{KINDS.slice(0, 5).map(k => <span key={k.id}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: k.color, marginRight: 4 }} />{k.label}</span>)}<span>Filled = published</span></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
            {WEEKDAYS.map(d => <div key={d} style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: C.mute, textTransform: 'uppercase', padding: '2px 4px' }}>{d}</div>)}
            {p.grid.flat().map(({ day, inMonth }) => {
              const list = byDay.get(day) ?? []
              const isToday = day === p.today, isSel = day === sel
              return (
                <div key={day} className="cal-cell" role="button" tabIndex={0} onClick={() => setSel(day)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(day) } }}
                  style={{ minHeight: 104, padding: 5, borderRadius: 8, cursor: 'pointer', background: inMonth ? '#fff' : '#F7F4EC', border: `${isSel ? 2 : 1}px solid ${isSel ? C.orange : isToday ? C.ink : C.line}`, opacity: inMonth ? 1 : 0.65, boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, marginBottom: 3, color: isToday ? C.orange : C.ink }}><span>{Number(day.slice(8))}</span>{list.length > 0 && <span style={{ fontSize: 10.5, color: C.mute, fontWeight: 700 }}>{list.filter(e => e.status === 'published').length}/{list.length}</span>}</div>
                  <div style={{ display: 'grid', gap: 2 }}>
                    {list.slice(0, 3).map(e => <span key={e.key} className="cal-chip-text" role="button" tabIndex={0} onClick={ev => openItem(e, ev)} onKeyDown={ev => { if (ev.key === 'Enter') openItem(e, ev) }} style={chip(e, true)} title={`${kindOf(e.kind).label}: ${e.title} (${e.status}). Click to open.`}>{e.title}{tags(e)}</span>)}
                    {list.length > 3 && <span style={{ fontSize: 10.5, color: C.mute, fontWeight: 700 }}>+{list.length - 3} more</span>}
                    <span style={{ display: 'none' }} className="cal-dots" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Day panel ──────────────────────────────────────────────── */}
        <aside style={card} aria-label="Selected day">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{dayLabel(sel)}</h3>
            <span style={{ display: 'flex', gap: 4 }}><button type="button" style={lite} onClick={() => setSel(addDays(sel, -1))} aria-label="Previous day">←</button><button type="button" style={lite} onClick={() => setSel(addDays(sel, 1))} aria-label="Next day">→</button></span>
          </div>
          {sel === p.today && <div style={{ fontSize: 12, color: C.orange, fontWeight: 800, marginTop: 2 }}>Today</div>}

          <div style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
            {dayEntries.length === 0 && <div style={{ fontSize: 13, color: '#5B5347' }}>Nothing planned for this day.</div>}
            {dayEntries.map(e => (
              <div key={e.key} style={{ border: `1px solid ${C.line}`, borderLeft: `4px solid ${kindOf(e.kind).color}`, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>{kindOf(e.kind).label} · {STATUSES.find(s => s.id === e.status)?.label}{e.source === 'article' ? ' · from the site' : ''}</div>
                <div style={{ fontSize: 14, fontWeight: 800, margin: '2px 0', textDecoration: e.status === 'skipped' ? 'line-through' : undefined }}>{e.source === 'plan' ? <button type="button" onClick={ev => openItem(e, ev)} style={{ all: 'unset', cursor: 'pointer' }} title="Open the brief and images">{e.title}</button> : e.href ? <Link href={e.href} style={{ color: C.ink }} target={e.href.startsWith('http') ? '_blank' : undefined}>{e.title}</Link> : e.title}{tags(e)}</div>
                {e.notes && <div style={{ fontSize: 12.5, color: '#5B5347', whiteSpace: 'pre-wrap' }}>{e.notes}</div>}
                {e.source === 'plan' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {OPEN.includes(e.status) && <button type="button" style={lite} onClick={() => setStatus(e, 'published')} disabled={busy}>Mark published</button>}
                    {OPEN.includes(e.status) && <button type="button" style={lite} onClick={() => setStatus(e, 'skipped')} disabled={busy}>Skip</button>}
                    {!OPEN.includes(e.status) && <button type="button" style={lite} onClick={() => setStatus(e, 'planned')} disabled={busy}>Back to planned</button>}
                    <button type="button" style={lite} onClick={ev => openItem(e, ev)}>Open</button>
                    <button type="button" style={lite} onClick={() => edit(e)}>Edit</button>
                    <button type="button" style={{ ...lite, color: '#B23A24' }} onClick={() => { if (e.itemId && window.confirm('Delete this item from the plan?')) call('DELETE', `/api/admin/content-plan?id=${e.itemId}`) }} disabled={busy}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 4 }}>
            <div style={{ ...lab, color: C.ink, fontSize: 11 }}>{form.id ? 'Edit this item' : 'New item for this day'}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ ...inp, flex: 1 }} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as Kind }))} aria-label="Kind">{KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
              <select style={{ ...inp, flex: 1 }} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))} aria-label="Status">{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </div>
            <input style={{ ...inp, marginTop: 6 }} placeholder="Title (what goes out)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={200} />
            <textarea style={{ ...inp, marginTop: 6, minHeight: 56, resize: 'vertical' }} placeholder="Notes (angle, data, who does what)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            {form.kind === 'article' && (
              <select style={{ ...inp, marginTop: 6 }} value={form.article_id} onChange={e => setForm(f => ({ ...f, article_id: e.target.value, title: f.title || p.linkable.find(a => a.id === e.target.value)?.title || '' }))} aria-label="Link to an article">
                <option value="">Not linked to an article yet</option>
                {p.linkable.map(a => <option key={a.id} value={a.id}>{a.title.slice(0, 60)} ({a.status})</option>)}
              </select>
            )}
            <input style={{ ...inp, marginTop: 6 }} placeholder="Link (optional): a post, video or page" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
            {!form.id && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <select style={{ ...inp, flex: 2 }} value={form.every} onChange={e => setForm(f => ({ ...f, every: e.target.value as Form['every'] }))} aria-label="Repeat"><option value="none">Does not repeat</option><option value="day">Repeat every day</option><option value="week">Repeat every week</option></select>
                {form.every !== 'none' && <input style={{ ...inp, flex: 1 }} type="number" min={1} max={60} value={form.count} onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) || 1 }))} aria-label="How many times" />}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={save} disabled={busy || p.missing} style={{ ...btn, background: C.orange, color: '#1A1A1A', opacity: busy || p.missing ? 0.5 : 1 }}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Save to the plan'}</button>
              {form.id && <button type="button" onClick={() => setForm(blank())} style={{ ...btn, background: '#fff', color: C.ink, border: `1px solid ${C.line}` }}>Cancel</button>}
            </div>
            {err && <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: C.bad }}>{err}</div>}
          </div>
        </aside>
      </div>
      {open && <ItemDrawer key={open.itemId} entry={open} onClose={() => setOpen(null)} onChanged={() => router.refresh()} />}
    </div>
  )
}
