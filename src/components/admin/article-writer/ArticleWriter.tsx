'use client'

// src/components/admin/article-writer/ArticleWriter.tsx
//
// The article writer (mockups/article-writer.html). A canvas that looks like the published page (headline, dek, hero, body in the same CSS as
// readers get), a block menu on "/", layouts, an image library, live checks, autosave, history, scheduling and a reader preview.
// Saves go to /api/admin/articles. Publishing is a separate explicit step (a draft can never go live by a stray save), and an autosave of an
// already-published article only writes history, never the live page.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import ChartPickerModal from '@/components/admin/ChartPickerModal'
import { ARTICLE_CSS } from '@/components/article/article-css'
import type { Article, ArticleLayout, TiptapDoc } from '@/lib/articles'
import { runChecks } from '@/lib/article-checks'
import { WRITER_BLOCKS } from './extensions'
import SlashMenu, { filterItems, type SlashItem } from './SlashMenu'
import { ChecksPanel, PublishPanel, StoryPanel, VisualsPanel, C, type Rev } from './Panels'
import { LAYOUTS, slugify, type WriterMeta } from './types'
import { uploadImage } from './upload'

type Tab = 'story' | 'visuals' | 'checks' | 'publish'
type Menu = { x: number; y: number; q: string; from: number; to: number } | null

const EMPTY_DOC: TiptapDoc = { type: 'doc', content: [] }
const pill = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? '#1A1A1A' : C.line}`, background: on ? '#1A1A1A' : '#fff', color: on ? '#fff' : '#1A1A1A', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' })
const tbtn = (on: boolean): React.CSSProperties => ({ minWidth: 32, height: 30, border: `1px solid ${on ? '#1A1A1A' : C.line}`, background: on ? '#1A1A1A' : '#fff', color: on ? '#fff' : '#1A1A1A', borderRadius: 7, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', padding: '0 8px' })

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ArticleWriter({ initialArticle }: { initialArticle?: Article }) {
  const [meta, setMeta] = useState<WriterMeta>({
    title: initialArticle?.title ?? '',
    slug: initialArticle?.slug ?? '',
    dek: initialArticle?.dek ?? '',
    section: initialArticle?.section ?? '',
    layout: (initialArticle?.layout ?? 'standard') as ArticleLayout,
    excerpt: initialArticle?.excerpt ?? '',
    seoDescription: initialArticle?.seo_description ?? '',
    heroImage: initialArticle?.hero_image ?? '',
    teamTags: initialArticle?.team_tags ?? [],
    author: initialArticle?.author ?? 'George',
    subjectPlayerId: initialArticle?.subject_player_id != null ? String(initialArticle.subject_player_id) : '',
    subjectPlayerName: initialArticle?.subject_player_name ?? '',
  })
  const [articleId, setArticleId] = useState<string | null>(initialArticle?.id ?? null)
  const [status, setStatus] = useState<'draft' | 'published'>(initialArticle?.status ?? 'draft')
  const [publishedAt, setPublishedAt] = useState<string | null>(initialArticle?.published_at ?? null)
  const [publishWhen, setPublishWhen] = useState('')
  const [tab, setTab] = useState<Tab>('story')
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')
  const [label, setLabel] = useState(initialArticle ? 'Saved' : 'New draft')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [armed, setArmed] = useState(false)
  const [rev, setRev] = useState(0)
  const [tick, setTick] = useState(0)
  const [menu, setMenu] = useState<Menu>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  const [chartOpen, setChartOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [revisions, setRevisions] = useState<Rev[]>([])

  const dirty = useRef(false)
  const inflight = useRef(false)
  const menuRef = useRef<Menu>(null)
  const indexRef = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const handlers = useRef<{ files: (f: FileList | File[] | null, hero: boolean) => void; run: (id: string) => void }>({ files: () => {}, run: () => {} })
  menuRef.current = menu
  indexRef.current = menuIndex

  const bump = useCallback(() => { dirty.current = true; setRev(r => r + 1); setLabel('Unsaved changes') }, [])
  const set = useCallback((p: Partial<WriterMeta>) => { setMeta(m => ({ ...m, ...p })); bump() }, [bump])

  const syncMenu = useCallback((ed: NonNullable<ReturnType<typeof useEditor>>) => {
    const { $from, empty } = ed.state.selection
    const m = empty && $from.parent.type.name === 'paragraph' ? /^\/(\w*)$/.exec($from.parent.textContent) : null
    if (!m) { if (menuRef.current) setMenu(null); return }
    const c = ed.view.coordsAtPos($from.pos)
    setMenu({ x: c.left, y: c.bottom + 6, q: m[1], from: $from.start(), to: $from.end() })
    setMenuIndex(0)
  }, [])

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false } }), Image, ...WRITER_BLOCKS],
    content: initialArticle?.body ?? EMPTY_DOC,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'article-body', 'aria-label': 'Article body', style: 'outline:none;min-height:260px' },
      handlePaste(_v, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        handlers.current.files(files, false)
        return true
      },
      handleDrop(_v, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        handlers.current.files(files, false)
        return true
      },
      handleKeyDown(_v, event) {
        const m = menuRef.current
        if (!m) return false
        const items = filterItems(m.q)
        if (event.key === 'ArrowDown') { setMenuIndex(i => (i + 1) % Math.max(1, items.length)); return true }
        if (event.key === 'ArrowUp') { setMenuIndex(i => (i - 1 + items.length) % Math.max(1, items.length)); return true }
        if (event.key === 'Escape') { setMenu(null); return true }
        if ((event.key === 'Enter' || event.key === 'Tab') && items.length) { handlers.current.run(items[indexRef.current % items.length].id); return true }
        return false
      },
    },
    onUpdate({ editor: ed }) {
      // Keep one empty paragraph after a block that cannot hold the cursor, so there is always somewhere to keep typing.
      const last = ed.state.doc.lastChild
      if (last && last.type.name !== 'paragraph') ed.commands.insertContentAt(ed.state.doc.content.size, { type: 'paragraph' })
      bump()
      syncMenu(ed)
    },
    onSelectionUpdate({ editor: ed }) { setTick(t => t + 1); syncMenu(ed) },
  })

  // ---- Inserting --------------------------------------------------------------------------------------------------------------------

  const insertFigure = useCallback((src: string, alt = '', credit = '', width: 'inline' | 'wide' | 'full' = 'wide') => {
    editor?.chain().focus().insertContent({ type: 'figure', attrs: { src, alt, credit, width } }).run()
  }, [editor])

  const handleFiles = useCallback(async (files: FileList | File[] | null, asHero: boolean) => {
    const list = Array.from(files ?? []).filter(f => f.type.startsWith('image/'))
    if (!list.length) return
    setBusy(true); setUploadError('')
    try {
      for (const f of list) {
        const url = await uploadImage(f)
        if (asHero) set({ heroImage: url })
        else insertFigure(url, '', '')
      }
    } catch (e) { setUploadError(e instanceof Error ? e.message : 'Upload failed') }
    setBusy(false)
  }, [insertFigure, set])

  const runItem = useCallback((id: string) => {
    if (!editor) return
    const chain = editor.chain().focus()
    const m = menuRef.current
    if (m) chain.deleteRange({ from: m.from, to: m.to })
    setMenu(null)
    switch (id) {
      case 'image': chain.run(); fileRef.current?.click(); break
      case 'chart': chain.run(); setChartOpen(true); break
      case 'statRow': chain.insertContent({ type: 'statRow' }).run(); break
      case 'playerCard': chain.insertContent({ type: 'playerCard' }).run(); break
      case 'pullQuote': chain.setNode('pullQuote').run(); break
      case 'dataTable': chain.insertContent({ type: 'dataTable' }).run(); break
      case 'gallery': chain.insertContent({ type: 'gallery' }).run(); break
      case 'xEmbed': chain.insertContent({ type: 'xEmbed' }).run(); break
      case 'h2': chain.setNode('heading', { level: 2 }).run(); break
      case 'h3': chain.setNode('heading', { level: 3 }).run(); break
      case 'quote': chain.toggleBlockquote().run(); break
      case 'list': chain.toggleBulletList().run(); break
      case 'divider': chain.setHorizontalRule().run(); break
    }
  }, [editor])
  handlers.current = { files: handleFiles, run: runItem }

  // ---- Saving -----------------------------------------------------------------------------------------------------------------------

  const state = useRef({ meta, articleId, publishWhen, status })
  state.current = { meta, articleId, publishWhen, status }

  const loadRevisions = useCallback(async (id: string) => {
    try { setRevisions(((await (await fetch(`/api/admin/articles?id=${id}`)).json()) as { revisions: Rev[] }).revisions ?? []) } catch { /* history is optional */ }
  }, [])

  const save = useCallback(async (opts: { publish?: boolean; autosave?: boolean } = {}) => {
    if (!editor || inflight.current) return
    const { meta: m, articleId: id, publishWhen: when } = state.current
    if (!m.title.trim() || !m.slug.trim()) { if (!opts.autosave) setError('Write a headline (the slug follows it) before saving.'); return }
    const pid = m.subjectPlayerId.trim() ? Number(m.subjectPlayerId) : undefined
    inflight.current = true
    if (!opts.autosave) { setSaving(true); setError('') }
    try {
      const res = await fetch('/api/admin/articles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, title: m.title.trim(), slug: m.slug.trim(), body: editor.getJSON(), excerpt: m.excerpt.trim() || undefined, hero_image: m.heroImage.trim() || undefined,
          team_tags: m.teamTags, sport: 'mlb', author: m.author, dek: m.dek, section: m.section, layout: m.layout, seo_description: m.seoDescription,
          subject_player_id: pid, subject_player_name: m.subjectPlayerName, publish: !!opts.publish, autosave: !!opts.autosave,
          publish_at: opts.publish && when ? new Date(when).toISOString() : undefined,
        }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Save failed (${res.status})`)
      const saved = (await res.json()) as { id: string; slug: string; status: 'draft' | 'published'; published_at: string | null; historyOnly?: boolean }
      if (!id) { setArticleId(saved.id); window.history.replaceState(null, '', `/admin/articles/${saved.id}`) }
      dirty.current = false
      if (opts.publish) {
        setStatus('published'); setPublishedAt(saved.published_at)
        setLabel(saved.published_at && new Date(saved.published_at) > new Date() ? 'Scheduled' : 'Published')
        setArmed(false)
      } else setLabel(saved.historyOnly ? 'Autosaved to history (the live page is unchanged)' : `${opts.autosave ? 'Autosaved' : 'Saved'} ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
      void loadRevisions(saved.id)
    } catch (e) {
      if (!opts.autosave) setError(e instanceof Error ? e.message : 'Something went wrong.')
      else setLabel('Autosave failed, will retry')
    } finally {
      inflight.current = false
      setSaving(false)
    }
  }, [editor, loadRevisions])

  // Autosave 4 seconds after the last change.
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => { void save({ autosave: true }) }, 4000)
    return () => clearTimeout(t)
  }, [rev, save])

  useEffect(() => { if (initialArticle) void loadRevisions(initialArticle.id) }, [initialArticle, loadRevisions])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save() } }
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', onLeave)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave) }
  }, [save])

  const restore = useCallback(async (id: string) => {
    try {
      const r = (await (await fetch(`/api/admin/articles?revision=${id}`)).json()) as { title: string; body: TiptapDoc; meta: Record<string, unknown> }
      editor?.commands.setContent(r.body)
      const mm = r.meta ?? {}
      setMeta(m => ({ ...m, title: r.title, dek: String(mm.dek ?? m.dek), section: String(mm.section ?? m.section), excerpt: String(mm.excerpt ?? m.excerpt), heroImage: String(mm.hero_image ?? m.heroImage), seoDescription: String(mm.seo_description ?? m.seoDescription) }))
      bump(); setLabel('Restored: save to keep it')
    } catch { setError('Could not load that version.') }
  }, [editor, bump])

  const doPublish = () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 5000); return }
    void save({ publish: true })
  }

  const body = editor?.getJSON() ?? EMPTY_DOC
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => runChecks({ ...meta, body }), [meta, rev, editor])
  const errors = result.checks.filter(c => c.level === 'error').length
  const warns = result.checks.filter(c => c.level === 'warn').length
  const items = menu ? filterItems(menu.q) : []
  void tick

  const hero = meta.layout !== 'quick' && (
    <div style={{ margin: meta.layout === 'feature' ? '-34px -38px 22px' : '0 0 18px' }}>
      {meta.heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.heroImage} alt="" onClick={() => setTab('visuals')} style={{ width: '100%', height: meta.layout === 'feature' ? 300 : 'auto', maxHeight: 360, objectFit: 'cover', borderRadius: meta.layout === 'feature' ? '14px 14px 0 0' : 10, display: 'block', cursor: 'pointer' }} />
      ) : (
        <button type="button" onClick={() => setTab('visuals')} style={{ width: '100%', height: 150, border: `1.5px dashed ${C.line}`, borderRadius: 12, background: C.soft, color: C.mute, fontSize: 13, cursor: 'pointer' }}>Hero image: upload one in the Visuals tab</button>
      )}
    </div>
  )

  return (
    <div style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', background: C.cream, minHeight: '100vh', color: '#1A1A1A' }}>
      <style>{ARTICLE_CSS}</style>
      <style>{`
        .aw-grid{display:grid;grid-template-columns:minmax(0,1fr) 350px;min-height:calc(100vh - 54px)}
        @media (max-width:980px){.aw-grid{grid-template-columns:1fr}.aw-side{border-left:0!important;border-top:1px solid ${C.line}}}
        .aw-title,.aw-dek{width:100%;border:0;outline:none;background:transparent;resize:none;font-family:inherit;field-sizing:content;overflow:hidden;padding:0}
        .aw-title::placeholder,.aw-dek::placeholder{color:#c9c2b2}
        .ProseMirror p.is-empty:first-child{margin:0}
        .ProseMirror-selectednode{outline:none}
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: '#fff', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        <a href="/admin/articles" style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none' }}>← Articles</a>
        <span style={{ fontSize: 12, color: error ? C.bad : C.mute }}>{error || (armed ? 'Click Publish again to confirm' : label)}</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={pill(device === 'desktop')} onClick={() => setDevice('desktop')}>Desktop</button>
        <button type="button" style={pill(device === 'phone')} onClick={() => setDevice('phone')}>Phone</button>
        <button type="button" onClick={() => setTab('checks')} style={{ ...pill(false), borderColor: errors ? C.bad : warns ? C.orange : C.good, color: errors ? C.bad : warns ? C.orange : C.good }}>{errors ? `${errors} to fix` : warns ? `${warns} to review` : 'Checks passed'}</button>
        <button type="button" onClick={() => void save()} disabled={saving} style={{ ...pill(false), fontWeight: 800 }}>Save draft</button>
        <button type="button" onClick={doPublish} disabled={saving || errors > 0} style={{ border: 0, background: C.orange, color: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: errors ? 0.45 : 1 }}>{armed ? 'Confirm' : status === 'published' ? 'Update live' : 'Publish…'}</button>
      </div>

      <div className="aw-grid">
        <main style={{ padding: '22px 18px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', maxWidth: 760, marginBottom: 14 }}>
            {LAYOUTS.map(l => (
              <button key={l.id} type="button" onClick={() => set({ layout: l.id })} style={{ flex: 1, minWidth: 120, textAlign: 'left', border: `1px solid ${meta.layout === l.id ? C.orange : C.line}`, boxShadow: meta.layout === l.id ? '0 0 0 2px #ff572233' : 'none', background: '#fff', borderRadius: 12, padding: '9px 11px', cursor: 'pointer' }}>
                <b style={{ display: 'block', fontSize: 13 }}>{l.name}</b><span style={{ fontSize: 11, color: C.mute }}>{l.blurb}</span>
              </button>
            ))}
          </div>

          <div style={{ position: 'sticky', top: 62, zIndex: 10, width: '100%', maxWidth: 760, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '6px 8px', display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <button type="button" style={tbtn(!!editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="Bold"><b>B</b></button>
            <button type="button" style={tbtn(!!editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="Italic"><i>I</i></button>
            <button type="button" style={tbtn(!!editor?.isActive('link'))} onClick={() => { setLinkUrl((editor?.getAttributes('link').href as string) ?? ''); setLinkOpen(o => !o) }}>Link</button>
            <button type="button" style={tbtn(!!editor?.isActive('heading', { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
            <button type="button" style={tbtn(!!editor?.isActive('heading', { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
            <button type="button" style={tbtn(!!editor?.isActive('bulletList'))} onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</button>
            <button type="button" style={tbtn(!!editor?.isActive('blockquote'))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>Quote</button>
            <button type="button" style={{ ...tbtn(false), background: C.orange, color: '#fff', borderColor: C.orange }} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu(m => (m ? null : { x: r.left, y: r.bottom + 6, q: '', from: -1, to: -1 })); setMenuIndex(0) }}>+ Insert</button>
            <span style={{ flex: 1 }} />
            <button type="button" style={tbtn(false)} onClick={() => editor?.chain().focus().undo().run()}>Undo</button>
            <button type="button" style={tbtn(false)} onClick={() => editor?.chain().focus().redo().run()}>Redo</button>
            {linkOpen && (
              <form style={{ display: 'flex', gap: 6, width: '100%' }} onSubmit={e => { e.preventDefault(); const u = linkUrl.trim(); if (!u) editor?.chain().focus().unsetLink().run(); else editor?.chain().focus().setLink({ href: /^https?:\/\//i.test(u) ? u : `https://${u}` }).run(); setLinkOpen(false) }}>
                <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://… (empty removes the link)" style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 9px', fontSize: 13, fontFamily: 'inherit' }} />
                <button type="submit" style={tbtn(true)}>Apply</button>
              </form>
            )}
          </div>

          <article style={{ width: '100%', maxWidth: device === 'phone' ? 390 : meta.layout === 'data' ? 900 : 760, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: device === 'phone' ? '22px 18px 30px' : '34px 38px 40px', overflow: 'hidden' }}>
            {meta.layout === 'feature' && hero}
            {meta.section && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, marginBottom: 8 }}>{meta.section}</div>}
            <textarea className="aw-title" rows={1} placeholder="Headline" value={meta.title} aria-label="Headline"
              onChange={e => { const t = e.target.value; set({ title: t, ...(articleId ? {} : { slug: slugify(t) }) }) }}
              style={{ fontWeight: 800, letterSpacing: '-.02em', fontSize: meta.layout === 'quick' ? 'clamp(26px,4.4vw,36px)' : 'clamp(30px,5vw,46px)', lineHeight: 1.08, margin: '0 0 10px' }} />
            {meta.layout !== 'quick' && <textarea className="aw-dek" rows={1} placeholder="Dek: one line that says what the piece shows" value={meta.dek} aria-label="Dek" onChange={e => set({ dek: e.target.value })} style={{ fontSize: 19, lineHeight: 1.45, color: '#5b5347', margin: '0 0 14px' }} />}
            <div style={{ fontSize: 12.5, color: C.mute, padding: '10px 0', borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, marginBottom: 22 }}>{meta.author} · {result.minutes} min read · {result.words.toLocaleString()} words</div>
            {meta.layout !== 'feature' && hero}
            <EditorContent editor={editor} />
            {editor && editor.isEmpty && <div style={{ color: '#c9c2b2', fontSize: 14, marginTop: -250, pointerEvents: 'none', position: 'relative' }}>Begin writing. Type / on an empty line for blocks: image, chart, stat row, player card, pull quote, table.</div>}
          </article>
        </main>

        <aside className="aw-side" style={{ borderLeft: `1px solid ${C.line}`, background: '#fff', minWidth: 0 }}>
          <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 54, background: '#fff', zIndex: 5 }}>
            {(['story', 'visuals', 'checks', 'publish'] as Tab[]).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} style={{ flex: 1, border: 0, background: 'none', padding: '13px 4px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: tab === t ? '#1A1A1A' : C.mute, borderBottom: `2px solid ${tab === t ? C.orange : 'transparent'}`, cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
          <div style={{ padding: 16 }}>
            {tab === 'story' && <StoryPanel meta={meta} set={set} slugLocked={!!articleId} onTitleSlug={() => set({ slug: slugify(meta.title) })} />}
            {tab === 'visuals' && <VisualsPanel heroImage={meta.heroImage} onHero={u => set({ heroImage: u })} onInsert={insertFigure} onUpload={handleFiles} onChart={() => setChartOpen(true)} busy={busy} error={uploadError} />}
            {tab === 'checks' && <ChecksPanel checks={result.checks} words={result.words} minutes={result.minutes} />}
            {tab === 'publish' && <PublishPanel meta={meta} set={set} status={status} publishedAt={publishedAt} publishWhen={publishWhen || toLocalInput(null)} setPublishWhen={setPublishWhen} onPublish={doPublish} onSave={() => void save()} blocking={errors > 0} saving={saving} articleId={articleId} revisions={revisions} onRestore={restore} />}
          </div>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { void handleFiles(e.target.files, false); e.target.value = '' }} />
      {menu && <SlashMenu x={menu.x} y={menu.y} items={items} index={menuIndex} onHover={setMenuIndex} onPick={(i: SlashItem) => runItem(i.id)} />}
      {chartOpen && <ChartPickerModal onInsert={url => insertFigure(url, 'Chart', 'x9Lab')} onClose={() => setChartOpen(false)} />}
    </div>
  )
}
