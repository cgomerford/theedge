'use client'

// src/components/CheckoutButtons.tsx — the "Go Pro" buttons on /pricing.
// POSTs to /api/stripe/checkout and sends the browser to Stripe's hosted page.
// Pro is granted by the webhook after payment, never by this component.

import { useState } from 'react'

const MONO = 'var(--font-jetbrains), ui-monospace, monospace'

export default function CheckoutButtons({ signedIn }: { signedIn: boolean }) {
  const [interval, setInterval_] = useState<'month' | 'year'>('year')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function go() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interval }) })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.url) { window.location.href = json.url; return }
      if (json.error === 'not_configured') setMsg('Pro checkout is being switched on — please check back very shortly.')
      else if (json.error === 'already_pro') setMsg('You already have Pro.')
      else setMsg('Something went wrong starting checkout. Please try again.')
    } catch {
      setMsg('Could not reach checkout. Check your connection and try again.')
    }
    setBusy(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', border: '1px solid #3A3A38', marginBottom: 12 }}>
        {([['year', 'Yearly', 'best value'], ['month', 'Monthly', 'flexible']] as const).map(([v, label, sub]) => (
          <button key={v} type="button" onClick={() => setInterval_(v)}
            style={{ flex: 1, padding: '9px 6px', fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', border: 'none', background: interval === v ? '#FDE047' : 'transparent', color: interval === v ? '#1A1A1A' : '#FAF8F3' }}>
            {label}<span style={{ display: 'block', fontSize: 8, opacity: 0.7, letterSpacing: '.06em' }}>{sub}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={go} disabled={busy}
        style={{ width: '100%', padding: '13px 10px', fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', border: 'none', background: '#FF5722', color: '#fff', opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Opening checkout…' : 'Go Pro →'}
      </button>
      {msg && <p style={{ fontFamily: MONO, fontSize: 10.5, color: '#FDE047', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>{msg}</p>}
      <p style={{ fontFamily: MONO, fontSize: 10, color: '#8A8577', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>
        Secure checkout by Stripe · cancel any time{signedIn ? '' : ' · you can pay first and sign in after'}
      </p>
    </div>
  )
}
