'use client'

// Real heatmap + throw-trail chart driven by QBRoomSummary / trails / targets.
// Field UI restyled to closely match NFL Next Gen Stats trajectory charts
// (dark grid, yard labels, high-visibility colored trails from LOS).
// Cards are designed to sit cleanly side-by-side in a 2-column page grid.

import type { QBRoomSummary } from '@/lib/nfl/game-plays'

export type TargetEntry = {
  athleteId: string
  name: string
  targets: number
  receptions: number
}

export type QBPassTrail = {
  depth: 'short' | 'medium' | 'deep'
  direction: 'left' | 'middle' | 'right'
  isComplete: boolean
}

type Props = {
  qbName: string
  teamAbbr: string
  summary: QBRoomSummary
  redZonePlays: Array<{ startYardsToEndzone: number; isComplete: boolean | null }>
  targets: TargetEntry[]
  trails: QBPassTrail[]
}

const ZONE_POSITIONS: Record<string, { cx: number; cy: number }> = {
  'deep-left': { cx: 43, cy: 55 }, 'deep-middle': { cx: 110, cy: 55 }, 'deep-right': { cx: 176, cy: 55 },
  'medium-left': { cx: 43, cy: 145 }, 'medium-middle': { cx: 110, cy: 145 }, 'medium-right': { cx: 176, cy: 145 },
  'short-left': { cx: 43, cy: 240 }, 'short-middle': { cx: 110, cy: 240 }, 'short-right': { cx: 176, cy: 240 },
}

const ROW_Y: Record<string, number> = { deep: 55, medium: 145, short: 240 }
const COL_X: Record<string, number> = { left: 43, middle: 110, right: 176 }

function heatColor(pct: number): string {
  if (pct >= 80) return '#ef4444'
  if (pct >= 60) return '#f97316'
  if (pct >= 40) return '#eab308'
  if (pct >= 1) return '#22c55e'
  return '#1a3a1f'
}

function jitter(seed: number, range: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * range
}

function TrailLayer({ trails }: { trails: QBPassTrail[] }) {
  return (
    <g>
      {trails.map((t, i) => {
        const baseX = COL_X[t.direction]
        const baseY = ROW_Y[t.depth]
        const endX = Math.max(18, Math.min(202, baseX + jitter(i, 28)))
        const endY = Math.max(18, Math.min(300, baseY + jitter(i + 100, 28)))
        // NGS-style: green = complete, red = incomplete, slight yellow bias for short
        const color = t.isComplete
          ? (t.depth === 'short' ? '#a3e635' : '#4ade80')
          : '#f87171'
        const midX = (110 + endX) / 2 + jitter(i + 50, 12)
        const midY = (308 + endY) / 2 + 18
        const path = `M 110 308 Q ${midX} ${midY} ${endX} ${endY}`
        return (
          <path
            key={i}
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={1.9}
            opacity={0.82}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}
    </g>
  )
}

export default function QBRoomHeatmap({ qbName, teamAbbr, summary, redZonePlays, targets, trails }: Props) {
  const teamLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr.toLowerCase()}.png`

  // Yard label positions (from LOS upward)
  const yardLabels = [
    { y: 260, label: '+10' },
    { y: 185, label: '+20' },
    { y: 110, label: '+30' },
    { y: 50,  label: '+40' },
  ]

  return (
    <div style={{
      background: '#fff',
      border: '1px solid rgba(26,26,26,0.09)',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 14px',
        borderBottom: '1px solid rgba(26,26,26,0.06)',
        background: '#F7F4ED',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
      }}>
        <img
          src={teamLogo}
          alt={teamAbbr}
          width={34}
          height={34}
          style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="s" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15 }}>{qbName}</div>
          <div className="m" style={{ fontSize: 9, color: '#8a8a8a', marginTop: 1 }}>
            {teamAbbr} · {summary.completions}/{summary.totalAttempts} · {Math.round((summary.completions / Math.max(summary.totalAttempts, 1)) * 100)}%
          </div>
        </div>
      </div>

      {/* Two-column body — designed for page-level 2-col grid of these cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)',
      }}>
        {/* LEFT: NGS-style field */}
        <div style={{ padding: '12px 10px 12px 14px', borderRight: '1px solid rgba(26,26,26,0.06)' }}>
          <svg viewBox="0 0 220 320" style={{ width: '100%', display: 'block', borderRadius: 4 }}>
            <defs>
              <filter id={`heatBlur-${teamAbbr}`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
              <clipPath id={`fieldClip-${teamAbbr}`}>
                <rect x="8" y="8" width="204" height="304" rx="2" />
              </clipPath>
            </defs>

            {/* Dark NGS field base */}
            <rect x="8" y="8" width="204" height="304" fill="#0c0c0c" rx="2" />

            {/* Subtle grid */}
            <g clipPath={`url(#fieldClip-${teamAbbr})`} opacity={0.35}>
              {/* horizontal yard lines */}
              {[40, 70, 100, 130, 160, 190, 220, 250, 280].map(y => (
                <line key={`h${y}`} x1="8" y1={y} x2="212" y2={y} stroke="#3a3a3a" strokeWidth={0.8} />
              ))}
              {/* vertical hash-style lines */}
              {[40, 70, 100, 130, 160, 190].map(x => (
                <line key={`v${x}`} x1={x} y1="8" x2={x} y2="312" stroke="#2e2e2e" strokeWidth={0.6} />
              ))}
            </g>

            {/* Heat blobs (subtle under trails) */}
            <g clipPath={`url(#fieldClip-${teamAbbr})`} filter={`url(#heatBlur-${teamAbbr})`}>
              {Object.entries(summary.zoneChart).map(([key, z]) => {
                const pos = ZONE_POSITIONS[key]
                if (!pos || z.attempts === 0) return null
                const pct = (z.completions / z.attempts) * 100
                const r = 20 + Math.min(z.attempts, 6) * 2.2
                return (
                  <circle
                    key={key}
                    cx={pos.cx}
                    cy={pos.cy}
                    r={r}
                    fill={heatColor(pct)}
                    opacity={0.38 + Math.min(z.attempts, 5) * 0.05}
                  />
                )
              })}
            </g>

            {/* Trails (NGS primary visual) */}
            <g clipPath={`url(#fieldClip-${teamAbbr})`}>
              <TrailLayer trails={trails} />
            </g>

            {/* Field border */}
            <rect x="8" y="8" width="204" height="304" fill="none" stroke="#3f3f3f" strokeWidth={1.5} rx="2" />

            {/* Major depth lines */}
            <line x1="8" y1="110" x2="212" y2="110" stroke="rgba(255,255,255,0.18)" strokeWidth={1.2} />
            <line x1="8" y1="185" x2="212" y2="185" stroke="rgba(255,255,255,0.18)" strokeWidth={1.2} />
            <line x1="8" y1="260" x2="212" y2="260" stroke="rgba(255,255,255,0.18)" strokeWidth={1.2} />

            {/* Yard labels (left + right) */}
            {yardLabels.map(({ y, label }) => (
              <g key={label}>
                <text x={14} y={y + 3} fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize={9} fill="rgba(255,255,255,0.55)" fontWeight={500}>
                  {label}
                </text>
                <text x={206} y={y + 3} textAnchor="end" fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize={9} fill="rgba(255,255,255,0.55)" fontWeight={500}>
                  {label}
                </text>
              </g>
            ))}

            {/* Zone % labels (kept readable over dark) */}
            {Object.entries(summary.zoneChart).map(([key, z]) => {
              const pos = ZONE_POSITIONS[key]
              if (!pos) return null
              const pct = z.attempts > 0 ? Math.round((z.completions / z.attempts) * 100) : null
              return (
                <g key={key}>
                  <text
                    x={pos.cx}
                    y={pos.cy - 1}
                    textAnchor="middle"
                    fontFamily="JetBrains Mono, ui-monospace, monospace"
                    fontSize={12}
                    fontWeight={700}
                    fill="#fff"
                    stroke="rgba(0,0,0,0.7)"
                    strokeWidth={2.5}
                    paintOrder="stroke"
                  >
                    {pct === null ? '—' : `${pct}%`}
                  </text>
                  <text
                    x={pos.cx}
                    y={pos.cy + 11}
                    textAnchor="middle"
                    fontFamily="JetBrains Mono, ui-monospace, monospace"
                    fontSize={7}
                    fill="rgba(255,255,255,0.75)"
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={1.8}
                    paintOrder="stroke"
                  >
                    {z.completions}/{z.attempts}
                  </text>
                </g>
              )
            })}

            {/* LOS */}
            <line x1="8" y1="308" x2="212" y2="308" stroke="#3b82f6" strokeWidth={2.2} />
            <circle cx="110" cy="308" r="3.5" fill="#fff" stroke="#1e3a5f" strokeWidth={1} />
            <text x={14} y={304} fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize={8} fill="#93c5fd" fontWeight={600}>
              LOS
            </text>
            <text x={206} y={304} textAnchor="end" fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize={8} fill="#93c5fd" fontWeight={600}>
              LOS
            </text>
          </svg>

          {/* Compact legends under field */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="m" style={{ fontSize: 7.5, color: '#888' }}>LOW%</span>
              <div style={{
                width: 52,
                height: 5,
                borderRadius: 2,
                background: 'linear-gradient(to right, #1a3a1f, #22c55e, #eab308, #f97316, #ef4444)',
              }} />
              <span className="m" style={{ fontSize: 7.5, color: '#888' }}>HIGH%</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 11, height: 2.5, background: '#4ade80', borderRadius: 1 }} />
                <span className="m" style={{ fontSize: 7.5, color: '#888' }}>Comp</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 11, height: 2.5, background: '#f87171', borderRadius: 1 }} />
                <span className="m" style={{ fontSize: 7.5, color: '#888' }}>Inc</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: stats + targets with headshots */}
        <div style={{ padding: '12px 14px 12px 12px', display: 'flex', flexDirection: 'column' }}>
          {/* Key stats row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            marginBottom: 12,
            paddingBottom: 10,
            borderBottom: '1px solid rgba(26,26,26,0.06)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="s" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{summary.shotgunAttempts}</div>
              <div className="m" style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>Shotgun</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="s" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{summary.underCenterAttempts}</div>
              <div className="m" style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>Under Ctr</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="s" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                {summary.redZoneCompletions}/{summary.redZoneAttempts}
              </div>
              <div className="m" style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>Red Zone</div>
            </div>
          </div>

          {/* Targets + headshots */}
          {targets.length > 0 && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <div className="m" style={{
                fontSize: 8.5,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: 7,
              }}>
                Targets
              </div>
              {targets.slice(0, 5).map(t => (
                <div key={t.athleteId} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 0',
                }}>
                  <img
                    src={`https://a.espncdn.com/i/headshots/nfl/players/full/${t.athleteId}.png`}
                    alt={t.name}
                    width={26}
                    height={26}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      background: '#e5e5e5',
                      flexShrink: 0,
                    }}
                  />
                  <span className="s" style={{
                    fontSize: 11.5,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>
                  <span className="m" style={{ fontSize: 10, color: '#888', flexShrink: 0 }}>{t.receptions}</span>
                  <span className="m" style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: '#ff5722',
                    minWidth: 18,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    {t.targets}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Honesty note */}
          <div className="m" style={{
            fontSize: 7,
            color: '#999',
            lineHeight: 1.4,
            marginTop: 10,
            background: 'rgba(217,119,6,0.06)',
            borderLeft: '2px solid #d97706',
            padding: '5px 7px',
            borderRadius: '0 3px 3px 0',
          }}>
            Medium depth estimated. Trail endpoints zone-accurate but jittered (no public tracking). Preseason samples are directional only.
          </div>
        </div>
      </div>
    </div>
  )
}