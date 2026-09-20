'use client'

// src/components/HomeLeaderboards.tsx
//
// Sidebar leaderboards — REAL data only, matching mockup G's sidebar
// leaderboard blocks. Receives pre-fetched arrays as props (no client
// fetching), same convention as SportLiveTicker/SportTradingFloorBoard.
//
// MLB: real getSeasonLeaders() rows — true season leaders.
// NFL: real fetchNFLHomepageLeaders() rows — these are per-game BEST
// PERFORMANCES, not season totals (confirmed: ESPN's scoreboard endpoint
// only exposes per-game leaders — see src/lib/nfl/leaders.ts's own scope
// note). Labeled "Best performance" here, not "leaders", so nothing implies
// season-cumulative stats this data doesn't contain. Only the three
// confirmed-available categories are shown (passing/rushing/receiving
// yards) — no sacks or explosive-play columns, since no real data source
// for those was confirmed during this build.

import { useState } from 'react'
import type { LeaderRow } from '@/lib/mlb-leaders'
import type { NFLLeaderEntry } from '@/lib/nfl/leaders'

type Sport = 'mlb' | 'nfl'

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Headshot({ src, alt, rank }: { src: string | null; alt: string; rank: number }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[8.5px] font-extrabold shrink-0 ${rank === 0 ? 'bg-[#FF5722] text-white' : 'bg-[#E8E4DC] text-[#8A8577]'}`}>
        {initials(alt)}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`w-[22px] h-[22px] rounded-full object-cover shrink-0 border ${rank === 0 ? 'border-[#FF5722]' : 'border-[#E8E4DC]'}`}
    />
  )
}

function MlbBoard({ title, rows }: { title: string; rows: LeaderRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="mb-3 last:mb-0 rounded-xl bg-[#FAF8F3] border border-[#E8E4DC] p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#FF5722] mb-2">{title}</div>
      {rows.map((r, i) => (
        <div key={r.personId} className="flex items-center gap-2 py-1 rounded-lg transition-colors duration-200 hover:bg-white px-1 -mx-1">
          <span className="w-3.5 text-[10px] font-bold text-[#8A8577]">{i + 1}</span>
          <Headshot src={r.headshot} alt={r.name} rank={i} />
          <span className="flex-1 text-[12px] font-semibold text-[#1A1A1A] truncate">{r.name}</span>
          <span className="text-[11px] font-bold text-[#EA580C]">{r.statValue}</span>
        </div>
      ))}
    </div>
  )
}

function NflBoard({ title, rows }: { title: string; rows: NFLLeaderEntry[] }) {
  if (rows.length === 0) return null
  return (
    <div className="mb-3 last:mb-0 rounded-xl bg-[#FAF8F3] border border-[#E8E4DC] p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#FF5722] mb-2">{title}</div>
      <div className="text-[9px] text-[#8A8577] uppercase tracking-wide mb-2">Best single-game performance</div>
      {rows.map((r, i) => (
        <div key={r.athleteId} className="flex items-center gap-2 py-1 rounded-lg transition-colors duration-200 hover:bg-white px-1 -mx-1">
          <span className="w-3.5 text-[10px] font-bold text-[#8A8577]">{i + 1}</span>
          <Headshot src={r.headshotUrl} alt={r.playerName} rank={i} />
          <span className="flex-1 text-[12px] font-semibold text-[#1A1A1A] truncate">{r.playerName}</span>
          <span className="text-[11px] font-bold text-[#EA580C]">{r.displayValue}</span>
        </div>
      ))}
    </div>
  )
}

export default function HomeLeaderboards({
  mlbHr,
  mlbSb,
  mlbEra,
  nflPassing,
  nflRushing,
  nflReceiving,
}: {
  mlbHr: LeaderRow[]
  mlbSb: LeaderRow[]
  mlbEra: LeaderRow[]
  nflPassing: NFLLeaderEntry[]
  nflRushing: NFLLeaderEntry[]
  nflReceiving: NFLLeaderEntry[]
}) {
  const [sport, setSport] = useState<Sport>('mlb')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-[#FF5722]">§ Leaders</div>
        <div className="inline-flex gap-[2px] rounded-full border border-[#DEDACE] p-0.5">
          <button onClick={() => setSport('mlb')} className={`rounded-full text-[9px] font-bold uppercase px-2 py-0.5 transition-colors duration-200 ${sport === 'mlb' ? 'bg-[#FF5722] text-white' : 'text-[#8A8577]'}`}>MLB</button>
          <button onClick={() => setSport('nfl')} className={`rounded-full text-[9px] font-bold uppercase px-2 py-0.5 transition-colors duration-200 ${sport === 'nfl' ? 'bg-[#FF5722] text-white' : 'text-[#8A8577]'}`}>NFL</button>
        </div>
      </div>

      {sport === 'mlb' ? (
        <>
          <MlbBoard title="HR leaders" rows={mlbHr} />
          <MlbBoard title="SB leaders" rows={mlbSb} />
          <MlbBoard title="ERA leaders" rows={mlbEra} />
        </>
      ) : (
        <>
          <NflBoard title="Passing yards" rows={nflPassing} />
          <NflBoard title="Rushing yards" rows={nflRushing} />
          <NflBoard title="Receiving yards" rows={nflReceiving} />
        </>
      )}
    </div>
  )
}
