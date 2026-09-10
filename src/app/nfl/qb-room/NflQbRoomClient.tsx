// src/app/nfl/qb-room/NflQbRoomClient.tsx
// FULL REPLACEMENT

'use client'

import { useState, useEffect, useCallback } from 'react'
import NflQbWhosWho from '@/components/nfl/NflQbWhosWho'
import NflQbDumbbellChart from '@/components/nfl/NflQbDumbbellChart'
import NflQbAirToSticksChart from '@/components/nfl/NflQbAirToSticksChart'
import NflQbWeeklyRibbon from '@/components/nfl/NflQbWeeklyRibbon'
import NflQbZoneGrid from '@/components/nfl/NflQbZoneGrid'
import NflQbWeeklyHeatmap from '@/components/nfl/NflQbWeeklyHeatmap'
import NflQbBeeswarm from '@/components/nfl/NflQbBeeswarm'
import NflQbAggressivenessScatter from '@/components/nfl/NflQbAggressivenessScatter'
import NflRadarCycler from '@/components/nfl/NflRadarCycler'
import NflQbRotatingLeaderboard from '@/components/nfl/NflQbRotatingLeaderboard'
import { NflQbCoverageChart, NflQbPressureChart, NflQbFormationChart } from '@/components/nfl/NflQbCoveragePressureFormation'
import type {
  QbNgsSeasonProfile, QbNgsWeeklyPoint, QbWeeklyGridRow,
  QbZoneProfile, ZoneLeagueAverage, QbRadarProfile, FantasyProjectionRow,
  QbCoverageSplit, QbPressureSplit, QbFormationSplit,
} from '@/lib/nfl/queries'

type SearchResult = { type: 'player' | 'team'; id: string; label: string; sublabel: string; imageUrl: string | null; href: string }

function Cube({ title, explainer, children }: { title: string; explainer: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, margin: '0 0 4px' }}>{title}</h2>
      <p style={{ fontFamily: "'Fraunces', serif", fontSize: 12, fontStyle: 'italic', color: '#78716C', margin: '0 0 10px', lineHeight: 1.4 }}>{explainer}</p>
      {children}
    </div>
  )
}

export default function NflQbRoomClient({
  statsSeason, profiles, defaultQb, defaultWeekly, weeklyGrid,
  defaultZoneProfile, zoneLeagueAvg, defaultRadar, fantasyProjections,
  defaultCoverage, defaultPressure, defaultFormation,
}: {
  statsSeason: number
  profiles: QbNgsSeasonProfile[]
  defaultQb: QbNgsSeasonProfile | null
  defaultWeekly: QbNgsWeeklyPoint[]
  weeklyGrid: QbWeeklyGridRow[]
  defaultZoneProfile: QbZoneProfile | null
  zoneLeagueAvg: ZoneLeagueAverage[]
  defaultRadar: QbRadarProfile | null
  fantasyProjections: FantasyProjectionRow[]
  defaultCoverage: QbCoverageSplit[]
  defaultPressure: QbPressureSplit[]
  defaultFormation: QbFormationSplit[]
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [featuredQb, setFeaturedQb] = useState<{ id: string; name: string } | null>(
    defaultQb ? { id: defaultQb.playerId, name: defaultQb.playerName } : null,
  )
  const [weekly, setWeekly] = useState<QbNgsWeeklyPoint[]>(defaultWeekly)
  const [zoneProfile, setZoneProfile] = useState<QbZoneProfile | null>(defaultZoneProfile)
  const [radar, setRadar] = useState<QbRadarProfile | null>(defaultRadar)
  const [coverage, setCoverage] = useState<QbCoverageSplit[]>(defaultCoverage)
  const [pressure, setPressure] = useState<QbPressureSplit[]>(defaultPressure)
  const [formation, setFormation] = useState<QbFormationSplit[]>(defaultFormation)
  const [loadingDeepDive, setLoadingDeepDive] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nfl/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setResults((json.results ?? json ?? []).filter((r: SearchResult) => r.type === 'player'))
      } catch { setResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const selectQb = useCallback(async (id: string, name: string) => {
    setFeaturedQb({ id, name })
    setQuery(''); setResults([]); setLoadingDeepDive(true)
    try {
      const res = await fetch(`/api/nfl/qb-room/deep-dive?playerId=${encodeURIComponent(id)}&season=${statsSeason}`)
      const json = await res.json()
      setWeekly(json.weekly ?? []); setZoneProfile(json.zoneProfile ?? null); setRadar(json.radar ?? null)
      setCoverage(json.coverage ?? []); setPressure(json.pressure ?? []); setFormation(json.formation ?? [])
    } catch {
      setWeekly([]); setZoneProfile(null); setRadar(null); setCoverage([]); setPressure([]); setFormation([])
    } finally {
      setLoadingDeepDive(false)
    }
  }, [statsSeason])

  const dumbbellRows = profiles.map((p) => ({
    playerId: p.playerId, playerName: p.playerName, teamId: p.teamId,
    intended: p.avgIntendedAirYards, completed: p.avgCompletedAirYards, profile: p,
  }))

  return (
    <main style={{ maxWidth: 1600, margin: '0 auto', background: '#F4F0E8', color: '#1A1A1A', fontFamily: 'Inter, system-ui, sans-serif', padding: '24px 24px 60px' }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF5722', letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0 }}>
        § The Edge · NFL {statsSeason}
      </p>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, margin: '4px 0 8px', color: '#1A1A1A' }}>QB Room</h1>
      <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: '#78716C', maxWidth: 620, marginBottom: 28 }}>
        Every qualified passer this season, ranked by how far they actually throw versus how far
        those throws land — pulled from real Next Gen Stats and play-level charting data.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 28, alignItems: 'start' }}>
        <div>
          <div style={{ marginBottom: 28 }}>
            <NflQbWhosWho profiles={profiles} />
          </div>

           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28, alignItems: 'start' }}>
            <Cube title="Intended vs Completed" explainer="Navy dot is how far they aim. Colored dot (team color) is how far it actually lands.">
              <NflQbDumbbellChart rows={dumbbellRows} />
            </Cube>
            <Cube title="League Distribution" explainer="Every qualified QB's average depth of target, plotted on one line.">
              <NflQbBeeswarm profiles={profiles} />
            </Cube>
            <Cube title="Past the Sticks, or YAC?" explainer="Positive = average attempt clears the first-down marker. Negative = scheme leans on yards after catch.">
              <NflQbAirToSticksChart profiles={profiles} />
            </Cube>
            <Cube title="Depth vs Difficulty" explainer="X: how deep they aim. Y: how often into tight coverage. Top-right is the hardest throw profile in football.">
              <NflQbAggressivenessScatter profiles={profiles} />
            </Cube>
          </div>

          <div style={{ marginBottom: 28 }}>
            <Cube title="Weekly Intended Air Yards, Every Qualified QB" explainer="Darker cell = deeper average throw that week. Read across a row to see if depth is a habit or a streak.">
              <NflQbWeeklyHeatmap rows={weeklyGrid} />
            </Cube>
          </div>

          {fantasyProjections.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <Cube title="Fantasy Projections, This Week" explainer="Forward-looking projections for the upcoming week's slate.">
                <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 20 }}>
                  {fantasyProjections.map((f, i) => (
                    <div key={f.gsisId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(26,26,26,0.06)' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: i === 0 ? '#FF5722' : '#D4D0C8', width: 20 }}>{i + 1}</span>
                      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, flex: 1 }}>
                        {f.fullName} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 400, color: '#78716C' }}>· {f.teamId}{f.opponentTeam ? ` vs ${f.opponentTeam}` : ''}</span>
                      </span>
                      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 700, color: i === 0 ? '#FF5722' : '#1A1A1A' }}>{f.statValue.toFixed(1)} pts</span>
                    </div>
                  ))}
                </div>
              </Cube>
            </div>
          )}

          <div style={{ borderTop: '2px solid rgba(26,26,26,0.08)', paddingTop: 24 }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, margin: '0 0 8px' }}>Player Deep Dive</h2>
            <div style={{ position: 'relative', maxWidth: 320, marginBottom: 20 }}>
              <input
                value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a QB…"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(26,26,26,0.15)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, boxSizing: 'border-box' }}
              />
              {results.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid rgba(26,26,26,0.15)', maxHeight: 220, overflowY: 'auto' }}>
                  {results.map((r) => (
                    <button key={r.id} onClick={() => selectQb(r.id, r.label)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: "'Fraunces', serif", fontSize: 13 }}>
                      {r.label} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3' }}>· {r.sublabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loadingDeepDive ? (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A3A3A3', padding: 28, textAlign: 'center' }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <NflQbWeeklyRibbon weekly={weekly} playerName={featuredQb?.name ?? '—'} season={statsSeason} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <Cube title={`Zone Accuracy — ${featuredQb?.name ?? '—'}`} explainer="Comp% and CPOE for each of 6 field zones (left/middle/right x short/deep).">
                    <NflQbZoneGrid profile={zoneProfile} leagueAvg={zoneLeagueAvg} />
                  </Cube>
                  <Cube title={`vs Coverage — ${featuredQb?.name ?? '—'}`} explainer="EPA per attempt against each coverage shell they actually faced this season.">
                    <NflQbCoverageChart splits={coverage} />
                  </Cube>
                  <Cube title={`Pressure Response — ${featuredQb?.name ?? '—'}`} explainer="How much worse (or better) when the pocket collapses.">
                    <NflQbPressureChart splits={pressure} />
                  </Cube>
                  <Cube title={`Formation Rate — ${featuredQb?.name ?? '—'}`} explainer="Shotgun vs under center vs pistol, by snap share.">
                    <NflQbFormationChart splits={formation} />
                  </Cube>
                </div>

                {radar && (
                  <Cube title={`Full Profile — ${featuredQb?.name ?? '—'}`} explainer="Every core efficiency metric as a percentile against this season's qualified field.">
                    <NflRadarCycler
                      title={`${featuredQb?.name ?? ''} — Percentile Profile`}
                      entries={[{ name: featuredQb?.name ?? '', volumeLabel: `${radar.attempts} att`, axes: radar.axes }]}
                    />
                  </Cube>
                )}
              </div>
            )}
          </div>
        </div>

        <NflQbRotatingLeaderboard profiles={profiles} />
      </div>
    </main>
  )
}