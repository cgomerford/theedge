// src/app/admin/comments/page.tsx
//
// Moderation list for article comments, newest first. Reported and hidden ones are listed first so they are not missed. Auth: src/proxy.ts guards /admin.

import { listAllComments } from '@/lib/comments'
import CommentRow from './CommentRow'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comments - x9Lab', robots: { index: false, follow: false } }

export default async function AdminComments() {
  const all = await listAllComments()
  const flagged = all.filter(c => c.reports > 0 || c.status === 'hidden')
  const rest = all.filter(c => !(c.reports > 0 || c.status === 'hidden'))
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px', fontFamily: 'var(--font-redhat), system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 6px' }}>Comments</h1>
      <p style={{ color: '#5b5347', fontSize: 14, margin: '0 0 22px' }}>Comments go live when posted. Three different readers reporting one hides it automatically; you can show it again here.</p>
      {all.length === 0 && <p>No comments yet.</p>}
      {flagged.length > 0 && <h2 style={{ fontSize: 16, fontWeight: 800 }}>Reported or hidden ({flagged.length})</h2>}
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>{flagged.map(c => <CommentRow key={c.id} c={c} />)}</div>
      {rest.length > 0 && <h2 style={{ fontSize: 16, fontWeight: 800 }}>Latest ({rest.length})</h2>}
      <div style={{ display: 'grid', gap: 10 }}>{rest.map(c => <CommentRow key={c.id} c={c} />)}</div>
    </div>
  )
}
