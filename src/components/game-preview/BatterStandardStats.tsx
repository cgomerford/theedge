// src/components/game-preview/BatterStandardStats.tsx
//
// "Standard Stats" modal content for a batter: season line (free, already
// on the lineup object), recent-form streak (free, already fetched once
// per team), then park record / vs-pitcher / situational splits fetched
// on demand from /api/mlb/player-extra-stats the moment this mounts —
// see that route's own header comment for why those three aren't
// pre-fetched for the whole lineup up front.

'use client'

import { useEffect, useState } from 'react'
import type { LineupBatter } from '@/lib/lineups'
import type { BatterStreak } from '@/lib/streaks'

type ExtraStats = {
  parkRecord: { venue: string; games: number; avg: string; obp: string; slg: string; ops: string } | null
  vsPitcher: { avg: string; obp: string; slg: string; ops: string; ab: number; hits: number; home_runs: number; strikeouts: number; walks: number } | null
  risp: { avg?: string; obp?: string; ops?: string; plateAppearances?: number } | null
  basesLoaded: { avg?: string; obp?: string; ops?: string; plateAppearances?: number } | null
}

function fmt(v: string | number | undefined | null): string {
  if (v == null || v === '.---') return '—'
  return String(v)
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
      <span className="text-[11px] text-stone-500">{label}</span>
      <span className="text-[12px] font-mono font-bold text-stone-900">{value}</span>
    </div>
  )
}

export default function BatterStandardStats({
  batter, streak, venueName, opposingPitcherId, opposingPitcherName, season,
}: {
  batter: LineupBatter
  streak: BatterStreak | null
  venueName: string
  opposingPitcherId: number | null
  opposingPitcherName: string | null
  season: number
}) {
  // Initial state is already 'loading' — this component only ever mounts
  // fresh per batter (the modal that hosts it unmounts on close), so
  // there's no stale-previous-batter case that needs an explicit reset.
  const [extra, setExtra] = useState<ExtraStats | 'loading' | 'error'>('loading')

  useEffect(() => {
    const params = new URLSearchParams({ type: 'batter', playerId: String(batter.player_id), season: String(season), venueName })
    if (opposingPitcherId) params.set('opposingPitcherId', String(opposingPitcherId))
    fetch(`/api/mlb/player-extra-stats?${params.toString()}`)
      .then(r => r.json())
      .then(json => setExtra(json))
      .catch(() => setExtra('error'))
  }, [batter.player_id, venueName, opposingPitcherId, season])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">{season} season</p>
        <div className="grid grid-cols-2 gap-x-4">
          <StatRow label="AVG" value={fmt(batter.season_avg?.toFixed(3))} />
          <StatRow label="OBP" value={fmt(batter.season_obp?.toFixed(3))} />
          <StatRow label="SLG" value={fmt(batter.season_slg?.toFixed(3))} />
          <StatRow label="OPS" value={fmt(batter.season_ops?.toFixed(3))} />
          <StatRow label="RBI" value={fmt(batter.season_rbi)} />
        </div>
      </div>

      {streak && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Recent form</p>
          <p className="text-xs text-stone-700 mb-1">
            {streak.streak_label ?? (streak.is_hot ? 'Hitting well lately' : streak.is_cold ? 'Cold stretch' : 'Steady')}
          </p>
          <div className="grid grid-cols-2 gap-x-4">
            <StatRow label="AVG (L5)" value={fmt(streak.last_5_avg?.toFixed(3))} />
            <StatRow label="Hits (L10)" value={fmt(streak.hits_last_10)} />
          </div>
        </div>
      )}

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Record at this park</p>
        {extra === 'loading' ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">Loading…</p>
        ) : extra === 'error' || !extra.parkRecord ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">No record on file at this venue yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4">
            <StatRow label="Games" value={fmt(extra.parkRecord.games)} />
            <StatRow label="AVG" value={fmt(extra.parkRecord.avg)} />
            <StatRow label="OBP" value={fmt(extra.parkRecord.obp)} />
            <StatRow label="SLG" value={fmt(extra.parkRecord.slg)} />
          </div>
        )}
      </div>

      {opposingPitcherId != null && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">vs {opposingPitcherName ?? "tonight's starter"}</p>
          {extra === 'loading' ? (
            <p className="text-xs font-sans italic text-stone-400 py-2">Loading…</p>
          ) : extra === 'error' || !extra.vsPitcher ? (
            <p className="text-xs font-sans italic text-stone-400 py-2">No head-to-head history on record.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4">
              <StatRow label="AB" value={fmt(extra.vsPitcher.ab)} />
              <StatRow label="Hits" value={fmt(extra.vsPitcher.hits)} />
              <StatRow label="AVG" value={fmt(extra.vsPitcher.avg)} />
              <StatRow label="OPS" value={fmt(extra.vsPitcher.ops)} />
              <StatRow label="HR" value={fmt(extra.vsPitcher.home_runs)} />
              <StatRow label="K" value={fmt(extra.vsPitcher.strikeouts)} />
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Situational — {season} season</p>
        <p className="text-[10px] text-stone-400 font-sans italic mb-2">
          MLB&apos;s own splits only break out runners-in-scoring-position (2nd/3rd combined) and bases loaded — not each individual base state, and not a career view.
        </p>
        {extra === 'loading' ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">Loading…</p>
        ) : extra === 'error' ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">Couldn&apos;t load situational splits right now.</p>
        ) : (
          <>
            <p className="text-[10px] font-mono uppercase text-stone-500 mt-2 mb-1">
              Runners in scoring position <span className="text-stone-400 normal-case">— {fmt(extra.risp?.plateAppearances)} PA this season</span>
            </p>
            <div className="grid grid-cols-2 gap-x-4">
              <StatRow label="AVG" value={fmt(extra.risp?.avg)} />
              <StatRow label="OPS" value={fmt(extra.risp?.ops)} />
            </div>
            <p className="text-[10px] font-mono uppercase text-stone-500 mt-3 mb-1">
              Bases loaded <span className="text-stone-400 normal-case">— {fmt(extra.basesLoaded?.plateAppearances)} PA this season</span>
            </p>
            <div className="grid grid-cols-2 gap-x-4">
              <StatRow label="AVG" value={fmt(extra.basesLoaded?.avg)} />
              <StatRow label="OPS" value={fmt(extra.basesLoaded?.ops)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
