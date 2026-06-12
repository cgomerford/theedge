'use client'

// src/app/nfl/teams/[slug]/NFLTeamPage.tsx

import Link from 'next/link'
import type { NFLTeamCard } from '@/lib/nfl'
import type { NFLGame } from '@/lib/nfl-schedule'

type Props = {
  team: NFLTeamCard
  schedule: NFLGame[]
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatGameTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

export default function NFLTeamPage({ team, schedule }: Props) {
  const record = `${team.wins}–${team.losses}${team.ties > 0 ? `–${team.ties}` : ''}`
  const isPreSeason = new Date() < new Date('2026-09-09')

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Team header ── */}
      <div className="py-8 border-b border-stone-200 mb-8">
        <Link href="/nfl"
          className="font-mono text-[9px] uppercase tracking-widest text-stone-400 hover:text-orange-500 transition mb-6 inline-block">
          ← NFL
        </Link>
        <div className="flex items-center gap-6">
          <img src={team.logo} alt={team.name} className="w-20 h-20 object-contain shrink-0" />
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1">
              {team.conference} {team.division}
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-stone-900 leading-tight">
              {team.name}
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <span className="font-mono text-sm font-bold text-stone-700">{record}</span>
              <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider">2025 season</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pre-season analysis coming soon ── */}
      {isPreSeason && (
        <div
          className="rounded-xl overflow-hidden mb-8"
          style={{ background: '#1A1A1A', border: '0.5px solid rgba(255,87,34,0.2)' }}
        >
          <div className="px-6 py-8 text-center">
            <div className="font-mono text-[9px] uppercase tracking-widest text-orange-500 mb-3">
              ⊕ The Edge · {team.abbreviation} Analysis
            </div>
            <h2 className="font-serif text-2xl font-bold text-white mb-2">
              Full analysis from Week 1<span className="text-orange-500">.</span>
            </h2>
            <p className="font-serif italic text-stone-400 text-sm max-w-sm mx-auto">
              Edge Scores, game previews, injury reports, and Fantasy intelligence for every {team.shortName} game — live September 9, 2026.
            </p>
            <Link href="/pricing"
              className="inline-block mt-5 font-mono text-[10px] uppercase tracking-widest bg-[#FF5722] text-white px-5 py-2.5 rounded-sm hover:bg-orange-700 transition">
              Get Pro for Week 1 →
            </Link>
          </div>
        </div>
      )}

      {/* ── Schedule ── */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">
            § 2025 Season Results
          </span>
          <div className="flex-1 h-px bg-stone-200" />
        </div>

        {schedule.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-10 text-center font-serif italic text-stone-400 text-sm">
            Schedule not available — check back shortly.
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid px-4 py-2 bg-stone-50 border-b border-stone-100"
              style={{ gridTemplateColumns: '36px 1fr 100px 80px 70px', gap: '8px' }}>
              <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Wk</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Opponent</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Date</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">Result</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">Preview</div>
            </div>

            {schedule.map((game) => {
              const isHome = game.homeTeam.id === team.id
              const opponent = isHome ? game.awayTeam : game.homeTeam
              const teamScore = isHome ? game.homeScore : game.awayScore
              const oppScore = isHome ? game.awayScore : game.homeScore
              const isFinal = game.status === 'final'
              const isWin = isFinal && teamScore != null && oppScore != null && teamScore > oppScore
              const isLive = game.status === 'in_progress'

              // Use the game slug for the preview link
              const previewHref = `/nfl/${game.slug}`

              return (
                <div key={game.id}
                  className="grid px-4 py-3 border-b border-stone-50 last:border-0 items-center hover:bg-stone-50/50 transition-colors"
                  style={{ gridTemplateColumns: '36px 1fr 100px 80px 70px', gap: '8px' }}>

                  {/* Week */}
                  <div className="font-mono text-xs text-stone-400">{game.week}</div>

                  {/* Opponent */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={opponent.logo} alt={opponent.abbreviation}
                      className="w-6 h-6 object-contain shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
                    <div className="min-w-0">
                      <div className="font-serif text-sm font-semibold text-stone-900 leading-tight truncate">
                        {isHome ? '' : '@ '}{opponent.shortName}
                      </div>
                      <div className="font-mono text-[9px] text-stone-400 uppercase tracking-wider mt-0.5">
                        {isHome ? 'Home' : 'Away'}
                      </div>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="font-mono text-[10px] text-stone-500">
                    {formatShortDate(game.date)}
                  </div>

                  {/* Result */}
                  <div className="text-center">
                    {isFinal && teamScore != null ? (
                      <span className="font-mono text-xs font-bold"
                        style={{ color: isWin ? '#15803D' : '#DC2626' }}>
                        {isWin ? 'W' : 'L'} {teamScore}–{oppScore}
                      </span>
                    ) : isLive ? (
                      <span className="font-mono text-[9px] text-green-600 font-bold uppercase flex items-center justify-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                        Live
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] text-stone-400">
                        {formatGameTime(game.date)}
                      </span>
                    )}
                  </div>

                  {/* Preview link */}
                  <div className="text-center">
                    <Link href={previewHref}
                      className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 transition">
                      View →
                    </Link>
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}