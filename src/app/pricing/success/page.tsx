// /pricing/success — where Stripe sends people after paying.
// Pro is switched on by the webhook (api/stripe/webhook), which can land a few
// seconds after this page loads, so this page reads the real subscriber state
// and tells the truth: active now, or "give it a moment".

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getCurrentSubscriber } from '@/lib/auth'

export const metadata = { title: 'Welcome to Pro · The Edge' }
export const dynamic = 'force-dynamic'

export default async function ProSuccessPage() {
  const subscriber = await getCurrentSubscriber()
  const active = !!subscriber?.is_pro
  const F = { fontFamily: 'var(--font-outfit), system-ui, sans-serif' }
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <div className="max-w-[640px] mx-auto px-6 py-20">
        <div style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#FF5722' }}>⊕ Pro</div>
        <h1 style={{ ...F, fontWeight: 800, fontSize: 44, letterSpacing: '-.02em', margin: '10px 0 12px', color: '#1A1A1A' }}>{active ? "You're in. Welcome to Pro." : 'Payment received — thank you.'}</h1>
        {active ? (
          <p style={{ ...F, fontSize: 16, color: '#4A4740', lineHeight: 1.55 }}>Pro is active on your account. The Batting and Pitching Labs, the Statcast trends tab and every Pro panel are unlocked.</p>
        ) : subscriber ? (
          <p style={{ ...F, fontSize: 16, color: '#4A4740', lineHeight: 1.55 }}>We&apos;re switching Pro on now — it usually takes a few seconds. Refresh this page, or head to any player page and it will be unlocked.</p>
        ) : (
          <p style={{ ...F, fontSize: 16, color: '#4A4740', lineHeight: 1.55 }}>Your Pro membership is being set up on the email you paid with. <b>Sign in with that same email</b> and Pro will be unlocked — we send a one-click login link, no password.</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 28 }}>
          {!subscriber && <Link href="/login" style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', background: '#1A1A1A', color: '#FAF8F3', padding: '12px 18px', borderRadius: 8, textDecoration: 'none' }}>Sign in →</Link>}
          <Link href="/mlb" style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, textDecoration: 'none', padding: '12px 0' }}>Start exploring →</Link>
        </div>
      </div>
    </main>
  )
}
