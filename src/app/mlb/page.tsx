// src/app/mlb/page.tsx
import SiteHeader from '@/components/SiteHeader'
import {
  getMLBStandings,
  getMLBStatLeaders,
  getMLBNewsMultiSource,
  MLB_STAT_CATEGORIES,
} from '@/lib/mlb-homepage'
import { getScheduleForDate } from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import MLBHomepage from './MLBHomepage'
import { getFantasyPicks } from '@/lib/fantasy'
import { getCurrentSubscriber } from '@/lib/auth'
import { getAllActiveIL, getAllRecentTransactions } from '@/lib/team-transactions'
import MLBSubNav from '@/components/MLBSubNav'
import type { Prospect } from '@/app/mlb/MLBHomepage'

export const metadata = {
  title: 'MLB · The Edge',
  description: "Division standings, stat leaders, and today's edges — the GM briefing for baseball.",
}

export const revalidate = 1800

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const SEASON = new Date().getFullYear()

// sportId mapping:  11 = AAA (Triple-A East/West)  12 = AA (Double-A)
// Documented in fetch_player_form.py — MILB_AAA_SPORT_ID = 11
const MILB_LEVELS: { sportId: number; level: string }[] = [
  { sportId: 11, level: 'AAA' },
  { sportId: 12, level: 'AA'  },
]

// MLB parent team IDs that map to each MiLB affiliate.
// The MLB Stats API returns parentOrgId on every MiLB team record.
// We use this to group prospects by their MLB organisation.
// Format: { mlbTeamId: number }[] is already available via TEAM_LIST in the component.

async function fetchLevelProspects(
  sportId: number,
  level: string,
  limit = 50,
): Promise<Prospect[]> {
  try {
    // Fetch top hitters by OPS for this level, min 80 PA to filter small samples
    const url =
      `${MLB_API}/stats/leaders` +
      `?leaderCategories=onBasePlusSlugging` +
      `&season=${SEASON}` +
      `&sportId=${sportId}` +
      `&limit=${limit}` +
      `&statGroup=hitting`

    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const leaders: any[] = data.leagueLeaders?.[0]?.leaders ?? []

    return leaders.map((l: any, i: number) => {
      const personId: number = l.person?.id ?? 0
      const ops = parseFloat(l.value ?? '0') || undefined

      // parentOrgId links MiLB team back to the MLB club
      const parentOrgId: number | null = l.team?.parentOrgId ?? l.team?.parentOrg?.id ?? null

      return {
        rank: i + 1,
        player_name: l.person?.fullName ?? '—',
        position: l.person?.primaryPosition?.abbreviation ?? '',
        team_name: l.team?.name ?? '—',
        parent_team_id: parentOrgId,
        level,
        eta: undefined,
        age: l.person?.currentAge ? String(l.person.currentAge) : undefined,
        playerId: personId || null,
        ops,
      }
    })
  } catch (err) {
    console.warn(`MiLB ${level} (sportId ${sportId}) fetch failed:`, err)
    return []
  }
}

async function getMLBProspects(): Promise<Prospect[]> {
  // Fetch AAA and AA in parallel
  const [aaa, aa] = await Promise.all(
    MILB_LEVELS.map(({ sportId, level }) => fetchLevelProspects(sportId, level, 60))
  )

  // Merge — AAA first, then AA, sorted by OPS descending within each level
  const merged = [
    ...aaa.sort((a, b) => (b.ops ?? 0) - (a.ops ?? 0)),
    ...aa.sort((a, b) => (b.ops ?? 0) - (a.ops ?? 0)),
  ]

  // Re-rank globally
  return merged.map((p, i) => ({ ...p, rank: i + 1 }))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MLBPage() {
  const today = new Date().toISOString().split('T')[0]

  const [
    standings,
    news,
    games,
    predictions,
    fantasyResult,
    subscriber,
    activeIL,
    recentTransactions,
    prospects,
    ...statLeaderGroups
  ] = await Promise.all([
    getMLBStandings(),
    getMLBNewsMultiSource(),
    getScheduleForDate(today),
    getPredictionsForDate(today),
    getFantasyPicks(),
    getCurrentSubscriber(),
    getAllActiveIL(),
    getAllRecentTransactions(5, ['IL', 'ACTIVATION', 'TRADE', 'SIGNING', 'CALLUP']),
    getMLBProspects(),
    ...MLB_STAT_CATEGORIES.map(cat => getMLBStatLeaders(cat.slug, 10, cat.group)),
  ])

  const isPro = subscriber?.is_pro ?? false

  const statLeaders: Record<string, Awaited<ReturnType<typeof getMLBStatLeaders>>> = {}
  MLB_STAT_CATEGORIES.forEach((cat, i) => {
    statLeaders[cat.slug] = statLeaderGroups[i] as Awaited<ReturnType<typeof getMLBStatLeaders>>
  })

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <MLBHomepage
        standings={standings}
        statLeaders={statLeaders}
        games={games}
        predictions={predictions as Map<number, any>}
        news={news}
        today={today}
        fantasyPicks={fantasyResult.picks}
        fantasyIsStale={fantasyResult.isStale}
        isPro={isPro}
        activeIL={activeIL}
        recentTransactions={recentTransactions}
        prospects={prospects}
      />
    </main>
  )
}