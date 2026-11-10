'use client'

import { useState } from 'react'
import EmailSignupForm from './EmailSignupForm'

// "Free account" or "Pro account" in front of the normal email form. Both use the SAME magic-link signup. Choosing Pro only changes where
// the emailed link lands afterwards (/pricing/start, which opens Stripe checkout). Prices come from the server (what checkout charges now).
type Offer = { year: string | null; month: string | null }

export default function PlanChoice({ source, returnTo, extra, initialPlan, initialInterval, offer }: {
  source: string; returnTo?: string; extra?: Record<string, string | undefined>
  initialPlan: 'free' | 'pro'; initialInterval: 'year' | 'month'; offer: Offer
}) {
  const proAvailable = !!(offer.year || offer.month)
  const [plan, setPlan] = useState<'free' | 'pro'>(proAvailable ? initialPlan : 'free')
  const [interval, setIntervalState] = useState<'year' | 'month'>(initialInterval === 'month' && offer.month ? 'month' : offer.year ? 'year' : 'month')

  const card = (on: boolean): React.CSSProperties => ({ textAlign: 'left', padding: '12px 14px', background: on ? '#1A1A1A' : '#fff', color: on ? '#FAF8F3' : '#1A1A1A', border: '1px solid #1A1A1A', borderRadius: 2, cursor: 'pointer', fontSize: 15, fontWeight: 800 })
  const sub: React.CSSProperties = { display: 'block', marginTop: 2, fontSize: 13, fontWeight: 400, opacity: 0.8 }

  return (
    <div>
      {proAvailable && (
        <div role="radiogroup" aria-label="Choose your account" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
          <button type="button" role="radio" aria-checked={plan === 'free'} onClick={() => setPlan('free')} style={card(plan === 'free')}>Free account<span style={sub}>No card</span></button>
          <button type="button" role="radio" aria-checked={plan === 'pro'} onClick={() => setPlan('pro')} style={card(plan === 'pro')}>Pro account<span style={sub}>Then checkout</span></button>
        </div>
      )}
      {plan === 'pro' && (
        <div style={{ marginBottom: 14 }}>
          <div role="radiogroup" aria-label="Billing period" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {offer.year && <button type="button" role="radio" aria-checked={interval === 'year'} onClick={() => setIntervalState('year')} style={{ ...card(interval === 'year'), fontSize: 14 }}>Yearly, {offer.year}</button>}
            {offer.month && <button type="button" role="radio" aria-checked={interval === 'month'} onClick={() => setIntervalState('month')} style={{ ...card(interval === 'month'), fontSize: 14 }}>Monthly, {offer.month}</button>}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8a8275' }}>We email you a sign-in link; clicking it opens secure checkout. Leave checkout and you keep a free account.</p>
        </div>
      )}
      <EmailSignupForm source={source} returnTo={plan === 'pro' ? `/pricing/start?interval=${interval}` : returnTo} extra={extra} buttonLabel={plan === 'pro' ? 'Email me my sign-in link' : undefined} />
    </div>
  )
}
