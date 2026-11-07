'use client'

import { useEffect, useState } from 'react'
import ProCheckoutButton from './ProCheckoutButton'
import { FOUNDING, STANDARD, formatPrice } from '@/lib/pricing'

// The annual "Unlock" button for places that do not know the offer. It asks GET /api/stripe/offer what a new subscriber would pay
// right now and shows that, so it never prints a price checkout will not charge. While loading, and when annual checkout is not
// available (USD price not set up, or the founding count cannot be read), it shows no purchase button at all.
type Offer = { annual: { plan: 'founding' | 'standard' | null } }
let cached: Promise<Offer | null> | null = null
const load = () => (cached ??= fetch('/api/stripe/offer', { cache: 'no-store' }).then(r => (r.ok ? (r.json() as Promise<Offer>) : null)).catch(() => null))

export default function ProUnlockButton() {
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined)
  useEffect(() => { let off = false; load().then(o => { if (!off) setOffer(o) }); return () => { off = true } }, [])
  if (offer === undefined) return null
  const plan = offer?.annual.plan
  if (!plan) return <span style={{ fontSize: 14, color: '#5b5347' }}>Pro checkout is not open right now. <a href="/pricing" style={{ color: '#1A1A1A', fontWeight: 700 }}>See Pro</a></span>
  return <ProCheckoutButton expect={plan}>{plan === 'founding' ? `Unlock with Founding Pro, ${formatPrice(FOUNDING)}` : `Unlock with Pro, ${formatPrice(STANDARD)}`}</ProCheckoutButton>
}
