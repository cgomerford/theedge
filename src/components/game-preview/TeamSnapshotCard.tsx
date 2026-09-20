// src/components/game-preview/TeamSnapshotCard.tsx
//
// Small team-level card above the Starting Pitcher card — real season
// record + standard season stats (AVG/OBP/SLG/OPS, RBI, ERA/WHIP) and
// this team's real record at tonight's specific venue (see
// lib/team-season-stats.ts's own header comment for why these come from
// MLB's own /teams/stats + /schedule endpoints rather than the
// Statcast-only team_stats Supabase table). A short line + the same
// pro-gated funnel pattern as LabFunnelLink elsewhere on this page —
// except this one points at the Scout Report instead of a Lab page, per
// George.

import LabFunnelLink from './LabFunnelLink'
import type { TeamSeasonStats, TeamVenueRecord } from '@/lib/team-season-stats'

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-stone-50 last:border-0">
      <span className="text-[10.5px] text-stone-500">{label}</span>
      <span className="text-[11.5px] font-mono font-bold text-stone-900">{value}</span>
    </div>
  )
}

export default function TeamSnapshotCard({
  teamName, teamAbbr, record, season, venueName, seasonStats, venueRecord, slug, isPro,
}: {
  teamName: string
  teamAbbr: string
  record?: { wins: number; losses: number }
  season: number
  venueName: string
  seasonStats: TeamSeasonStats | null
  venueRecord: TeamVenueRecord | null
  slug: string
  isPro: boolean
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">Team Snapshot</p>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-sans font-semibold text-stone-900">{teamName}</span>
        {record && (
          <span className="text-[11px] font-mono text-stone-500">{record.wins}-{record.losses}</span>
        )}
      </div>

      {seasonStats ? (
        <div className="grid grid-cols-2 gap-x-3 mb-3">
          <StatRow label="AVG" value={seasonStats.avg} />
          <StatRow label="OPS" value={seasonStats.ops} />
          <StatRow label="RBI" value={String(seasonStats.rbi)} />
          <StatRow label="HR" value={String(seasonStats.homeRuns)} />
          <StatRow label="ERA" value={seasonStats.era} />
          <StatRow label="WHIP" value={seasonStats.whip} />
        </div>
      ) : (
        <p className="text-[10.5px] text-stone-400 font-sans italic mb-3">Season stats unavailable.</p>
      )}

      {/* Freemium extension of the free grid above — same stats depth
          the Scout Report goes into, previewed here so there's a reason
          to unlock without leaving the game preview. */}
      {seasonStats && (
        isPro ? (
          <div className="mb-3 pt-3 border-t border-stone-100">
            <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-1">More this season</p>
            <div className="grid grid-cols-2 gap-x-3">
              <StatRow label="OBP" value={seasonStats.obp} />
              <StatRow label="SLG" value={seasonStats.slg} />
              <StatRow label="Runs" value={String(seasonStats.runs)} />
              <StatRow label="SB" value={String(seasonStats.stolenBases)} />
              <StatRow label="BB / K" value={`${seasonStats.walks} / ${seasonStats.strikeOuts}`} />
              <StatRow label="W-L (SV)" value={`${seasonStats.wins}-${seasonStats.losses} (${seasonStats.saves})`} />
            </div>
          </div>
        ) : (
          <div className="mb-3 pt-3 border-t border-stone-100">
            <div className="flex items-center justify-between gap-3 bg-stone-900 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-0.5">⊕ More season stats</p>
                <p className="text-[10px] text-stone-300">OBP · SLG · Runs · SB · BB/K · W-L</p>
              </div>
              <a href="/pricing" className="shrink-0 text-[9.5px] font-bold px-2.5 py-1.5 bg-amber-300 text-stone-900 rounded whitespace-nowrap">Unlock →</a>
            </div>
          </div>
        )
      )}

      <div className="mb-3">
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-1">At {venueName || 'this park'}</p>
        {venueRecord ? (
          <p className="text-[11.5px] font-mono font-bold text-stone-900">
            {venueRecord.wins}-{venueRecord.losses} <span className="text-stone-400 font-normal">({venueRecord.games} GP, {season})</span>
          </p>
        ) : (
          <p className="text-[10.5px] text-stone-400 font-sans italic">No record here yet this season.</p>
        )}
      </div>

      <p className="text-[10.5px] text-stone-500 leading-snug mb-3">
        Full team trends, bullpen usage, injuries &amp; transactions are in the Scout Report.
      </p>
      <LabFunnelLink href={`/mlb/${slug}/scout-report`} label={`${teamAbbr} in the Scout Report`} isPro={isPro} />
    </div>
  )
}
