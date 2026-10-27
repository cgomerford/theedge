'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Unfollow on /me: POST /api/follow toggles the follow off, then the page is re-read on the server so the row disappears.
export default function UnfollowButton({ kind, refId, name }: { kind: 'player' | 'team'; refId: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function go() {
    setBusy(true); setFailed(false)
    try {
      const res = await fetch('/api/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ref: refId, name }) })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean }
      if (res.ok && json.ok) { router.refresh(); return }
      setFailed(true)
    } catch { setFailed(true) }
    setBusy(false)
  }
  return (
    <button type="button" onClick={go} disabled={busy} aria-label={`Unfollow ${name}`} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: failed ? '#D4533B' : '#8a8275', textDecoration: 'underline', cursor: busy ? 'wait' : 'pointer' }}>
      {failed ? 'Try again' : busy ? 'Removing' : 'Unfollow'}
    </button>
  )
}
