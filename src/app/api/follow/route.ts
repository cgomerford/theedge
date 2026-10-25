import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { toggleFollow, type FollowKind } from '@/lib/follows'
import { findTeamBySlug } from '@/lib/teams'

// POST { kind: 'player' | 'team', ref: string, name?: string } -> toggles the follow for the signed-in person.
export async function POST(req: NextRequest) {
  const sub = await getCurrentSubscriber()
  if (!sub) return NextResponse.json({ ok: false, error: 'signin' }, { status: 401 })

  let body: { kind?: string; ref?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
  }
  const kind = body.kind as FollowKind
  const ref = String(body.ref ?? '')
  if ((kind !== 'player' && kind !== 'team') || !ref) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
  if (kind === 'team' && !findTeamBySlug(ref)) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

  const result = await toggleFollow(sub, kind, ref, String(body.name ?? ''))
  return NextResponse.json(result, { status: result.ok ? 200 : result.error === 'limit' ? 200 : 400 })
}
