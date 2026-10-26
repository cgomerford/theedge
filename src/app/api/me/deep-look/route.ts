// POST {feature, entityId} spends today's free deep look (or reports the state). GET ?feature=&entityId= returns the state. Private: always dynamic, never cached.
import { NextRequest, NextResponse } from 'next/server'
import { claimDeepLook, getDeepLookState, type DeepLookFeature } from '@/lib/deep-look'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store' }
const FEATURES: DeepLookFeature[] = ['batting_lab', 'pitching_lab', 'pitch_shape', 'player_trends', 'game_zones', 'scout_report']

function parse(feature: unknown, entityId: unknown): { feature: DeepLookFeature; entityId: string } | null {
  if (typeof feature !== 'string' || !FEATURES.includes(feature as DeepLookFeature)) return null
  const id = typeof entityId === 'number' ? String(entityId) : entityId
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null
  return { feature: feature as DeepLookFeature, entityId: id }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { feature?: unknown; entityId?: unknown } | null
  const p = parse(body?.feature, body?.entityId)
  if (!p) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: HEADERS })
  const state = await claimDeepLook(p.feature, p.entityId)
  return NextResponse.json({ state }, { headers: HEADERS })
}

export async function GET(req: NextRequest) {
  const p = parse(req.nextUrl.searchParams.get('feature'), req.nextUrl.searchParams.get('entityId'))
  if (!p) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: HEADERS })
  const state = await getDeepLookState(p.feature, p.entityId)
  // The pages build each module's data on the server behind ProGate, and every data API checks the look itself, so this
  // returns the state only. (No client island needs module data from here.)
  return NextResponse.json({ state }, { headers: HEADERS })
}
