'use client'

import { useEffect, useState } from 'react'
import ProCheckoutButton from './ProCheckoutButton'
import { FOUNDING, STANDARD, FOUNDING_MONTHLY, STANDARD_MONTHLY, formatPrice } from '@/lib/pricing'

// The "Unlock" buttons for places that do not know the offer. They ask GET /api/stripe/offer what a new subscriber would pay right now
// and show that, so a button never prints a price checkout will not charge. While loading, and when neither period is available (USD price
// not set up, or the founding count cannot be read), no purchase button is shown at all.
type Plan = 'founding' | 'standard' | null
type Offer = { annual: { plan: Plan }; monthly: { plan: Plan } }
let cached: Promise<Offer | null> | null = null
const load = () => (cached ??= fetch('/api/stripe/offer', { cache: 'no-store' }).then(r => (r.ok ? (r.json() as Promise<Offer>) : null)).catch(() => null))

export default function ProUnlockButton() {
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined)
  useEffect(() => { let off = false; load().then(o => { if (!off) setOffer(o) }); return () => { off = true } }, [])
  if (offer === undefined) return null
  const y = offer?.annual.plan, m = offer?.monthly.plan
  if (!y && !m) return <span style={{ fontSize: 14, color: '#5b5347' }}>Pro checkout is not open right now. <a href="/pricing" style={{ color: '#1A1A1A', fontWeight: 700 }}>See Pro</a></span>
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      {y && <ProCheckoutButton interval="year" expect={y}>{y === 'founding' ? `Unlock with Founding Pro, ${formatPrice(FOUNDING)}` : `Unlock with Pro, ${formatPrice(STANDARD)}`}</ProCheckoutButton>}
      {m && <ProCheckoutButton interval="month" variant="outline" expect={m}>{`Monthly, ${formatPrice(m === 'founding' ? FOUNDING_MONTHLY : STANDARD_MONTHLY)}`}</ProCheckoutButton>}
    </span>
  )
}
