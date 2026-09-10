// src/app/nfl/defensive-coordinator/NflDefCoordinatorClient.tsx
// FULL REPLACEMENT

'use client'

import { useState, useCallback } from 'react'
import NflCoverageDiagram, { type CoverageKey } from '@/components/nfl/diagrams/NflCoverageDiagram'
import NflInfoButton, { EPA_EXPLAINER, SUSCEPTIBLE_EXPLAINER, COVERAGE_EXPLAINERS } from '@/components/nfl/NflInfoButton'
import type { DefCoordinatorTeamRow, TeamCoverageBreakdown } from '@/lib/nfl/queries'

export default function NflDefCoordinatorClient({ statsSeason, teams }: { statsSeason: number; teams: DefCoordinatorTeamRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [breakdown, setBreakdown] = useState<TeamCoverageBreakdown | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedCoverage, setSelectedCoverage] = useState<CoverageKey | null>(null)

  const toggle = useCallback(async (teamId: string, topCoverage: string) => {
    if (expanded === teamId) { setExpanded(null); return }
    setExpanded(teamId)
    setLoading(true)
    setSelectedCoverage(topCoverage as CoverageKey)
    try {
      const res = await fetch(`/api/nfl/defensive-coordinator/team?teamId=${teamId}&season=${statsSeason}`)
      const json = await res.json()
      setBreakdown(json.breakdown ?? null)
    } catch {
      setBreakdown(null)
    } finally {
      setLoading(false)
    }
  }, [expanded, statsSeason])

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', background: '#F4F0E8', color: '#1A1A1A', fontFamily: 'Inter, system-ui, sans-serif', padding: '24px 24px 60px' }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF5722', letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0 }}>
        § The Edge · NFL {statsSeason}
      </p>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, margin: '4px 0 8px', color: '#1A1A1A' }}>Defensive Coordinator</h1>
      <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: '#78716C', maxWidth: 620, marginBottom: 8 }}>
        Every team's go-to coverage shell, and the coverage that's actually hurt them most. Click a team, then click any coverage to see its diagram.
      </p>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#78716C', marginBottom: 28 }}>
        What's EPA? <NflInfoButton text={EPA_EXPLAINER} label="EPA" /> &nbsp;·&nbsp; What does "susceptible" mean? <NflInfoButton text={SUSCEPTIBLE_EXPLAINER} label="Susceptible" />
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {teams.map((t) => {
          const accent = t.teamColor ?? '#FF5722'
          return (
            <div key={t.teamId} style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
              <button onClick={() => toggle(t.teamId, t.topCoverage)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                {t.logoUrl ? <img src={t.logoUrl} width={32} height={32} style={{ objectFit: 'contain', flexShrink: 0 }} alt="" /> : <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0EBE0', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15, color: '#1A1A1A' }}>{t.teamId}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C' }}>{t.topCoverage} · {t.topCoveragePct.toFixed(0)}%</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: accent, fontWeight: 700 }}>
                    Weak vs {t.mostSusceptibleCoverage} ({t.mostSusceptibleEpa >= 0 ? '+' : ''}{t.mostSusceptibleEpa.toFixed(2)} EPA)
                    <NflInfoButton text={COVERAGE_EXPLAINERS[t.mostSusceptibleCoverage] ?? SUSCEPTIBLE_EXPLAINER} label={t.mostSusceptibleCoverage} />
                  </div>
                </div>
              </button>

              {expanded === t.teamId && (
                <div style={{ padding: '0 16px 16px' }}>
                  {loading ? (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A3A3A3', padding: 20, textAlign: 'center' }}>Loading…</div>
                  ) : breakdown ? (
                    <>
                      {selectedCoverage && <NflCoverageDiagram coverage={selectedCoverage} />}
                      <div style={{ display: 'flex', gap: 12, marginTop: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1, textAlign: 'center', background: '#F4F0E8', padding: 8 }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#78716C' }}>MAN</div>
                          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>{breakdown.manPct.toFixed(0)}%</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center', background: '#F4F0E8', padding: 8 }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#78716C' }}>ZONE</div>
                          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>{breakdown.zonePct.toFixed(0)}%</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center', background: '#F4F0E8', padding: 8 }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#78716C' }}>BLITZ</div>
                          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>{breakdown.blitzRate.toFixed(0)}%</div>
                        </div>
                      </div>
                      {breakdown.coverages.map((c) => (
                        <button
                          key={c.label}
                          onClick={() => setSelectedCoverage(c.label as CoverageKey)}
                          style={{ display: 'block', width: '100%', marginBottom: 6, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, marginBottom: 2, color: selectedCoverage === c.label ? accent : '#1A1A1A', fontWeight: selectedCoverage === c.label ? 700 : 400 }}>
                            <span onClick={(e) => e.stopPropagation()}>
                              {c.label}{selectedCoverage === c.label ? ' ▸' : ''}
                              <NflInfoButton text={COVERAGE_EXPLAINERS[c.label] ?? ''} label={c.label} />
                            </span>
                            <span style={{ fontWeight: 700 }}>
                              {c.pct.toFixed(0)}% {c.epaAllowedPerPlay != null ? `· ${c.epaAllowedPerPlay >= 0 ? '+' : ''}${c.epaAllowedPerPlay.toFixed(2)} EPA` : ''}
                            </span>
                          </div>
                          <div style={{ height: 5, background: '#F0EBE0' }}><div style={{ height: 5, width: `${c.pct}%`, background: accent }} /></div>
                        </button>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A3A3A3', textAlign: 'center', padding: 16 }}>No data.</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}