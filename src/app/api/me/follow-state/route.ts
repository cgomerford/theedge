// Private: does the signed-in person follow this team or player, and are they at their free limit? Used by the Follow button island,
// so pages that carry a Follow button never read the session themselves. Signed out -> { signedIn: false }.
import { NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getFollowState } from '@/lib/follows'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind') === 'player' ? 'player' : 'team'
  const ref = searchParams.get('ref') ?? ''
  const sub = await getCurrentSubscriber()
  if (!sub || !ref) return NextResponse.json({ signedIn: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  const st = await getFollowState(sub, kind, ref)
  return NextResponse.json({ signedIn: true, ...st }, { headers: { 'Cache-Control': 'private, no-store' } })
}
