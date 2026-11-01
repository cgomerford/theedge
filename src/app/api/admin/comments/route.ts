import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { setCommentStatus } from '@/lib/comments'

// PATCH { id, status: 'visible' | 'hidden' | 'delete' } -> moderate one comment. Admin only.
export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string }
  if (!b.id || !['visible', 'hidden', 'delete'].includes(String(b.status))) return NextResponse.json({ ok: false }, { status: 400 })
  const ok = await setCommentStatus(b.id, b.status as 'visible' | 'hidden' | 'delete')
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 })
}
