'use client'

import { useEffect } from 'react'
import { cleanRef, REF_COOKIE, REF_COOKIE_DAYS } from '@/lib/referral'

// Mounted once in the root layout. If the address has ?ref=CODE, remember it for 30 days in the edge_ref cookie so it
// survives the trip through signup and checkout. First touch wins: a code already saved is never overwritten.
// Renders nothing. The cookie is only read by our own checkout route; it is not an analytics or ad cookie.
export default function ReferralCapture() {
  useEffect(() => {
    try {
      const code = cleanRef(new URLSearchParams(window.location.search).get('ref'))
      if (!code) return
      if (document.cookie.split(';').some(c => c.trim().startsWith(`${REF_COOKIE}=`))) return
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${REF_COOKIE}=${code}; Max-Age=${REF_COOKIE_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`
    } catch { /* cookies blocked: no referral is recorded, nothing else breaks */ }
  }, [])
  return null
}
