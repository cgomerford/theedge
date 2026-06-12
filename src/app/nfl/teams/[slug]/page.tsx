// src/app/nfl/teams/[slug]/page.tsx

import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import NFLTeamPage from './NFLTeamPage'
import { getNFLTeams } from '@/lib/nfl'
import { getNFLTeamSchedule } from '@/lib/nfl-schedule'

type Props = {
  params: { slug: string }
}

// Maps URL slugs → ESPN team IDs
// Slugs match what the SiteHeader mega panel uses
const SLUG_TO_ID: Record<string, string> = {
  // AFC East
  'buf': '17', 'mia': '20', 'ne': '21', 'nyj': '18',
  // AFC North
  'bal': '33', 'cin': '4', 'cle': '5', 'pit': '23',
  // AFC South
  'hou': '34', 'ind': '11', 'jax': '30', 'ten': '10',
  // AFC West
  'den': '7', 'kc': '12', 'lv': '13', 'lac': '24',
  // NFC East
  'dal': '6', 'nyg': '19', 'phi': '22', 'wsh': '28',
  // NFC North
  'chi': '3', 'det': '16', 'gb': '9', 'min': '29',
  // NFC South
  'atl': '1', 'car': '2', 'no': '25', 'tb': '27',
  // NFC West
  'ari': '32', 'lar': '14', 'sf': '26', 'sea': '15',
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
    getNFLTeamSchedule(id, 2025),
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