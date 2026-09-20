// src/components/TeamRadarSlideshow.tsx
//
// "Most rounded team" — a 20-axis radar (10 pitching, 10 batting, split
// across the two halves of the shape) auto-advancing through all 30 teams
// every 5s, pausing on hover. Hovering a single vertex shows a comprehensive
// stat line (all 10 pitching or all 10 batting axes, not just the one
// hovered) for every real player who makes up that team-level number,
// lazy-fetched per team (not all 30 rosters upfront).

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { teamLogoUrl } from '@/lib/mlb'
import { MLB_TEAMS } from '@/lib/teams'
import {
  TEAM_RADAR_AXES,
  percentileRank,
  getTeamRosterBreakdown,
  type TeamRadarRow,
  type TeamRadarAxisKey,
  type RadarPlayerLine,
} from '@/lib/team-radar'

const ORANGE = '#FF5722'
const BLUE = '#185FA5'
const AXIS_LINE = 'rgba(26,26,26,0.12)'
const SLIDE_MS = 5000
const SEASON = new Date().getFullYear()

// Rounded to 2dp — raw Math.cos/sin output can differ in its last few
// decimal digits between server and client (same float, different JS
// engine build), which turns into a real hydration mismatch once those
// digits land in an SVG points="..." string. Rounding first keeps the
// server- and client-rendered markup byte-identical.
function polar(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: Math.round((cx + r * Math.cos(angleRad)) * 100) / 100,
    y: Math.round((cy + r * Math.sin(angleRad)) * 100) / 100,
  }
}

function angleFor(i: number, n: number) {
  return -Math.PI / 2 + i * ((2 * Math.PI) / n)
}

type Axis = { key: TeamRadarAxisKey; label: string; group: 'Pitching' | 'Batting'; pct: number; raw: string; rank: number }

function buildAxes(row: TeamRadarRow, cohort: TeamRadarRow[]): Axis[] {
  return TEAM_RADAR_AXES.map(def => {
    const value = row.values[def.key]
    const all = cohort.map(c => c.values[def.key])
    const sorted = [...all].sort((a, b) => (def.higherIsBetter ? b - a : a - b))
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      pct: percentileRank(value, all, def.higherIsBetter),
      raw: def.fmt(value),
      rank: sorted.indexOf(value) + 1,
    }
  })
}

function compositeScore(axes: Axis[]): number {
  return Math.round(axes.reduce((s, a) => s + a.pct, 0) / axes.length)
}

function RadarShape({
  axes,
  size = 320,
  hoveredAxis,
  onHoverAxis,
  onLeaveAxis,
}: {
  axes: Axis[]
  size?: number
  hoveredAxis: TeamRadarAxisKey | null
  onHoverAxis: (key: TeamRadarAxisKey, x: number, y: number) => void
  onLeaveAxis: () => void
}) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 42
  const n = axes.length
  const rings = [0.25, 0.5, 0.75, 1]

  const pointAt = (i: number, frac: number) => polar(cx, cy, R * frac, angleFor(i, n))
  const shapePath = axes.map((a, i) => pointAt(i, Math.max(0.04, a.pct / 100))).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {rings.map(f => (
        <polygon
          key={f}
          points={axes.map((_, i) => { const p = pointAt(i, f); return `${p.x},${p.y}` }).join(' ')}
          fill="none"
          stroke={AXIS_LINE}
          strokeWidth={1}
        />
      ))}
      {axes.map((a, i) => {
        const outer = pointAt(i, 1)
        return <line key={a.key} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke={AXIS_LINE} strokeWidth={1} />
      })}
      {/* Split fill — pitching half vs batting half, so the two sides of
          "rounded" are visually distinct even before reading labels. */}
      <path d={shapePath} fill={ORANGE} fillOpacity={0.16} stroke={ORANGE} strokeWidth={2} />
      {axes.map((a, i) => {
        const p = pointAt(i, Math.max(0.04, a.pct / 100))
        const labelP = polar(cx, cy, R + 20, angleFor(i, n))
        const color = a.group === 'Pitching' ? BLUE : ORANGE
        const isHovered = a.key === hoveredAxis
        return (
          <g key={a.key}>
            {/* A single hit target with onMouseEnter/onMouseLeave (fires once
                per crossing) instead of a container-level mousemove listener
                (fires on every pixel) — the mousemove approach was the source
                of the flicker, since it re-ran hit-testing on every mouse
                jitter near a dot's edge. */}
            <circle
              cx={p.x} cy={p.y} r={13}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverAxis(a.key, p.x, p.y)}
              onMouseLeave={onLeaveAxis}
            />
            <circle
              cx={p.x} cy={p.y} r={isHovered ? 5.5 : 4}
              fill={color} stroke="#fff" strokeWidth={1.5}
              style={{ pointerEvents: 'none' }}
            />
            <text
              x={labelP.x} y={labelP.y}
              textAnchor={Math.abs(labelP.x - cx) < 4 ? 'middle' : labelP.x > cx ? 'start' : 'end'}
              dominantBaseline={Math.abs(labelP.y - cy) < 4 ? 'middle' : labelP.y > cy ? 'hanging' : 'auto'}
              fontSize={8.5}
              fontWeight={700}
              fill={color}
              style={{ pointerEvents: 'none' }}
            >
              {a.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Comprehensive on purpose: hovering ANY pitching axis shows every
// pitcher's full 10-stat pitching line (not just the one hovered stat),
// and any batting axis shows every batter's full 10-stat batting line —
// so one hover answers "who's behind this number" AND "how good are they
// overall," not just a single cell.
const PITCHING_COLS: [string, TeamRadarAxisKey][] = [
  ['IP', 'era' /* placeholder, overridden below */], ['ERA', 'era'], ['WHIP', 'whip'], ['FIP', 'fip'],
  ['K/9', 'k9'], ['BB/9', 'bb9'], ['HR/9', 'hr9'], ['K/BB', 'kbb'], ['SV', 'saves'], ['HLD', 'holds'], ['SHO', 'shutouts'],
]
const BATTING_COLS: [string, TeamRadarAxisKey][] = [
  ['PA', 'avg' /* placeholder, overridden below */], ['AVG', 'avg'], ['OBP', 'obp'], ['SLG', 'slg'], ['OPS', 'ops'],
  ['HR', 'hr'], ['RBI', 'rbi'], ['R', 'runs'], ['SB', 'sb'], ['2B', 'doubles'], ['BB', 'walks'],
]

function fmtCell(v: number | undefined): string {
  if (v === undefined) return '—'
  if (Number.isInteger(v)) return String(v)
  return v < 1 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(2)
}

function PlayerBreakdownCard({
  axis, players, loading, dotX, dotY, onMouseEnter, onMouseLeave,
}: {
  axis: Axis; players: RadarPlayerLine[]; loading: boolean; dotX: number; dotY: number
  onMouseEnter: () => void; onMouseLeave: () => void
}) {
  const isPitching = axis.group === 'Pitching'
  const cols = isPitching ? PITCHING_COLS : BATTING_COLS
  const color = isPitching ? BLUE : ORANGE

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        // Anchored to the hovered dot's own coordinates, always opening to
        // its right — not a fixed spot below the whole radar.
        position: 'absolute', zIndex: 40, left: dotX + 18, top: dotY, transform: 'translateY(-50%)',
        width: 560, maxWidth: '85vw', maxHeight: 320, overflow: 'auto',
        background: '#1A1A1A', color: '#FAF8F3', borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.32)',
        // Interactive (not pointer-events: none) so the roster list can
        // actually be scrolled while it's open — staying open while the
        // cursor is over the card, not just the dot, is handled by the
        // parent's hover-grace-period (see cancelClear/scheduleClear).
        pointerEvents: 'auto',
      }}
    >
      <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 21, fontWeight: 800, color, lineHeight: 1 }}>{axis.raw}</span>
          <span className="s" style={{ fontSize: 12, fontWeight: 700 }}>
            {axis.label} team total — <span style={{ color }}>#{axis.rank} of 30</span> ({axis.pct}th percentile)
          </span>
        </div>
        <div className="m" style={{ fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>
          {isPitching ? 'Pitching staff' : 'Batting order'} — full line, sorted by {isPitching ? 'innings pitched' : 'plate appearances'}{players.length > 8 ? ' — scroll for more' : ''}
        </div>
        {axis.key === 'shutouts' && (
          <div className="m" style={{ fontSize: 8, color: '#D4A657', marginTop: 4, lineHeight: 1.4 }}>
            Team total counts every game the pitching staff allowed zero runs, solo or combined. The SHO column below is each pitcher&apos;s own complete-game shutouts only — a combined shutout (multiple pitchers) adds to the team total but isn&apos;t credited to any one pitcher, so the column won&apos;t always sum to the team total.
          </div>
        )}
      </div>
      <div style={{ padding: '4px 10px 8px' }}>
        {loading ? (
          <div className="m" style={{ fontSize: 9, color: '#A3A3A3', padding: '10px 0' }}>Loading roster…</div>
        ) : players.length === 0 ? (
          <div className="m" style={{ fontSize: 9, color: '#A3A3A3', padding: '10px 0' }}>No data</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4px 6px 4px 0' }} />
                {cols.map(([label], i) => (
                  <th key={label + i} className="m" style={{ fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', padding: '4px 6px', fontWeight: 700 }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.personId} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '4px 6px 4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                      <img
                        src={p.headshot}
                        alt=""
                        width={18}
                        height={18}
                        // width/height set again inline (not just as HTML
                        // attributes) — Tailwind's preflight ships `img {
                        // height: auto }`, which otherwise overrides the
                        // attribute, breaks the square box, and turns
                        // border-radius: 50% into an oval/rounded-rect.
                        style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block' }}
                      />
                      <span className="s" style={{ fontSize: 10 }}>{p.name}</span>
                    </div>
                  </td>
                  {cols.map(([label, key], i) => (
                    <td key={label + i} className="m" style={{ textAlign: 'right', padding: '4px 6px', fontWeight: key === axis.key ? 700 : 400, color: key === axis.key ? color : '#D4D0C8' }}>
                      {i === 0 ? fmtCell(isPitching ? p.ip : p.pa) : fmtCell(p[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function TeamRadarSlideshow({ rows, cFIP }: { rows: TeamRadarRow[]; cFIP: number }) {
  const teamOrder = useMemo(
    () => rows
      .map(r => ({ row: r, meta: MLB_TEAMS.find(t => t.id === r.teamId) }))
      .filter((x): x is { row: TeamRadarRow; meta: NonNullable<typeof x.meta> } => !!x.meta)
      .sort((a, b) => a.meta.short.localeCompare(b.meta.short)),
    [rows]
  )

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hover, setHover] = useState<{ axis: TeamRadarAxisKey; x: number; y: number } | null>(null)
  const [rosterCache, setRosterCache] = useState<Record<number, { pitchers: RadarPlayerLine[]; batters: RadarPlayerLine[] }>>({})
  // Leaving the dot doesn't close the card immediately — it's delayed a
  // beat so the cursor can travel from the dot onto the card itself (to
  // scroll the roster list) without the card vanishing mid-move. Entering
  // either the dot or the card cancels the pending close.
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClear = () => { if (clearTimer.current) { clearTimeout(clearTimer.current); clearTimer.current = null } }
  const scheduleClear = () => { cancelClear(); clearTimer.current = setTimeout(() => setHover(null), 150) }
  const handleHoverAxis = (axis: TeamRadarAxisKey, x: number, y: number) => { cancelClear(); setHover({ axis, x, y }) }
  useEffect(() => () => cancelClear(), [])

  const current = teamOrder[index % teamOrder.length]
  // Loading is derived, not stored — true exactly while the current team's
  // roster fetch (kicked off below) hasn't landed in the cache yet.
  const loadingTeamId = current && rosterCache[current.row.teamId] === undefined ? current.row.teamId : null

  useEffect(() => {
    if (paused || teamOrder.length === 0) return
    const t = setInterval(() => setIndex(i => (i + 1) % teamOrder.length), SLIDE_MS)
    return () => clearInterval(t)
  }, [paused, teamOrder.length])

  useEffect(() => {
    if (!current) return
    const teamId = current.row.teamId
    if (rosterCache[teamId] !== undefined) return
    getTeamRosterBreakdown(teamId, SEASON, cFIP)
      .then(data => setRosterCache(prev => ({ ...prev, [teamId]: data })))
  }, [current, cFIP, rosterCache])

  if (!current) {
    return (
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-4 text-[11px] text-[#8A8577] text-center py-10">
        Team radar unavailable right now.
      </div>
    )
  }

  const axes = buildAxes(current.row, rows)
  const score = compositeScore(axes)
  const hoveredAxisDef = hover ? axes.find(a => a.key === hover.axis) : undefined
  const roster = rosterCache[current.row.teamId]
  const playersForAxis = hoveredAxisDef
    ? (hoveredAxisDef.group === 'Pitching' ? roster?.pitchers : roster?.batters) ?? []
    : []

  return (
    <div
      className="rounded-lg border border-[#E8E4DC] bg-white p-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[12px] font-serif font-bold text-[#1A1A1A]">Most rounded team</div>
          <div className="text-[9.5px] text-[#8A8577]">20 axes, half pitching half batting — {paused ? 'paused' : `advances every ${SLIDE_MS / 1000}s`}. Hover a point for the full roster line behind it.</div>
        </div>
        <div className="flex items-center gap-1">
          {teamOrder.map((t, i) => (
            <button
              key={t.row.teamId}
              onClick={() => setIndex(i)}
              aria-label={t.meta.short}
              style={{ width: 5, height: 5, borderRadius: 999, background: i === index % teamOrder.length ? ORANGE : '#DEDACE', border: 'none', cursor: 'pointer', padding: 0 }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div style={{ position: 'relative' }}>
          <RadarShape
            axes={axes}
            hoveredAxis={hover?.axis ?? null}
            onHoverAxis={handleHoverAxis}
            onLeaveAxis={scheduleClear}
          />
          {hoveredAxisDef && hover && (
            <PlayerBreakdownCard
              axis={hoveredAxisDef}
              players={playersForAxis}
              loading={loadingTeamId === current.row.teamId}
              dotX={hover.x}
              dotY={hover.y}
              onMouseEnter={cancelClear}
              onMouseLeave={scheduleClear}
            />
          )}
        </div>

        <div style={{ minWidth: 140 }}>
          <div className="flex items-center gap-2 mb-2">
            <img src={teamLogoUrl(current.row.teamId)} alt="" width={28} height={28} />
            <div>
              <div className="text-[14px] font-serif font-bold text-[#1A1A1A]">{current.meta.short}</div>
              <div className="text-[9px] text-[#8A8577] uppercase tracking-wide">{current.row.teamName}</div>
            </div>
          </div>
          <div className="text-[24px] font-black leading-none" style={{ color: ORANGE }}>{score}</div>
          <div className="text-[9px] text-[#8A8577] uppercase tracking-wide mb-2">all-round score</div>
          <div className="flex items-center gap-3 text-[9px]">
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: BLUE, display: 'inline-block' }} />Pitching</span>
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: ORANGE, display: 'inline-block' }} />Batting</span>
          </div>
        </div>
      </div>
    </div>
  )
}
