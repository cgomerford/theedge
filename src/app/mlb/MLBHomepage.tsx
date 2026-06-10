'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MLBDivisionStandings, MLBStatLeader, MLBNewsItem, MLBStatCategory } from '@/lib/mlb-homepage'
import { MLB_STAT_CATEGORIES } from '@/lib/mlb-homepage'
import type { MLBGame } from '@/lib/mlb'
import { slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import type { EdgePrediction } from '@/lib/edge-fetch'
import MLBFantasySection from '@/components/MLBFantasySection'
import type { FantasyPicksByType } from '@/lib/fantasy'

type Props = {
  standings: MLBDivisionStandings[]
  statLeaders: Record<string, MLBStatLeader[]>
  games: MLBGame[]
  predictions: Map<number, EdgePrediction>
  news: MLBNewsItem[]
  today: string
  fantasyPicks: FantasyPicksByType
  fantasyIsStale: boolean
  isPro: boolean
}

// ─── Helpers ──────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatGameTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    })
  } catch {
    return '—'
  }
}

function edgeColor(score: number): string {
  if (score >= 15) return '#166534'
  if (score >= 5)  return '#15803d'
  if (score <= -15) return '#991b1b'
  if (score <= -5)  return '#b91c1c'
  return '#78716c'
}

function edgeBg(score: number): string {
  if (score >= 5)  return 'rgba(134,190,135,0.15)'
  if (score <= -5) return 'rgba(239,154,154,0.15)'
  return 'rgba(214,211,209,0.15)'
}

// ─── Today's Game Card ────────────────────────────────────

function GameCard({ game, prediction }: { game: MLBGame; prediction?: EdgePrediction }) {
  const slug = slugifyGame(game)
  const awayName = shortName(game.teams.away.team.name)
  const homeName = shortName(game.teams.home.team.name)
  const gameTime = formatGameTime(game.gameDate)

  const summary = prediction?.summary ?? null
  const isLive = game.status.abstractGameState === 'Live'
  const isFinal = game.status.abstractGameState === 'Final'

  const cardClass = 'block bg-white border border-stone-200 rounded-lg p-4 hover:border-stone-300 hover:shadow-sm transition group'

  return (
    <Link href={`/mlb/${slug}`} className={cardClass}>
      {/* Matchup row */}
      <div className="flex items-center gap-2 mb-3">
        <img
          src={teamLogoUrl(game.teams.away.team.id)}
          alt={awayName}
          className="w-5 h-5 object-contain flex-shrink-0"
        />
        <span className="text-sm font-semibold text-stone-600">{awayName}</span>
        <span className="text-stone-300 text-xs font-mono">@</span>
        <img
          src={teamLogoUrl(game.teams.home.team.id)}
          alt={homeName}
          className="w-5 h-5 object-contain flex-shrink-0"
        />
        <span className="text-sm font-semibold text-stone-900">{homeName}</span>
      </div>

      {/* Narrative summary */}
      {summary && (
        <p className="text-xs text-stone-500 leading-relaxed font-serif italic line-clamp-2 mb-2">
          &ldquo;{summary}&rdquo;
        </p>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="text-[9px] font-mono uppercase tracking-widest text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
              Live
            </span>
          )}
          {isFinal && (
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Final</span>
          )}
          {!isLive && !isFinal && (
            <span className="text-[10px] font-mono text-stone-400">{gameTime} ET</span>
          )}
        </div>
        <span className="text-[10px] font-mono text-orange-500 group-hover:text-orange-600 transition">
          Full preview →
        </span>
      </div>
    </Link>
  )
}

function DivisionTable({ division }: { division: MLBDivisionStandings }) {
  const leagueColor = division.league === 'AL' ? '#003087' : '#BA0021'
  const divShort = division.division.replace(/^(AL|NL)\s+/, '')

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
        <span
          className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded"
          style={{ background: leagueColor, color: '#fff' }}
        >
          {division.league}
        </span>
        <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500">
          {divShort}
        </span>
      </div>

      <div className="divide-y divide-stone-100">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Team</span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 w-7 text-center">W</span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 w-7 text-center">L</span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 w-10 text-right">PCT</span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 w-8 text-right">GB</span>
        </div>

        {division.teams.map((team, i) => {
          const teamSlug = findTeamByName(team.name)?.slug ?? team.abbreviation.toLowerCase()
          return (
            <Link
              key={team.id}
              href={`/mlb/teams/${teamSlug}`}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2.5 items-center hover:bg-stone-50 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
                  alt={team.abbreviation}
                  className="w-5 h-5 object-contain flex-shrink-0"
                  onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none' }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 truncate leading-tight">
                    {team.name.split(' ').slice(-1)[0]}
                  </div>
                  <div className="text-[9px] font-mono text-stone-400 leading-tight">
                    {team.streak}
                  </div>
                </div>
                {i === 0 && (
                  <span className="text-[8px] font-mono uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 hidden sm:inline">
                    1st
                  </span>
                )}
              </div>
              <span className="text-sm font-mono font-bold text-stone-900 w-7 text-center">{team.wins}</span>
              <span className="text-sm font-mono text-stone-500 w-7 text-center">{team.losses}</span>
              <span className="text-sm font-mono text-stone-600 w-10 text-right">{team.pct}</span>
              <span className="text-xs font-mono text-stone-400 w-8 text-right">{team.gb}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stat Leaders Panel ───────────────────────────────────

function StatLeadersPanel({ leaders, label }: { leaders: MLBStatLeader[]; label: string }) {
  if (!leaders || leaders.length === 0) {
    return (
      <div className="text-center py-12 text-stone-400 font-mono text-sm">
        No data available — check back when the season is underway.
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="divide-y divide-stone-100">
        {leaders.slice(0, 10).map((leader) => (
          <div key={`${leader.rank}-${leader.name}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition">
            <span className="text-[11px] font-mono text-stone-400 w-4 flex-shrink-0">{leader.rank}</span>
            <img
              src={leader.headshot}
              alt={leader.name}
              className="w-9 h-9 rounded-full object-cover bg-stone-100 flex-shrink-0"
              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none' }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-stone-900 truncate">{leader.name}</div>
              <div className="text-[10px] font-mono uppercase text-stone-400">{leader.teamAbbr}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-serif font-bold text-stone-900">{leader.statValue}</div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── News Card ────────────────────────────────────────────

function NewsCard({ item, featured }: { item: MLBNewsItem; featured?: boolean }) {
  const containerClass = `block bg-white border border-stone-200 rounded-lg overflow-hidden hover:border-stone-400 hover:shadow-md transition group${featured ? ' md:col-span-2' : ''}`
  const headingClass = `font-serif text-stone-900 leading-snug group-hover:text-orange-700 transition${featured ? ' text-xl mb-2' : ' text-base mb-1'}`

  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className={containerClass}>
      {featured && (
        item.image
          ? <img src={item.image} alt="" className="w-full h-48 object-cover" />
          : <div className="w-full h-24 bg-gradient-to-r from-stone-100 to-stone-50" />
      )}
      <div className="p-4">
        <h3 className={headingClass}>{item.headline}</h3>
        {item.description && (
          <p className="text-stone-500 text-sm leading-relaxed line-clamp-2">{item.description}</p>
        )}
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mt-2">
          {timeAgo(item.published)}
        </div>
      </div>
    </a>
  )
}

// ─── Main Component ───────────────────────────────────────

export default function MLBHomepage({ standings, statLeaders, games, predictions, news, today, fantasyPicks, fantasyIsStale, isPro }: Props) {
  const [activeLeague, setActiveLeague] = useState<'AL' | 'NL'>('AL')
  const [activeStat, setActiveStat] = useState(MLB_STAT_CATEGORIES[0].slug)
  const [activeGroup, setActiveGroup] = useState<'batting' | 'pitching'>('batting')

  const activeDivisions = standings.filter(d => d.league === activeLeague)
  const currentCat = MLB_STAT_CATEGORIES.find(c => c.slug === activeStat)
  const groupCats = MLB_STAT_CATEGORIES.filter(c => c.group === activeGroup)

  // Top edges today — sort by absolute edge score
  const edgeGames = [...games]
    .map(g => ({ game: g, pred: predictions.get(g.gamePk) }))
    .filter(({ pred }) => pred && pred.edge_score !== null)
    .sort((a, b) => Math.abs(b.pred!.edge_score!) - Math.abs(a.pred!.edge_score!))

  const pendingGames = [...games]
    .map(g => ({ game: g, pred: predictions.get(g.gamePk) }))
    .filter(({ pred }) => !pred || pred.edge_score === null)

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Hero ── */}
      <div className="py-10 md:py-14">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-orange-600 mb-3">
          § The Edge · MLB
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-stone-900 leading-none tracking-tight mb-3">
          The GM Brief<span className="text-orange-500">.</span>
        </h1>
        <p className="text-stone-500 text-base md:text-lg max-w-xl font-serif italic">
          Standings, stat leaders, and today's edges — in five minutes.
        </p>
      </div>

      {/* ── TODAY'S FULL SLATE ── */}
      {games.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
              ⊕ Today's slate · {today}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
              {games.length} game{games.length !== 1 ? 's' : ''} today
            </div>
          </div>

          {/* Games with edge reads — sorted by strength */}
          {edgeGames.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {edgeGames.map(({ game, pred }) => (
                <GameCard key={game.gamePk} game={game} prediction={pred} />
              ))}
            </div>
          )}

          {/* Games still pending a read */}
          {pendingGames.length > 0 && (
            <>
              {edgeGames.length > 0 && (
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-stone-400 mt-6 mb-3">
                  Read pending
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingGames.map(({ game }) => (
                  <GameCard key={game.gamePk} game={game} prediction={undefined} />
                ))}
              </div>
            </>
          )}

          {/* Empty state — no games at all today */}
          {edgeGames.length === 0 && pendingGames.length === 0 && (
            <div className="text-center py-10 bg-white border border-stone-200 rounded-lg text-stone-400 font-mono text-sm">
              No games scheduled today.
            </div>
          )}
        </section>
      )}

      {/* After the games grid section, before standings */}
      <MLBFantasySection picks={fantasyPicks} isStale={fantasyIsStale} isPro={isPro} />

      {/* ── STANDINGS ── */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
            ⊕ Division standings
          </div>
          <div className="flex gap-1">
            {(['AL', 'NL'] as const).map(league => (
              <button
                key={league}
                onClick={() => setActiveLeague(league)}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-widest transition rounded ${activeLeague === league ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800 border border-stone-300'}`}
              >
                {league}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeDivisions.length > 0 ? (
            activeDivisions.map(div => (
              <DivisionTable key={div.division} division={div} />
            ))
          ) : (
            <div className="col-span-3 text-center py-16 bg-white border border-stone-200 rounded-lg">
              <div className="font-mono text-stone-400 text-sm">Standings unavailable — retrying shortly.</div>
            </div>
          )}
        </div>
      </section>

      {/* ── STAT LEADERS ── */}
      <section className="mb-12">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
          ⊕ Statistical leaders
        </div>

        {/* Batting / Pitching toggle */}
        <div className="flex gap-1 mb-3">
          {(['batting', 'pitching'] as const).map(group => (
            <button
              key={group}
              onClick={() => {
                setActiveGroup(group)
                const first = MLB_STAT_CATEGORIES.find(c => c.group === group)
                if (first) setActiveStat(first.slug)
              }}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest transition rounded ${activeGroup === group ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800 border border-stone-200 bg-white'}`}
            >
              {group}
            </button>
          ))}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 flex-wrap mb-4">
          {groupCats.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setActiveStat(cat.slug)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest transition rounded ${activeStat === cat.slug ? 'bg-orange-600 text-white' : 'text-stone-500 hover:text-stone-800 border border-stone-200 bg-white'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <StatLeadersPanel
          leaders={statLeaders[activeStat] ?? []}
          label={currentCat?.label ?? activeStat}
        />
      </section>

      {/* ── NEWS ── */}
      <section>
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
          § Around the league
        </div>

        {news.length === 0 ? (
          <div className="text-center py-12 bg-white border border-stone-200 rounded-lg text-stone-400 font-mono text-sm">
            News unavailable — check back shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {news.map((item, i) => (
              <NewsCard key={item.id} item={item} featured={i === 0} />
            ))}
          </div>
        )}
      </section>

    </div>
  )
}