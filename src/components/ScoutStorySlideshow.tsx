'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { ScoutReport, ScoutRow } from '@/lib/scout'

type Props = {
  report: ScoutReport
  homeAbbr: string
  awayAbbr: string
  homeName: string
  awayName: string
  homeColor?: string
  awayColor?: string
  homeTeamId?: number | null
  awayTeamId?: number | null
  awayPitcherName?: string
  homePitcherName?: string
  // add any other props you already have (notes, streaks, etc.)
}

const SLIDE_DURATION = 5200 // ms

export default function ScoutStorySlideshow({
  report,
  homeAbbr,
  awayAbbr,
  homeName,
  awayName,
  homeColor = '#1A1A1A',
  awayColor = '#FF5722',
  awayPitcherName = 'TBD',
  homePitcherName = 'TBD',
}: Props) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─────────────────────────────────────────────
  // Build the ordered story slides from the real report
  // ─────────────────────────────────────────────
  const slides = useMemo(() => {
    const awayPitching = report.rows
      .filter(r => r.section === 'pitching' && r.leanLabel.includes(awayAbbr))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4)

    const homePitching = report.rows
      .filter(r => r.section === 'pitching' && r.leanLabel.includes(homeAbbr))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4)

    const keyNotes = report.rows
      .filter(r => !['situation', 'moves'].includes(r.section))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)

    const contextNotes = report.rows
      .filter(r => r.section === 'situation' || r.section === 'moves')
      .sort((a, b) => b.weight - a.weight)

    return [
      // 1. Opening
      {
        id: 'open',
        title: 'SCOUTING REPORT',
        content: (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6">
            <p className="font-mono text-[11px] tracking-[0.3em] text-stone-400">THE EDGE</p>
            <h1 className="text-3xl font-bold leading-none" style={{ fontFamily: 'Bebas Neue' }}>
              {awayName}
              <span className="block text-stone-500 text-xl my-2">@</span>
              {homeName}
            </h1>
            <div className="flex gap-8 mt-4 text-sm">
              <div>
                <p className="text-stone-500 text-[10px] uppercase">SP</p>
                <p className="font-medium">{awayPitcherName}</p>
              </div>
              <div>
                <p className="text-stone-500 text-[10px] uppercase">SP</p>
                <p className="font-medium">{homePitcherName}</p>
              </div>
            </div>
          </div>
        ),
      },

      // 2. Away Pitching
      {
        id: 'away-pitch',
        title: `${awayAbbr} PITCHING`,
        content: <NotesBlock rows={awayPitching} color={awayColor} empty="No strong pitching notes" />,
      },

      // 3. Home Pitching
      {
        id: 'home-pitch',
        title: `${homeAbbr} PITCHING`,
        content: <NotesBlock rows={homePitching} color={homeColor} empty="No strong pitching notes" />,
      },

      // 4. Key Edges
      {
        id: 'edges',
        title: 'KEY EDGES',
        content: <NotesBlock rows={keyNotes} color="#FF5722" empty="No notable edges" />,
      },

      // 5. Context / Park / Moves
      {
        id: 'context',
        title: 'CONTEXT',
        content: <NotesBlock rows={contextNotes} color="#a8a29e" empty="Nothing notable tonight" />,
      },

      // 6. Closing
      {
        id: 'close',
        title: '',
        content: (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <p className="font-mono text-[11px] tracking-widest text-stone-500">FULL REPORT</p>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'Bebas Neue' }}>
              {awayAbbr} @ {homeAbbr}
            </h2>
            <p className="text-stone-400 text-sm mt-4">Swipe for next game →</p>
          </div>
        ),
      },
    ]
  }, [report, awayAbbr, homeAbbr, awayName, homeName, awayPitcherName, homePitcherName])

  // Auto-play
  useEffect(() => {
    if (!playing) return
    timer.current = setTimeout(() => {
      setIndex(i => (i + 1) % slides.length)
    }, SLIDE_DURATION)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [index, playing, slides.length])

  const go = (dir: 1 | -1) => {
    setIndex(i => {
      const next = i + dir
      if (next < 0) return slides.length - 1
      if (next >= slides.length) return 0
      return next
    })
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 9:16 Story Frame */}
      <div
        className="relative bg-[#0c0c0c] rounded-2xl overflow-hidden shadow-2xl select-none"
        style={{ width: 340, height: 604, aspectRatio: '9/16' }}
        onClick={e => {
          const x = e.nativeEvent.offsetX
          go(x < 120 ? -1 : 1)
        }}
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 z-30 flex gap-1">
          {slides.map((_, i) => (
            <div key={i} className="h-[2.5px] flex-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full origin-left"
                style={{
                  transform: `scaleX(${i < index ? 1 : i === index ? 1 : 0})`,
                  transition: i === index && playing
                    ? `transform ${SLIDE_DURATION}ms linear`
                    : 'none',
                }}
              />
            </div>
          ))}
        </div>

        {/* Animated slide content */}
        <div className="absolute inset-0 pt-12 pb-8 px-5 text-white">
          <div
            key={slides[index].id}
            className="h-full animate-story-in"
          >
            {slides[index].title && (
              <div className="mb-5">
                <div className="h-1 w-10 rounded-full bg-[#FF5722] mb-2" />
                <p className="font-mono text-[11px] tracking-[0.2em] text-stone-400 uppercase">
                  {slides[index].title}
                </p>
              </div>
            )}
            {slides[index].content}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 text-sm">
        <button
          onClick={() => setPlaying(p => !p)}
          className="px-4 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="font-mono text-xs text-stone-500">
          {index + 1} / {slides.length}
        </span>
      </div>

      {/* Tiny CSS for the entrance animation */}
      <style jsx>{`
        @keyframes story-in {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-story-in {
          animation: story-in 0.45s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────
function NotesBlock({
  rows,
  color,
  empty,
}: {
  rows: ScoutRow[]
  color: string
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="text-stone-500 text-sm mt-8">{empty}</p>
  }

  return (
    <div className="space-y-4 overflow-y-auto max-h-[420px] pr-1">
      {rows.map((r, i) => (
        <div
          key={r.id}
          className="flex gap-3 animate-story-in"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
            style={{ background: color }}
          />
          <p className="text-[15px] leading-snug text-stone-100">{r.line}</p>
        </div>
      ))}
    </div>
  )
}