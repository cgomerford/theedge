'use client'

/**
 * src/components/fantasy/FantasyTicker.tsx
 *
 * FTSE-style auto-scrolling ticker showing EVERY pitcher on tonight's slate.
 * CSS marquee animation — seamless infinite loop via duplicated content.
 * Players tagged as picks get colored; everyone else is neutral.
 */

import type { TickerPitcher } from '@/lib/fantasy-ticker'

function getTickerColor(pitcher: TickerPitcher): string {
  if (pitcher.pickType === 'streamer') return 'text-emerald-400'
  if (pitcher.pickType === 'faller') return 'text-red-400'
  if (pitcher.pickType === 'sleeper') return 'text-yellow-300'
  // No pick — color by edge score direction
  if (pitcher.edgeScore != null) {
    if (pitcher.edgeScore > 10) return 'text-emerald-500/70'
    if (pitcher.edgeScore < -10) return 'text-red-500/70'
  }
  return 'text-stone-500'
}

function getTickerArrow(pitcher: TickerPitcher): string {
  if (pitcher.pickType === 'streamer') return '▲'
  if (pitcher.pickType === 'faller') return '▼'
  if (pitcher.pickType === 'sleeper') return '◆'
  if (pitcher.edgeScore != null) {
    if (pitcher.edgeScore > 5) return '▲'
    if (pitcher.edgeScore < -5) return '▼'
  }
  return '—'
}

function getScoreDisplay(pitcher: TickerPitcher): string {
  if (pitcher.pickType === 'sleeper') return '+R'
  if (pitcher.signalScore != null) return String(pitcher.signalScore)
  if (pitcher.edgeScore != null) return String(Math.round(Math.abs(pitcher.edgeScore)))
  return '—'
}

function TickerStrip({ pitchers }: { pitchers: TickerPitcher[] }) {
  return (
    <>
      {pitchers.map((p, i) => {
        const color = getTickerColor(p)
        const arrow = getTickerArrow(p)
        const score = getScoreDisplay(p)

        return (
          <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap mr-6">
            <span className="font-mono text-[11px] text-stone-400">
              {p.name}
            </span>
            <span className={`font-mono text-[11px] font-bold ${color}`}>
              {score} {arrow}
            </span>
          </span>
        )
      })}
    </>
  )
}

export default function FantasyTicker({ pitchers }: { pitchers: TickerPitcher[] }) {
  if (pitchers.length === 0) return null

  // ~1.8s per pitcher — fast like FTSE
  const duration = Math.max(12, pitchers.length * 1.8)

  return (
    <div className="bg-stone-900 overflow-hidden relative">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-stone-900 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-stone-900 to-transparent z-10 pointer-events-none" />

      <div
        className="flex items-center py-2 animate-ticker hover:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {/* Render twice for seamless loop */}
        <div className="flex items-center shrink-0">
          <TickerStrip pitchers={pitchers} />
        </div>
        <div className="flex items-center shrink-0" aria-hidden>
          <TickerStrip pitchers={pitchers} />
        </div>
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker-scroll linear infinite;
          will-change: transform;
        }
      `}</style>
    </div>
  )
}