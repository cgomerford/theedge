// Content calendar writes (admin only, src/lib/admin-auth.ts). Every body goes through cleanItem / cleanTargets before it reaches the database.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { cleanItem, cleanTargets } from '@/lib/content-plan-core'
import { createItems, deleteItem, getItem, saveTargets, updateItem } from '@/lib/content-plan'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const reply = (r: { ok: boolean; missing?: boolean; error?: string }) => NextResponse.json(r, { status: r.ok ? 200 : r.missing ? 503 : 500 })
const body = async (req: NextRequest) => (await req.json().catch(() => ({}))) as Record<string, unknown>

// GET ?id=... returns one item in full, brief included (read when its drawer opens).
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: 'Unknown item.' }, { status: 400 })
  const item = await getItem(id)
  if (item === 'missing') return NextResponse.json({ ok: false, missing: true, error: 'The calendar tables are not ready yet.' }, { status: 503 })
  return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ ok: false, error: 'That item was not found.' }, { status: 404 })
}

// POST { items: [...] } creates up to 60 plan items.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false }, { status: 401 })
  const b = await body(req)
  const items = (Array.isArray(b.items) ? b.items.slice(0, 60) : []).map(cleanItem)
  if (!items.length || items.some(i => !i)) return NextResponse.json({ ok: false, error: 'Each item needs a date and a title.' }, { status: 400 })
  return reply(await createItems(items as NonNullable<(typeof items)[number]>[]))
}

// PATCH { id, ...fields } changes one item. Only the fields sent are changed.
export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false }, { status: 401 })
  const b = await body(req)
  const id = String(b.id ?? '')
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: 'Unknown item.' }, { status: 400 })
  const full = cleanItem({ plan_date: '2000-01-01', title: 'x', ...b })
  if (!full) return NextResponse.json({ ok: false, error: 'That change is not valid.' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  for (const k of ['plan_date', 'kind', 'title', 'notes', 'status', 'article_id', 'url', 'brief'] as const) if (k in b) patch[k] = full[k]
  if ('title' in b && !String(b.title ?? '').trim()) return NextResponse.json({ ok: false, error: 'A title is needed.' }, { status: 400 })
  return reply(await updateItem(id, patch))
}

// DELETE ?id=... removes one item.
export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: 'Unknown item.' }, { status: 400 })
  return reply(await deleteItem(id))
}

// PUT { targets } saves the weekly targets.
export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false }, { status: 401 })
  return reply(await saveTargets(cleanTargets((await body(req)).targets)))
}
