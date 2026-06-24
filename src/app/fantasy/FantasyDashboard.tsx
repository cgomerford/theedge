'use client'

/**
 * src/app/fantasy/FantasyDashboard.tsx
 *
 * The full Pro Fantasy Desk — two-column layout.
 * Updated layout:
 *   - Market Movement stretches full-width
 *   - Below it: Regression Watch split (Pitchers left | Batters right)
 */
import { useState } from 'react'
import Link from 'next/link'
import type { FantasyPicksByType, FantasyPick } from '@/lib/fantasy'
import type { NewsItem } from '@/lib/fantasy-news'
import type { TeamTransaction } from '@/lib/team-transactions'
import type { BoardGame } from '@/lib/trading-floor-board'
import type { RegressionWatchData } from '@/lib/regression-watch'

import TradingFloorBoard from '@/components/TradingFloorBoard'
import RegressionWatchPanel from '@/components/RegressionWatchPanel'
import MarketMovementSection from '@/components/fantasy/MarketMovementSection'
import MinorLeagueWatchSection from '@/components/fantasy/MinorLeagueWatchSection'

// ── Types ─────────────────────────────────────────────────────────────────────
type Props = {
  picks: FantasyPicksByType
  isStale: boolean
  news: NewsItem[]
  ilList: TeamTransaction[]
  transactions: TeamTransaction[]
  board: BoardGame[]
  regression: RegressionWatchData | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function formatAge(dateStr: string): string {
  const age = daysAgo(dateStr)
  if (age === 0) return 'Today'
  if (age === 1) return 'Yesterday'
  return `${age}d ago`
}

function ilBadgeStyle(days: number | null): { bg: string; color: string } {
  if (!days || days <= 10) return { bg: 'rgba(220,38,38,0.10)', color: '#DC2626' }
  if (days <= 15) return { bg: 'rgba(217,119,6,0.10)', color: '#D97706' }
  return { bg: 'rgba(37,99,235,0.10)', color: '#2563EB' }
}

function txBadge(category: string): { label: string; bg: string; color: string } {
  switch (category) {
    case 'CALLUP': return { label: '↑ Up', bg: 'rgba(21,128,61,0.12)', color: '#15803D' }
    case 'ACTIVATION': return { label: 'Act', bg: 'rgba(21,128,61,0.12)', color: '#15803D' }
    case 'OPTION': return { label: '↓ Opt', bg: 'rgba(217,119,6,0.12)', color: '#D97706' }
    case 'DFA': return { label: 'DFA', bg: 'rgba(220,38,38,0.12)', color: '#DC2626' }
    case 'RELEASE': return { label: 'Rel', bg: 'rgba(220,38,38,0.12)', color: '#DC2626' }
    case 'TRADE': return { label: '⇄ Trade', bg: 'rgba(124,58,237,0.10)', color: '#7C3AED' }
    case 'SUSPENSION': return { label: 'Susp', bg: 'rgba(220,38,38,0.12)', color: '#DC2626' }
    default: return { label: category, bg: 'rgba(120,113,108,0.10)', color: '#78716C' }
  }
}

function newsCategoryStyle(category: NewsItem['category']): { dot: string; bg: string; color: string } {
  switch (category) {
    case 'injury': return { dot: '#DC2626', bg: 'rgba(220,38,38,0.10)', color: '#DC2626' }
    case 'lineup': return { dot: '#D97706', bg: 'rgba(217,119,6,0.10)', color: '#D97706' }
    case 'transaction': return { dot: '#2563EB', bg: 'rgba(37,99,235,0.10)', color: '#2563EB' }
    default: return { dot: '#78716C', bg: 'rgba(120,113,108,0.10)', color: '#78716C' }
  }
}

// ── Section Label ─────────────────────────────────────────────────────────────
function SectionLabel({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold whitespace-nowrap">
        § {children}
      </h2>
      <div className="flex-1 h-px bg-stone-200" />
      {live && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-green-600">Live</span>
        </div>
      )}
    </div>
  )
}

// ── News widget ───────────────────────────────────────────────────────────────
type NewsFilter = 'all' | 'injury' | 'lineup' | 'transaction'

function NewsWire({
  news,
  ilList,
  transactions,
}: {
  news: NewsItem[]
  ilList: TeamTransaction[]
  transactions: TeamTransaction[]
}) {
  const [newsFilter, setNewsFilter] = useState<NewsFilter>('all')
  const [activeSection, setActiveSection] = useState<'news' | 'injuries' | 'transactions'>('news')

  const filteredNews = newsFilter === 'all'
    ? news
    : news.filter(n => n.category === newsFilter)

  const FILTERS: { key: NewsFilter; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: 'text-stone-900' },
    { key: 'injury', label: 'Injuries', color: 'text-red-600' },
    { key: 'lineup', label: 'Lineups', color: 'text-amber-600' },
    { key: 'transaction', label: 'Transactions', color: 'text-blue-600' },
  ]

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col h-full min-h-[340px]">
      {/* Section switcher */}
      <div className="flex border-b border-stone-200 shrink-0">
        {[
          { key: 'news' as const, label: 'News', count: news.length },
          { key: 'injuries' as const, label: 'IL', count: ilList.length },
          { key: 'transactions' as const, label: 'Wire', count: transactions.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`flex-1 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              activeSection === tab.key
                ? 'border-b-2 border-orange-500 text-orange-600 -mb-px font-bold'
                : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            {tab.label} · {tab.count}
          </button>
        ))}
      </div>

      {/* News */}
      {activeSection === 'news' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex gap-1 px-3 py-2 border-b border-stone-100 shrink-0 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setNewsFilter(f.key)}
                className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                  newsFilter === f.key
                    ? 'bg-stone-900 text-white'
                    : `bg-stone-100 ${f.color} hover:bg-stone-200`
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {filteredNews.length === 0 ? (
              <div className="px-4 py-6 text-center font-serif italic text-stone-400 text-xs">
                No {newsFilter} stories right now
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {filteredNews.slice(0, 5).map((item, i) => {
                  const style = newsCategoryStyle(item.category)
                  return (
                    <a
                      key={i}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 px-3 py-2 hover:bg-stone-50 transition-colors"
                    >
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: style.dot }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-[11px] font-semibold text-stone-900 leading-snug line-clamp-2">
                          {item.title}
                        </div>
                        <div className="font-mono text-[9px] text-stone-400 mt-0.5">
                          {item.source} · {item.publishedDisplay}
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            )}
          </div>
          <Link
            href="/fantasy/news"
            className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 text-center py-2 border-t border-stone-100 bg-stone-50 shrink-0"
          >
            Full wire →
          </Link>
        </div>
      )}

      {/* IL */}
      {activeSection === 'injuries' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden">
            {ilList.length === 0 ? (
              <div className="px-4 py-6 text-center font-serif italic text-stone-400 text-xs">
                No active IL placements
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {ilList.slice(0, 5).map((t, i) => {
                  const badge = ilBadgeStyle(t.il_days)
                  return (
                    <div key={i} className="px-3 py-2 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-serif text-[11px] font-semibold text-stone-900 truncate">
                            {t.player_name}
                          </span>
                          <span
                            className="font-mono text-[9px] font-bold px-1 py-0.5 rounded"
                            style={{ background: badge.bg, color: badge.color }}
                          >
                            {t.il_days ? `${t.il_days}d` : 'IL'}
                          </span>
                          {t.team_id != null && (
                            <img
                              src={`https://www.mlbstatic.com/team-logos/${t.team_id}.svg`}
                              alt={t.team_name ?? ''}
                              className="w-4 h-4 object-contain"
                            />
                          )}
                        </div>
                        {t.injury_reason && (
                          <div className="font-serif italic text-[10px] text-stone-400 truncate">
                            {t.injury_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <Link
            href="/fantasy/injuries"
            className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 text-center py-2 border-t border-stone-100 bg-stone-50 shrink-0"
          >
            Full IL list →
          </Link>
        </div>
      )}

      {/* Wire */}
      {activeSection === 'transactions' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden">
            {transactions.length === 0 ? (
              <div className="px-4 py-6 text-center font-serif italic text-stone-400 text-xs">
                No recent transactions
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {transactions.slice(0, 5).map((t, i) => {
                  const badge = txBadge(t.category)
                  return (
                    <div key={i} className="px-3 py-2 flex items-start gap-2">
                      <span
                        className="font-mono text-[9px] font-bold px-1 py-0.5 rounded shrink-0 mt-0.5"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-serif text-[11px] font-semibold text-stone-900 truncate">
                            {t.player_name}
                          </span>
                          {t.team_id != null && (
                            <img
                              src={`https://www.mlbstatic.com/team-logos/${t.team_id}.svg`}
                              alt={t.team_name ?? ''}
                              className="w-4 h-4 object-contain"
                            />
                          )}
                        </div>
                        <div className="font-mono text-[9px] text-stone-400">
                          {formatAge(t.transaction_date)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <Link
            href="/fantasy/transactions"
            className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 text-center py-2 border-t border-stone-100 bg-stone-50 shrink-0"
          >
            Full wire →
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Pick cards & tables ───────────────────────────────────────────────────────
function StreamerCard({ pick }: { pick: FantasyPick }) {
  const [expanded, setExpanded] = useState(false)
  const signal = pick.signal_score ?? 0
  const isTop = signal >= 70

  if (isTop) {
    return (
      <div className="rounded-xl overflow-hidden mb-3" style={{ background: '#1A1A1A', border: '0.5px solid rgba(255,87,34,0.3)' }}>
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-widest text-orange-500 mb-1.5">
                ⊕ Top stream tonight
              </div>
              <div className="font-serif font-semibold text-white text-lg leading-tight mb-1">
                {pick.headline}
              </div>
              <div className="font-serif italic text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {pick.one_liner}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="font-mono text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider"
                style={{ background: '#EAF3DE', color: '#27500A' }}>
                Stream
              </span>
              {pick.game_time && (
                <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {pick.game_time}
                </span>
              )}
            </div>
          </div>

          {pick.details && (
            <div className="mt-3 pt-3 flex gap-4 flex-wrap" style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
              {Object.entries(pick.details)
                .filter(([k]) => !['swing', 'direction'].includes(k))
                .slice(0, 4)
                .map(([key, val]) => (
                  <div key={key} className="text-center">
                    <div className="font-mono text-sm font-bold text-white">{String(val)}</div>
                    <div className="font-mono text-[9px] uppercase tracking-wider mt-0.5"
                      style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {key.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))}
              {pick.game_slug && (
                <Link
                  href={`/mlb/${pick.game_slug}`}
                  className="ml-auto font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-400 self-end"
                >
                  Preview →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-2">
      <button className="w-full text-left px-4 py-3" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-serif text-sm font-semibold text-stone-900 leading-snug mb-1">
              {pick.headline}
            </div>
            <div className="font-serif italic text-xs text-stone-500 leading-snug">
              {pick.one_liner}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: '#EAF3DE', color: '#27500A' }}>
              Stream
            </span>
            {pick.game_slug && (
              <Link
                href={`/mlb/${pick.game_slug}`}
                onClick={e => e.stopPropagation()}
                className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600"
              >
                →
              </Link>
            )}
            <span className="font-mono text-[9px] text-stone-300">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>
      {expanded && pick.details && (
        <div className="border-t border-stone-100 px-4 py-3 bg-stone-50">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(pick.details)
              .filter(([k]) => !['swing', 'direction'].includes(k))
              .map(([key, val]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-stone-400">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[10px] font-bold text-stone-700">{String(val)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FallerCard({ pick }: { pick: FantasyPick }) {
  const isSit = (pick.signal_score ?? 50) < 35
  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-2">
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ background: isSit ? 'rgba(220,38,38,0.07)' : 'rgba(217,119,6,0.07)' }}
      >
        <span
          className="font-mono text-[9px] uppercase tracking-wider font-bold"
          style={{ color: isSit ? '#DC2626' : '#D97706' }}
        >
          {isSit ? '▼ Sit' : '▼ Monitor'}
        </span>
        {pick.game_time && (
          <span className="font-mono text-[9px] text-stone-400">{pick.game_time}</span>
        )}
      </div>
      <div className="px-4 py-3">
        <div className="font-serif text-sm font-semibold text-stone-900 mb-1">{pick.headline}</div>
        <div className="font-serif italic text-xs text-stone-500 leading-relaxed">{pick.one_liner}</div>
        {pick.details && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {Object.entries(pick.details)
              .filter(([k]) => !['swing', 'direction'].includes(k))
              .slice(0, 3)
              .map(([k, v]) => (
                <span
                  key={k}
                  className="font-mono text-[9px] px-2 py-0.5 rounded"
                  style={{
                    background: isSit ? 'rgba(220,38,38,0.08)' : 'rgba(217,119,6,0.08)',
                    color: isSit ? '#DC2626' : '#D97706',
                  }}
                >
                  {k.replace(/_/g, ' ')}: {String(v)}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SleeperCard({ pick }: { pick: FantasyPick }) {
  const gap = pick.details?.era_fip_gap ?? pick.details?.l3_gap ?? null
  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-2">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-serif text-sm font-semibold text-stone-900 mb-1">{pick.headline}</div>
          <div className="font-serif italic text-xs text-stone-500 leading-relaxed mb-2">{pick.one_liner}</div>
          {pick.details && (
            <div className="flex gap-2 flex-wrap">
              {Object.entries(pick.details)
                .filter(([k]) => !['swing', 'direction'].includes(k))
                .slice(0, 3)
                .map(([k, v]) => (
                  <span key={k} className="font-mono text-[9px] px-2 py-0.5 rounded bg-blue-50 text-blue-800">
                    {k.replace(/_/g, ' ')}: {String(v)}
                  </span>
                ))}
            </div>
          )}
        </div>
        {gap != null && (
          <div className="text-center shrink-0">
            <div className="font-mono text-xl font-bold text-blue-600">
              {Number(gap) > 0 ? '+' : ''}{Number(gap).toFixed(2)}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mt-0.5">
              ERA−FIP
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TwoStartTable({ picks }: { picks: FantasyPick[] }) {
  if (picks.length === 0) return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-6 text-center font-serif italic text-stone-400 text-sm">
      Two-start picks not yet computed for this week.
    </div>
  )

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="grid px-4 py-2 bg-stone-50 border-b border-stone-100"
        style={{ gridTemplateColumns: '1fr 90px 90px 50px' }}>
        <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Pitcher</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">Start 1</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">Start 2</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">Grade</div>
      </div>
      {picks.map((pick, i) => {
        const s1 = pick.details?.start1_matchup ?? '–'
        const s2 = pick.details?.start2_matchup ?? '–'
        const s1q = pick.details?.start1_quality ?? 'avg'
        const s2q = pick.details?.start2_quality ?? 'avg'
        const grade = pick.signal_score != null
          ? pick.signal_score >= 80 ? 'A+' : pick.signal_score >= 65 ? 'A' : pick.signal_score >= 50 ? 'B+' : 'B'
          : '–'
        const gradeStyle = grade.startsWith('A')
          ? { bg: '#EAF3DE', color: '#27500A' }
          : { bg: '#E6F1FB', color: '#0C447C' }

        const qualityBadge = (q: string) => {
          const qLower = String(q).toLowerCase()
          if (qLower === 'elite' || qLower === 'strong')
            return <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#EAF3DE', color: '#27500A' }}>{q}</span>
          if (qLower === 'avg' || qLower === 'average')
            return <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#FAEEDA', color: '#633806' }}>{q}</span>
          return <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">{q}</span>
        }

        return (
          <div key={i} className="grid px-4 py-3 border-b border-stone-50 last:border-0 items-center"
            style={{ gridTemplateColumns: '1fr 90px 90px 50px' }}>
            <div>
              <div className="font-serif text-sm font-semibold text-stone-900">{pick.headline}</div>
              {pick.one_liner && (
                <div className="font-mono text-[9px] text-stone-400 mt-0.5">{pick.one_liner}</div>
              )}
            </div>
            <div className="text-center">
              <div className="font-mono text-[9px] text-stone-400 mb-1">{String(s1)}</div>
              {qualityBadge(String(s1q))}
            </div>
            <div className="text-center">
              <div className="font-mono text-[9px] text-stone-400 mb-1">{String(s2)}</div>
              {qualityBadge(String(s2q))}
            </div>
            <div className="text-center">
              <span className="font-mono text-[10px] font-bold px-2 py-1 rounded"
                style={{ background: gradeStyle.bg, color: gradeStyle.color }}>
                {grade}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PlatformTable({ picks }: { picks: FantasyPick[] }) {
  const allStreamers = picks.filter(p => p.pick_type === 'streamer' || (p.signal_score ?? 0) >= 50)
  const streamers = allStreamers.slice(0, 3)
  const hasMore = allStreamers.length > streamers.length

  if (streamers.length === 0) return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-6 text-center font-serif italic text-stone-400 text-sm">
      Platform scores compute once streamers are confirmed.
    </div>
  )

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="grid px-4 py-2 bg-stone-50 border-b border-stone-100"
        style={{ gridTemplateColumns: '1fr 50px 50px 50px 50px' }}>
        <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Pitcher</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-center" style={{ color: '#7C3AED' }}>DK</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-center" style={{ color: '#DC2626' }}>Yahoo</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-center" style={{ color: '#2563EB' }}>ESPN</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-center" style={{ color: '#15803D' }}>Sleeper</div>
      </div>
      {streamers.map((pick, i) => {
        const d = pick.details ?? {}
        const ip = Number(d.proj_ip ?? d.ip ?? 6)
        const k = Number(d.proj_k ?? d.k ?? 7)
        const er = Number(d.proj_er ?? d.er ?? 2)
        const bb = Number(d.proj_bb ?? d.bb ?? 2)
        const win = 0.55

        const dk = parseFloat(((ip * 2.25) + (k * 2) + (er * -2) + (bb * -0.5) + (win * 4)).toFixed(1))
        const yahoo = parseFloat(((ip * 2.25) + (k * 1) + (er * -1.5) + (bb * -0.75)).toFixed(1))
        const espn = parseFloat(((ip * 3) + (k * 1) + (er * -2) + (win * 5)).toFixed(1))
        const sleeper = parseFloat(((ip * 2.25) + (k * 1.5) + (er * -2) + (bb * -0.5)).toFixed(1))

        return (
          <div key={i} className="grid px-4 py-3 border-b border-stone-50 last:border-0 items-center"
            style={{ gridTemplateColumns: '1fr 50px 50px 50px 50px' }}>
            <div>
              <div className="font-serif text-sm font-semibold text-stone-900">{pick.headline}</div>
              <div className="font-mono text-[9px] text-stone-400 mt-0.5">
                {ip.toFixed(1)} IP · {k}K · {er}ER
              </div>
            </div>
            <div className="text-center font-mono text-sm font-bold" style={{ color: '#7C3AED' }}>{dk}</div>
            <div className="text-center font-mono text-sm text-stone-700">{yahoo}</div>
            <div className="text-center font-mono text-sm text-stone-700">{espn}</div>
            <div className="text-center font-mono text-sm text-stone-700">{sleeper}</div>
          </div>
        )
      })}
      <div className="px-4 py-2 border-t border-stone-100 bg-stone-50 flex items-center justify-between flex-wrap gap-2">
        <p className="font-mono text-[9px] text-stone-400">
          DK: 2.25/IP+2K−2ER. Yahoo: 2.25/IP+1K−1.5ER. ESPN: 3/IP+1K−2ER+5W. Sleeper: 2.25/IP+1.5K−2ER.
        </p>
        {hasMore && (
          <a href="/fantasy/platform-scoring" className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 shrink-0">
            See full scoring →
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function FantasyDashboard({
  picks,
  isStale,
  news,
  ilList,
  transactions,
  board,
  regression,
}: Props) {
  const allPicks: FantasyPick[] = [
    ...picks.streamer.map(p => ({ ...p, pick_type: 'streamer' as const })),
    ...picks.mover.map(p => ({ ...p, pick_type: 'mover' as const })),
    ...picks.faller.map(p => ({ ...p, pick_type: 'faller' as const })),
    ...picks.sleeper.map(p => ({ ...p, pick_type: 'sleeper' as const })),
  ]

  const twoStartPicks = allPicks.filter(p =>
    p.details?.start1_matchup || p.details?.start2_matchup
  )

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 pb-16">
      {/* Hero */}
      <div className="py-5 border-b border-stone-900 mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-widest text-orange-500 font-bold mb-1">
              ⊕ The Edge · Fantasy Desk · Pro
            </div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-stone-900 leading-none tracking-tight">
              The Trading Floor<span className="text-orange-500">.</span>
            </h1>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: 'Slate', count: board.length, color: '#FF5722' },
              { label: 'News', count: news.length, color: '#1A1A1A' },
              { label: 'On IL', count: ilList.length, color: '#DC2626' },
              { label: 'Moves', count: transactions.length, color: '#2563EB' },
              { label: 'Streams', count: picks.streamer.length, color: '#15803D' },
              { label: 'Trending', count: picks.cooler.length + picks.riser.length + picks.prospect.length, color: '#7C3AED' },
            ].map(s => (
              <div key={s.label} className="text-center px-2.5 py-1.5 bg-white rounded-md border border-stone-200 min-w-[54px]">
                <div className="font-mono text-sm font-bold leading-none" style={{ color: s.color }}>
                  {s.count}
                </div>
                <div className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
        {isStale && (
          <div className="mt-3 font-mono text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md">
            ⚠ Showing yesterday's picks — tonight's compute runs at 11:30 PM UK
          </div>
        )}
      </div>

      {/* Above-the-fold: Board + News */}
      <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-5 mb-6">
        <section>
          <SectionLabel live>The Board · tonight</SectionLabel>
          <TradingFloorBoard games={board.slice(0, 6)} />
          {board.length > 6 && (
            <div className="mt-2 text-right">
              <Link href="/fantasy/board" className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600">
                All {board.length} games →
              </Link>
            </div>
          )}
        </section>
        <NewsWire news={news} ilList={ilList} transactions={transactions} />
      </div>

      {/* ── BELOW THE FOLD ───────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Market Movement — stretches full width */}
        {(picks.cooler.length > 0 || picks.riser.length > 0) && (
          <section>
            <SectionLabel>Market Movement</SectionLabel>
            <MarketMovementSection coolers={picks.cooler} risers={picks.riser} />
          </section>
        )}

        {/* Regression Watch — split layout (Pitchers left | Batters right) */}
        <section>
          <SectionLabel>Regression Watch</SectionLabel>
          <RegressionWatchPanel data={regression} layout="split" />
        </section>

        {/* Minor League Watch */}
        {picks.prospect.length > 0 && (
          <section>
            <SectionLabel>Minor League Watch</SectionLabel>
            <MinorLeagueWatchSection prospects={picks.prospect} />
          </section>
        )}

        {/* Streamers */}
        <section>
          <SectionLabel live>Streamers</SectionLabel>
          {picks.streamer.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-xl px-4 py-6 text-center font-serif italic text-stone-400 text-sm">
              Streamers populate once probable pitchers confirm — usually 3–4 hours pre-game.
            </div>
          ) : (
            picks.streamer.map((pick, i) => <StreamerCard key={i} pick={pick} />)
          )}
          <Link
            href="/fantasy/streamers"
            className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 mt-2 inline-block"
          >
            Full 7-day streamer board →
          </Link>
        </section>

        {/* Sell/Sit + Sleepers */}
        {(picks.faller.length > 0 || picks.sleeper.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {picks.faller.length > 0 && (
              <section>
                <SectionLabel>Sell / Sit tonight</SectionLabel>
                {picks.faller.map((pick, i) => <FallerCard key={i} pick={pick} />)}
              </section>
            )}
            {picks.sleeper.length > 0 && (
              <section>
                <SectionLabel>Sleepers — buy the data</SectionLabel>
                {picks.sleeper.map((pick, i) => <SleeperCard key={i} pick={pick} />)}
              </section>
            )}
          </div>
        )}

        {/* Two-Start + Platform Scoring */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section>
            <SectionLabel>Two-start pitchers this week</SectionLabel>
            <TwoStartTable picks={twoStartPicks} />
            <Link
              href="/fantasy/two-start"
              className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 mt-2 inline-block"
            >
              Full two-start board →
            </Link>
          </section>
          <section>
            <SectionLabel>Platform scoring</SectionLabel>
            <PlatformTable picks={allPicks} />
          </section>
        </div>
      </div>
    </div>
  )
}