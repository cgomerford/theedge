import { NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getPlayerFollows } from '@/lib/follows'
import { findTeamBySlug } from '@/lib/teams'
import { getMLBTeamNextGame } from '@/lib/mlb-homepage'
import { initialsOf } from '@/components/ui/InitialsChip'
import { headshotUrl } from '@/lib/mlb-assets'
import { teamLogoUrl } from '@/lib/mlb'

// Private: who the signed-in person follows (up to 6 players and teams) with each one's next game.
// Loaded by the homepage's "Your follows" island so the homepage HTML itself stays cacheable for everyone.
// Signed out -> 401 { signedIn: false }.

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }

type Item = { kind: 'team' | 'player'; name: string; chip: string; img: string; href: string; next: string | null }

async function playerTeamId(playerId: number): Promise<number | null> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam`, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const json = await res.json()
    const id = Number(json.people?.[0]?.currentTeam?.id)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch (e) {
    console.error('[api/me/follows] playerTeamId failed:', e instanceof Error ? e.message : e)
    return null
  }
}

async function nextText(teamId: number | null): Promise<string | null> {
  if (!teamId) return null
  const g = await getMLBTeamNextGame(teamId)
  if (!g) return null
  const d = new Date(`${g.gameDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `next: ${g.isHome ? 'vs' : 'at'} ${g.opponent}, ${d}`
}

export async function GET() {
  const sub = await getCurrentSubscriber()
  if (!sub) return NextResponse.json({ signedIn: false }, { status: 401, headers: NO_STORE })

  const players = await getPlayerFollows(sub.id)
  const teams = sub.teams.map(findTeamBySlug).filter((t): t is NonNullable<typeof t> => !!t)

  const teamItems: Promise<Item>[] = teams.slice(0, 6).map(async t => ({
    kind: 'team' as const, name: t.short, chip: t.abbrev, img: teamLogoUrl(t.id), href: `/mlb/teams/${t.slug}`, next: await nextText(t.id),
  }))
  const playerItems: Promise<Item>[] = players.slice(0, 6).map(async p => ({
    kind: 'player' as const, name: p.player_name, chip: initialsOf(p.player_name), img: headshotUrl(p.player_id, 80), href: `/mlb/players/${p.player_id}`, next: await nextText(await playerTeamId(p.player_id)),
  }))
  const items = (await Promise.all([...teamItems, ...playerItems])).slice(0, 6)
  return NextResponse.json({ signedIn: true, items }, { headers: NO_STORE })
}
