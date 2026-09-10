// src/app/nfl/offensive-coordinator/NflOffCoordinatorClient.tsx
// FULL REPLACEMENT

'use client'

import { useState, useCallback } from 'react'
import NflFormationDiagram, { type FormationKey } from '@/components/nfl/diagrams/NflFormationDiagram'
import type { OffCoordinatorTeamRow, TeamFormationBreakdown } from '@/lib/nfl/queries'

export default function NflOffCoordinatorClient({ statsSeason, teams }: { statsSeason: number; teams: OffCoordinatorTeamRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [breakdown, setBreakdown] = useState<TeamFormationBreakdown | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedFormation, setSelectedFormation] = useState<FormationKey | null>(null)

  const toggle = useCallback(async (teamId: string, topFormation: string) => {
    if (expanded === teamId) { setExpanded(null); return }
    setExpanded(teamId)
    setLoading(true)
    setSelectedFormation(topFormation as FormationKey)
    try {
      const res = await fetch(`/api/nfl/offensive-coordinator/team?teamId=${teamId}&season=${statsSeason}`)
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
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, margin: '4px 0 8px', color: '#1A1A1A' }}>Offensive Coordinator</h1>
      <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: '#78716C', maxWidth: 620, marginBottom: 28 }}>
        Every team's go-to formation and run/pass identity. Click a team for the full personnel breakdown, then click any formation to see its diagram.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {teams.map((t) => {
          const accent = t.teamColor ?? '#FF5722'
          return (
            <div key={t.teamId} style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
              <button onClick={() => toggle(t.teamId, t.topFormation)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                {t.logoUrl ? <img src={t.logoUrl} width={32} height={32} style={{ objectFit: 'contain', flexShrink: 0 }} alt="" /> : <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0EBE0', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15, color: '#1A1A1A' }}>{t.teamId}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C' }}>{t.topFormation} · {t.topFormationPct.toFixed(0)}%</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: accent, fontWeight: 700 }}>{t.passPct.toFixed(0)}% pass / {t.runPct.toFixed(0)}% run</div>
                </div>
              </button>

              {expanded === t.teamId && (
                <div style={{ padding: '0 16px 16px' }}>
                  {loading ? (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A3A3A3', padding: 20, textAlign: 'center' }}>Loading…</div>
                  ) : breakdown ? (
                    <>
                      {selectedFormation && <NflFormationDiagram formation={selectedFormation} />}
                      <div style={{ marginTop: 12 }}>
                        {breakdown.formations.map((f) => (
                          <button
                            key={f.label}
                            onClick={() => setSelectedFormation(f.label as FormationKey)}
                            style={{ display: 'block', width: '100%', marginBottom: 6, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, marginBottom: 2, color: selectedFormation === f.label ? accent : '#1A1A1A', fontWeight: selectedFormation === f.label ? 700 : 400 }}>
                              <span>{f.label}{selectedFormation === f.label ? ' ▸' : ''}</span><span style={{ fontWeight: 700 }}>{f.pct.toFixed(0)}%</span>
                            </div>
                            <div style={{ height: 5, background: '#F0EBE0' }}><div style={{ height: 5, width: `${f.pct}%`, background: accent }} /></div>
                          </button>
                        ))}
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#78716C', marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Personnel</div>
                        {breakdown.personnel.map((p) => (
                          <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: '2px 0' }}>
                            <span>{p.label} personnel</span><span style={{ fontWeight: 700 }}>{p.pct.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
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