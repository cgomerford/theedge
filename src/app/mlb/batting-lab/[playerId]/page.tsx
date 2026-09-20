'use client'

// src/app/mlb/batting-lab/[playerId]/page.tsx — Batting Lab Overview
//
// Real season stats + real percentiles (vs every qualified hitter this
// season, same leaderboard-rank method /api/lab/batter-card uses) +
// radar, plus a real bat-speed/contact-quality panel (bat speed, exit
// velo, xwOBA-minus-wOBA "loud outs" signal, and the real per-pitch-type
// miss-distance breakdown on his own swinging strikes) — same real
// per-pitch Statcast source pitcher-statcast-profile.ts uses, seen from
// the batter's side.

import { useEffect, useState } from 'react'
import { useBattingLabData } from '@/lib/batting-lab-context'
import { SeasonStatsCard, PercentileRankingsCard } from '@/components/player/StatsPercentilesRail'
import PlayerRadarChart from '@/components/player/PlayerRadarChart'
import PlayerBioExportButton from '@/components/player/PlayerBioExportButton'
import CareerStats from '@/components/stats/CareerTable'
import { MLB_TEAMS } from '@/lib/teams'
import type { CareerSeasonRow } from '@/lib/lab'

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}
function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:213:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}
function age(birthDate: string | null): number | null {
  if (!birthDate) return null
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000))
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BattingLabOverview() {
  const { data, failed } = useBattingLabData()
  const [careerSeasons, setCareerSeasons] = useState<CareerSeasonRow[]>([])

  useEffect(() => {
    if (!data) return
    let cancelled = false
    fetch(`/api/stats/career?playerId=${data.id}&subject=batter`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setCareerSeasons(json.seasons ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [data])

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  const { batSpeed, bio } = data
  const teamId = MLB_TEAMS.find(t => t.abbrev === data.abbr)?.id ?? 0

  return (
    <div className="space-y-6">
      {/* Back-of-the-card bio strip — real MLB identity fields */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex items-center gap-5 flex-wrap">
        <img src={mlbHeadshot(data.id)} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${data.color}` }} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 flex-1">
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Age</div><div className="text-[13px] font-mono font-bold text-stone-900">{bio.age ?? age(bio.birthDate) ?? '—'}</div></div>
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Bats</div><div className="text-[13px] font-mono font-bold text-stone-900">{bio.bats ?? '—'}</div></div>
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Height / Weight</div><div className="text-[13px] font-mono font-bold text-stone-900">{bio.height ?? '—'} · {bio.weight ?? '—'} lb</div></div>
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Position</div><div className="text-[13px] font-mono font-bold text-stone-900">{bio.position ?? '—'}</div></div>
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Born</div><div className="text-[13px] font-mono font-bold text-stone-900">{fmtDate(bio.birthDate)}</div></div>
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Birthplace</div><div className="text-[13px] font-mono font-bold text-stone-900">{bio.birthCountry ?? '—'}</div></div>
          <div className="col-span-2"><div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">MLB Debut</div><div className="text-[13px] font-mono font-bold text-stone-900">{fmtDate(bio.mlbDebutDate)}</div></div>
        </div>
        <div className="ml-auto">
          <PlayerBioExportButton playerId={data.id} name={data.name} teamAbbr={data.abbr} teamId={teamId} teamColor={data.color} percentileRows={data.percentileRows} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <PercentileRankingsCard percentileRows={data.percentileRows} />
        <SeasonStatsCard seasonStatRows={data.seasonStatRows} />
        <PlayerRadarChart dials={[]} leaderboardPercentiles={data.percentileRows} color={data.color} />
      </div>

      {careerSeasons.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <CareerStats seasons={careerSeasons} subject="batter" playerId={data.id} />
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Bat speed &amp; contact quality</p>
        <p className="text-[10px] font-mono text-stone-400 mb-4">Real per-swing Statcast fields — bat speed, exit velo, and whether the results match the contact quality.</p>

        {batSpeed === null ? (
          <p className="text-[12px] font-serif italic text-stone-400 text-center py-6">No bat-speed data on record yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div>
                <div className="text-[9px] font-mono text-stone-400">Avg bat speed</div>
                <div className="text-[20px] font-black text-stone-900">{batSpeed.avgBatSpeed != null ? `${batSpeed.avgBatSpeed.toFixed(1)}` : '—'}<span className="text-[11px] font-mono text-stone-400 ml-1">mph</span></div>
              </div>
              <div>
                <div className="text-[9px] font-mono text-stone-400">Avg exit velo</div>
                <div className="text-[20px] font-black text-stone-900">{batSpeed.avgExitVelo != null ? `${batSpeed.avgExitVelo.toFixed(1)}` : '—'}<span className="text-[11px] font-mono text-stone-400 ml-1">mph</span></div>
              </div>
              <div>
                <div className="text-[9px] font-mono text-stone-400">xwOBA</div>
                <div className="text-[20px] font-black text-stone-900">{fmtRate(batSpeed.avgXwoba)}</div>
              </div>
              <div>
                <div className="text-[9px] font-mono text-stone-400">xwOBA − wOBA</div>
                <div className="text-[20px] font-black" style={{ color: (batSpeed.xwobaMinusWoba ?? 0) > 0 ? '#059669' : '#DC2626' }}>
                  {batSpeed.xwobaMinusWoba != null ? (batSpeed.xwobaMinusWoba > 0 ? '+' : '') + fmtRate(batSpeed.xwobaMinusWoba) : '—'}
                </div>
              </div>
            </div>
            <p className="text-[9px] font-mono text-stone-400 mb-3">Positive xwOBA − wOBA means the contact quality says he should be producing more than the results show — &quot;loud outs.&quot; Negative means results are outrunning the quality of contact.</p>

            {batSpeed.missByPitchSeason.length > 0 && (
              <div className="pt-4 border-t border-stone-100">
                <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">Miss distance by pitch type — real, on his own swinging strikes</p>
                <div className="space-y-1.5">
                  {batSpeed.missByPitchSeason.slice(0, 6).map(m => (
                    <div key={m.pitchType} className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="w-28 shrink-0 text-stone-700 font-bold truncate">{m.pitchName}</span>
                      <span className="text-stone-400">n={m.whiffs}</span>
                      <span className="ml-auto text-stone-600">{m.avgMissDistanceIn != null ? `${m.avgMissDistanceIn.toFixed(1)}in miss` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
