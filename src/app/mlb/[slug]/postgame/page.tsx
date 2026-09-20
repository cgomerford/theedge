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

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getScheduleForDate, slugifyGame, teamLogoUrl, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import PostgameShell from '@/components/postgame/report/PostgameShell'
import type { PostgameContext } from '@/components/postgame/report/types'

export const revalidate = 300
export const maxDuration = 30

type Props = { params: Promise<{ slug: string }> }

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const matchup = slug.replace(/-(\d{4}-\d{2}-\d{2})(-game\d+)?$/, '').replace(/-vs-/, ' vs ').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const title = `${matchup} — Postgame Report · The Edge`
  const description = `Postgame breakdown for ${matchup}: how the game swung, top performers, the full box score and a hand-scored scorecard.`
  return { title, description, openGraph: { title, description, type: 'article', url: `https://edgereportdaily.com/mlb/${slug}/postgame` }, twitter: { card: 'summary_large_image', title, description } }
}

export default async function PostGamePage({ params }: Props) {
  const { slug } = await params
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
  const isPro = (subscriber?.is_pro ?? false) || process.env.NODE_ENV === 'development'   // dev is always Pro so the Pro sections can be tested
  const isAdmin = subscriber?.role === 'admin' || process.env.NODE_ENV === 'development'
  const isFinal = game.status?.abstractGameState === 'Final'
  const away = game.teams.away, home = game.teams.home
  const awayAbbr = away.team.abbreviation ?? 'AWAY', homeAbbr = home.team.abbreviation ?? 'HOME'

  const ctx: PostgameContext = {
    gamePk: game.gamePk, gameDate: dateMatch[1], slug, isPro, isAdmin,
    away: { id: away.team.id, name: away.team.name, abbr: awayAbbr },
    home: { id: home.team.id, name: home.team.name, abbr: homeAbbr },
  }

  return (
    <>
      <SiteHeader variant="page" />
      <LiveTicker />
      <div className="min-h-screen bg-stone-50">
        <div className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
          <div className="flex items-center px-4 py-2 gap-2" style={centered}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={teamLogoUrl(away.team.id)} alt={awayAbbr} className="w-8 h-8 object-contain flex-shrink-0" />
              <span className="text-[13px] font-mono font-bold text-stone-900 truncate">{awayAbbr}</span>
              {isFinal && <span className="text-[15px] font-mono font-bold text-stone-900 ml-1">{(away as { score?: number }).score ?? ''}</span>}
            </div>
            <div className="flex flex-col items-center shrink-0 px-1">
              <span className="text-[11px] font-serif italic text-stone-400 leading-none">at</span>
              <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5">{isFinal ? 'Final' : (game.status?.detailedState ?? 'Not final')}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
              {isFinal && <span className="text-[15px] font-mono font-bold text-stone-900 mr-1">{(home as { score?: number }).score ?? ''}</span>}
              <span className="text-[13px] font-mono font-bold text-stone-900 truncate">{homeAbbr}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={teamLogoUrl(home.team.id)} alt={homeAbbr} className="w-8 h-8 object-contain flex-shrink-0" />
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <Link href={`/mlb/${slug}`} className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-600 transition whitespace-nowrap">Game Preview →</Link>
              <Link href={`/mlb/${slug}/scout-report`} className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-600 transition whitespace-nowrap">Scout Report →</Link>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-stone-100" style={centered}>
            <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-orange-600">§ Postgame Report</span>
          </div>
        </div>

        <div className="px-4 py-6" style={centered}>
          {isFinal ? <PostgameShell ctx={ctx} /> : (
            <div className="max-w-2xl mx-auto py-16 text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-orange-600 mb-3">Not final yet</p>
              <h1 className="font-serif text-2xl text-stone-900 mb-3">{away.team.name} @ {home.team.name}</h1>
              <p className="text-stone-500 mb-6">The postgame report appears once the game ends. Status: {game.status?.detailedState ?? 'Scheduled'}.</p>
              <Link href={`/mlb/${slug}`} className="font-mono text-sm underline text-stone-900">← Back to the game preview</Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
