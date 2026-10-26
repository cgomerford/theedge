// src/lib/require-signup.ts
//
// "Is this request from a signed-up member?" — the SIGN-UP gate (any subscriber with a live session), for pages and
// layouts that are free but not anonymous (Contact, Approach). Pro-only things keep using require-pro.ts.
//
// Never defaults to true. Like isProViewer, the single exception is `next dev` (NODE_ENV is 'production' on every
// Vercel build): signed-up is assumed locally so pages can be built; set the cookie `edge_force_locked=1` to preview the
// signed-out state.

import { cookies } from 'next/headers'
import { getCurrentSubscriber } from '@/lib/auth'
import { getDevView } from '@/lib/dev-view'

export async function isSignedIn(): Promise<boolean> {
  const devView = await getDevView()
  if (devView) return devView !== 'out'
  if (await getCurrentSubscriber()) return true
  if (process.env.NODE_ENV === 'development') {
    const jar = await cookies()
    return jar.get('edge_force_locked')?.value !== '1'
  }
  return false
}
