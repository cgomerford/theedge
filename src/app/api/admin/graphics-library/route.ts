// src/app/api/admin/graphics-library/route.ts
//
// Saved graphics for /admin/graphics: GET the newest 60 (without the full spec), GET ?id= one with its spec, POST save or update, DELETE ?id=.
// Two kinds share the table: 'blocks' (Graphic Blocks specs) and 'creator' (Graphic Creator documents); lists are filtered by ?kind=.
// Single writer of graphics_library. Auth: isAdminRequest (src/proxy.ts does not cover /api). The spec is validated with the studio's own
// schema before it is stored.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { parseDoc } from '@/lib/graphics/creator'
import { validateSpec } from '@/lib/graphics/schema'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const supabase = createAdminClient()
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data, error } = await supabase.from('graphics_library').select('id, name, template, spec, caption, post_at, updated_at').eq('id', id).maybeSingle()
    if (error) { console.error('[GET /api/admin/graphics-library] Supabase error:', error.message); return NextResponse.json({ error: 'Could not load it' }, { status: 500 }) }
    return data ? NextResponse.json(data) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const kind = req.nextUrl.searchParams.get('kind') === 'creator' ? 'creator' : 'blocks'
  const { data, error } = await supabase.from('graphics_library').select('id, name, template, caption, post_at, updated_at').eq('kind', kind).order('updated_at', { ascending: false }).limit(60)
  if (error) {
    console.error('[GET /api/admin/graphics-library] Supabase error:', error.message)
    return NextResponse.json({ items: [], missingTable: /graphics_library/.test(error.message) })
  }
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: { id?: string; kind?: string; name?: string; spec?: unknown; caption?: string; post_at?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const kind = body.kind === 'creator' ? 'creator' : 'blocks'
  let spec: unknown, template: string, fallbackName: string
  if (kind === 'creator') {
    const doc = parseDoc(body.spec)
    if (!doc) return NextResponse.json({ error: 'The graphic is not valid.' }, { status: 400 })
    spec = doc; template = 'creator'; fallbackName = 'Untitled graphic'
  } else {
    const v = validateSpec(body.spec)
    if (!v.ok) return NextResponse.json({ error: `The graphic is not valid: ${v.errors[0]}` }, { status: 400 })
    spec = v.spec; template = v.spec.template; fallbackName = v.spec.title
  }
  const name = (body.name ?? '').trim().slice(0, 120) || fallbackName.slice(0, 120) || 'Untitled graphic'
  const row = { name, kind, template, spec, caption: (body.caption ?? '').slice(0, 1000), post_at: body.post_at && !Number.isNaN(Date.parse(body.post_at)) ? new Date(body.post_at).toISOString() : null, updated_at: new Date().toISOString() }
  const supabase = createAdminClient()
  const q = body.id ? supabase.from('graphics_library').update(row).eq('id', body.id) : supabase.from('graphics_library').insert(row)
  const { data, error } = await q.select('id, name, template, caption, post_at, updated_at').single()
  if (error) {
    console.error('[POST /api/admin/graphics-library] Supabase error:', error.message)
    return NextResponse.json({ error: 'Save failed. The graphics library SQL may not have been run yet.' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Pass id' }, { status: 400 })
  const { error } = await createAdminClient().from('graphics_library').delete().eq('id', id)
  if (error) { console.error('[DELETE /api/admin/graphics-library] Supabase error:', error.message); return NextResponse.json({ error: 'Delete failed' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
