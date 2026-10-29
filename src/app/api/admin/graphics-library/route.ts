// src/app/api/admin/graphics-library/route.ts
//
// Saved graphics for /admin/graphics: GET the newest 60 (without the full spec), GET ?id= one with its spec, POST save or update, DELETE ?id=.
// Single writer of graphics_library. Auth: isAdminRequest (src/proxy.ts does not cover /api). The spec is validated with the studio's own
// schema before it is stored.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
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
  const { data, error } = await supabase.from('graphics_library').select('id, name, template, caption, post_at, updated_at').order('updated_at', { ascending: false }).limit(60)
  if (error) {
    console.error('[GET /api/admin/graphics-library] Supabase error:', error.message)
    return NextResponse.json({ items: [], missingTable: /graphics_library/.test(error.message) })
  }
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: { id?: string; name?: string; spec?: unknown; caption?: string; post_at?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const v = validateSpec(body.spec)
  if (!v.ok) return NextResponse.json({ error: `The graphic is not valid: ${v.errors[0]}` }, { status: 400 })
  const name = (body.name ?? '').trim().slice(0, 120) || v.spec.title.slice(0, 120) || 'Untitled graphic'
  const row = { name, template: v.spec.template, spec: v.spec, caption: (body.caption ?? '').slice(0, 1000), post_at: body.post_at && !Number.isNaN(Date.parse(body.post_at)) ? new Date(body.post_at).toISOString() : null, updated_at: new Date().toISOString() }
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
