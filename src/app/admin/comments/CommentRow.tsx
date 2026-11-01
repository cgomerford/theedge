'use client'

import { useState } from 'react'
import type { AdminComment } from '@/lib/comments'

export default function CommentRow({ c }: { c: AdminComment }) {
  const [status, setStatus] = useState(c.status)
  const [gone, setGone] = useState(false)
  async function act(next: 'visible' | 'hidden' | 'delete') {
    if (next === 'delete' && !window.confirm('Delete this comment for good?')) return
    const r = await fetch('/api/admin/comments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, status: next }) })
    if (!r.ok) return
    if (next === 'delete') setGone(true); else setStatus(next)
  }
  if (gone) return null
  const btn: React.CSSProperties = { border: '1px solid #1A1A1A', background: '#fff', borderRadius: 999, padding: '4px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
  return (
    <div style={{ border: '1px solid #e7e2d8', borderRadius: 12, padding: '12px 14px', background: status === 'hidden' ? '#f1eee6' : '#fff', opacity: status === 'hidden' ? 0.8 : 1 }}>
      <div style={{ fontSize: 12, color: '#8a8275', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        <span><b style={{ color: '#1A1A1A' }}>{c.author_name}</b> on {c.article_slug ? <a href={`/articles/${c.article_slug}#comments`} style={{ color: '#FF5722' }}>{c.article_title}</a> : 'a removed article'} · {new Date(c.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}</span>
        <span>{c.reports > 0 ? `${c.reports} report${c.reports > 1 ? 's' : ''} · ` : ''}{status}</span>
      </div>
      <p style={{ margin: '6px 0 10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14 }}>{c.body}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {status === 'visible' ? <button style={btn} onClick={() => act('hidden')}>Hide</button> : <button style={btn} onClick={() => act('visible')}>Show again</button>}
        <button style={{ ...btn, color: '#D4533B', borderColor: '#D4533B' }} onClick={() => act('delete')}>Delete</button>
      </div>
    </div>
  )
}
