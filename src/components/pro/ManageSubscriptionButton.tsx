'use client'

import { useState } from 'react'

// Opens Stripe's hosted billing portal (POST /api/stripe/portal). Shown on /me to Pro members only.
export default function ManageSubscriptionButton({ style }: { style?: React.CSSProperties }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function go() {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { url?: string }
      if (res.ok && json.url) {
        window.location.href = json.url
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
      <button type="button" onClick={go} disabled={busy} style={{ ...style, cursor: busy ? 'wait' : 'pointer' }}>
        <b>Manage subscription</b>
      </button>
      {failed && <p role="alert" style={{ margin: '6px 0 0', fontSize: 13, color: '#b42318' }}>The billing page could not open. Try again.</p>}
    </>
  )
}
