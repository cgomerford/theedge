// src/app/mlb/[slug]/postgame/page.tsx
//
// Postgame report — rebuilt in the Scout Report's format (sticky section nav, one card per
// section, Free / Pro tiers). The page resolves the game and hands a small context to
// <PostgameShell>; each section fetches what it needs (one shared cached feed, see
// lib/postgame/data.ts) and streams in on its own.
//
// The previous tabbed page (PostGameReportTab and its children) is no longer rendered from here;
// the components and lib/postgame.ts are left in place for salvage while the remaining sections
// (spray, ABS, bullpen, umpires, key players, the Pro audits) are rebuilt.

import { devPro } from '@/lib/dev-pro'
import XMark from '@/components/XMark'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getScheduleForDate, slugifyGame, teamLogoUrl, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import type { Metadata } from 'next'
import { pageMeta, noindex } from '@/lib/seo'
import { parseGameSlug, gameTitle, fitDescription } from '@/lib/game-slug'
import { SportsEventSchema, BreadcrumbSchema } from '@/components/StructuredData'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import Tabs from '@/components/ui/Tabs'
import RecapTab from '@/components/postgame/report/RecapTab'
import { Suspense } from 'react'
import PostgameShell from '@/components/postgame/report/PostgameShell'
import type { PostgameContext } from '@/components/postgame/report/types'
import { SITE_URL } from '@/lib/site'

export const revalidate = 300
export const maxDuration = 30

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pro?: string; tab?: string }> }

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const p = parseGameSlug(slug)
  if (!p) return { title: 'Postgame report', ...noindex() }
  const title = gameTitle(p, ' postgame')
  const description = fitDescription(
    `${p.awayName} at ${p.homeName} on ${p.dateLabel}: how the game went, top performers, pitch-by-pitch charts and the full box score, with the sample size beside each stat.`,
    ['Free account.'],
  )
  return pageMeta({ title, description, path: `/mlb/${slug}/postgame`, type: 'article' })
}

export default async function PostGamePage({ params, searchParams }: Props) {
  const { slug } = await params
  const { pro } = await searchParams
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  // live schedule first; fall back to the cached game_previews row for games that have aged out of it
  const [fresh, { data: cached }] = await Promise.all([
    getScheduleForDate(dateMatch[1]).catch(() => [] as MLBGame[]),
    createAdminClient().from('game_previews').select('raw_data').eq('slug', slug).single(),
  ])
  let game: MLBGame | null = fresh.find((g) => slugifyGame(g) === slug) ?? null
  if (!game && cached?.raw_data) game = cached.raw_data as MLBGame
  if (!game) notFound()

  const subscriber = await getCurrentSubscriber()
  const isPro = (subscriber?.is_pro ?? false) || devPro(pro)
  const isAdmin = subscriber?.role === 'admin' || devPro(pro)
  const isFinal = game.status?.abstractGameState === 'Final'
  const away = game.teams.away, home = game.teams.home
  const awayAbbr = away.team.abbreviation ?? 'AWAY', homeAbbr = home.team.abbreviation ?? 'HOME'

  const ctx: PostgameContext = {
    gamePk: game.gamePk, gameDate: dateMatch[1], slug, isPro, isAdmin,
    away: { id: away.team.id, name: away.team.name, abbr: awayAbbr },
    home: { id: home.team.id, name: home.team.name, abbr: homeAbbr },
  }

  const aScore = (away as { score?: number }).score ?? 0, hScore = (home as { score?: number }).score ?? 0
  const short = (n: string) => n.split(' ').slice(-1)[0]
  const [w, l] = aScore > hScore ? [away, home] : [home, away]
  const headline = `Final: ${short(w.team.name)} ${Math.max(aScore, hScore)}, ${short(l.team.name)} ${Math.min(aScore, hScore)}`
  const dateText = new Date(`${dateMatch[1]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const seriesText = game.seriesDescription && game.seriesDescription !== 'Regular Season' && game.seriesGameNumber ? `${game.seriesDescription}, Game ${game.seriesGameNumber}` : null
  const tab = (await searchParams).tab === 'full' ? 'full' : 'recap'

  return (
    <>
      <SportsEventSchema awayTeam={away.team.name} homeTeam={home.team.name} gameDate={game.gameDate} venue={game.venue?.name ?? null} path={`/mlb/${slug}/postgame`} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: `${away.team.name} vs ${home.team.name}`, path: `/mlb/${slug}` }, { name: 'Postgame report', path: `/mlb/${slug}/postgame` }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '28px 24px 80px' }}>
          {isFinal ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>Postgame</div>
              <h1 style={{ margin: '4px 0 8px', fontSize: 'clamp(30px, 5.5vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{headline}</h1>
              <div style={{ fontSize: 15, color: '#57534E', marginBottom: 14 }}>{dateText}{game.venue?.name ? ` · ${game.venue.name}` : ''}{seriesText ? ` · ${seriesText}` : ''}</div>
              <Suspense fallback={null}>
                <Tabs label="Postgame sections" defaultTab="recap" tabs={[{ id: 'recap', label: 'Recap' }, { id: 'full', label: 'Full report' }]} />
              </Suspense>
              <div style={{ marginTop: 8 }}>
                {tab === 'full' ? <PostgameShell ctx={ctx} /> : <Suspense fallback={null}><RecapTab ctx={ctx} /></Suspense>}
              </div>
            </>
          ) : (
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '64px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>Not final yet</p>
              <h1 style={{ fontSize: 28, margin: '8px 0 12px' }}>{away.team.name} at {home.team.name}</h1>
              <p style={{ color: '#57534E', marginBottom: 20 }}>The postgame report appears once the game ends. Status: {game.status?.detailedState ?? 'Scheduled'}.</p>
              <Link href={`/mlb/${slug}`} style={{ color: '#FF5722', fontWeight: 800 }}>← Back to the game preview</Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
