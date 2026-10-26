'use client'

import { openSignup } from './openSignup'
import { signupHref } from '@/lib/site'
import { INLINE_ASK_LINE, SIGNUP_BUTTON } from './copy'

// The one inline ask a page may carry: one line and one button, between two rules. The link works without JavaScript.
export default function SignupAskButton({ source }: { source: string }) {
  return (
    <div style={{ borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '14px 0', margin: '24px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px' }}>
      <span style={{ flex: '1 1 280px', fontSize: 16, fontWeight: 800 }}>{INLINE_ASK_LINE}</span>
      <a
        href={signupHref(source)}
        onClick={e => { e.preventDefault(); openSignup(source) }}
        style={{ background: '#1A1A1A', color: '#FAF8F3', fontWeight: 800, fontSize: 15, padding: '11px 18px', borderRadius: 2, textDecoration: 'none' }}
      >
        {SIGNUP_BUTTON}
      </a>
    </div>
  )
}
