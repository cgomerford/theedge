// src/app/api/admin/article-images/route.ts
//
// The article writer's image library: the newest uploads in the `article-images` bucket, so a picture used once can be used again.
// Auth: isAdminRequest. Read only; uploads go through /api/admin/upload.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase'

const BUCKET = 'article-images'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 60, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) {
    console.error('[GET /api/admin/article-images] Supabase storage error:', error.message)
    return NextResponse.json({ images: [] })
  }
  const images = (data ?? [])
    .filter(f => f.name && /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name))
    .map(f => ({ name: f.name, url: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl, created_at: f.created_at ?? null }))
  return NextResponse.json({ images })
}
