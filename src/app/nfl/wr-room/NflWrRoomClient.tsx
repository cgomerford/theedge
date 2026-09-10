// src/app/nfl/wr-room/NflWrRoomClient.tsx

'use client'

import { useState, useEffect, useCallback } from 'react'
import NflWrWhosWho from '@/components/nfl/NflWrWhosWho'
import NflWrCushionSeparationChart from '@/components/nfl/NflWrCushionSeparationChart'
import NflWrBeeswarm from '@/components/nfl/NflWrBeeswarm'
import NflWrYacChart from '@/components/nfl/NflWrYacChart'
import NflWrDepthSeparationScatter from '@/components/nfl/NflWrDepthSeparationScatter'
import NflWrWeeklyHeatmap from '@/components/nfl/NflWrWeeklyHeatmap'
import NflWrRotatingLeaderboard from '@/components/nfl/NflWrRotatingLeaderboard'
import NflRadarCycler from '@/components/nfl/NflRadarCycler'
import { NflQbCoverageChart, NflQbPressureChart } from '@/components/nfl/NflQbCoveragePressureFormation'
import type {
  WrNgsSeasonProfile, WrNgsWeeklyPoint, WrWeeklyGridRow,
  WrRadarProfile, FantasyProjectionRow, QbCoverageSplit, QbPressureSplit,
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

export default function NflWrRoomClient({
  statsSeason, profiles, defaultWr, defaultWeekly, weeklyGrid,
  defaultRadar, fantasyProjections, defaultCoverage, defaultPressure,
}: {
  statsSeason: number
  profiles: WrNgsSeasonProfile[]
  defaultWr: WrNgsSeasonProfile | null
  defaultWeekly: WrNgsWeeklyPoint[]
  weeklyGrid: WrWeeklyGridRow[]
  defaultRadar: WrRadarProfile | null
  fantasyProjections: FantasyProjectionRow[]
  defaultCoverage: QbCoverageSplit[]
  defaultPressure: QbPressureSplit[]
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [featuredWr, setFeaturedWr] = useState<{ id: string; name: string } | null>(
    defaultWr ? { id: defaultWr.playerId, name: defaultWr.playerName } : null,
  )
  const [weekly, setWeekly] = useState<WrNgsWeeklyPoint[]>(defaultWeekly)
  const [radar, setRadar] = useState<WrRadarProfile | null>(defaultRadar)
  const [coverage, setCoverage] = useState<QbCoverageSplit[]>(defaultCoverage)
  const [pressure, setPressure] = useState<QbPressureSplit[]>(defaultPressure)
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

  const selectWr = useCallback(async (id: string, name: string) => {
    setFeaturedWr({ id, name })
    setQuery(''); setResults([]); setLoadingDeepDive(true)
    try {
      const res = await fetch(`/api/nfl/wr-room/deep-dive?playerId=${encodeURIComponent(id)}&season=${statsSeason}`)
      const json = await res.json()
      setWeekly(json.weekly ?? []); setRadar(json.radar ?? null)
      setCoverage(json.coverage ?? []); setPressure(json.pressure ?? [])
    } catch {
      setWeekly([]); setRadar(null); setCoverage([]); setPressure([])
    } finally {
      setLoadingDeepDive(false)
    }
  }, [statsSeason])

  return (
    <main style={{ maxWidth: 1600, margin: '0 auto', background: '#F4F0E8', color: '#1A1A1A', fontFamily: 'Inter, system-ui, sans-serif', padding: '24px 24px 60px' }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF5722', letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0 }}>
        § The Edge · NFL {statsSeason}
      </p>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, margin: '4px 0 8px', color: '#1A1A1A' }}>WR Room</h1>
      <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: '#78716C', maxWidth: 620, marginBottom: 28 }}>
        Every qualified receiver this season, ranked by target depth, separation, and what they do
        after the catch — pulled from real Next Gen Stats tracking data.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 28, alignItems: 'start' }}>
        <div>
          <div style={{ marginBottom: 28 }}><NflWrWhosWho profiles={profiles} /></div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28, alignItems: 'start' }}>
            <Cube title="Cushion vs Separation" explainer="Grey dot is space given at the snap. Colored dot (team color) is space created by the catch point.">
              <NflWrCushionSeparationChart profiles={profiles} />
            </Cube>
            <Cube title="League Distribution" explainer="Every qualified WR's average target depth, plotted on one line.">
              <NflWrBeeswarm profiles={profiles} />
            </Cube>
            <Cube title="YAC vs Expected" explainer="Positive = creates more yards after catch than expected. Negative = goes down at first contact more than expected.">
              <NflWrYacChart profiles={profiles} />
            </Cube>
            <Cube title="Depth vs Separation" explainer="X: how deep they're targeted. Y: separation created. Bottom-right is the hardest role in football.">
              <NflWrDepthSeparationScatter profiles={profiles} />
            </Cube>
          </div>

          <div style={{ marginBottom: 28 }}>
            <Cube title="Weekly Separation, Every Qualified WR" explainer="Darker cell = more separation that week. Read across a row to see if it's a habit or a streak.">
              <NflWrWeeklyHeatmap rows={weeklyGrid} />
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
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a WR…" style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(26,26,26,0.15)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, boxSizing: 'border-box' }} />
              {results.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid rgba(26,26,26,0.15)', maxHeight: 220, overflowY: 'auto' }}>
                  {results.map((r) => (
                    <button key={r.id} onClick={() => selectWr(r.id, r.label)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: "'Fraunces', serif", fontSize: 13 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
                  <Cube title={`vs Coverage — ${featuredWr?.name ?? '—'}`} explainer="EPA per target against each coverage shell they actually faced this season.">
                    <NflQbCoverageChart splits={coverage} />
                  </Cube>
                  <Cube title={`Pressure Response — ${featuredWr?.name ?? '—'}`} explainer="Production when their QB is pressured vs a clean pocket.">
                    <NflQbPressureChart splits={pressure} />
                  </Cube>
                </div>

                {radar && (
                  <Cube title={`Full Profile — ${featuredWr?.name ?? '—'}`} explainer="Every core efficiency metric as a percentile against this season's qualified field.">
                    <NflRadarCycler
                      title={`${featuredWr?.name ?? ''} — Percentile Profile`}
                      entries={[{ name: featuredWr?.name ?? '', volumeLabel: `${radar.targets} tgt`, axes: radar.axes }]}
                    />
                  </Cube>
                )}
              </div>
            )}
          </div>
        </div>

        <NflWrRotatingLeaderboard profiles={profiles} />
      </div>
    </main>
  )
}
