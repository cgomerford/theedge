// src/lib/require-pro.ts
//
// ONE place that decides "is this request from a Pro member?" for anything that
// is not a page with its own isPro prop — API routes and route layouts.
//
//   isProViewer()  → boolean, from the real subscriber session (subscribers.is_pro).
//   requirePro()   → null when allowed, or a 403 JSON Response to `return` from a route.
//
// Never defaults to true. Local testing only: under `next dev` (NODE_ENV is
// 'production' on every Vercel build, so this can never open a deployed site)
// set the cookie `edge_dev_pro=1` to see the Pro views. Nothing is unlocked automatically.

import { cookies } from 'next/headers'
import { getCurrentSubscriber } from '@/lib/auth'
import { getDevView } from '@/lib/dev-view'

export async function isProViewer(): Promise<boolean> {
  const devView = await getDevView()
  if (devView) return devView === 'pro'
  const subscriber = await getCurrentSubscriber()
  if (subscriber?.is_pro) return true
  if (process.env.NODE_ENV === 'development') {
    const jar = await cookies()
    return jar.get('edge_dev_pro')?.value === '1'
  }
  return false
}

export async function requirePro(): Promise<Response | null> {
  if (await isProViewer()) return null
  return Response.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
}

/** Who is looking: drives ProGate and /pricing. 'pro' sees everything; 'member' is signed in without Pro; 'anon' is signed out. */
export type { ViewerTier } from '@/lib/require-pro-types'
import type { ViewerTier } from '@/lib/require-pro-types'

export async function getViewerTier(): Promise<ViewerTier> {
  const devView = await getDevView()
  if (devView) return devView === 'pro' ? 'pro' : devView === 'member' ? 'member' : 'anon'
  const subscriber = await getCurrentSubscriber()
  if (subscriber?.is_pro) return 'pro'
  if (process.env.NODE_ENV === 'development') {
    const jar = await cookies()
    if (jar.get('edge_dev_pro')?.value === '1') return 'pro'
  }
  return subscriber ? 'member' : 'anon'
}
