'use client'

/**
 * src/app/fantasy/FantasyDashboard.tsx
 *
 * The full Pro Fantasy Desk — the trading floor.
 * Only rendered for authenticated Pro users (gated in page.tsx).
 */

import { useState } from 'react'
import Link from 'next/link'
import type { FantasyPicksByType, FantasyPick } from '@/lib/fantasy'

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  picks: FantasyPicksByType
  isStale: boolean
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  {
    key: 'streamer' as const,
    label: 'Streamers',
    icon: '▲',
    desc: 'Best arms to stream tonight based on matchup, park, bullpen rest',
  },
  {
    key: 'mover' as const,
    label: 'Movers',
    icon: '⇅',
    desc: 'Biggest edge score swings since yesterday — act before the field notices',
  },
  {
    key: 'faller' as const,
    label: 'Sell / Sit',
    icon: '▼',
    desc: 'Stars in tough spots tonight — elite pitchers, bad parks, stacked lineups',
  },
  {
    key: 'sleeper' as const,
    label: 'Sleepers',
    icon: '◎',
    desc: 'Regression watch — hidden value the model likes that ownership ignores',
  },
]

// ─── Deep page links ──────────────────────────────────────────────────────────

const DEEP_PAGES = [
  { href: '/fantasy/streamers',  label: '7-Day Board',       desc: 'Every streamer call this week'         },
  { href: '/fantasy/two-start',  label: 'Two-Start',         desc: 'Pitchers starting twice this week'     },
  { href: '/fantasy/platforms',  label: 'Platform Scores',   desc: 'Yahoo · ESPN · Sleeper · DraftKings'   },
  { href: '/fantasy/news',       label: 'News Wire',         desc: 'Injury & roster news that moves scores' },
]

// ─── Pick card ────────────────────────────────────────────────────────────────

function PickCard({ pick }: { pick: FantasyPick }) {
  const [expanded, setExpanded] = useState(false)

  const signalColor =
    (pick.signal_score ?? 0) >= 70 ? 'text-emerald-600 bg-emerald-50' :
    (pick.signal_score ?? 0) >= 40 ? 'text-orange-600 bg-orange-50'   :
    'text-stone-400 bg-stone-50'

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden hover:border-stone-300 transition">
      <button
        className="w-full text-left p-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-serif font-bold text-stone-900 leading-snug">
                {pick.headline}
              </span>
              {pick.signal_score != null && (
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${signalColor}`}>
                  {pick.signal_score}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 font-serif italic leading-relaxed">
              {pick.one_liner}
            </p>
            {pick.game_time && (
              <div className="text-[9px] font-mono text-stone-400 uppercase tracking-widest mt-1.5">
                {pick.game_time}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pick.game_slug && (
              <Link
                href={`/mlb/${pick.game_slug?.replace(/-at-/g, '-vs-')}`}
                onClick={e => e.stopPropagation()}
                className="text-[9px] font-mono uppercase tracking-widest text-orange-600 hover:text-orange-700 border border-stone-200 px-2 py-1 rounded hover:border-orange-300 transition"
              >
                Preview →
              </Link>
            )}
            <span className="text-stone-400 text-xs font-mono">
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && pick.details && (
        <div className="border-t border-stone-100 px-4 py-3 bg-stone-50 space-y-2">
          {Object.entries(pick.details)
            .filter(([k]) => !['swing', 'direction'].includes(k))
            .map(([key, val]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="font-mono text-[10px] uppercase tracking-wide text-stone-400">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-[11px] font-bold text-stone-700">
                  {String(val)}
                </span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ─── Mover card ───────────────────────────────────────────────────────────────

function MoverCard({ pick }: { pick: FantasyPick }) {
  const swing     = pick.details?.swing
  const direction = pick.details?.direction

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-serif font-bold text-stone-900 leading-snug">
              {pick.headline}
            </span>
            {swing != null && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                direction === 'up' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
              }`}>
                {direction === 'up' ? '↑' : '↓'} {Math.abs(swing)}
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 font-serif italic leading-relaxed">
            {pick.one_liner}
          </p>
        </div>
        {pick.game_slug && (
          <Link
            href={`/mlb/${pick.game_slug}`}
            className="shrink-0 text-[9px] font-mono uppercase tracking-widest text-orange-600 hover:text-orange-700 border border-stone-200 px-2 py-1 rounded hover:border-orange-300 transition opacity-0 group-hover:opacity-100"
          >
            Preview →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FantasyDashboard({ picks, isStale }: Props) {
  const [activeTab, setActiveTab] = useState<keyof FantasyPicksByType>('streamer')

  const activePicks   = picks[activeTab]
  const activeTabMeta = TABS.find(t => t.key === activeTab)!
  const hasAnyPicks   = Object.values(picks).some(arr => arr.length > 0)

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Hero ── */}
      <div className="py-10 md:py-14 border-b border-stone-200 mb-8">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#FF5722] mb-3">
          ⊕ The Edge · Fantasy Desk · Pro
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-stone-900 leading-none tracking-tight mb-3">
          The Trading Floor<span className="text-[#FF5722]">.</span>
        </h1>
        <p className="text-stone-500 text-base md:text-lg max-w-xl font-serif italic">
          Every edge that matters tonight — streamers, movers, fades, and sleepers.
        </p>
      </div>

      {/* ── Stale warning ── */}
      {isStale && (
        <div className="text-[10px] font-mono text-yellow-700 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded mb-6">
          ⚠ Yesterday&apos;s picks — tonight&apos;s compute runs at 11:30 PM UK
        </div>
      )}

      {/* ── Tonight's picks ── */}
      <section className="mb-12">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
          ⊕ Tonight&apos;s calls
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {TABS.map(tab => {
            const count    = picks[tab.key].length
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-xs font-mono uppercase tracking-widest transition rounded-lg flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#1A1A1A] text-white'
                    : 'text-stone-500 hover:text-stone-800 border border-stone-200 bg-white'
                }`}
              >
                <span className="text-[10px]">{tab.icon}</span>
                {tab.label}
                {count > 0 && (
                  <span className={`text-[9px] font-bold ${isActive ? 'text-[#FF5722]' : 'text-stone-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab description */}
        <p className="font-mono text-[10px] text-stone-400 mb-4 italic">
          {activeTabMeta.desc}
        </p>

        {/* Picks */}
        {!hasAnyPicks ? (
          <div className="text-center py-12 bg-white border border-stone-200 rounded-lg">
            <div className="text-stone-400 font-mono text-sm">No picks computed yet today.</div>
            <div className="text-[10px] font-mono text-stone-300 mt-1">Check back after 11:30 PM UK</div>
          </div>
        ) : activePicks.length === 0 ? (
          <div className="text-center py-10 bg-white border border-stone-200 rounded-lg">
            <div className="text-stone-400 font-mono text-sm">No {activeTabMeta.label.toLowerCase()} tonight.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {activePicks.map((pick, i) => (
              activeTab === 'mover'
                ? <MoverCard key={i} pick={pick} />
                : <PickCard key={i} pick={pick} />
            ))}
          </div>
        )}
      </section>

      {/* ── Deep pages grid ── */}
      <section>
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
          ⊕ Deeper analysis
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEEP_PAGES.map(page => (
            <Link
              key={page.href}
              href={page.href}
              className="block bg-white border border-stone-200 rounded-lg p-4 hover:border-[#FF5722] hover:shadow-sm transition group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-stone-900 group-hover:text-[#FF5722] transition mb-1">
                    {page.label}
                  </p>
                  <p className="text-[11px] text-stone-400 font-serif italic">{page.desc}</p>
                </div>
                <span className="text-stone-300 group-hover:text-[#FF5722] transition font-mono text-sm ml-3">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
