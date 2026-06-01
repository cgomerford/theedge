'use client'

import Link from 'next/link'
import type { Team } from '@/lib/teams'
import type { MLBTeamRecord, MLBNextGame, MLBTeamLeader, MLBNewsItem } from '@/lib/mlb-homepage'

type Props = {
  team: Team
  record: MLBTeamRecord | null
  nextGame: MLBNextGame | null
  leaders: MLBTeamLeader[]
  news: MLBNewsItem[]
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatGameDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatGameTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    })
  } catch { return '' }
}

function shortName(name: string): string {
  return name.split(' ').slice(-1)[0]
}

export default function TeamMiniDugout({ team, record, nextGame, leaders, news }: Props) {
  const battingLeaders = leaders.filter(l => l.category === 'batting')
  const pitchingLeaders = leaders.filter(l => l.category === 'pitching')

  const headshotUrl = (personId: number) =>
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Back link ── */}
      <div className="pt-6 mb-8">
        <Link href="/mlb" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back
        </Link>
      </div>

      {/* ── Hero ── */}
      <div
        className="rounded-xl p-8 mb-8 relative overflow-hidden"
        style={{ background: team.primary_color }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: `radial-gradient(circle at 80% 50%, ${team.secondary_color}, transparent 60%)` }}
        />
        <div className="relative">
          <div
            className="text-[10px] font-mono uppercase tracking-[0.25em] mb-2 opacity-70"
            style={{ color: team.text_on_primary }}
          >
            ⊕ The Edge · {team.league} {team.division}
          </div>
          <h1
            className="font-serif text-4xl md:text-5xl font-bold leading-none tracking-tight mb-1"
            style={{ color: team.text_on_primary }}
          >
            {team.name}<span style={{ color: team.secondary_color }}>.</span>
          </h1>
          {record && (
            <div
              className="text-sm font-mono mt-3 opacity-80"
              style={{ color: team.text_on_primary }}
            >
              {record.wins}–{record.losses} · #{record.divisionRank} {record.division} · {record.streak}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

        {/* ── Season record ── */}
        {record && (
          <div className="bg-white border border-stone-200 rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
              ⊕ Season record
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-serif text-3xl font-bold" style={{ color: team.primary_color }}>
                  {record.wins}–{record.losses}
                </div>
                <div className="text-[10px] font-mono uppercase text-stone-400 mt-1">Overall</div>
              </div>
              <div>
                <div className="font-serif text-xl font-bold text-stone-900">{record.pct}</div>
                <div className="text-[10px] font-mono uppercase text-stone-400 mt-1">Win %</div>
              </div>
              <div>
                <div className="text-sm font-mono font-bold text-stone-700">{record.homeRecord}</div>
                <div className="text-[10px] font-mono uppercase text-stone-400">Home</div>
              </div>
              <div>
                <div className="text-sm font-mono font-bold text-stone-700">{record.awayRecord}</div>
                <div className="text-[10px] font-mono uppercase text-stone-400">Away</div>
              </div>
              <div>
                <div className="text-sm font-mono font-bold text-stone-700">{record.runsScored}</div>
                <div className="text-[10px] font-mono uppercase text-stone-400">Runs scored</div>
              </div>
              <div>
                <div className="text-sm font-mono font-bold text-stone-700">{record.runsAllowed}</div>
                <div className="text-[10px] font-mono uppercase text-stone-400">Runs allowed</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Next game ── */}
        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
            ⊕ Next game
          </div>
          {nextGame ? (
            <div>
              <div className="text-[10px] font-mono uppercase text-stone-400 mb-1">
                {formatGameDate(nextGame.gameDate)} · {formatGameTime(nextGame.gameTime)} ET
              </div>
              <div className="font-serif text-2xl font-light text-stone-900 mb-1">
                {nextGame.isHome ? 'vs' : '@'}{' '}
                <span className="font-bold">{shortName(nextGame.opponent)}</span>
              </div>
              <div className="text-xs font-mono text-stone-400 mb-4">{nextGame.venue}</div>
              <Link
                href={`/mlb/${nextGame.slug}`}
                className="text-[10px] font-mono uppercase tracking-widest text-orange-600 hover:underline"
              >
                View full preview →
              </Link>
            </div>
          ) : (
            <div className="text-stone-400 font-mono text-sm">No upcoming games found.</div>
          )}
        </div>

        {/* ── Team leaders snapshot ── */}
        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
            ⊕ Team leaders
          </div>
          <div className="space-y-3">
            {battingLeaders.slice(0, 2).map(l => (
              <div key={l.label} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Player Headshot */}
                  {l.personId > 0 && (
                    <img 
                      src={headshotUrl(l.personId)} 
                      alt={l.name} 
                      className="w-8 h-8 rounded-full object-cover bg-stone-100 border border-stone-200"
                    />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-stone-900 leading-tight">{l.name.split(' ').slice(-1)[0]}</div>
                    <div className="text-[9px] font-mono uppercase text-stone-400">{l.label}</div>
                  </div>
                </div>
                <div className="font-serif text-lg font-bold" style={{ color: team.primary_color }}>
                  {l.value}
                </div>
              </div>
            ))}
            <div className="border-t border-stone-100 pt-3 mt-3 space-y-3">
              {pitchingLeaders.slice(0, 2).map(l => (
                <div key={l.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Player Headshot */}
                    {l.personId > 0 && (
                      <img 
                        src={headshotUrl(l.personId)} 
                        alt={l.name} 
                        className="w-8 h-8 rounded-full object-cover bg-stone-100 border border-stone-200"
                      />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-stone-900 leading-tight">{l.name.split(' ').slice(-1)[0]}</div>
                      <div className="text-[9px] font-mono uppercase text-stone-400">{l.label}</div>
                    </div>
                  </div>
                  <div className="font-serif text-lg font-bold" style={{ color: team.primary_color }}>
                    {l.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Full leaders ── */}
      {leaders.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-stone-100">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
              ⊕ Full leaders
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-stone-100">
            {leaders.map(l => (
              <div key={l.label} className="p-4 flex items-start gap-3">
                {/* Player Headshot */}
                {l.personId > 0 && (
                  <img 
                    src={headshotUrl(l.personId)} 
                    alt={l.name} 
                    className="w-10 h-10 rounded-full object-cover bg-stone-100 border border-stone-200 flex-shrink-0"
                  />
                )}
                <div className="truncate">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-0.5">{l.label}</div>
                  <div className="font-serif text-xl font-bold leading-tight mb-0.5" style={{ color: team.primary_color }}>{l.value}</div>
                  <div className="text-xs text-stone-600 truncate">{l.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── News ── */}
      <section>
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
          § Latest {team.short} news
        </div>
        {news.length === 0 ? (
          <div className="text-center py-12 bg-white border border-stone-200 rounded-lg text-stone-400 font-mono text-sm">
            No recent news found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {news.map((item, i) => {
              const isFeatured = i === 0
              const cardClass = isFeatured
                ? 'block bg-white border border-stone-200 rounded-lg overflow-hidden hover:border-stone-400 hover:shadow-md transition group md:col-span-2'
                : 'block bg-white border border-stone-200 rounded-lg overflow-hidden hover:border-stone-400 hover:shadow-sm transition group'
              const headingClass = isFeatured
                ? 'font-serif text-stone-900 leading-snug group-hover:text-orange-700 transition text-xl mb-2'
                : 'font-serif text-stone-900 leading-snug group-hover:text-orange-700 transition text-base mb-1'
              return (
                <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer" className={cardClass}>
                  {isFeatured && item.image && (
                    <img src={item.image} alt="" className="w-full h-48 object-cover" />
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
            })}
          </div>
        )}
      </section>
    </div>
  )
}