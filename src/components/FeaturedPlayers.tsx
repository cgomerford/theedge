// src/components/FeaturedPlayers.tsx
//
// A real current MLB leaderboard (top qualified players by one real
// stat — OPS for batters, ERA for pitchers), each a clickable card
// straight into that player's Lab. Not a hand-picked or fabricated
// list — it's whoever's actually leading the league right now, via the
// same getLeaders() this app already uses for percentile ranks, so it
// stays current on its own as the season moves.

import Link from 'next/link'
import type { LeaderRow } from '@/lib/lab'

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

export default function FeaturedPlayers({ title, statLabel, leaders, labPath, fmt }: {
  title: string
  statLabel: string
  leaders: LeaderRow[]
  labPath: 'batting-lab' | 'pitching-lab'
  fmt: (v: number) => string
}) {
  if (leaders.length === 0) return null
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-[#8A8577] mb-3">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {leaders.map(p => (
          <Link
            key={p.personId}
            href={`/mlb/${labPath}/${p.personId}`}
            className="flex items-center gap-2.5 rounded-lg border border-stone-200 bg-white px-3 py-2.5 hover:border-[#FF5722] transition"
          >
            <img
              src={mlbHeadshot(p.personId)}
              alt=""
              width={32}
              height={32}
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: '#F4F1EA' }}
            />
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-[#1A1A1A] truncate">{p.name}</div>
              <div className="text-[10px] font-mono text-[#8A8577]">{p.team} · {statLabel} {fmt(p.value)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
