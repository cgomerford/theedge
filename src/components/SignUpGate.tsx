// src/components/SignUpGate.tsx
//
// What a signed-out visitor sees on a sign-up-gated page. Rendered by the SERVER (layout or page) after it checked the
// session (isSignedIn), so none of the gated page's client code or data requests run. Empty state over teaser: it says
// what is inside and has no numbers. Free: signing up unlocks it; there is no Pro gate here.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'

export default function SignUpGate({ title, blurb, features }: { title: string; blurb: string; features: string[] }) {
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div className="max-w-[760px] mx-auto px-6 py-16">
        <span style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 9, fontWeight: 800, letterSpacing: '.12em', background: '#FDE047', color: '#1A1A1A', padding: '3px 7px', borderRadius: 5 }}>FREE WITH A SIGN-UP</span>
        <h1 style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontWeight: 800, fontSize: 40, letterSpacing: '-.02em', margin: '14px 0 10px', color: '#1A1A1A' }}>{title}</h1>
        <p style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 16, color: '#4A4740', lineHeight: 1.55, margin: '0 0 18px' }}>{blurb}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'grid', gap: 8 }}>
          {features.map(f => (
            <li key={f} style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 14.5, color: '#3a352c' }}><span style={{ color: '#FF5722' }}>◆</span>{f}</li>
          ))}
        </ul>
        <Link href="/login" style={{ fontFamily: 'var(--font-redhat), system-ui, sans-serif', fontSize: 14, fontWeight: 700, background: '#FF5722', color: '#fff', padding: '11px 20px', borderRadius: 8, textDecoration: 'none' }}>Sign up free</Link>
      </div>
    </main>
  )
}
