'use client'

// src/components/AnimatedStatGrid.tsx
//
// 2026-08-23: new. Big animated stat grid, styled after a mining-
// contractor reference site (bold sans numbers, thin-line icons,
// hairline dividers). Max-animation version per request:
//   1. Digit scramble (rapid random digits matching target's length,
//      ~350ms) before settling into a real count-up.
//   2. Count-up itself uses ease-out over ~900ms via requestAnimationFrame.
//   3. Icon gets a one-time "settle pulse" (scale bounce) the instant
//      the count-up finishes.
//   4. Hairline divider under each stat draws in left-to-right on reveal.
//   5. Whole grid staggers in per-card via IntersectionObserver, doesn't
//      replay on re-scroll (fires once).
//
// Icons are simple inline SVG line-glyphs (no new dependency) rather
// than an icon library — swap for lucide-react or similar if that's
// already installed elsewhere in the app; didn't want to assume.

import { useEffect, useRef, useState } from 'react'

export type StatEntry = {
  icon: 'ruler' | 'chart' | 'grid' | 'team' | 'report' | 'check'
  value: number
  suffix?: string      // e.g. 'k', 'M', '+'
  decimals?: number     // 0 for integers, 1 for "5.1k" style
  label: string
}

const ICONS: Record<StatEntry['icon'], React.ReactNode> = {
  ruler: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="9" width="20" height="6" rx="0.5" />
      <path d="M6 9v3M10 9v3M14 9v3M18 9v3" />
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 20V10M10 20V4M17 20v-7" />
    </svg>
  ),
  grid: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  team: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="9" cy="8" r="3" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      <circle cx="18" cy="9" r="2.3" /><path d="M15.5 20c.3-2.8 2-4.8 4.5-5" />
    </svg>
  ),
  report: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="3" width="16" height="18" rx="0.5" /><path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  check: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="16" rx="0.5" /><path d="M8 12l2.5 2.5L16 9" />
    </svg>
  ),
}

function formatDisplay(n: number, decimals: number, suffix: string): string {
  const rounded = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-US')
  return `${rounded}${suffix}`
}

function randomDigits(digitCount: number): string {
  let out = ''
  for (let i = 0; i < digitCount; i++) out += Math.floor(Math.random() * 10)
  return out
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

function AnimatedStatCard({ stat, index, revealed }: { stat: StatEntry; index: number; revealed: boolean }) {
  const [display, setDisplay] = useState('—')
  const [settled, setSettled] = useState(false)
  const [dividerIn, setDividerIn] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!revealed || startedRef.current) return
    startedRef.current = true

    const startDelay = index * 140
    const scrambleMs = 350
    const countMs = 900
    const digitCount = Math.max(2, Math.round(stat.value).toString().length)

    const startTimer = setTimeout(() => {
      setDividerIn(true)
      const scrambleStart = performance.now()

      const scrambleStep = (ts: number) => {
        const elapsed = ts - scrambleStart
        if (elapsed < scrambleMs) {
          setDisplay(randomDigits(digitCount) + (stat.suffix ?? ''))
          requestAnimationFrame(scrambleStep)
        } else {
          const countStart = performance.now()
          const countStep = (cts: number) => {
            const progress = Math.min(1, (cts - countStart) / countMs)
            const eased = easeOutExpo(progress)
            setDisplay(formatDisplay(stat.value * eased, stat.decimals ?? 0, stat.suffix ?? ''))
            if (progress < 1) {
              requestAnimationFrame(countStep)
            } else {
              setSettled(true)
              setTimeout(() => setSettled(false), 500)
            }
          }
          requestAnimationFrame(countStep)
        }
      }
      requestAnimationFrame(scrambleStep)
    }, startDelay)

    return () => clearTimeout(startTimer)
  }, [revealed, index, stat])

  return (
    <div
      className="py-6 px-1"
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s ease ${index * 0.14}s, transform 0.5s ease ${index * 0.14}s`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[#FF5722]"
          style={{
            display: 'inline-flex',
            transform: settled ? 'scale(1.18)' : 'scale(1)',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {ICONS[stat.icon]}
        </span>
      </div>
      <div className="edge-display text-[38px] leading-none text-[#1A1A1A] tabular-nums mb-1">
        {display}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-3">
        {stat.label}
      </div>
      <div
        className="h-px bg-[#1A1A1A]"
        style={{
          width: dividerIn ? '100%' : '0%',
          transition: 'width 0.7s ease 0.1s',
        }}
      />
    </div>
  )
}

export default function AnimatedStatGrid({ stats }: { stats: StatEntry[] }) {
  const [revealed, setRevealed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="grid grid-cols-2 sm:grid-cols-3 gap-x-8">
      {stats.map((stat, i) => (
        <AnimatedStatCard key={stat.label} stat={stat} index={i} revealed={revealed} />
      ))}
    </div>
  )
}