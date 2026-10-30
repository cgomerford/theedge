'use client'

// The writer's sidebar: Story (the fields around the article), Visuals (upload, headshots and logos, the image library, hero), Checks and Publish.
// Presentational: state and saving live in ArticleWriter.tsx.

import { useEffect, useRef, useState } from 'react'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import { teamLogoUrl } from '@/lib/mlb'
import { teamCodeToId, teamCodeToName } from '@/lib/team-codes'
import type { Check } from '@/lib/article-checks'
import { MLB_CODES, SECTIONS, type WriterMeta } from './types'

export const C = { line: '#e7e2d8', soft: '#f1eee6', mute: '#8a8275', orange: '#FF5722', good: '#1D9E75', bad: '#D4533B', cream: '#FAF8F3' }
const inp: React.CSSProperties = { width: '100%', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontSize: 13.5, background: C.cream, fontFamily: 'inherit' }
const lab: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, marginBottom: 5 }
const chip = (on: boolean): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 700, border: `1px solid ${on ? C.orange : C.line}`, background: on ? C.orange : '#fff', color: on ? '#fff' : '#1A1A1A', borderRadius: 999, padding: '4px 9px', cursor: 'pointer' })
const cnt = (ok: boolean): React.CSSProperties => ({ fontSize: 11, color: ok ? C.good : C.mute, textAlign: 'right', marginTop: 3 })
const note: React.CSSProperties = { fontSize: 11.5, color: C.mute, lineHeight: 1.5, marginTop: 6 }
const F = ({ label, children }: { label: string; children: React.ReactNode }) => <div style={{ marginBottom: 15 }}><label style={lab}>{label}</label>{children}</div>

type Person = { id: number; fullName: string; primaryPosition: string }
export function usePeople() {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Person[]>([])
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const search = (v: string) => {
    setQ(v)
    if (t.current) clearTimeout(t.current)
    if (v.trim().length < 2) { setFound([]); return }
    t.current = setTimeout(async () => {
      try { setFound(((await (await fetch(`/api/lab/search?q=${encodeURIComponent(v.trim())}`)).json()) as { people: Person[] }).people.slice(0, 6)) } catch { setFound([]) }
    }, 250)
  }
  return { q, found, search, clear: () => { setQ(''); setFound([]) } }
}

// ---- Story -----------------------------------------------------------------------------------------------------------------------------

export function StoryPanel({ meta, set, slugLocked, onTitleSlug }: { meta: WriterMeta; set: (p: Partial<WriterMeta>) => void; slugLocked: boolean; onTitleSlug: () => void }) {
  const people = usePeople()
  const toggle = (c: string) => set({ teamTags: meta.teamTags.includes(c) ? meta.teamTags.filter(x => x !== c) : [...meta.teamTags, c] })
  return (
    <div>
      <F label="Section">
        <select style={inp} value={meta.section} onChange={e => set({ section: e.target.value })}>
          <option value="">Choose a section</option>
          {SECTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
      </F>
      <F label="Headline">
        <div style={cnt(meta.title.length > 0 && meta.title.length <= 70)}>{meta.title.length} characters{meta.title.length > 70 ? ' (long for search)' : meta.title.length ? ' (good under 70)' : ''}</div>
      </F>
      <F label="Slug">
        <input style={{ ...inp, opacity: slugLocked ? 0.6 : 1 }} value={meta.slug} disabled={slugLocked} onChange={e => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
        <div style={note}>/articles/{meta.slug || '…'}{slugLocked ? ' (locked once saved, so the link never breaks)' : ''}</div>
        {!slugLocked && <button type="button" style={{ ...chip(false), marginTop: 6 }} onClick={onTitleSlug}>Make from headline</button>}
      </F>
      <F label="Excerpt (the card on the homepage and team pages)">
        <textarea style={{ ...inp, resize: 'vertical' }} rows={3} maxLength={200} value={meta.excerpt} onChange={e => set({ excerpt: e.target.value })} />
        <div style={cnt(meta.excerpt.length >= 60 && meta.excerpt.length <= 200)}>{meta.excerpt.length} / 200 (the most Google News and X show)</div>
      </F>
      <F label="Teams">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{MLB_CODES.map(c => <button key={c} type="button" title={teamCodeToName(c)} style={chip(meta.teamTags.includes(c))} onClick={() => toggle(c)}>{c}</button>)}</div>
      </F>
      <F label="Subject player">
        {meta.subjectPlayerId ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={headshotCutoutUrl(Number(meta.subjectPlayerId), 120)} alt="" width={36} height={36} style={{ objectFit: 'contain', objectPosition: 'center bottom' }} />
            <b style={{ fontSize: 13.5, flex: 1 }}>{meta.subjectPlayerName}</b>
            <button type="button" style={chip(false)} onClick={() => set({ subjectPlayerId: '', subjectPlayerName: '' })}>Clear</button>
          </div>
        ) : (
          <>
            <input style={inp} placeholder="Search a player by name" value={people.q} onChange={e => people.search(e.target.value)} />
            {people.found.map(p => <button key={p.id} type="button" style={{ ...chip(false), display: 'block', margin: '6px 0 0', borderRadius: 8 }} onClick={() => { set({ subjectPlayerId: String(p.id), subjectPlayerName: p.fullName }); people.clear() }}>{p.fullName} · {p.primaryPosition}</button>)}
          </>
        )}
        <div style={note}>Optional. Saved with the article for the player strip.</div>
      </F>
      <F label="Byline"><input style={inp} value={meta.author} onChange={e => set({ author: e.target.value })} /></F>
    </div>
  )
}

// ---- Visuals ---------------------------------------------------------------------------------------------------------------------------

type LibImg = { name: string; url: string }

export function VisualsPanel({ heroImage, heroSize, heroAlt, onHeroAlt, onHero, onInsert, onUpload, onChart, busy, error }: {
  heroImage: string
  heroSize: { w: number; h: number } | null
  heroAlt: string
  onHeroAlt: (v: string) => void
  onHero: (url: string) => void
  onInsert: (url: string, alt: string, credit: string, width?: 'inline' | 'wide' | 'full') => void
  onUpload: (files: FileList | null, asHero: boolean) => void
  onChart: () => void
  busy: boolean
  error: string
}) {
  const people = usePeople()
  const [lib, setLib] = useState<LibImg[] | null>(null)
  const [team, setTeam] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const heroRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/article-images').then(r => r.json()).then(d => alive && setLib((d as { images: LibImg[] }).images ?? [])).catch(() => alive && setLib([]))
    return () => { alive = false }
  }, [busy])
  const teamId = team ? teamCodeToId(team) : undefined
  return (
    <div>
      <div style={{ border: `2px dashed ${C.line}`, borderRadius: 12, padding: 16, textAlign: 'center', fontSize: 13, color: C.mute, marginBottom: 12, cursor: 'pointer' }}
        onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onUpload(e.dataTransfer.files, false) }}>
        <b style={{ color: '#1A1A1A' }}>{busy ? 'Uploading…' : 'Drag a picture here, paste, or click to upload'}</b><br />Large pictures are shrunk for you.
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => onUpload(e.target.files, false)} />
      </div>
      {error && <div style={{ color: C.bad, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

      <F label="Hero image">
        {heroImage ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
            <button type="button" style={{ ...chip(false), marginTop: 6 }} onClick={() => onHero('')}>Remove hero</button>
          </div>
        ) : <button type="button" style={chip(false)} onClick={() => heroRef.current?.click()}>Upload a hero image</button>}
        <input ref={heroRef} type="file" accept="image/*" hidden onChange={e => onUpload(e.target.files, true)} />
        {heroImage && <div style={note}>{heroSize ? (heroSize.w >= 1200 && heroSize.h >= 675 ? `${heroSize.w} × ${heroSize.h}: big enough for link previews.` : `${heroSize.w} × ${heroSize.h}: under the 1200 × 675 that link previews need, so a generated card is used instead.`) : 'Measuring…'}</div>}
        {heroImage && <input style={{ ...inp, marginTop: 8 }} placeholder="Describe the hero image (alt text)" value={heroAlt} onChange={e => onHeroAlt(e.target.value)} />}
      </F>

      <F label="Find a headshot">
        <input style={inp} placeholder="Player name" value={people.q} onChange={e => people.search(e.target.value)} />
        {people.found.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={headshotCutoutUrl(p.id, 120)} alt="" width={34} height={34} style={{ objectFit: 'contain', objectPosition: 'center bottom' }} />
            <span style={{ flex: 1, fontSize: 13 }}>{p.fullName}</span>
            <button type="button" style={chip(false)} onClick={() => onInsert(headshotCutoutUrl(p.id, 640), p.fullName, 'MLB', 'inline')}>Insert</button>
          </div>
        ))}
      </F>

      <F label="Team logo">
        <select style={inp} value={team} onChange={e => setTeam(e.target.value)}><option value="">Choose a team</option>{MLB_CODES.map(c => <option key={c} value={c}>{teamCodeToName(c)}</option>)}</select>
        {teamId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={teamLogoUrl(teamId)} alt="" width={34} height={34} style={{ objectFit: 'contain' }} />
            <span style={{ flex: 1, fontSize: 13 }}>{teamCodeToName(team)}</span>
            <button type="button" style={chip(false)} onClick={() => onInsert(teamLogoUrl(teamId), `${teamCodeToName(team)} logo`, 'MLB', 'inline')}>Insert</button>
          </div>
        )}
      </F>

      <F label="Chart"><button type="button" style={{ ...chip(false), padding: '7px 12px' }} onClick={onChart}>Open the chart picker</button></F>

      <F label="Library (your recent uploads)">
        {lib === null ? <div style={note}>Loading…</div> : lib.length === 0 ? <div style={note}>Nothing uploaded yet.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {lib.map(m => (
              <div key={m.name} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}`, display: 'block' }} />
                <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                  <button type="button" style={{ ...chip(false), padding: '2px 6px', fontSize: 10.5 }} onClick={() => onInsert(m.url, '', '')}>Insert</button>
                  <button type="button" style={{ ...chip(false), padding: '2px 6px', fontSize: 10.5 }} onClick={() => onHero(m.url)}>Hero</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </F>
    </div>
  )
}

// ---- Checks ----------------------------------------------------------------------------------------------------------------------------

export function ChecksPanel({ checks, words, minutes }: { checks: Check[]; words: number; minutes: number }) {
  const order = { error: 0, warn: 1, ok: 2 } as const
  const sorted = [...checks].sort((a, b) => order[a.level] - order[b.level])
  const mark = { error: ['×', C.bad], warn: ['!', C.orange], ok: ['✓', C.good] } as const
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 8 }}>{words.toLocaleString()} words · {minutes} min read</div>
      {sorted.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '8px 0', borderBottom: `1px solid ${C.soft}` }}>
          <b style={{ width: 16, color: mark[c.level][1] }}>{mark[c.level][0]}</b>
          <div><div>{c.text}</div>{c.detail && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{c.detail}</div>}</div>
        </div>
      ))}
      <div style={note}>Runs as you type with the same word list the site uses. Publishing is blocked while a banned word remains; the server checks again.</div>
    </div>
  )
}

// ---- Publish ---------------------------------------------------------------------------------------------------------------------------

export interface Rev { id: string; kind: string; saved_at: string; title: string }

export function PublishPanel({ meta, set, status, publishedAt, publishWhen, setPublishWhen, onPublish, onSave, blocking, saving, articleId, revisions, onRestore }: {
  meta: WriterMeta; set: (p: Partial<WriterMeta>) => void
  status: 'draft' | 'published'; publishedAt: string | null
  publishWhen: string; setPublishWhen: (v: string) => void
  onPublish: () => void; onSave: () => void; blocking: boolean; saving: boolean
  articleId: string | null; revisions: Rev[]; onRestore: (id: string) => void
}) {
  const scheduled = publishWhen ? new Date(publishWhen) : null
  const futureSched = scheduled && scheduled.getTime() > Date.now()
  const et = scheduled ? scheduled.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : ''
  const live = status === 'published' && publishedAt && new Date(publishedAt).getTime() <= Date.now()
  const queued = status === 'published' && publishedAt && new Date(publishedAt).getTime() > Date.now()
  const desc = meta.seoDescription || meta.excerpt
  return (
    <div>
      <F label="Status">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={chip(status === 'draft')}>Draft</span><span style={chip(!!queued)}>Scheduled</span><span style={chip(!!live)}>Published</span>
        </div>
        {queued && publishedAt && <div style={note}>Goes live {new Date(publishedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET.</div>}
      </F>
      <F label="When">
        <input type="datetime-local" style={inp} value={publishWhen} onChange={e => setPublishWhen(e.target.value)} />
        <div style={note}>{futureSched ? `Will go live ${et}.` : 'Leave empty to publish now.'}</div>
      </F>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={onSave} disabled={saving} style={{ ...chip(false), padding: '9px 14px', fontSize: 13 }}>Save draft</button>
        <button type="button" onClick={onPublish} disabled={saving || blocking} style={{ ...chip(true), padding: '9px 14px', fontSize: 13, opacity: blocking ? 0.45 : 1 }}>{futureSched ? 'Schedule' : status === 'published' ? 'Update live article' : 'Publish now'}</button>
      </div>
      {blocking && <div style={{ ...note, color: C.bad, marginTop: -8, marginBottom: 12 }}>Fix the errors in the Checks tab first.</div>}

      <F label="Search description (optional, replaces the excerpt in search)">
        <textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={meta.seoDescription} onChange={e => set({ seoDescription: e.target.value })} />
        <div style={cnt(desc.length >= 70 && desc.length <= 155)}>{desc.length} / 155</div>
      </F>
      <F label="Share preview (X)">
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', fontSize: 12 }}>
          {meta.heroImage ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={meta.heroImage} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} /> : <div style={{ height: 80, background: C.soft, display: 'grid', placeItems: 'center', color: C.mute }}>No hero image</div>}
          <div style={{ padding: '8px 10px' }}><b style={{ display: 'block', fontSize: 13 }}>{meta.title || 'Headline'}</b>xlab9.com · {desc.slice(0, 110) || 'Description'}</div>
        </div>
      </F>
      <F label="Preview">
        {articleId ? <a href={`/admin/articles/${articleId}/preview`} target="_blank" rel="noreferrer" style={{ ...chip(false), display: 'inline-block', textDecoration: 'none', color: '#1A1A1A', padding: '7px 12px' }}>Open the reader view</a> : <div style={note}>Save once to open the reader view.</div>}
      </F>
      <F label="History">
        {revisions.length === 0 ? <div style={note}>Saves will appear here.</div> : revisions.slice(0, 12).map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '5px 0', borderBottom: `1px solid ${C.soft}` }}>
            <span style={{ flex: 1 }}>{new Date(r.saved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {r.kind}</span>
            <button type="button" style={chip(false)} onClick={() => onRestore(r.id)}>Restore</button>
          </div>
        ))}
        <div style={note}>Restoring puts that version in the editor; nothing changes until you save.</div>
      </F>
    </div>
  )
}
