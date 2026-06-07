'use client'

/**
 * src/components/MLBFantasySection.tsx
 *
 * Fantasy Intel section for the /mlb hub page.
 * Surfaces tonight's streamers, movers, fallers, sleepers inline
 * instead of on a standalone /fantasy page.
 *
 * Always renders in TEASER mode (1 pick visible per tab + Pro CTA)
 * because /mlb is ISR-cached and doesn't check auth state. The full
 * desk experience lives in authenticated spaces (Dugout, game pages).
 *
 * Data comes from getFantasyPicks() in src/lib/fantasy.ts.
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
  { key: 'streamer' as const, label: 'Streamers',  desc: 'Best arms to stream tonight' },
  { key: 'mover'    as const, label: 'Movers',     desc: 'Biggest edge swings today' },
  { key: 'faller'   as const, label: 'Sell / Sit', desc: 'Stars in tough spots' },
  { key: 'sleeper'  as const, label: 'Sleepers',   desc: 'Regression watch — hidden value' },
]

// ─── Pick card (compact, inline — not the full FantasyPlayerCard) ─────────────

function PickCard({ pick }: { pick: FantasyPick }) {
  const signalColor =
    (pick.signal_score ?? 0) >= 70 ? 'text-emerald-600' :
    (pick.signal_score ?? 0) >= 40 ? 'text-orange-600'  :
    'text-stone-400'

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-serif font-bold text-stone-900 leading-snug">
              {pick.headline}
            </span>
            {pick.signal_score != null && (
              <span className={`text-[10px] font-mono font-bold ${signalColor} bg-stone-50 px-1.5 py-0.5 rounded`}>
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
        {pick.game_slug && (
          <Link
            href={`/mlb/${pick.game_slug?.replace(/-at-/g, '-vs-')}`}
            className="shrink-0 text-[9px] font-mono uppercase tracking-widest text-orange-600 hover:text-orange-700 border border-stone-200 px-2 py-1 rounded hover:border-orange-300 transition opacity-0 group-hover:opacity-100"
          >
            Preview →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Mover card (game-level, no player) ───────────────────────────────────────

function MoverCard({ pick }: { pick: FantasyPick }) {
  const swing = pick.details?.swing
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
                direction === 'up'
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-red-700 bg-red-50'
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

// ─── Main section ─────────────────────────────────────────────────────────────

export default function MLBFantasySection({ picks, isStale }: Props) {
  const [activeTab, setActiveTab] = useState<keyof FantasyPicksByType>('streamer')

  const activePicks = picks[activeTab]
  const hasAnyPicks = Object.values(picks).some(arr => arr.length > 0)

  // Don't render the section at all if there are zero picks across all types
  if (!hasAnyPicks) return null

  // Teaser: show only the first pick. Pro CTA for the rest.
  const teaserPick = activePicks[0] ?? null
  const lockedCount = Math.max(0, activePicks.length - 1)
  const activeTabMeta = TABS.find(t => t.key === activeTab)!

  return (
    <section className="mb-12">

      {/* Header */}
      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#FF5722] mb-1">
            ⊕ Fantasy intel · Pro
          </div>
          <h2 className="text-2xl font-serif font-bold text-stone-900 leading-none">
            Tonight&apos;s desk<span className="text-orange-500">.</span>
          </h2>
        </div>
        <Link
          href="/pricing"
          className="text-[10px] font-mono uppercase tracking-widest text-[#FDE047] bg-[#1A1A1A] px-3 py-1.5 rounded hover:bg-stone-800 transition"
        >
          Unlock full desk →
        </Link>
      </div>

      {/* Stale warning */}
      {isStale && (
        <div className="text-[10px] font-mono text-yellow-700 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded mb-3">
          ⚠ Yesterday&apos;s picks — tonight&apos;s compute at 11:30 PM UK
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(tab => {
          const count = picks[tab.key].length
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest transition rounded flex items-center gap-1.5 ${
                isActive
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-500 hover:text-stone-800 border border-stone-200 bg-white'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-[9px] ${isActive ? 'text-orange-400' : 'text-stone-400'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activePicks.length === 0 ? (
        <div className="text-center py-8 bg-white border border-stone-200 rounded-lg">
          <div className="text-stone-400 font-mono text-sm">
            No {activeTabMeta.label.toLowerCase()} tonight.
          </div>
          <div className="text-[10px] font-mono text-stone-300 mt-1">
            {activeTabMeta.desc}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* The one visible pick */}
          {teaserPick && (
            activeTab === 'mover'
              ? <MoverCard pick={teaserPick} />
              : <PickCard pick={teaserPick} />
          )}

          {/* Pro gate for the rest */}
          {lockedCount > 0 && (
            <Link
              href="/pricing"
              className="block bg-stone-50 border border-dashed border-stone-300 rounded-lg p-4 text-center hover:border-orange-300 hover:bg-orange-50/30 transition group"
            >
              <div className="text-xs font-mono uppercase tracking-widest text-stone-400 group-hover:text-orange-600 transition mb-1">
                + {lockedCount} more {activeTabMeta.label.toLowerCase()}
              </div>
              <div className="text-[10px] font-serif italic text-stone-400">
                Full fantasy desk with Pro →
              </div>
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
