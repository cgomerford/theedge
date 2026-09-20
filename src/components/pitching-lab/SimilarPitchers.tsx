'use client'

// src/components/pitching-lab/SimilarPitchers.tsx
//
// "Similar arsenal, league-wide" — consumes /api/mlb/similar-pitchers,
// which computes a real, documented distance score over real per-pitch
// usage/velo/movement data (see src/lib/pitcher-similarity.ts). Not a
// fetched fact, a derived ranking — labeled as such in the caption.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SimilarPitcher } from '@/lib/pitcher-similarity'

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

export default function SimilarPitchers({ pitcherId, season }: { pitcherId: number; season: number }) {
  const [similar, setSimilar] = useState<SimilarPitcher[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/similar-pitchers?playerId=${pitcherId}&season=${season}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setSimilar(json.similar ?? []) })
      .catch(() => { if (!cancelled) setSimilar([]) })
    return () => { cancelled = true }
  }, [pitcherId, season])

  if (similar === null) return <div className="bg-white border border-stone-200 rounded-xl p-5 text-[12px] text-stone-400 text-center py-10">Finding comparable arsenals…</div>
  if (similar.length === 0) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">Similar arsenal, league-wide</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {similar.map(s => (
          <Link
            key={s.playerId}
            href={`/mlb/pitching-lab/${s.playerId}`}
            className="flex flex-col items-center text-center rounded-lg border border-stone-100 p-3 hover:border-[#FF5722] transition"
          >
            <img src={mlbHeadshot(s.playerId)} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', background: '#F4F1EA' }} />
            <span className="mt-2 text-[11px] font-bold text-stone-900 leading-tight">{s.playerName}</span>
            <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wide">{s.teamAbbr ?? '—'}</span>
            {s.primaryPitch && (
              <span className="mt-1 text-[9px] font-mono text-stone-500">{s.primaryPitch.name} {s.primaryPitch.velo?.toFixed(0)}mph</span>
            )}
            <span className="mt-1.5 text-[10px] font-mono font-bold text-[#FF5722]">{s.score} sim</span>
          </Link>
        ))}
      </div>
      <p className="text-[9px] font-mono text-stone-400 mt-3">
        Ranked by a real distance score over usage%, velocity, and movement on shared pitch types (min 50% usage-weighted overlap) — a ranking aid, not a fetched external comp.
      </p>
    </div>
  )
}
