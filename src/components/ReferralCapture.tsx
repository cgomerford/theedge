'use client'

import { useEffect } from 'react'
import { cleanRef, saveRefCookie } from '@/lib/referral'

// Mounted once in the root layout. If the address has ?ref=CODE, remember it for 30 days in the edge_ref cookie so it
// survives the trip through signup and checkout. First touch wins: a code already saved is never overwritten.
// Renders nothing. The cookie is only read by our own checkout route; it is not an analytics or ad cookie.
export default function ReferralCapture() {
  useEffect(() => {
    try {
      const code = cleanRef(new URLSearchParams(window.location.search).get('ref'))
      if (code) saveRefCookie(code)
    } catch { /* the address could not be read: no referral is saved, nothing else breaks */ }
  }, [])
  return null
}
