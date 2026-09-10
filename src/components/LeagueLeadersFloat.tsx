'use client'

// src/components/LeagueLeadersFloat.tsx
//
// 2026-08-23: floating league-leader cards for the homepage — continuous
// idle float (CSS keyframes, staggered durations per card for an organic
// feel), scroll-in stagger reveal (IntersectionObserver), and a light
// scroll-parallax drift (rAF-throttled scroll listener, no dependency
// added — matches the no-framer-motion convention already in this
// codebase).
//
// Data comes straight from lib/mlb-leaders.ts's getSeasonLeaders() —
// real, live, already curl-verified in that file (reliever pool quirk
// etc). Headshot URL and stat formatting (ERA/.avg display) are already
// handled there, so this component just renders LeaderRow as-is.

import { useEffect, useRef, useState } from 'react'
import type { LeaderRow } from '@/lib/mlb-leaders'

export type LeaderCardData = {
  label: string
  category: string
  row: LeaderRow
}

const FLOAT_DURATIONS = ['7s', '9s', '8s', '10s']
const FLOAT_DELAYS = ['0s', '0.6s', '1.2s', '0.3s']
const PARALLAX_FACTORS = [0.04, -0.06, 0.05, -0.03]

function LeaderCard({ leader, index, revealed, scrollY }: {
  leader: LeaderCardData
  index: number
  revealed: boolean
  scrollY: number
}) {
  const parallax = scrollY * PARALLAX_FACTORS[index % PARALLAX_FACTORS.length]

  return (
    <div
      className="bg-white border border-[#1A1A1A] p-5 w-56"
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? `translateY(${parallax}px)` : 'translateY(40px)',
        transition: `opacity 0.6s ease ${index * 0.12}s, transform 0.6s ease ${index * 0.12}s`,
        animation: revealed ? `edge-float ${FLOAT_DURATIONS[index % 4]} ease-in-out ${FLOAT_DELAYS[index % 4]} infinite` : 'none',
      }}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] mb-3">
        {leader.label}
      </div>
      <div className="flex items-center gap-3 mb-3">
        <img
          src={leader.row.headshot}
          alt=""
          className="w-10 h-10 rounded-full border border-[#DEDACE] object-cover bg-[#F4F1EA]"
        />
        <div>
          <div className="font-serif font-semibold text-sm leading-tight">{leader.row.name}</div>
          <div className="font-mono text-[10px] text-[#8A8577]">{leader.row.teamAbbr}</div>
        </div>
      </div>
      <div className="edge-display text-[28px] leading-none text-[#1A1A1A]">
        {leader.row.statValue}
      </div>
    </div>
  )
}

export default function LeagueLeadersFloat({ leaders }: { leaders: LeaderCardData[] }) {
  const [revealed, setRevealed] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

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
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect()
          setScrollY(window.innerHeight - rect.top)
        }
        rafRef.current = null
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (leaders.length === 0) return null

  return (
    <div ref={ref} className="flex flex-wrap justify-center gap-6 py-4">
      {leaders.map((leader, i) => (
        <LeaderCard key={leader.category} leader={leader} index={i} revealed={revealed} scrollY={scrollY} />
      ))}
    </div>
  )
}