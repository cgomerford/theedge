import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { addComment, reportComment } from '@/lib/comments'

// POST { articleId, name, body } -> posts a comment as the signed-in reader.
// POST { report: commentId }     -> reports a comment (three different readers hide it).
export async function POST(req: NextRequest) {
  const sub = await getCurrentSubscriber()
  if (!sub) return NextResponse.json({ ok: false, error: 'Sign in to comment.' }, { status: 401 })
  let b: { articleId?: string; name?: string; body?: string; report?: string }
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 }) }

  if (b.report) {
    const ok = await reportComment(String(b.report), sub.id)
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 })
  }
  if (!b.articleId) return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const r = await addComment(String(b.articleId), sub.id, b.name, b.body)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
