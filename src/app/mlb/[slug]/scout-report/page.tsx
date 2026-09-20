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

import { getScheduleForDate, slugifyGame, teamLogoUrl, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import { getCurrentSubscriber } from '@/lib/auth'
import ScoutReport from '@/components/scout/ScoutReport'

export const revalidate = 60
export const maxDuration = 15

type Props = { params: Promise<{ slug: string }> }

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  const dateStr = dateMatch?.[1] ?? ''
  const matchup = slug
    .replace(/-(\d{4}-\d{2}-\d{2})(-game\d+)?$/, '')
    .replace(/-at-/, ' at ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  const displayDate = dateStr
    ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''
  const title = `${matchup} — Scout Report${displayDate ? ` · ${displayDate}` : ''} · The Edge`
  const description = `Topic-by-topic scouting breakdown for ${matchup}: starting pitching, batting & lineups, bullpen, defense, and situational tendencies.`
  return {
    title, description,
    openGraph: { title, description, type: 'article', url: `https://edgereportdaily.com/mlb/${slug}/scout-report` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function ScoutReportPage({ params }: Props) {
  const { slug } = await params
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
  const isPro = (subscriber?.is_pro ?? false) || process.env.NODE_ENV === 'development'

  const isFinal = game.status?.abstractGameState === 'Final'
  const awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'
  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'

  return (
    <>
      <SiteHeader variant="page" />
      <LiveTicker />
      <div className="min-h-screen bg-stone-50">
        <div className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
          <div className="flex items-center px-4 py-2 gap-2" style={centered}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <img src={teamLogoUrl(game.teams.away.team.id)} alt={awayAbbr} className="w-8 h-8 object-contain flex-shrink-0" />
              <span className="text-[13px] font-mono font-bold text-stone-900 truncate">{awayAbbr}</span>
            </div>

            <div className="flex flex-col items-center shrink-0 px-1">
              <span className="text-[11px] font-serif italic text-stone-400 leading-none">at</span>
              <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5 whitespace-nowrap">
                {isFinal ? 'Final' : gameTimeFormatted}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
              <span className="text-[13px] font-mono font-bold text-stone-900 truncate">{homeAbbr}</span>
              <img src={teamLogoUrl(game.teams.home.team.id)} alt={homeAbbr} className="w-8 h-8 object-contain flex-shrink-0" />
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-3">
              <Link href={`/mlb/${slug}`} className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-600 transition whitespace-nowrap">
                Game Preview →
              </Link>
              {isFinal && (
                <Link href={`/mlb/${slug}/postgame`} className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-600 transition whitespace-nowrap">
                  Postgame →
                </Link>
              )}
            </div>
          </div>

          <div className="px-4 py-2 border-t border-stone-100" style={centered}>
            <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-orange-600">§ Scout Report</span>
          </div>
        </div>

        <div className="px-4 py-6" style={centered}>
          <ScoutReport game={game} gameDate={dateMatch[1]} isPro={isPro} />
        </div>
      </div>
    </>
  )
}
