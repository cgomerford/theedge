'use client'

// src/components/article/Comments.tsx
//
// Reader comments under an article. Everyone can read; posting needs a signed-in account (signedIn comes from the server, never defaulted).

import { useState } from 'react'
import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'
import type { Comment } from '@/lib/comments'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
const MAX = 1000

export default function Comments({ articleId, initial, signedIn }: { articleId: string; initial: Comment[]; signedIn: boolean }) {
  const [list, setList] = useState(initial)
  const [name, setName] = useState(() => { try { return localStorage.getItem('x9_comment_name') ?? '' } catch { return '' } })
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [reported, setReported] = useState<string[]>([])

  async function post() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId, name, body }) })
      const j = await r.json()
      if (j.ok) {
        setList(l => [...l, j.comment]); setBody('')
        try { localStorage.setItem('x9_comment_name', name.trim()) } catch { /* private window */ }
      } else setMsg(j.error ?? 'Could not post.')
    } catch { setMsg('Could not post. Check your connection.') }
    setBusy(false)
  }

  async function report(id: string) {
    setReported(r => [...r, id])
    try { await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report: id }) }) } catch { /* shown as reported either way */ }
  }

  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', fontFamily: SANS, fontSize: 14, background: '#fff', color: C.ink }

  return (
    <section id="comments" aria-label="Comments" style={{ marginTop: 40, fontFamily: SANS }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 800 }}>Comments{list.length > 0 ? ` (${list.length})` : ''}</h2>

      {list.length === 0 && <p style={{ margin: '0 0 16px', fontSize: 14, color: '#5b5347' }}>No comments yet.</p>}
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        {list.map(c => (
          <div key={c.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: C.mute }}>
              <span><b style={{ color: C.ink, fontSize: 13 }}>{c.author_name}</b> · {when(c.created_at)}</span>
              {signedIn && (reported.includes(c.id)
                ? <span>Reported</span>
                : <button type="button" onClick={() => report(c.id)} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Report</button>)}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</p>
          </div>
        ))}
      </div>

      {signedIn ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <input aria-label="Your name" placeholder="Your name (shown with your comment)" value={name} maxLength={30} onChange={e => setName(e.target.value)} style={field} />
          <textarea aria-label="Your comment" placeholder="Join the discussion" value={body} maxLength={MAX} rows={4} onChange={e => setBody(e.target.value)} style={{ ...field, resize: 'vertical' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.mute }}>{body.length}/{MAX} · Plain text, no links. Be civil.</span>
            <button type="button" disabled={busy || body.trim().length < 2 || name.trim().length < 2} onClick={post} style={{ background: C.orange, color: '#fff', border: 0, borderRadius: 999, padding: '10px 20px', fontFamily: SANS, fontWeight: 800, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy || body.trim().length < 2 || name.trim().length < 2 ? 0.5 : 1 }}>{busy ? 'Posting…' : 'Post comment'}</button>
          </div>
          {msg && <div role="alert" style={{ fontSize: 13, color: C.bad }}>{msg}</div>}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: '#5b5347' }}><Link href="/login" style={{ color: C.orange, fontWeight: 800 }}>Sign in</Link> or <Link href="/signup" style={{ color: C.orange, fontWeight: 800 }}>create a free account</Link> to comment.</p>
      )}
    </section>
  )
}
