'use client'

// src/components/ScoutReportShowcase.tsx
//
// 2026-08-23: new. "Apple commercial" style showcase — an iPad frame
// with a scaled mockup of the real Scout Report layout auto-scrolling
// inside it, top/bottom gradient-masked. No video file — pure CSS
// animation, so it loads instantly and stays on-brand.
//
// Content mirrors ScoutReportTab's real module list (TeamTrendsCard,
// PitchLocationCard-style arsenal, hot zones, BullpenUsageCard,
// ABSChallengeCard, SBTendencyCard) but with placeholder team labels
// and round numbers — illustrative only, never live or real-looking
// data in a marketing component.
//
// Scroll loop: content is rendered twice back-to-back, then translateY
// runs 0 -> -50% linearly and repeats — seamless loop, same pattern as
// the homepage's stat marquee.

import { useEffect, useRef, useState } from 'react'

function MiniCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#DEDACE] rounded-sm p-3 mb-2.5">
      <div className="font-mono text-[7px] uppercase tracking-widest text-[#8A8577] mb-2">{title}</div>
      {children}
    </div>
  )
}

function ArsenalBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="font-mono text-[7px] text-[#4A4740] w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#F4F1EA] rounded-sm overflow-hidden">
        <div className="h-full bg-[#FF5722]" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[7px] text-[#8A8577] w-6 text-right">{pct}%</span>
    </div>
  )
}

function ZoneGrid() {
  const heat = [2, 4, 5, 3, 5, 4, 1, 3, 2]
  return (
    <div className="grid grid-cols-3 gap-0.5 w-16">
      {heat.map((h, i) => (
        <div
          key={i}
          className="aspect-square rounded-sm"
          style={{ background: `rgba(255,87,34,${h / 5})` }}
        />
      ))}
    </div>
  )
}

function ReportContent() {
  return (
    <div className="px-4 pt-5">
      {/* Header */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-[#1A1A1A]" />
        <span className="font-mono text-[9px] text-[#8A8577]">VS</span>
        <div className="w-8 h-8 rounded-full bg-[#FF5722]" />
      </div>
      <div className="font-mono text-[7px] uppercase tracking-widest text-[#FF5722] text-center mb-4">
        § Scouting report
      </div>

      <MiniCard title="Season numbers · TEAM A">
        <div className="grid grid-cols-2 gap-2">
          {[['SP ERA', '3.42'], ['Bullpen ERA', '3.71'], ['OPS L30', '.762'], ['RISP AVG', '.251']].map(([l, v]) => (
            <div key={l} className="bg-[#F4F1EA] rounded-sm px-2 py-1.5">
              <div className="font-mono text-[6px] text-[#8A8577]">{l}</div>
              <div className="font-mono text-[10px] font-bold text-[#1A1A1A]">{v}</div>
            </div>
          ))}
        </div>
      </MiniCard>

      <MiniCard title="Pitch arsenal">
        <ArsenalBar label="Fastball" pct={42} />
        <ArsenalBar label="Slider" pct={28} />
        <ArsenalBar label="Changeup" pct={18} />
        <ArsenalBar label="Curve" pct={12} />
      </MiniCard>

      <MiniCard title="Lineup hot zones vs RHP">
        <div className="flex items-center gap-3">
          <ZoneGrid />
          <p className="font-serif text-[8px] text-[#4A4740] leading-tight">
            Concentrated damage up and in — three of the top five hitters share this profile.
          </p>
        </div>
      </MiniCard>

      <MiniCard title="Bullpen usage">
        <div className="space-y-1.5">
          {['Most used: 7th inning', 'Sharpest: 8th inning · 0.6 R/app', '1 blown save this season'].map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[#FF5722] shrink-0" />
              <span className="font-mono text-[7px] text-[#4A4740]">{t}</span>
            </div>
          ))}
        </div>
      </MiniCard>

      <MiniCard title="ABS challenge tendency">
        <div className="flex items-baseline gap-2">
          <span className="edge-display text-[22px] leading-none text-[#1A1A1A]">62%</span>
          <span className="font-mono text-[7px] text-[#8A8577]">success rate, 8 challenges L15</span>
        </div>
      </MiniCard>

      <MiniCard title="Stolen base tendency vs tonight's catcher">
        <div className="flex items-baseline gap-2">
          <span className="edge-display text-[22px] leading-none text-[#1A1A1A]">1.4s</span>
          <span className="font-mono text-[7px] text-[#8A8577]">catcher pop time · league avg 1.9s</span>
        </div>
      </MiniCard>

      <MiniCard title="Ballpark & weather">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[7px] text-[#4A4740]">12mph out to left</span>
          <span className="font-mono text-[7px] text-[#FF5722]">HR factor +8%</span>
        </div>
      </MiniCard>
    </div>
  )
}

export default function ScoutReportShowcase() {
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
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="flex justify-center py-6"
      style={{
        perspective: '1400px',
      }}
    >
      <div
        style={{
          transform: revealed
            ? 'rotateX(0deg) scale(1)'
            : 'rotateX(12deg) scale(0.94)',
          opacity: revealed ? 1 : 0,
          transition: 'transform 1.1s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.9s ease',
        }}
      >
        {/* iPad frame */}
        <div
          className="relative"
          style={{
            width: 260,
            height: 360,
            background: '#1A1A1A',
            borderRadius: 28,
            padding: 10,
            boxShadow: revealed ? '0 40px 70px -20px rgba(0,0,0,0.35)' : 'none',
            animation: revealed ? 'edge-float-slow 13s ease-in-out infinite' : 'none',
          }}
        >
          {/* Camera dot */}
          <div
            style={{
              position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)',
              width: 4, height: 4, borderRadius: '50%', background: '#3A3A38',
            }}
          />
          {/* Screen */}
          <div
            style={{
              width: '100%', height: '100%', borderRadius: 18, overflow: 'hidden',
              background: '#FAF8F3', position: 'relative',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
            }}
          >
            <div
              style={{
                animation: revealed ? 'edge-scout-scroll 16s linear infinite' : 'none',
              }}
            >
              <ReportContent />
              <ReportContent />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}