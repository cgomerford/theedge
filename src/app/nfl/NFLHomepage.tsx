'use client'

import { useState } from 'react'
import type { NFLDivision, NFLStatLeader, NFLNewsItem, NFLTeamCard, NFLKeyDate } from '@/lib/nfl'
import { STAT_CATEGORIES } from '@/lib/nfl'

type Props = {
  standings: NFLDivision[]
  statLeaders: Record<string, { leaders: NFLStatLeader[]; season: number }>
  news: NFLNewsItem[]
  teams: NFLTeamCard[]
  keyDates: NFLKeyDate[]
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

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

// ─── Key Dates Strip ──────────────────────────────────────

function KeyDatesStrip({ dates }: { dates: NFLKeyDate[] }) {
  return (
    <div className="bg-stone-900 border border-stone-200 rounded-lg overflow-hidden mb-10">
      <div className="px-5 py-3 border-b border-stone-700">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-orange-500">
          ⊕ 2026 Season countdown
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y divide-stone-700">
        {dates.map(d => {
          const days = daysUntil(d.date)
          const isPast = days < 0
          const isNext = !isPast && dates.filter(x => daysUntil(x.date) > 0).indexOf(d) === 0
          return (
            <div
              key={d.label}
              className="px-4 py-4 flex flex-col gap-1"
              style={{ background: isNext ? 'rgba(234,88,12,0.08)' : undefined }}
            >
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-500">
                {formatDate(d.date)}
              </div>
              <div className="font-serif text-base font-bold text-stone-100 leading-tight">
                {d.label}
              </div>
              <div className="text-[10px] font-mono text-stone-500">{d.description}</div>
              <div className="mt-1">
                {isPast ? (
                  <span className="text-[9px] font-mono text-stone-600">Complete</span>
                ) : (
                  <span
                    className="text-[10px] font-mono font-bold"
                    style={{ color: isNext ? '#f97316' : '#78716c' }}
                  >
                    {days === 0 ? 'Today' : `${days}d away`}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Team Card ────────────────────────────────────────────

function TeamCard({ team }: { team: NFLTeamCard }) {
  const record = `${team.wins}–${team.losses}${team.ties > 0 ? `–${team.ties}` : ''}`
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3 hover:border-stone-400 hover:shadow-sm transition cursor-pointer flex items-center gap-3">
      {team.logo && (
        <img
          src={team.logo}
          alt={team.abbreviation}
          className="w-8 h-8 object-contain flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-900 truncate leading-tight">
          {team.shortName}
        </div>
        <div className="text-[10px] font-mono text-stone-400">{team.abbreviation}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-mono font-bold text-stone-700">{record}</div>
        <div className="text-[9px] font-mono text-stone-400">2025</div>
      </div>
    </div>
  )
}

// ─── Teams Grid ───────────────────────────────────────────

function TeamsGrid({ teams }: { teams: NFLTeamCard[] }) {
  const [activeConf, setActiveConf] = useState<'AFC' | 'NFC'>('AFC')
  const filtered = teams.filter(t => t.conference === activeConf)

  const divisions = ['East', 'North', 'South', 'West']

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
          ⊕ 2025 Team records
        </div>
        <div className="flex gap-1">
          {(['AFC', 'NFC'] as const).map(c => (
            <button
              key={c}
              onClick={() => setActiveConf(c)}
              className={`px-3 py-1 text-xs font-mono uppercase tracking-widest transition rounded ${activeConf === c ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800 border border-stone-300'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {divisions.map(div => {
          const divTeams = filtered.filter(t => t.division === div)
          if (divTeams.length === 0) return null
          return (
            <div key={div}>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2 px-1">
                {activeConf} {div}
              </div>
              <div className="space-y-2">
                {divTeams.map(team => (
                  <TeamCard key={team.id} team={team} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Stat Leaders Panel ───────────────────────────────────

function StatLeadersPanel({ leaders, label, season }: { leaders: NFLStatLeader[]; label: string; season: number }) {
  const isLastSeason = season < new Date().getFullYear()

  if (!leaders || leaders.length === 0) {
    return (
      <div className="text-center py-12 text-stone-400 font-mono text-sm">
        No data available yet — check back when the season is underway.
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      {isLastSeason && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          <span className="text-[9px] font-mono uppercase tracking-widest text-amber-600">
            ⊕ {season} season leaders — 2026 stats available from September
          </span>
        </div>
      )}
      <div className="divide-y divide-stone-100">
        {leaders.slice(0, 10).map(leader => (
          <div key={`${leader.rank}-${leader.name}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition">
            <span className="text-[11px] font-mono text-stone-400 w-4 flex-shrink-0">{leader.rank}</span>
            {leader.headshot && (
              <img
                src={leader.headshot}
                alt={leader.name}
                className="w-9 h-9 rounded-full object-cover bg-stone-100 flex-shrink-0"
                onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none' }}
              />
            )}
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

function NewsCard({ item, featured }: { item: NFLNewsItem; featured?: boolean }) {
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

export default function NFLHomepage({ standings, statLeaders, news, teams, keyDates }: Props) {
  const [activeStat, setActiveStat] = useState(STAT_CATEGORIES[0]?.slug ?? '')

const currentData = statLeaders[activeStat] ?? { leaders: [], season: 2025 }
  const currentCat = STAT_CATEGORIES.find(c => c.slug === activeStat)
  const isPreSeason = standings.length === 0

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Hero ── */}
      <div className="py-10 md:py-14">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-orange-600 mb-3">
          § The Edge · NFL
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-stone-900 leading-none tracking-tight mb-3">
          The GM Brief<span className="text-orange-500">.</span>
        </h1>
        <p className="text-stone-500 text-base md:text-lg max-w-xl font-serif italic">
          {isPreSeason
            ? 'Off-season hub — full game analysis and predictions from Week 1.'
            : 'Division standings, stat leaders, and what matters — in five minutes.'}
        </p>
      </div>

      {/* ── Key dates ── */}
      <KeyDatesStrip dates={keyDates} />

      {/* ── Teams grid ── */}
      {teams.length > 0 && <TeamsGrid teams={teams} />}

      {/* ── Stat leaders ── */}
      <section className="mb-12">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
          ⊕ Statistical leaders
        </div>
        <div className="flex gap-1 flex-wrap mb-4">
          {STAT_CATEGORIES.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setActiveStat(cat.slug)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest transition rounded ${activeStat === cat.slug ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800 border border-stone-200 bg-white'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
       <StatLeadersPanel
  leaders={currentData.leaders}
  label={currentCat?.label ?? activeStat}
  season={currentData.season}
/>
      </section>

      {/* ── In-season standings (only shown when data exists) ── */}
      {standings.length > 0 && (
        <section className="mb-12">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
            ⊕ Division standings
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {standings.map(div => (
              <div key={div.name} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500">
                    {div.name}
                  </span>
                </div>
                <div className="divide-y divide-stone-100">
                  {div.teams.map(team => (
                    <div key={team.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition">
                      {team.logo && <img src={team.logo} alt={team.abbreviation} className="w-5 h-5 object-contain" />}
                      <div className="flex-1 text-sm font-semibold text-stone-900">{team.name}</div>
                      <div className="font-mono text-sm text-stone-600">{team.wins}–{team.losses}</div>
                      <div className="font-mono text-xs text-stone-400">{team.pct}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── News ── */}
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