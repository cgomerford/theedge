'use client'

// src/components/OAAZoneMap.tsx
//
// Outfield OAA (Outs Above Average) visualised per zone on a field diagram.
// Data comes from Statcast OAA leaderboard — fetched client-side.
// Shows LF / CF / RF OAA with colour intensity and context label.
// Can be used on the batting tab (team context) or game page header.

import { useEffect, useState } from 'react'

/* ── Types ───────────────────────────────────────────────────────────── */

interface OutfielderOAA {
  position: 'LF' | 'CF' | 'RF'
  oaa:      number
  name:     string
  pa_outs?: number
}

interface TeamOAA {
  lf: OutfielderOAA | null
  cf: OutfielderOAA | null
  rf: OutfielderOAA | null
  total: number
}

/* ── OAA colour helpers ──────────────────────────────────────────────── */

function oaaColor(oaa: number): string {
  if (oaa >= 6)  return 'rgba(22,163,74,0.75)'
  if (oaa >= 3)  return 'rgba(22,163,74,0.45)'
  if (oaa >= 1)  return 'rgba(22,163,74,0.20)'
  if (oaa >= -1) return 'rgba(26,26,26,0.06)'
  if (oaa >= -3) return 'rgba(220,38,38,0.20)'
  if (oaa >= -6) return 'rgba(220,38,38,0.45)'
  return 'rgba(220,38,38,0.70)'
}

function oaaTextColor(oaa: number): string {
  if (oaa >= 3)  return '#14532D'
  if (oaa >= 1)  return '#166534'
  if (oaa <= -3) return '#7F1D1D'
  if (oaa <= -1) return '#991B1B'
  return '#6B6B6B'
}

function oaaLabel(oaa: number): string {
  if (oaa >= 6)  return 'Elite'
  if (oaa >= 3)  return 'Above avg'
  if (oaa >= 1)  return 'Solid'
  if (oaa >= -1) return 'Average'
  if (oaa >= -3) return 'Below avg'
  return 'Poor'
}

/* ── Savant OAA fetch ────────────────────────────────────────────────── */

async function fetchTeamOAA(teamId: number): Promise<TeamOAA | null> {
  const season = new Date().getFullYear()

  try {
    // Savant OAA leaderboard by position
    const positions: Array<'7' | '8' | '9'> = ['7', '8', '9'] // LF, CF, RF
    const posMap: Record<string, 'LF' | 'CF' | 'RF'> = { '7': 'LF', '8': 'CF', '9': 'RF' }

    const results = await Promise.all(
      positions.map(async pos => {
        const url = `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielder&year=${season}&team=${teamId}&pos=${pos}&min=0&csv=true`
        const res = await fetch(url, { headers: { Accept: 'text/csv,*/*' } })
        if (!res.ok) return null
        const text = await res.text()
        const lines = text.trim().split('\n')
        if (lines.length < 2) return null

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase())
        const nameIdx = headers.findIndex(h => h === 'last_name, first_name' || h === 'player_name' || h.includes('name'))
        const oaaIdx  = headers.findIndex(h => h === 'outs_above_average' || h === 'oaa')
        const teamIdx = headers.findIndex(h => h === 'team_id' || h === 'team')

        if (oaaIdx === -1) return null

        // Find player for this team
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
          const oaa   = parseFloat(cells[oaaIdx])
          if (isNaN(oaa)) continue
          const name  = nameIdx >= 0 ? cells[nameIdx] : 'Unknown'
          return {
            position: posMap[pos],
            oaa:      Math.round(oaa),
            name:     name.split(',').reverse().join(' ').trim(),
          } as OutfielderOAA
        }
        return null
      })
    )

    const lf = results[0]
    const cf = results[1]
    const rf = results[2]
    const total = (lf?.oaa ?? 0) + (cf?.oaa ?? 0) + (rf?.oaa ?? 0)

    return { lf, cf, rf, total }
  } catch {
    return null
  }
}

/* ── SVG field with OAA zones ────────────────────────────────────────── */

function FieldWithOAA({ teamOAA }: { teamOAA: TeamOAA }) {
  const { lf, cf, rf } = teamOAA

  return (
    <svg viewBox="0 0 220 180" style={{ width: '100%', display: 'block' }}>
      {/* Field background */}
      <path d="M110 160 L15 40 Q110 -10 205 40 Z" fill="#F0EDE6" stroke="#D4C9C0" strokeWidth="1"/>

      {/* LF zone */}
      <path
        d="M110 160 L15 40 Q62 15 110 10 Z"
        fill={oaaColor(lf?.oaa ?? 0)}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1"
      />

      {/* CF zone */}
      <path
        d="M110 160 L110 10 Q110 5 110 10 Z"
        fill="none"
      />
      {/* CF is the apex — triangle from both sides */}
      <path
        d="M110 160 Q62 15 110 10 Q158 15 110 160 Z"
        fill={oaaColor(cf?.oaa ?? 0)}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1"
      />

      {/* RF zone */}
      <path
        d="M110 160 Q158 15 205 40 Z"
        fill={oaaColor(rf?.oaa ?? 0)}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1"
      />

      {/* Infield */}
      <path
        d="M110 160 L72 122 L110 84 L148 122 Z"
        fill="#E8DDD5" stroke="#D4C9C0" strokeWidth="0.5"
      />

      {/* Foul lines */}
      <line x1="110" y1="160" x2="15" y2="40"  stroke="#C4BDB7" strokeWidth="0.5" strokeDasharray="3,2"/>
      <line x1="110" y1="160" x2="205" y2="40" stroke="#C4BDB7" strokeWidth="0.5" strokeDasharray="3,2"/>

      {/* Bases */}
      <rect x="107" y="81" width="6" height="6" fill="#1A1A1A" rx="1" transform="rotate(45 110 84)"/>
      <rect x="69"  y="119" width="6" height="6" fill="#1A1A1A" rx="1" transform="rotate(45 72 122)"/>
      <rect x="145" y="119" width="6" height="6" fill="#1A1A1A" rx="1" transform="rotate(45 148 122)"/>
      <polygon points="110,165 106,160 108,155 112,155 114,160" fill="#1A1A1A"/>

      {/* OAA labels per zone */}
      {lf && (
        <g>
          <text x="52" y="88" textAnchor="middle" fontSize="10" fontWeight="700"
            fill={oaaTextColor(lf.oaa)} fontFamily="Space Mono, monospace">
            {lf.oaa > 0 ? `+${lf.oaa}` : lf.oaa}
          </text>
          <text x="52" y="100" textAnchor="middle" fontSize="7"
            fill={oaaTextColor(lf.oaa)} fontFamily="Space Mono, monospace">
            LF
          </text>
        </g>
      )}

      {cf && (
        <g>
          <text x="110" y="52" textAnchor="middle" fontSize="10" fontWeight="700"
            fill={oaaTextColor(cf.oaa)} fontFamily="Space Mono, monospace">
            {cf.oaa > 0 ? `+${cf.oaa}` : cf.oaa}
          </text>
          <text x="110" y="64" textAnchor="middle" fontSize="7"
            fill={oaaTextColor(cf.oaa)} fontFamily="Space Mono, monospace">
            CF
          </text>
        </g>
      )}

      {rf && (
        <g>
          <text x="168" y="88" textAnchor="middle" fontSize="10" fontWeight="700"
            fill={oaaTextColor(rf.oaa)} fontFamily="Space Mono, monospace">
            {rf.oaa > 0 ? `+${rf.oaa}` : rf.oaa}
          </text>
          <text x="168" y="100" textAnchor="middle" fontSize="7"
            fill={oaaTextColor(rf.oaa)} fontFamily="Space Mono, monospace">
            RF
          </text>
        </g>
      )}
    </svg>
  )
}

/* ── Main component ──────────────────────────────────────────────────── */

interface OAAZoneMapProps {
  teamId:   number
  teamName: string
  // Optional: pass OAA values directly from components_raw to skip fetch
  oaaFromModel?: number | null
}

export default function OAAZoneMap({ teamId, teamName, oaaFromModel }: OAAZoneMapProps) {
  const [teamOAA, setTeamOAA] = useState<TeamOAA | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchTeamOAA(teamId).then(data => {
      setTeamOAA(data)
      setLoading(false)
    })
  }, [teamId])

  // Fallback: if Savant fetch fails but we have the model OAA
  const fallbackTotal = oaaFromModel ?? null

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 120, fontFamily: 'Space Mono, monospace',
        fontSize: 10, color: '#A3A3A3',
      }}>
        Loading fielding data...
      </div>
    )
  }

  // If we got nothing from Savant, show team-level OAA from model if available
  if (!teamOAA && fallbackTotal !== null) {
    return (
      <div style={{ textAlign: 'center', padding: 16 }}>
        <div style={{
          fontFamily: 'Space Mono, monospace', fontSize: 24,
          fontWeight: 700, color: fallbackTotal >= 0 ? '#16A34A' : '#DC2626',
        }}>
          {fallbackTotal > 0 ? `+${fallbackTotal}` : fallbackTotal}
        </div>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#A3A3A3', marginTop: 4 }}>
          Team OAA · {teamName}
        </div>
      </div>
    )
  }

  if (!teamOAA) {
    return (
      <div style={{
        textAlign: 'center', padding: 16,
        fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#A3A3A3',
      }}>
        Fielding data not available
      </div>
    )
  }

  return (
    <div>
      {/* Field diagram */}
      <FieldWithOAA teamOAA={teamOAA} />

      {/* Per-player breakdown */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {[teamOAA.lf, teamOAA.cf, teamOAA.rf].filter(Boolean).map(of => of && (
          <div key={of.position} style={{
            flex: 1, padding: '8px 10px',
            background: '#FAF8F3',
            border: '0.5px solid rgba(26,26,26,0.08)',
            borderRadius: 6,
          }}>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: 9,
              color: '#A3A3A3', textTransform: 'uppercase',
              letterSpacing: '.05em', marginBottom: 3,
            }}>
              {of.position}
            </div>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: 13,
              fontWeight: 700,
              color: oaaTextColor(of.oaa),
            }}>
              {of.oaa > 0 ? `+${of.oaa}` : of.oaa}
            </div>
            <div style={{
              fontFamily: 'Fraunces, serif', fontSize: 11,
              color: '#6B6B6B', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {of.name.split(' ').slice(-1)[0]}
            </div>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: 8,
              color: oaaTextColor(of.oaa), marginTop: 2,
            }}>
              {oaaLabel(of.oaa)}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div style={{
        marginTop: 8, padding: '6px 10px',
        background: teamOAA.total >= 0 ? '#F0FDF4' : '#FEF2F2',
        borderRadius: 6, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase' }}>
          Outfield total OAA
        </span>
        <span style={{
          fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: 700,
          color: teamOAA.total >= 0 ? '#16A34A' : '#DC2626',
        }}>
          {teamOAA.total > 0 ? `+${teamOAA.total}` : teamOAA.total}
        </span>
      </div>

      <div style={{
        fontFamily: 'Space Mono, monospace', fontSize: 8,
        color: '#C4BDB7', textAlign: 'center', marginTop: 8,
      }}>
        OAA via Baseball Savant · 2026 season
      </div>
    </div>
  )
}
