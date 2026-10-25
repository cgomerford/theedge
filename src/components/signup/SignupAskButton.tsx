'use client'

import { openSignup } from './openSignup'
import { signupHref } from '@/lib/site'

// The one inline ask a page may carry. A plain row with a text button; the link works without JavaScript.
export default function SignupAskButton({ source }: { source: string }) {
  return (
    <div style={{ borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '14px 0', margin: '24px 0' }}>
      <a
        href={signupHref(source)}
        onClick={e => { e.preventDefault(); openSignup(source) }}
        style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A', textDecoration: 'underline', textUnderlineOffset: 3 }}
      >
        Free daily email
      </a>
    </div>
  )
}
