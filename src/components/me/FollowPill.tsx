'use client'

// src/components/me/FollowPill.tsx: the "+ Follow" pill on the empty state. Uses the existing follow API (POST /api/follow toggles) and re-reads the page.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { C, SANS } from './ui'

export default function FollowPill({ kind, refId, name }: { kind: 'player' | 'team'; refId: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function go() {
    setBusy(true); setFailed(false)
    try {
      const res = await fetch('/api/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ref: refId, name }) })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean }
      if (res.ok && j.ok) { router.refresh(); return }
      setFailed(true)
    } catch { setFailed(true) }
    setBusy(false)
  }
  return <button type="button" onClick={go} disabled={busy} aria-label={`Follow ${name}`} style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, borderRadius: 999, padding: '7px 14px', border: `1px solid ${C.orange}`, background: '#fff1ea', color: C.orange, cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{failed ? 'Try again' : busy ? 'Following' : '+ Follow'}</button>
}
