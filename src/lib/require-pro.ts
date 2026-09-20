// src/lib/require-pro.ts
//
// ONE place that decides "is this request from a Pro member?" for anything that
// is not a page with its own isPro prop — API routes and route layouts.
//
//   isProViewer()  → boolean, from the real subscriber session (subscribers.is_pro).
//   requirePro()   → null when allowed, or a 403 JSON Response to `return` from a route.
//
// Never defaults to true. The single exception is `next dev` (NODE_ENV is
// 'production' on every Vercel build, so this can never open a deployed site):
// Pro is unlocked locally so the paid views can be built and tested. To preview
// the LOCKED state locally, set the cookie `edge_force_locked=1`.

import { cookies } from 'next/headers'
import { getCurrentSubscriber } from '@/lib/auth'

export async function isProViewer(): Promise<boolean> {
  const subscriber = await getCurrentSubscriber()
  if (subscriber?.is_pro) return true
  if (process.env.NODE_ENV === 'development') {
    const jar = await cookies()
    return jar.get('edge_force_locked')?.value !== '1'
  }
  return false
}

export async function requirePro(): Promise<Response | null> {
  if (await isProViewer()) return null
  return Response.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
}
