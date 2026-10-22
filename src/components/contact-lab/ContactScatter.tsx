'use client'

// src/components/contact-lab/ContactScatter.tsx
//
// League scatter of Pull AIR% (x) against Barrel% (y), one dot per hitter with MIN_LEADERBOARD+ batted balls, shared by the
// Contact Engine page and the Batting Lab Contact tab. Dashed lines are the MEDIAN of the hitters shown. The selected hitter
// is highlighted (yellow, larger). Hover for a hitter and his sample. Custom SVG: Recharts has no clean way to mark one
// point and draw median lines in data units here. Props are plain data.

import { useState } from 'react'
import { C, Foot } from '@/components/team/ui'
import { MIN_LEADERBOARD, STABLE_BBE, type LeaderRow } from '@/lib/contact-profile/model'

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`
const fmt = (n: number) => n.toLocaleString('en-US')
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export default function ContactScatter({ rows, season, selectedId, onSelect }: {
  rows: LeaderRow[]; season: number; selectedId?: number | null; onSelect?: (id: number | null) => void
}) {
  const [tip, setTip] = useState<{ x: number; y: number; r: LeaderRow } | null>(null)
  const W = 760, H = 440, L = 54, R = 16, T = 14, B = 46
  const xs = rows.map(r => r.pullAir), ys = rows.map(r => r.barrel)
  const xl: [number, number] = [Math.max(0, Math.floor((Math.min(...xs, 0.05) - 0.01) * 20) / 20), Math.ceil((Math.max(...xs, 0.3) + 0.01) * 20) / 20]
  const yl: [number, number] = [0, Math.ceil((Math.max(...ys, 0.12) + 0.01) * 20) / 20]
  const X = (v: number) => L + ((W - L - R) * (v - xl[0])) / (xl[1] - xl[0])
  const Y = (v: number) => T + (H - T - B) * (1 - (v - yl[0]) / (yl[1] - yl[0]))
  const mx = median(xs), my = median(ys)
  const xt: number[] = [], yt: number[] = []
  for (let v = xl[0]; v <= xl[1] + 1e-9; v += 0.05) xt.push(Math.round(v * 100) / 100)
  for (let v = 0; v <= yl[1] + 1e-9; v += 0.04) yt.push(Math.round(v * 100) / 100)
  const sel = selectedId != null ? rows.find(r => r.id === selectedId) ?? null : null
  const others = rows.filter(r => r.id !== selectedId)

  return (
    <div>
      <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 8px' }}>
        {rows.length} hitters. Filled dot: {STABLE_BBE}+ batted balls; hollow: {MIN_LEADERBOARD}–{STABLE_BBE - 1}. Orange dashed lines are the median of the hitters shown (Pull AIR% {pct(mx)}, Barrel% {pct(my)}).
        {sel ? <> <b style={{ color: C.ink }}>{sel.name}</b>: Pull AIR% {pct(sel.pullAir)}, Barrel% {pct(sel.barrel)}, n = {fmt(sel.n)} batted balls.{onSelect ? <> <button type="button" onClick={() => onSelect(null)} style={{ all: 'unset', cursor: 'pointer', color: C.orange, fontWeight: 700 }}>Clear</button></> : null}</> : null}
        {!sel && selectedId != null ? <> He is not in the scatter: under {MIN_LEADERBOARD} batted balls in {season}.</> : null}
      </p>
      <div style={{ position: 'relative' }} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Pull AIR% against Barrel% for ${rows.length} hitters with ${MIN_LEADERBOARD} or more batted balls in ${season}${sel ? `; ${sel.name} highlighted` : ''}`}>
          {yt.map(v => <g key={`y${v}`}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={C.line} /><text x={L - 8} y={Y(v) + 4} fontSize={11} textAnchor="end" fill={C.mute}>{Math.round(v * 100)}%</text></g>)}
          {xt.map(v => <g key={`x${v}`}><line y1={T} y2={H - B} x1={X(v)} x2={X(v)} stroke={C.soft} /><text x={X(v)} y={H - B + 16} fontSize={11} textAnchor="middle" fill={C.mute}>{Math.round(v * 100)}%</text></g>)}
          <line x1={X(mx)} x2={X(mx)} y1={T} y2={H - B} stroke={C.orange} strokeDasharray="5 4" />
          <line x1={L} x2={W - R} y1={Y(my)} y2={Y(my)} stroke={C.orange} strokeDasharray="5 4" />
          {others.map(r => (
            <circle key={r.id} cx={X(r.pullAir)} cy={Y(r.barrel)} r={4.4} fill={r.n >= STABLE_BBE ? C.ink : '#fff'} fillOpacity={r.n >= STABLE_BBE ? (sel ? 0.45 : 0.75) : 1} stroke={C.ink} strokeWidth={1.2}
              style={onSelect ? { cursor: 'pointer' } : undefined} onClick={onSelect ? () => onSelect(r.id) : undefined}
              onMouseMove={e => { const b = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect(); setTip({ x: e.clientX - b.left + 12, y: e.clientY - b.top + 12, r }) }} />
          ))}
          {sel && <circle cx={X(sel.pullAir)} cy={Y(sel.barrel)} r={9} fill={C.yellow} stroke={C.ink} strokeWidth={2.4}
            onMouseMove={e => { const b = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect(); setTip({ x: e.clientX - b.left + 12, y: e.clientY - b.top + 12, r: sel }) }} />}
          <text x={(L + W - R) / 2} y={H - 6} fontSize={11} fontWeight={700} textAnchor="middle" fill="#5b5347">Pull AIR% (pulled air balls ÷ batted balls) →</text>
          <text transform={`translate(13 ${(T + H - B) / 2}) rotate(-90)`} fontSize={11} fontWeight={700} textAnchor="middle" fill="#5b5347">Barrel% ↑</text>
        </svg>
        {tip && (
          <div style={{ position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none', background: C.ink, color: '#fff', fontSize: 12, padding: '7px 10px', borderRadius: 8, lineHeight: 1.4, whiteSpace: 'nowrap', zIndex: 5 }}>
            <b>{tip.r.name}</b> {tip.r.team}<br />Barrel {pct(tip.r.barrel)} · Pull AIR {pct(tip.r.pullAir)}<br />n = {fmt(tip.r.n)} batted balls
          </div>
        )}
      </div>
      <Foot>Source: Baseball Savant via pybaseball. Barrel% = barrels ÷ batted balls; Pull AIR% = pulled fly balls, line drives and popups ÷ batted balls, with spray mirrored for left-handed hitters. Minimum {MIN_LEADERBOARD} batted balls in the {season} regular season; dashed lines are medians of the hitters shown. Hover a dot for the hitter and his sample.</Foot>
    </div>
  )
}
