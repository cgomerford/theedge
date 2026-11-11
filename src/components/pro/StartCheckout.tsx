'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { saveRefCookie } from '@/lib/referral'

// The landing step of "Start Pro": the person has just signed in from the emailed link, so this page starts the same Stripe
// checkout the pricing buttons use (POST /api/stripe/checkout) and sends them to Stripe. The referral code comes from the link they clicked and is sent in
// the request body (checkout prefers the body, then falls back to the edge_ref cookie); it is also saved as the cookie if this browser has none yet.
// Pro itself is granted only by the webhook after payment. If Stripe is not reachable the person keeps a free account.
export default function StartCheckout({ interval, refCode }: { interval: 'year' | 'month'; refCode?: string | null }) {
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (started.current) return   // React dev mode runs effects twice; one checkout session is enough
    started.current = true
    if (refCode) saveRefCookie(refCode)
    ;(async () => {
      try {
        const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interval, ...(refCode ? { ref: refCode } : {}) }) })
        const json = (await res.json().catch(() => ({}))) as { url?: string }
        if (res.ok && json.url) { window.location.href = json.url; return }
        if (res.status === 409) { window.location.href = '/pricing'; return }   // price changed, or already Pro: the pricing page shows the truth
      } catch { /* fall through */ }
      setFailed(true)
    })()
  }, [interval, refCode])

  return failed ? (
    <div role="alert">
      <p style={{ fontSize: 17, color: '#1A1A1A', margin: '0 0 12px' }}>Checkout could not begin. Your free account is ready.</p>
      <Link href="/pricing" style={{ color: '#FF5722', fontWeight: 800 }}>Go to pricing to try again →</Link>
    </div>
  ) : (
    <p role="status" style={{ fontSize: 17, color: '#5b5347', margin: 0 }}>Taking you to secure checkout…</p>
  )
}
