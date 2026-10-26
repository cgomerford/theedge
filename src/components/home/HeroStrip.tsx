'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { openSignup } from '@/components/signup/openSignup'

// The strip at the top of the homepage: headline, one line, and two buttons. The page stays cacheable (same HTML for everyone);
// this island only hides "Create account" once it learns the visitor is already signed in (private /api/me/follows).
// Brand colours only: black #1A1A1A, cream #FAF8F3, orange #FF5722, yellow #FDE047. The tagline is George's.

export default function HeroStrip({ reportHref }: { reportHref: string }) {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/me/follows', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.signedIn) setSignedIn(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <section aria-label="x9Lab" style={{ margin: '16px 0 20px', padding: 'clamp(24px, 4vw, 40px) clamp(20px, 4vw, 28px) clamp(24px, 4vw, 34px)', background: '#1A1A1A', color: '#FAF8F3', borderRadius: 2 }}>
      <div aria-hidden="true" style={{ width: 44, height: 5, background: '#FDE047', marginBottom: 16 }} />
      <h1 style={{ margin: 0, fontWeight: 800, fontSize: 'clamp(36px, 6vw, 60px)', letterSpacing: '-0.02em', lineHeight: 1.02 }}>Every pitch, read plainly.</h1>
      <p style={{ margin: '18px 0 20px', maxWidth: 560, fontSize: 'clamp(15px, 2vw, 17px)', lineHeight: 1.5, color: 'rgba(250,248,243,.92)' }}>
        Bringing baseball analytics to the fan. See the game like the front office.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {!signedIn && (
          <button type="button" onClick={() => openSignup('home_hero')} style={{ padding: '11px 18px', background: '#FF5722', color: '#fff', border: 0, borderRadius: 2, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
            Create account
          </button>
        )}
        <Link href={reportHref} style={{ padding: '10px 18px', border: '1.5px solid rgba(250,248,243,.85)', color: '#FAF8F3', borderRadius: 2, fontSize: 15, fontWeight: 800, textDecoration: 'none' }}>
          See a scout report
        </Link>
      </div>
    </section>
  )
}
