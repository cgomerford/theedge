'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Spends today's free deep look on one feature + entity (POST /api/me/deep-look), then re-renders the page so the module appears.
// Merely visiting a public page never spends a look: this button (or a lab tab, which is itself the choice) does.
export default function OpenLookButton({ feature, entityId, children, onOpened }: { feature: string; entityId: string; children: React.ReactNode; onOpened?: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function open() {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch('/api/me/deep-look', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, entityId }) })
      const json = (await res.json().catch(() => ({}))) as { state?: string }
      if (res.ok && (json.state === 'this_look' || json.state === 'pro')) {
        onOpened?.()
        router.refresh()
        return
      }
      setFailed(true)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  return (
    <>
      <button type="button" onClick={open} disabled={busy} style={{ padding: '12px 18px', background: '#FF5722', color: '#FAF8F3', border: 0, borderRadius: 2, fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer' }}>
        {children}
      </button>
      {failed && <span style={{ fontSize: 13, color: '#8a8275' }}>Could not open it. Try again.</span>}
    </>
  )
}
