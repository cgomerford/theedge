'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MLBStatLeader, MLBNewsItem } from '@/lib/mlb-homepage'
import type { Team } from '@/lib/teams'

type StatLeaders = {
  homeRuns: MLBStatLeader[]
  battingAverage: MLBStatLeader[]
  earnedRunAverage: MLBStatLeader[]
  strikeOuts: MLBStatLeader[]
}

type Props = {
  news: MLBNewsItem[]
  statLeaders: StatLeaders
  teams: Team[]
}

const STAT_TABS = [
  { key: 'homeRuns'         as const, label: 'HR',  description: 'Home Runs' },
  { key: 'battingAverage'   as const, label: 'AVG', description: 'Batting Average' },
  { key: 'earnedRunAverage' as const, label: 'ERA', description: 'Earned Run Avg' },
  { key: 'strikeOuts'       as const, label: 'SO',  description: 'Strikeouts' },
]

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function newsSource(link: string): string {
  try {
    const host = new URL(link).hostname.replace('www.', '')
    if (host.includes('espn')) return 'ESPN'
    if (host.includes('mlb.com')) return 'MLB.com'
    if (host.includes('cbssports')) return 'CBS Sports'
    if (host.includes('google')) return 'Google News'
    if (host.includes('athletic')) return 'The Athletic'
    if (host.includes('nbcsports')) return 'NBC Sports'
    return host.split('.')[0].toUpperCase()
  } catch {
    return 'News'
  }
}

// ─── Featured leader (top card) ──────────────────────────

function LeaderFeatured({ leader, label }: { leader: MLBStatLeader; label: string }) {
  return (
    <div className="bg-stone-900 border border-stone-700 rounded-lg p-5 flex items-center gap-5">
      <div className="relative flex-shrink-0">
        <img
          src={leader.headshot}
          alt={leader.name}
          className="w-16 h-16 rounded-full object-cover bg-stone-800 ring-2 ring-orange-500"
          onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none' }}
        />
        <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
          1
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-mono uppercase tracking-widest text-stone-500 mb-0.5">
          League leader · {label}
        </div>
        <div className="text-base font-semibold text-stone-100 truncate">{leader.name}</div>
        <div className="text-[10px] font-mono uppercase text-stone-500">{leader.teamAbbr}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-4xl font-serif font-bold text-yellow-300 leading-none">{leader.statValue}</div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-stone-600 mt-1">{label}</div>
      </div>
    </div>
  )
}

// ─── Ranked list (positions 2–5) ─────────────────────────

function LeaderRow({ leader, label }: { leader: MLBStatLeader; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-800 last:border-0 hover:bg-stone-900 transition">
      <span className="text-stone-700 font-mono text-sm w-4 flex-shrink-0 text-center">
        {leader.rank}
      </span>
      <img
        src={leader.headshot}
        alt={leader.name}
        className="w-8 h-8 rounded-full object-cover bg-stone-800 flex-shrink-0"
        onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-200 truncate">{leader.name}</div>
        <div className="text-[10px] font-mono uppercase text-stone-600">{leader.teamAbbr}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-lg font-serif font-bold text-yellow-300">{leader.statValue}</div>
      </div>
    </div>
  )
}

// ─── News card ────────────────────────────────────────────
function NewsCard({ item, size }: { item: MLBNewsItem; size: 'large' | 'medium' | 'small' }) {
  const source = newsSource(item.link)
  const baseClass = 'block group relative overflow-hidden rounded-lg border border-stone-700 hover:border-stone-500 transition'
  const mediumClass = 'block group bg-stone-900 border border-stone-700 rounded-lg overflow-hidden hover:border-stone-500 transition'
  const smallClass = 'flex items-start gap-3 py-3 border-b border-stone-800 last:border-0 group hover:bg-stone-900/50 transition px-1 rounded'

  if (size === 'large') {
    return (
      <a href={item.link} target="_blank" rel="noopener noreferrer" className={baseClass}>
        {item.image
          ? <img src={item.image} alt="" className="w-full h-56 object-cover opacity-60 group-hover:opacity-80 transition" />
          : <div className="w-full h-56 bg-stone-800" />
        }
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-mono uppercase tracking-widest text-orange-400 bg-stone-900 px-2 py-0.5 rounded">{source}</span>
            <span className="text-[9px] font-mono text-stone-600">{timeAgo(item.published)}</span>
          </div>
          <h3 className="font-serif text-xl text-stone-100 leading-snug group-hover:text-yellow-300 transition line-clamp-3">{item.headline}</h3>
        </div>
      </a>
    )
  }

  if (size === 'medium') {
    return (
      <a href={item.link} target="_blank" rel="noopener noreferrer" className={mediumClass}>
        {item.image && <img src={item.image} alt="" className="w-full h-32 object-cover opacity-70 group-hover:opacity-90 transition" />}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-mono uppercase tracking-widest text-orange-400">{source}</span>
            <span className="text-[9px] font-mono text-stone-600">{timeAgo(item.published)}</span>
          </div>
          <h3 className="font-serif text-base text-stone-100 leading-snug group-hover:text-yellow-300 transition line-clamp-3">{item.headline}</h3>
        </div>
      </a>
    )
  }

  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className={smallClass}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-orange-400">{source}</span>
          <span className="text-[9px] font-mono text-stone-700">{timeAgo(item.published)}</span>
        </div>
        <h3 className="text-sm text-stone-300 leading-snug group-hover:text-yellow-300 transition line-clamp-2">{item.headline}</h3>
      </div>
      {item.image && <img src={item.image} alt="" className="w-14 h-14 object-cover rounded flex-shrink-0 opacity-70" />}
    </a>
  )
}
// ─── Main component ───────────────────────────────────────

export default function HomeLeagueSection({ news, statLeaders, teams }: Props) {
  const [activeStat, setActiveStat] = useState<keyof StatLeaders>('homeRuns')
  const [activeTeam, setActiveTeam] = useState<string | null>(null)
  const [activeLeague, setActiveLeague] = useState<'ALL' | 'AL' | 'NL'>('ALL')

  const activeTab = STAT_TABS.find(t => t.key === activeStat)!
  const leaders = statLeaders[activeStat] ?? []
  const topLeader = leaders[0]
  const restLeaders = leaders.slice(1, 6)

  // Filter news by team
  const filteredNews = activeTeam
    ? news.filter(n => {
        const team = teams.find(t => t.slug === activeTeam)
        if (!team) return true
        const haystack = (n.headline + ' ' + n.description).toLowerCase()
        return haystack.includes(team.short.toLowerCase()) ||
               haystack.includes(team.name.toLowerCase())
      })
    : news

  const displayTeams = activeLeague === 'ALL' ? teams : teams.filter(t => t.league === activeLeague)
  const hasFilteredNews = filteredNews.length > 0

  // News layout
  const featured = filteredNews[0]
  const medium = filteredNews.slice(1, 3)
  const small = filteredNews.slice(3, 12)

  return (
    <section className="border-t border-stone-800 px-4 md:px-6 py-16">
      <div className="max-w-5xl mx-auto">

        {/* ── STAT LEADERS ─────────────────────────────── */}
        <div className="mb-20">
          <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-orange-500 mb-2">
                § League leaders
              </div>
              <h2 className="text-3xl md:text-4xl font-serif font-light text-stone-100 leading-none">
                Who&apos;s running the show<span className="text-orange-500">.</span>
              </h2>
            </div>
            <Link
              href="/mlb"
              className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-400 transition"
            >
              Full leaderboard →
            </Link>
          </div>

          {/* Stat tabs */}
          <div className="flex gap-1 mb-6 flex-wrap">
            {STAT_TABS.map(tab => {
              const isActive = activeStat === tab.key
              const cls = isActive
                ? 'px-4 py-2 text-xs font-mono uppercase tracking-widest bg-orange-500 text-white rounded-md'
                : 'px-4 py-2 text-xs font-mono uppercase tracking-widest text-stone-500 border border-stone-800 rounded-md hover:border-stone-600 hover:text-stone-300 transition'
              return (
                <button key={tab.key} onClick={() => setActiveStat(tab.key)} className={cls}>
                  {tab.label}
                  <span className="ml-2 text-[9px] opacity-60 hidden sm:inline">{tab.description}</span>
                </button>
              )
            })}
          </div>

          {leaders.length === 0 ? (
            <div className="text-center py-12 text-stone-600 font-mono text-sm border border-stone-800 rounded-lg">
              No data yet — check back when the season is underway.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: featured leader */}
              <div className="space-y-3">
                {topLeader && <LeaderFeatured leader={topLeader} label={activeTab.label} />}
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-700 px-1">
                  Also in the running
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-lg overflow-hidden">
                  {restLeaders.map(l => (
                    <LeaderRow key={l.rank} leader={l} label={activeTab.label} />
                  ))}
                </div>
              </div>

              {/* Right: context panel */}
              <div className="bg-stone-900 border border-stone-800 rounded-lg p-5">
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-600 mb-4">
                  ⊕ {activeTab.description} · 2026 season
                </div>
                {topLeader && (
                  <div className="mb-6">
                    <div className="text-[10px] font-mono uppercase text-stone-500 mb-1">Pace</div>
                    <div className="text-stone-300 text-sm font-serif leading-relaxed">
                      <span className="text-yellow-300 font-bold">{topLeader.name.split(' ').slice(-1)[0]}</span>
                      {' '}leads all of MLB with{' '}
                      <span className="text-yellow-300 font-bold">{topLeader.statValue}</span>
                      {' '}{activeTab.description.toLowerCase()}.
                      {topLeader.teamAbbr && (
                        <span className="text-stone-500"> ({topLeader.teamAbbr})</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Bar chart — relative to leader */}
                <div className="space-y-2.5">
                  {leaders.slice(0, 5).map((l, i) => {
                    const topVal = parseFloat(leaders[0]?.statValue ?? '1') || 1
                    const val = parseFloat(l.statValue) || 0
                    const pct = Math.round((val / topVal) * 100)
                    const barColor = i === 0 ? '#f97316' : '#44403c'
                    return (
                      <div key={l.rank}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono text-stone-400 truncate max-w-[140px]">
                            {l.name.split(' ').slice(-1)[0]}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-stone-300">{l.statValue}</span>
                        </div>
                        <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: barColor }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── AROUND THE LEAGUE ────────────────────────── */}
        <div>
          <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-orange-500 mb-2">
                § Around the league
              </div>
              <h2 className="text-3xl md:text-4xl font-serif font-light text-stone-100 leading-none">
                Latest news<span className="text-orange-500">.</span>
              </h2>
            </div>
            {activeTeam && (
              <button
                onClick={() => setActiveTeam(null)}
                className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-stone-300 transition border border-stone-700 px-3 py-1.5 rounded"
              >
                ✕ Clear filter
              </button>
            )}
          </div>

          {/* League + team filters */}
          <div className="flex gap-1 mb-3">
            {(['ALL', 'AL', 'NL'] as const).map(l => {
              const cls = activeLeague === l
                ? 'px-3 py-1 text-xs font-mono uppercase tracking-widest bg-stone-700 text-stone-100 rounded'
                : 'px-3 py-1 text-xs font-mono uppercase tracking-widest text-stone-500 border border-stone-800 rounded hover:border-stone-600 transition'
              return (
                <button key={l} onClick={() => setActiveLeague(l)} className={cls}>{l}</button>
              )
            })}
          </div>

          <div className="flex gap-1 flex-wrap mb-6">
            {displayTeams.map(team => {
              const isActive = activeTeam === team.slug
              return (
                <div key={team.slug} className="flex items-center rounded overflow-hidden border border-stone-800">
                  <button
                    onClick={() => setActiveTeam(isActive ? null : team.slug)}
                    className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition"
                    style={isActive
                      ? { background: team.primary_color, color: team.text_on_primary }
                      : { color: '#78716c' }
                    }
                  >
                    {team.abbrev}
                  </button>
                  <Link
                    href={`/mlb/teams/${team.slug}`}
                    className="px-1.5 py-1 text-[10px] text-stone-700 hover:text-orange-400 border-l border-stone-800 transition"
                    title={`${team.short} team page`}
                  >
                    →
                  </Link>
                </div>
              )
            })}
          </div>

          {/* News grid */}
          {!hasFilteredNews ? (
            <div className="text-center py-12 text-stone-600 font-mono text-sm border border-stone-800 rounded-lg">
              No recent articles for this team — try another or clear the filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Featured large card */}
              {featured && (
                <div className="md:col-span-2">
                  <NewsCard item={featured} size="large" />
                </div>
              )}

              {/* Medium cards */}
              <div className="flex flex-col gap-4">
                {medium.map(item => (
                  <NewsCard key={item.id} item={item} size="medium" />
                ))}
              </div>

              {/* Small list cards — full width below */}
              {small.length > 0 && (
                <div className="md:col-span-3 bg-stone-900 border border-stone-800 rounded-lg px-4 py-2">
                  {small.map(item => (
                    <NewsCard key={item.id} item={item} size="small" />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </section>
  )
}