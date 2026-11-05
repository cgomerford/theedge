// Uploads from the content assistants (MLB Analysis, X, YouTube) into the content calendar, with no admin password.
// Auth: a bearer token per assistant (src/lib/content-ingest-auth.ts), or the admin cookie with a `source` in the body. An upload can only ever arrive as
// planned or drafted, can never link an article, cannot touch an item George has scheduled, published or skipped, and there is no delete here.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { ingestSource } from '@/lib/content-ingest-auth'
import { SOURCES, cleanAgentItem, daysBetween, isDay, type Source } from '@/lib/content-plan-core'
import { listSourceItems, upsertAgentItems } from '@/lib/content-plan'

export const dynamic = 'force-dynamic'
const MAX_ITEMS = 30

/** The caller's source: from the token, or, for the admin, from the `source` they name. */
async function who(req: NextRequest, named: unknown): Promise<Source | null> {
  const t = await ingestSource(req)
  if (t) return t
  if (await isAdminRequest(req)) return SOURCES.some(s => s.id === named) ? (named as Source) : null
  return null
}
const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 })

// POST { items: [{ plan_date, kind, title, notes, brief, url, status, external_key }] }  (up to 30)
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const source = await who(req, b.source)
  if (!source) return NextResponse.json({ ok: false, error: (await isAdminRequest(req)) ? 'Say which source these are from.' : 'Not authorised.' }, { status: (await isAdminRequest(req)) ? 400 : 401 })
  const raw = Array.isArray(b.items) ? b.items : []
  if (!raw.length) return bad('Send { "items": [ ... ] } with at least one item.')
  if (raw.length > MAX_ITEMS) return bad(`Send at most ${MAX_ITEMS} items at a time.`)
  const items = raw.map(x => cleanAgentItem(x, source))
  const wrong = items.findIndex(i => !i)
  if (wrong >= 0) return bad(`Item ${wrong + 1} needs a plan_date (YYYY-MM-DD) and a title.`)
  const r = await upsertAgentItems(items as NonNullable<(typeof items)[number]>[])
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.missing ? 503 : 500 })
  return NextResponse.json({ ok: true, results: r.results })
}

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD  (at most 31 days)  ->  this source's own items; the brief itself is not returned, only its length
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const source = await who(req, q.get('source'))
  if (!source) return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 401 })
  const from = q.get('from'), to = q.get('to')
  if (!isDay(from) || !isDay(to) || to < from) return bad('Send from and to as YYYY-MM-DD.')
  if (daysBetween(from, to) > 31) return bad('The range can be at most 31 days.')
  const r = await listSourceItems(source, from, to)
  if (!r.ok) return NextResponse.json({ ok: false, error: r.missing ? 'The calendar tables are not ready yet.' : 'Could not read the plan.' }, { status: r.missing ? 503 : 500 })
  return NextResponse.json({ ok: true, source, items: r.items })
}
