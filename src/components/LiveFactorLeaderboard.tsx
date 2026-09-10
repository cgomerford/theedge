'use client'

// src/components/LiveFactorLeaderboard.tsx
//
// 2026-08-23: new. Animated bar-chart leaderboard for the homepage,
// ranking tonight's slate by strongest factor lean. Deliberately no
// chart library dependency — plain divs + CSS transition for the bar
// fill, requestAnimationFrame for the count-up. Animates once, on
// scroll-into-view, via IntersectionObserver (not on every re-render).
//
// Data is computed server-side in page.tsx from the same `predictions`
// map already fetched for the rest of the homepage — no new fetch here.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export type LeaderboardEntry = {
  gamePk: number
  slug: string
  away: string
  home: string
  awayLogo: string
  homeLogo: string
  leanAbbr: string
  factorsFor: number
  factorsTotal: number
  time: string
}

function useCountUp(target: number, active: boolean, durationMs = 700): number {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    let raf: number
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const progress = Math.min(1, (ts - startRef.current) / durationMs)
      setValue(Math.round(progress * target))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, target, durationMs])

  return value
}

function LeaderboardRow({ entry, rank, active }: { entry: LeaderboardEntry; rank: number; active: boolean }) {
  const pct = Math.round((entry.factorsFor / entry.factorsTotal) * 100)
  const count = useCountUp(entry.factorsFor, active)

  return (
    <Link
      href={`/mlb/${entry.slug}`}
      className="group flex items-center gap-4 py-3 border-b border-stone-200 last:border-0 hover:bg-stone-50 transition-colors px-2 -mx-2"
    >
      <span className="font-mono text-xs text-stone-400 w-5 shrink-0">{rank}</span>

      <div className="flex items-center gap-2 w-40 shrink-0">
        <img src={entry.awayLogo} alt="" className="w-5 h-5 object-contain" />
        <span className="font-serif text-sm text-stone-700 truncate">{entry.away}</span>
        <span className="font-mono text-[10px] text-stone-300">@</span>
        <img src={entry.homeLogo} alt="" className="w-5 h-5 object-contain" />
        <span className="font-serif text-sm text-stone-700 truncate">{entry.home}</span>
      </div>

      <div className="flex-1 flex items-center gap-3 min-w-0">
        <div className="flex-1 h-2 bg-stone-100 border border-stone-200 overflow-hidden">
          <div
            className="h-full bg-orange-600 transition-[width] duration-700 ease-out"
            style={{ width: active ? `${pct}%` : '0%' }}
          />
        </div>
        <span className="font-mono text-xs text-stone-500 w-24 shrink-0 text-right">
          {count} of {entry.factorsTotal} → <span className="text-orange-600">{entry.leanAbbr}</span>
        </span>
      </div>

      <span className="font-mono text-[10px] text-stone-400 w-14 shrink-0 text-right hidden sm:block">
        {entry.time}
      </span>
    </Link>
  )
}

export default function LiveFactorLeaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const [active, setActive] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (entries.length === 0) return null

  return (
    <div ref={ref} className="border border-stone-200 bg-white">
      {entries.map((entry, i) => (
        <LeaderboardRow key={entry.gamePk} entry={entry} rank={i + 1} active={active} />
      ))}
    </div>
  )
}