// src/app/mlb/[slug]/scout-report/page.tsx
//
// Standalone Scout Report page — split out of mlb/[slug]/page.tsx's old
// "Scout" tab so it has its own linkable slug (per George: homepage game
// cards now hover-reveal separate "Scout Report" / "Game Preview" links
// instead of one combined game page).
//
// The old tabbed report (ScoutSlotAsync) is archived; this page hands the
// game it already resolved to the new sectioned ScoutReport
// (components/scout/), which is being built one section at a time.

import { devPro } from '@/lib/dev-pro'
import XMark from '@/components/XMark'
import { getScheduleForDate, slugifyGame, teamLogoUrl, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import MLBSubNav from '@/components/MLBSubNav'
import ContextStrip from '@/components/nav/ContextStrip'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import { getCurrentSubscriber } from '@/lib/auth'
import type { Metadata } from 'next'
import SignupAsk from '@/components/signup/SignupAsk'
import { pageMeta, noindex } from '@/lib/seo'
import { parseGameSlug, gameTitle, fitDescription } from '@/lib/game-slug'
import { SportsEventSchema, BreadcrumbSchema } from '@/components/StructuredData'
import ScoutReport from '@/components/scout/ScoutReport'
import { SITE_URL } from '@/lib/site'

export const revalidate = 60
export const maxDuration = 15

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pro?: string; tab?: string }> }

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const p = parseGameSlug(slug)
  if (!p) return { title: 'Scout report', ...noindex() }
  const title = gameTitle(p, ' scout report')
  const description = fitDescription(
    `${p.awayName} at ${p.homeName} on ${p.dateLabel}: starting pitching, lineups and batter zones, bullpen, defense and situational splits, with the sample size beside each stat.`,
    ['Free account.'],
  )
  return pageMeta({ title, description, path: `/mlb/${slug}/scout-report`, type: 'article' })
}

const ROUND_SHORT: Record<string, string> = { 'World Series': 'WS', 'League Championship Series': 'LCS', 'Division Series': 'DS', 'Wild Card Game': 'WC', 'Wild Card Series': 'WC' }

// Breadcrumb strip under the MLB tabs. Uses only what the schedule row for this game already holds; a missing part is dropped.
function ScoutStrip({ game, slug, isFinal, awayAbbr, homeAbbr, gameDate }: { game: MLBGame; slug: string; isFinal: boolean; awayAbbr: string; homeAbbr: string; gameDate: string }) {
  const series = game.seriesDescription && game.seriesDescription !== 'Regular Season' ? game.seriesDescription : null
  const gameNo = series && game.seriesGameNumber ? game.seriesGameNumber : null
  const when = new Date(game.gameDate)
  const day = new Date(`${gameDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).toLowerCase().replace(' ', '') // 8:00pm
  const timeEt = `${time.replace(/(am|pm)$/, ' $1')} ET`
  const venue = game.venue?.name
  return (
    <ContextStrip
      left={<>
        <span className="x9-strip-d">MLB / {series ?? 'Regular season'} / {gameNo ? `Game ${gameNo} / ` : ''}<b>Scout report</b> <span style={{ color: '#B5AFA2' }}>·</span> {awayAbbr} at {homeAbbr}, {day}, {timeEt}{venue ? `, ${venue}` : ''}</span>
        <span className="x9-strip-m"><b>{awayAbbr} at {homeAbbr}</b> <span style={{ color: '#B5AFA2' }}>·</span> {series ? `${ROUND_SHORT[series] ?? series}${gameNo ? ` G${gameNo}` : ''} · ` : ''}{day}, {timeEt}</span>
      </>}
      right={<span className="x9-strip-d">Also: <a href={`/mlb/${slug}`}>Preview</a>{isFinal ? <> · <a href={`/mlb/${slug}/postgame`}>Postgame</a></> : ' · Postgame after the game'}</span>}
    />
  )
}

export default async function ScoutReportPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { pro, tab } = await searchParams
  const supa = createAdminClient()
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  // Same lookup pattern as the game page: live schedule first, fall back
  // to the cached game_previews row for games that have aged out of the
  // live schedule endpoint's window.
  const [freshGames, { data: cached }] = await Promise.all([
    getScheduleForDate(dateMatch[1]).catch(() => [] as MLBGame[]),
    supa.from('game_previews').select('raw_data').eq('slug', slug).single(),
  ])
  let game: MLBGame | null = freshGames.find(g => slugifyGame(g) === slug) ?? null
  if (!game && cached?.raw_data) game = cached.raw_data as MLBGame
  if (!game) notFound()

  const subscriber = await getCurrentSubscriber()
  // Local development (`next dev`) is always Pro so the Pro sections and chart layers can be tested.
  // NODE_ENV is 'production' on any deployed build, so real subscribers are still gated by is_pro.
  const isPro = (subscriber?.is_pro ?? false) || devPro(pro)

  const isFinal = game.status?.abstractGameState === 'Final'
  const awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'
  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'

  return (
    <>
      <SportsEventSchema awayTeam={game.teams.away.team.name} homeTeam={game.teams.home.team.name} gameDate={game.gameDate} venue={game.venue?.name ?? null} path={`/mlb/${slug}/scout-report`} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: `${game.teams.away.team.name} vs ${game.teams.home.team.name}`, path: `/mlb/${slug}` }, { name: 'Scout report', path: `/mlb/${slug}/scout-report` }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <LiveTicker />
      <div className="min-h-screen bg-stone-50">
        <ScoutStrip game={game} slug={slug} isFinal={isFinal} awayAbbr={awayAbbr} homeAbbr={homeAbbr} gameDate={dateMatch[1]} />
        <div style={centered}>
          <h1 className="m-0 px-4 pt-4 text-[12px] uppercase tracking-widest font-bold text-orange-600"><XMark /> {game.teams.away.team.name} vs {game.teams.home.team.name}: scout report</h1>
        </div>

        <div className="px-4 py-6" style={centered}>
          <ScoutReport game={game} gameDate={dateMatch[1]} tab={tab} />
          <SignupAsk source="scout_report_end" />
        </div>
      </div>
    </>
  )
}
