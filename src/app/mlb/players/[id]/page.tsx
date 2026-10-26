// src/app/mlb/players/[id]/page.tsx
//
// Server component. Fetches identity + bio in one shot (single MLB API
// hydrate call), passes it to the client shell. Statcast, splits, game
// log all fetch client-side per-tab so the initial render isn't blocked
// by Savant CSVs.
//
// This is the BASIC stats page — advanced views live in the Batting /
// Pitching Lab. Old deep links (?tab=lab, used by MlbDeepDives cards) land on
// this page's Lab tab, which is either the lab hand-off (Pro) or the locked card.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPlayerPageData } from '@/lib/player-page'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import ProGate from '@/components/pro/ProGate'
import PendingBlock from '@/components/data/PendingBlock'
import { getPlayerOverview } from '@/lib/player-overview'
import { PlayerHeader, LatestGame, GoDeeper, OverviewBody, ZonesShell, Section } from '@/components/player-page/PlayerOverviewView'
import { getCurrentSubscriber } from '@/lib/auth'
import { Suspense } from 'react'
import StatcastTrendsSlot from '@/components/player/trends/StatcastTrendsSlot'

import { devPro } from '@/lib/dev-pro'
import { resolveViewer } from '@/lib/gate'
import FollowControl from '@/components/signup/FollowControl'
import { pageMeta, noindex } from '@/lib/seo'
import { fitDescription } from '@/lib/game-slug'
import { PersonSchema, BreadcrumbSchema } from '@/components/StructuredData'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  
  const data = await getPlayerPageData(Number(id))
  if (!data) return { title: 'Player not found', ...noindex() }
  const { identity } = data
  const team = identity.currentTeam?.name ? ` (${identity.currentTeam.name})` : ''
  const description = fitDescription(
    `${identity.fullName}${team}: season stats, recent form, career history and game log, with pitch-level views in the ${identity.isPitcher ? 'Pitching' : 'Batting'} Lab. Sample size beside every number.`,
    ['Free account.'],
  )
  return pageMeta({ title: `${identity.fullName} stats and pitch data`, description, path: `/mlb/players/${id}`, type: 'website' })
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; pro?: string }>
}) {
  const { id } = await params
  const { tab, pro } = await searchParams
  const playerId = Number(id)
  if (!playerId) notFound()

  const data = await getPlayerPageData(playerId)
  if (!data) notFound()

  // isPro: the real subscriber flag. `next dev` only: unlocked for local
  // testing (same override as the Scout Report and team pages) — ?pro=0 previews
  // the LOCKED state. Every deployed build has NODE_ENV 'production', so real
  // visitors are gated by is_pro alone. Required prop below, never defaulted.
  const subscriber = await getCurrentSubscriber()
  const isPro = (subscriber?.is_pro ?? false) || devPro(pro)
  // The zones tab is the page's one gate. A free account may spend today's deep look on it (see lib/deep-look.ts).
  const gate = isPro ? { tier: 'pro' as const, freeLook: false, state: 'pro' as const } : await resolveViewer('player_trends', String(playerId))

  const overview = await getPlayerOverview(data)
  const centered: React.CSSProperties = { maxWidth: 1360, margin: '0 auto', padding: '16px 24px 72px' }

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <PersonSchema name={data.identity.fullName} path={`/mlb/players/${playerId}`} teamName={data.identity.currentTeam?.name ?? null} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: data.identity.fullName, path: `/mlb/players/${playerId}` }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={centered}>
        <PlayerHeader data={data} follow={<FollowControl kind="player" refId={String(playerId)} name={data.identity.fullName} />} />
        {overview.seasonNote ? <p style={{ margin: '0 0 8px', fontSize: 14, color: '#8a8275' }}>{overview.seasonNote}</p> : null}
        <GoDeeper data={data} current="player" />
        <LatestGame o={overview} />
        <OverviewBody o={overview} data={data} />

        <Section title="Zones">
          <ProGate
            feature="player_trends"
            entityId={String(playerId)}
            source="follow"
            full={async () => (
              <Suspense fallback={<PendingBlock label="Statcast zones" />}>
                <StatcastTrendsSlot playerId={playerId} subject={data.identity.isPitcher ? 'pitcher' : 'batter'} teamId={data.identity.currentTeam?.id ?? null} color={data.identity.currentTeam?.primaryColor ?? '#1A1A1A'} season={overview.season} />
              </Suspense>
            )}
            shell={<ZonesShell />}
          />
        </Section>
      </div>
    </main>
  )
}
