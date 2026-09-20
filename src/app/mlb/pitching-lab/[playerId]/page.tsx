'use client'

// src/app/mlb/pitching-lab/[playerId]/page.tsx — Overview tab.
//
// 2026-09-14 rebuild: no more inline PitchingTab/PitchLocationCard (hot
// zones live on the Location Lab tab now, sequencing/pitch predictor stay
// off Overview per instruction — their eventual home is the Sequencing
// tab). This tab is now: bio, percentile rankings, radar, career stats,
// year-on-year trend, vs-teammates comparison, and a league-wide
// "similar arsenal" finder. Every piece below reuses an existing,
// already-real component/route from the main /mlb/players/[id] page
// rather than re-deriving any of this data — see each fetch's comment
// for its real source.

import { useEffect, useState } from 'react'
import { SeasonStatsCard, PercentileRankingsCard } from '@/components/player/StatsPercentilesRail'
import PlayerRadarChart from '@/components/player/PlayerRadarChart'
import PlayerBioExportButton from '@/components/player/PlayerBioExportButton'
import BattingYearOnYear from '@/components/player/BattingYearOnYear'
import BioTab from '@/components/player/tabs/BioTab'
import CareerStats from '@/components/stats/CareerTable'
import TeammateComparison from '@/components/pitching-lab/TeammateComparison'
import SimilarPitchers from '@/components/pitching-lab/SimilarPitchers'
import { usePitchingLabData } from '@/lib/pitching-lab-context'
import { buildPitcherPercentileList, type StatcastPercentileRow } from '@/lib/player-signature'
import type { PitcherStatcastFull } from '@/lib/player-statcast-full'
import type { PlayerPageData } from '@/lib/player-page'
import type { PercentileStat } from '@/lib/pitcher-percentiles'
import type { CareerSeasonRow } from '@/lib/lab'
import { MLB_TEAMS } from '@/lib/teams'

const SEASON = new Date().getFullYear()

export default function PitcherOverviewPage() {
  const { data, failed } = usePitchingLabData()

  const [bio, setBio] = useState<PlayerPageData | null>(null)
  const [percentiles, setPercentiles] = useState<{ stats: PercentileStat[]; qualified: boolean } | null>(null)
  const [radarAxes, setRadarAxes] = useState<StatcastPercentileRow[]>([])
  const [careerSeasons, setCareerSeasons] = useState<CareerSeasonRow[]>([])

  const playerId = data?.id ?? null

  // Bio/draft/education/awards/transactions/yearByYear — real MLB Stats API,
  // same fetcher /mlb/players/[id] uses (src/lib/player-page.ts).
  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/mlb/pitcher-bio?playerId=${playerId}`).then(r => r.json()).then(json => { if (!cancelled && !json.error) setBio(json) }).catch(() => {})
    return () => { cancelled = true }
  }, [playerId])

  // Percentile strip — real pitcher_stats vs the qualified MLB pool.
  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/stats/pitcher-percentiles?playerId=${playerId}&season=${SEASON}`).then(r => r.json()).then(json => { if (!cancelled) setPercentiles(json) }).catch(() => {})
    return () => { cancelled = true }
  }, [playerId])

  // Radar — the FULL Statcast percentile list (xERA/xBA/xSLG/xwOBA/Fastball
  // Velo/Whiff%/K%/BB%/Barrel%/Hard-Hit%/GB%/Extension — up to 11 real
  // axes, all from player-statcast-full.ts's `ranks`), not just the
  // 3-dial "signature" subset /mlb/players/[id] shows elsewhere. Same
  // single fetch, richer read of it.
  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/player/statcast-full/${playerId}?type=pitcher`)
      .then(r => r.json())
      .then((p: PitcherStatcastFull) => {
        if (cancelled) return
        setRadarAxes(buildPitcherPercentileList(p.ranks ?? {}))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [playerId])

  // Career table — real yearByYear, same route /mlb/players/[id] uses.
  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/stats/career?playerId=${playerId}&subject=pitcher`).then(r => r.json()).then(json => { if (!cancelled) setCareerSeasons(json.seasons ?? []) }).catch(() => {})
    return () => { cancelled = true }
  }, [playerId])

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null || playerId === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  const identity = bio?.identity
  const teamId = MLB_TEAMS.find(t => t.abbrev === data.abbr)?.id ?? 0

  return (
    <div className="space-y-6">
      {/* Bio summary strip */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-center gap-x-8 gap-y-2">
        {identity ? (
          <>
            <BioChip label="Throws" value={identity.pitchHand === 'L' ? 'LHP' : identity.pitchHand === 'R' ? 'RHP' : '—'} />
            <BioChip label="Age" value={String(identity.currentAge || '—')} />
            <BioChip label="Height" value={identity.height || '—'} />
            <BioChip label="Weight" value={identity.weight ? `${identity.weight} lb` : '—'} />
            <BioChip label="No." value={identity.primaryNumber ? `#${identity.primaryNumber}` : '—'} />
            <BioChip label="Born" value={identity.birthCountry ?? '—'} />
            <BioChip label="MLB Debut" value={identity.mlbDebutDate ?? '—'} />
          </>
        ) : (
          <p className="text-[12px] font-mono text-stone-400">Loading bio…</p>
        )}
        {radarAxes.length > 0 && (
          <div className="ml-auto">
            <PlayerBioExportButton playerId={playerId} name={data.name} teamAbbr={data.abbr} teamId={teamId} teamColor={data.color} percentileRows={radarAxes} season={SEASON} />
          </div>
        )}
      </div>

      {/* Percentiles | Stats | Radar — 3 equal columns. Percentile rail is
          Savant-style (POOR→GREAT gradient + positioned badge), same
          visual language as the main stats page, fed by the same
          11-metric Statcast percentile list as the radar. Season stats
          reuse the pitcher_stats-based percentile fetch's already-
          formatted raw values. */}
      {radarAxes.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-5 items-start">
          <PercentileRankingsCard percentileRows={radarAxes} season={SEASON} />
          <SeasonStatsCard seasonStatRows={(percentiles?.stats ?? []).map(s => ({ key: s.key, label: s.label, value: s.value }))} />
          <PlayerRadarChart dials={[]} leaderboardPercentiles={radarAxes} color={data.color} />
        </div>
      )}

      {/* Vs teammates + similar arsenal */}
      <div className="grid lg:grid-cols-2 gap-5">
        <TeammateComparison pitcherId={playerId} teamId={identity?.currentTeam?.id ?? null} season={SEASON} />
        <SimilarPitchers pitcherId={playerId} season={SEASON} />
      </div>

      {/* Career stats */}
      {careerSeasons.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <CareerStats seasons={careerSeasons} subject="pitcher" playerId={playerId} />
        </div>
      )}

      {/* Year-on-year trend */}
      {bio && bio.yearByYearPitching.length > 0 && <BattingYearOnYear rows={bio.yearByYearPitching} isPitcher />}

      {/* Full bio: draft, personal, awards, transactions */}
      {bio && <BioTab data={bio} />}
    </div>
  )
}

function BioChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{label}</div>
      <div className="text-[13px] font-mono font-bold text-stone-900">{value}</div>
    </div>
  )
}
