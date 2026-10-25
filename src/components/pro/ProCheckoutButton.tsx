'use client'

import { useState } from 'react'

// Starts the existing Stripe checkout (POST /api/stripe/checkout) and sends the browser to Stripe. Pro itself is granted
// only by the Stripe webhook after payment, never here. Shown to signed-in people without Pro only.
export default function ProCheckoutButton({ children, interval = 'year', variant = 'solid' }: { children: React.ReactNode; interval?: 'year' | 'month'; variant?: 'solid' | 'outline' }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function go() {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interval }) })
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
      <button
        type="button"
        onClick={go}
        disabled={busy}
        style={{ padding: '12px 18px', background: variant === 'solid' ? '#FF5722' : 'transparent', color: variant === 'solid' ? '#fff' : '#1A1A1A', border: variant === 'solid' ? 0 : '1px solid #1A1A1A', borderRadius: 2, fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}
      >
        {children}
      </button>
      {failed && <span role="alert" style={{ marginLeft: 12, fontSize: 13, color: '#b42318' }}>Checkout could not begin. Try again.</span>}
    </>
  )
}
