'use client'

// src/components/LineupSprayChart.tsx
//
// 2026-08-20 (later still): L30 and vs-LHP/vs-RHP filters are now REAL —
// scripts/fetch_batter_spray.py was verified (live test pull, not
// assumed) to have game_date and p_throws available from pybaseball, and
// now stores them as gd/pt on every play. The disabled "(soon)" toggle
// row that used to live in ScoutReportTab.tsx above this chart has moved
// INTO this component, since the filtering now genuinely happens here.
// Window options are Season / L30 (not L15 — confirmed L30 is what's
// wanted). Handedness options are All / vs LHP / vs RHP, filtering on
// each play's own pt field (the ACTUAL pitcher who threw that specific
// pitch), not the tonight's-starter handedness used elsewhere on the
// Scout Report page (TeamHotZoneCard's opposingThrows) — those are two
// different, both-legitimate things: "how has this lineup hit lefties in
// general this season" vs. "how does this lineup match up against
// tonight's specific starter's handedness."
//
// Auto-fit scale (computeAutoScale) and the unified wall/dot scale from
// the previous two passes are unchanged — filtering just changes which
// plays feed into that same pipeline.

import { useState, useMemo } from 'react'
import type { BatterSpray, SprayPlay } from '@/lib/batter-spray'
import type { VenueFieldDimensions } from '@/lib/venue-dimensions'

type Props = {
  teamAbbr: string
  teamName: string
  color: string
  batters: BatterSpray[]
  lineupSize: number
  venueDimensions?: VenueFieldDimensions | null
  playerNames?: Record<number, string>
}

const VB_W = 500
const VB_H = 500
const HOME_X = 250
const HOME_Y = 460
const VERT_MARGIN = 28
const HORZ_MARGIN = 18

const FT_PER_HC_UNIT = 2.5 // unofficial community convention — MLB has never published a real one
const GAP_ANGLE_DEG = 22.5 // assumed, not measured

type WindowFilter = 'season' | 'l30'
type HandFilter = 'all' | 'L' | 'R'

type OutcomeGroup = 'hr' | 'triple' | 'double' | 'single' | 'out'

function classifyOutcome(ev: string | null): OutcomeGroup {
  if (ev === 'home_run') return 'hr'
  if (ev === 'triple') return 'triple'
  if (ev === 'double') return 'double'
  if (ev === 'single') return 'single'
  return 'out'
}

const OUTCOME_COLOR: Record<OutcomeGroup, string> = {
  hr: '#DC2626', triple: '#F97316', double: '#EAB308', single: '#2563EB', out: 'rgba(87,79,69,0.30)',
}
const OUTCOME_RADIUS: Record<OutcomeGroup, number> = {
  hr: 4.8, triple: 4.2, double: 3.4, single: 2.7, out: 2,
}
const OUTCOME_LABEL: Record<OutcomeGroup, string> = {
  hr: 'Home run', triple: 'Triple', double: 'Double', single: 'Single', out: 'Out',
}
const DRAW_ORDER: OutcomeGroup[] = ['out', 'single', 'double', 'triple', 'hr']

function playToFeet(p: SprayPlay): { fx: number; fy: number } {
  return {
    fx: (p.x - 125) * FT_PER_HC_UNIT,
    fy: (200 - p.y) * FT_PER_HC_UNIT,
  }
}

function computeAutoScale(dims: VenueFieldDimensions | null | undefined, plays: SprayPlay[]): number {
  let maxFy = 380
  let maxAbsFx = 300

  if (dims) {
    const distances = [dims.leftLine, dims.leftCenter, dims.center, dims.rightCenter, dims.rightLine].filter(
      (d): d is number => d != null,
    )
    if (distances.length > 0) {
      maxFy = Math.max(...distances)
      const lineReach = Math.max(dims.leftLine ?? 0, dims.rightLine ?? 0) * Math.sin((45 * Math.PI) / 180)
      maxAbsFx = Math.max(lineReach, maxFy * Math.sin((GAP_ANGLE_DEG * Math.PI) / 180))
    }
  }

  for (const p of plays) {
    const { fx, fy } = playToFeet(p)
    if (fy > maxFy) maxFy = fy
    if (Math.abs(fx) > maxAbsFx) maxAbsFx = Math.abs(fx)
  }

  const availH = HOME_Y - VERT_MARGIN
  const availW = VB_W / 2 - HORZ_MARGIN

  return Math.min(availH / maxFy, availW / maxAbsFx)
}

function wallPoint(distanceFt: number, angleDeg: number, scale: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: HOME_X + distanceFt * scale * Math.sin(rad),
    y: HOME_Y - distanceFt * scale * Math.cos(rad),
  }
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  const pts = [points[0], ...points, points[points.length - 1]]
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function FieldArt({ dims, scale }: { dims?: VenueFieldDimensions | null; scale: number }) {
  const hasRealDims = !!(dims && dims.leftLine != null && dims.center != null && dims.rightLine != null)

  let wallPath: string
  if (hasRealDims) {
    const points = [
      wallPoint(dims!.leftLine!, -45, scale),
      wallPoint(dims!.leftCenter ?? (dims!.leftLine! + dims!.center!) / 2, -GAP_ANGLE_DEG, scale),
      wallPoint(dims!.center!, 0, scale),
      wallPoint(dims!.rightCenter ?? (dims!.rightLine! + dims!.center!) / 2, GAP_ANGLE_DEG, scale),
      wallPoint(dims!.rightLine!, 45, scale),
    ]
    wallPath = smoothPath(points) + ` L ${HOME_X} ${HOME_Y} Z`
  } else {
    const points = [
      wallPoint(330, -45, scale),
      wallPoint(370, -22.5, scale),
      wallPoint(400, 0, scale),
      wallPoint(370, 22.5, scale),
      wallPoint(330, 45, scale),
    ]
    wallPath = smoothPath(points) + ` L ${HOME_X} ${HOME_Y} Z`
  }

  return (
    <>
      <defs>
        <linearGradient id="spray-turf" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5CAE5C" />
          <stop offset="100%" stopColor="#6DBE6D" />
        </linearGradient>
        <radialGradient id="spray-turf-shade" cx="50%" cy="20%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="65%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#1a3d1a" stopOpacity="0.12" />
        </radialGradient>
        <linearGradient id="spray-dirt" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#DCB994" />
          <stop offset="100%" stopColor="#C79B6E" />
        </linearGradient>
      </defs>
      <path d={wallPath} fill="url(#spray-turf)" stroke="#3E7D3E" strokeWidth={1.5} />
      <path d={wallPath} fill="url(#spray-turf-shade)" />
      <path
        d={`M ${HOME_X} ${HOME_Y} L ${HOME_X + 60 * scale} ${HOME_Y - 60 * scale} L ${HOME_X} ${HOME_Y - 120 * scale} L ${HOME_X - 60 * scale} ${HOME_Y - 60 * scale} Z`}
        fill="url(#spray-dirt)" stroke="#A9835C" strokeWidth={1.25}
      />
      <line x1={HOME_X} y1={HOME_Y} x2={wallPoint(hasRealDims ? dims!.leftLine! : 330, -45, scale).x} y2={wallPoint(hasRealDims ? dims!.leftLine! : 330, -45, scale).y} stroke="#F5F5F4" strokeWidth={1.75} opacity={0.85} />
      <line x1={HOME_X} y1={HOME_Y} x2={wallPoint(hasRealDims ? dims!.rightLine! : 330, 45, scale).x} y2={wallPoint(hasRealDims ? dims!.rightLine! : 330, 45, scale).y} stroke="#F5F5F4" strokeWidth={1.75} opacity={0.85} />
      <polygon points="250,464 244,458 246,451 254,451 256,458" fill="#1C1917" />
    </>
  )
}

function isWithinL30(gd: string | null): boolean {
  if (!gd) return false
  const playDate = new Date(gd + 'T00:00:00')
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  return playDate >= cutoff
}

export default function LineupSprayChart({ teamAbbr, teamName, color, batters, lineupSize, venueDimensions, playerNames = {} }: Props) {
  const [selectedId, setSelectedId] = useState<number | 'all'>('all')
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('season')
  const [handFilter, setHandFilter] = useState<HandFilter>('all')

  const activeBatters = useMemo(
    () => (selectedId === 'all' ? batters : batters.filter(b => b.player_id === selectedId)),
    [batters, selectedId],
  )

  const allPlays = useMemo(() => {
    let plays = activeBatters.flatMap(b => b.plays)
    if (windowFilter === 'l30') plays = plays.filter(p => isWithinL30(p.gd))
    if (handFilter !== 'all') plays = plays.filter(p => p.pt === handFilter)
    return plays
  }, [activeBatters, windowFilter, handFilter])

  const totalPlays = allPlays.length
  const scale = useMemo(() => computeAutoScale(venueDimensions, allPlays), [venueDimensions, allPlays])

  const byOutcome: Record<OutcomeGroup, SprayPlay[]> = { hr: [], triple: [], double: [], single: [], out: [] }
  for (const p of allPlays) byOutcome[classifyOutcome(p.ev)].push(p)

  const hasRealDims = !!(venueDimensions && venueDimensions.leftLine != null && venueDimensions.center != null && venueDimensions.rightLine != null)

  const toggleBtnClass = (active: boolean) =>
    `font-mono text-[8px] uppercase tracking-wider px-2 py-0.5 border rounded ${
      active ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200 text-stone-500 hover:border-stone-400'
    }`

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm" style={{ borderTop: `3px solid ${color}` }}>
      <div className="px-4 py-2.5 border-b border-stone-100" style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
              {teamName} · Spray by outcome
            </p>
            {hasRealDims && (
              <p className="font-mono text-[9px] text-stone-600 mt-0.5">
                {venueDimensions!.venueName} · {venueDimensions!.leftLine}
                {venueDimensions!.leftCenter != null && ` / ${venueDimensions!.leftCenter}`}
                {' / '}{venueDimensions!.center}
                {venueDimensions!.rightCenter != null && ` / ${venueDimensions!.rightCenter}`}
                {' / '}{venueDimensions!.rightLine} ft
              </p>
            )}
          </div>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="font-mono text-[10px] border border-stone-300 rounded-md px-2 py-1 bg-white text-stone-700"
          >
            <option value="all">Whole lineup</option>
            {batters.map(b => (
              <option key={b.player_id} value={b.player_id}>
                {playerNames[b.player_id] ?? `Player ${b.player_id}`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 flex-wrap">
          <button className={toggleBtnClass(windowFilter === 'season')} onClick={() => setWindowFilter('season')}>Season</button>
          <button className={toggleBtnClass(windowFilter === 'l30')} onClick={() => setWindowFilter('l30')}>L30</button>
          <span className="w-px bg-stone-200 mx-0.5" />
          <button className={toggleBtnClass(handFilter === 'all')} onClick={() => setHandFilter('all')}>All</button>
          <button className={toggleBtnClass(handFilter === 'L')} onClick={() => setHandFilter('L')}>vs LHP</button>
          <button className={toggleBtnClass(handFilter === 'R')} onClick={() => setHandFilter('R')}>vs RHP</button>
        </div>
      </div>

      <div className="p-3">
        {totalPlays === 0 ? (
          <p className="text-sm font-serif italic text-stone-400 text-center py-10">
            No balls in play for this selection — try a wider window or All handedness.
          </p>
        ) : (
          <>
            <svg width="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: 'block' }}>
              <FieldArt dims={venueDimensions} scale={scale} />
              {DRAW_ORDER.map(group =>
                byOutcome[group].map((p, i) => {
                  const { fx, fy } = playToFeet(p)
                  const sx = HOME_X + fx * scale
                  const sy = HOME_Y - fy * scale
                  return (
                    <circle
                      key={`${group}-${i}`}
                      cx={sx} cy={sy}
                      r={OUTCOME_RADIUS[group]}
                      fill={OUTCOME_COLOR[group]}
                      opacity={group === 'out' ? 1 : 0.9}
                      stroke={group === 'hr' ? '#7F1D1D' : undefined}
                      strokeWidth={group === 'hr' ? 1 : 0}
                    />
                  )
                })
              )}
            </svg>

            <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-3">
              {DRAW_ORDER.slice().reverse().map(group => {
                const count = byOutcome[group].length
                const pct = totalPlays > 0 ? ((count / totalPlays) * 100).toFixed(1) : '0.0'
                return (
                  <div key={group} className="flex items-center gap-1.5">
                    <span className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, background: OUTCOME_COLOR[group] }} />
                    <span className="font-mono text-[9px] text-stone-500">
                      <span className="font-semibold text-stone-700">{OUTCOME_LABEL[group]}</span>
                      {' '}· {count.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                )
              })}
            </div>

            <p className="text-[9px] font-mono text-center text-stone-400 mt-2.5 pt-2 border-t border-stone-100">
              {totalPlays.toLocaleString()} balls in play
              {selectedId === 'all' ? ` · ${batters.length}/${lineupSize} confirmed batters w/ data` : ` · ${playerNames[selectedId] ?? 'this player'}`}
              {windowFilter === 'l30' && ' · L30'}
              {handFilter !== 'all' && ` · vs ${handFilter}HP`}
            </p>
            {hasRealDims ? (
              <p className="text-[7px] font-mono text-center text-stone-400 mt-1">
                Wall drawn from real fence distances; gap angles (±22.5°) are an illustrative assumption. Scale auto-fits to whichever is larger — the park's real distances or the furthest plotted ball.
              </p>
            ) : (
              <p className="text-[7px] font-mono text-center text-stone-400 mt-1">
                Venue dimensions unavailable — showing a generic outfield shape, not this park's actual fences.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}