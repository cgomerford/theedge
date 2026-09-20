// src/app/api/postgame-card/[gamePk]/route.tsx
//
// X graphics for the Postgame report: GET /api/postgame-card/<gamePk>?card=umpire[&download=1] returns a 1600×900 PNG.
// Cards: final, swing, performers, umpire, abs, contact, starters, leverage (lib/postgame/cards). Admin only — the
// graphics are for posting from the brand account, so the route checks the session role (any signed-in admin) and, in
// local development, lets the dev server through. Never cached: it reads the same cached feed as the page and is cheap.

import { ImageResponse } from 'next/og'
import { getCurrentSubscriber } from '@/lib/auth'
import { getPostData } from '@/lib/postgame/data'
import { buildCard, CARD_KINDS, type CardKind } from '@/lib/postgame/cards/cards'
import { loadFonts, W, H } from '@/lib/postgame/cards/frame'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: Request, { params }: { params: Promise<{ gamePk: string }> }) {
  const sub = process.env.NODE_ENV === 'development' ? null : await getCurrentSubscriber()
  if (process.env.NODE_ENV !== 'development' && sub?.role !== 'admin') return new Response('Not found', { status: 404 })

  const { gamePk } = await params
  const pk = Number(gamePk)
  const url = new URL(req.url)
  const kind = url.searchParams.get('card') as CardKind | null
  if (!Number.isInteger(pk) || !kind || !CARD_KINDS.includes(kind)) return new Response(`Use ?card=${CARD_KINDS.join('|')}`, { status: 400 })

  const data = await getPostData(pk)
  if (!data) return new Response('Game feed unavailable', { status: 502 })
  const gameDate = data.feed.gameData.datetime?.officialDate ?? ''

  let element
  try { element = await buildCard(kind, data, gameDate) } catch (err) {
    console.error(`[postgame-card] ${kind} failed:`, err instanceof Error ? err.message : err)
    return new Response('Card failed to build', { status: 500 })
  }
  if (!element) return new Response('Not enough data for this card', { status: 404 })

  const t = data.feed.gameData.teams
  const name = `edge-${kind}-${(t.away.abbreviation ?? 'away').toLowerCase()}-${(t.home.abbreviation ?? 'home').toLowerCase()}-${gameDate}.png`
  return new ImageResponse(element, {
    width: W, height: H, fonts: await loadFonts(),
    headers: {
      'Cache-Control': 'private, no-store',
      ...(url.searchParams.get('download') ? { 'Content-Disposition': `attachment; filename="${name}"` } : {}),
    },
  })
}
