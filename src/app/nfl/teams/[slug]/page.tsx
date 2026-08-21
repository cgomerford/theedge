// src/app/nfl/teams/[slug]/page.tsx

import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import NFLTeamPage from './NFLTeamPage'
import { getNFLTeams } from '@/lib/nfl'
import { getNFLTeamGamesAdapted } from '@/lib/nfl/games-adapter'

type Props = {
  params: { slug: string }
}

// Maps URL slugs → ESPN team IDs
// Slugs match what the SiteHeader mega panel uses
//
// CORRECTED 2026-08-14 — the previous version of this map had 12 team ids
// shuffled between the wrong franchises (two rotation cycles: MIA/NYJ/NO/
// SF/SEA and DET/MIN/CAR/BUF/NE/PHI/ARI), plus `ari: '32'` which isn't a
// valid ESPN team id at all (real Cardinals id is 22). Cross-checked against
// ESPN scoreboard/playbyplay payloads pulled directly. If any team page
// still looks wrong after this, re-verify that specific team's id via
// curl against https://cdn.espn.com/core/nfl/scoreboard rather than
// trusting this list blind — don't propagate a second bad copy.
const SLUG_TO_ID: Record<string, string> = {
  // AFC East
  'buf': '2', 'mia': '15', 'ne': '17', 'nyj': '20',
  // AFC North
  'bal': '33', 'cin': '4', 'cle': '5', 'pit': '23',
  // AFC South
  'hou': '34', 'ind': '11', 'jax': '30', 'ten': '10',
  // AFC West
  'den': '7', 'kc': '12', 'lv': '13', 'lac': '24',
  // NFC East
  'dal': '6', 'nyg': '19', 'phi': '21', 'wsh': '28',
  // NFC North
  'chi': '3', 'det': '8', 'gb': '9', 'min': '16',
  // NFC South
  'atl': '1', 'car': '29', 'no': '18', 'tb': '27',
  // NFC West
  'ari': '22', 'lar': '14', 'sf': '25', 'sea': '26',
}

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = rawSlug.toLowerCase()
  const teamId = SLUG_TO_ID[slug]
  if (!teamId) return { title: 'NFL Team · The Edge' }
  const teams = await getNFLTeams()
  const team = teams.find(t => t.id === teamId)
  if (!team) return { title: 'NFL Team · The Edge' }
  return {
    title: `${team.name} · The Edge`,
    description: `${team.name} schedule, stats, and analysis — The Edge NFL.`,
  }
}

export default async function NFLTeamPageRoute({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = rawSlug.toLowerCase()

  console.log('[NFL Team] slug:', slug)

  const teamId = SLUG_TO_ID[slug]

  console.log('[NFL Team] teamId:', teamId)

  if (!teamId) {
    console.log('[NFL Team] no teamId found for slug:', slug)
    notFound()
  }

  const id = teamId as string

  const [teams, schedule] = await Promise.all([
    getNFLTeams(),
    // Reads from the nfl_games Supabase table (written by
    // scripts/nfl_scoreboard_ingest.py, post-game only). Previously this
    // called getNFLTeamSchedule(id, 2025) from a different source — that
    // hardcoded 2025 season and this new source doesn't yet distinguish
    // "last completed season" vs "this preseason" beyond the seasonType
    // filter baked into getRecentNFLGames/getTeamNFLGames. Revisit once
    // regular-season 2026 rows exist if you need those separated.
    getNFLTeamGamesAdapted(id),
  ])

  console.log('[NFL Team] schedule length:', schedule.length)

  const team = teams.find(t => t.id === id)

  if (!team) {
    console.log('[NFL Team] no team found for id:', id)
    notFound()
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <NFLTeamPage team={team!} schedule={schedule} />
    </main>
  )
}