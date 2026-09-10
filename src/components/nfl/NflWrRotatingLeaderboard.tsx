// ============================================================
// src/components/nfl/NflWrRotatingLeaderboard.tsx
// ============================================================
'use client'

import { useState, useEffect } from 'react'
import type { WrNgsSeasonProfile } from '@/lib/nfl/queries'
import NflQbAvatar from './NflQbAvatar'

type Category = { key: string; label: string; get: (p: WrNgsSeasonProfile) => number; fmt: (v: number) => string; higherIsBetter: boolean }

const CATEGORIES: Category[] = [
  { key: 'iay', label: 'Avg Target Depth', get: (p) => p.avgIntendedAirYards, fmt: (v) => v.toFixed(1), higherIsBetter: true },
  { key: 'sep', label: 'Separation', get: (p) => p.avgSeparation, fmt: (v) => v.toFixed(1), higherIsBetter: true },
  { key: 'yacae', label: 'YAC vs Expected', get: (p) => p.avgYacAboveExpectation, fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`, higherIsBetter: true },
  { key: 'catch', label: 'Catch %', get: (p) => p.catchPct, fmt: (v) => `${v.toFixed(0)}%`, higherIsBetter: true },
  { key: 'share', label: 'Air Yards Share', get: (p) => p.targetShareOfAirYards, fmt: (v) => `${v.toFixed(1)}%`, higherIsBetter: true },
  { key: 'targets', label: 'Targets', get: (p) => p.targets, fmt: (v) => String(v), higherIsBetter: true },
]

export default function NflWrRotatingLeaderboard({ profiles, intervalMs = 6000, limit = 45 }: { profiles: WrNgsSeasonProfile[]; intervalMs?: number; limit?: number }) {
  const [catIndex, setCatIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setCatIndex((i) => (i + 1) % CATEGORIES.length), intervalMs)
    return () => clearInterval(t)
  }, [paused, intervalMs])

  const cat = CATEGORIES[catIndex]
  const ranked = [...profiles]
    .filter((p) => Number.isFinite(cat.get(p)))
    .sort((a, b) => (cat.higherIsBetter ? cat.get(b) - cat.get(a) : cat.get(a) - cat.get(b)))
    .slice(0, limit)

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 16, position: 'sticky', top: 24 }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 8 }}>
        {CATEGORIES.map((c, i) => <button key={c.key} onClick={() => setCatIndex(i)} style={{ width: 6, height: 6, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: i === catIndex ? '#FF5722' : 'rgba(26,26,26,0.15)' }} />)}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#FF5722', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{cat.label}</div>
      <div style={{ maxHeight: 900, overflowY: 'auto' }}>
        {ranked.map((p, i) => (
          <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(26,26,26,0.05)' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: i === 0 ? '#FF5722' : '#D4D0C8', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <NflQbAvatar headshotUrl={p.headshotUrl} playerName={p.playerName} teamColor={p.teamColor} size={22} ringColor={p.teamColor} />
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 11, fontWeight: 700, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: i === 0 ? '#FF5722' : '#1A1A1A' }}>{cat.fmt(cat.get(p))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
