// GET  /api/me/dashboard  -> { layout, saved, isPro } : the person's saved layout, or the starter layout.
// PUT  /api/me/dashboard  { layout } -> { layout, saved } : validated against their plan (stats, widget count) before it is saved.
// Private: signed-in only, never cached. The plan is read on the server; the browser cannot ask for more than its plan allows.

import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import { getSavedLayout, saveLayout } from '@/lib/dashboard/store'
import { parseLayout, starterLayout } from '@/lib/dashboard/layout'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
// the local dev stand-in subscriber is not a row in subscribers, so nothing can be saved for it
const DEV_ID = '00000000-0000-0000-0000-000000000000'

export async function GET() {
  const sub = await getCurrentSubscriber()
  if (!sub) return NextResponse.json({ error: 'sign_in' }, { status: 401, headers: NO_STORE })
  const isPro = await isProViewer()
  const saved = sub.id === DEV_ID ? null : await getSavedLayout(sub.id, isPro)
  return NextResponse.json({ layout: saved ?? starterLayout(isPro), saved: !!saved, isPro, canSave: sub.id !== DEV_ID }, { headers: NO_STORE })
}

export async function PUT(req: NextRequest) {
  const sub = await getCurrentSubscriber()
  if (!sub) return NextResponse.json({ error: 'sign_in' }, { status: 401, headers: NO_STORE })
  const isPro = await isProViewer()
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400, headers: NO_STORE }) }
  const layout = parseLayout((body as { layout?: unknown } | null)?.layout, isPro)
  if (!layout) return NextResponse.json({ error: 'bad_layout' }, { status: 400, headers: NO_STORE })
  if (sub.id === DEV_ID) return NextResponse.json({ layout, saved: false }, { headers: NO_STORE })
  const ok = await saveLayout(sub.id, layout)
  return NextResponse.json({ layout, saved: ok }, { status: ok ? 200 : 500, headers: NO_STORE })
}
