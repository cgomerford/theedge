'use client'

// src/components/contact-shape/ContactMap.tsx
//
// The contact map: launch angle across, exit velocity up. Three views: every batted ball as a dot over what the league produced in each box; the share of his balls in each box; or his share minus the
// league's (or minus a second hitter's). Optional contact box outline and the barrel and sweet-spot guides. Pure drawing: the numbers come from src/lib/contact-shape/math.ts.

import { GRID, cellX, type Ball, type Grid, type Zone, evOf, isHit } from '@/lib/contact-shape/math'

export type MapMode = 'dots' | 'density' | 'diff'
const CW = 22, CH = 18, ML = 46, MB = 34, MT = 8, MR = 8
const W = ML + GRID.laBins * CW + MR, H = MT + GRID.evBins * CH + MB
const ORANGE = [255, 87, 34], BLUE = [69, 106, 144], PAPER = [250, 248, 243]
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t)))).join(',')})`
const xOf = (la: number) => ML + ((Math.max(GRID.laStart, Math.min(GRID.laStart + GRID.laBins * GRID.laStep, la)) - GRID.laStart) / GRID.laStep) * CW
const yOf = (ev: number) => MT + (GRID.evBins - (Math.max(GRID.evStart, Math.min(GRID.evStart + GRID.evBins * GRID.evStep, ev)) - GRID.evStart) / GRID.evStep) * CH

export default function ContactMap({ balls, mine, against: refGrid, league, mode, zone, onCell, label, compact = false }: {
  balls: Ball[]; mine: Grid; against: Grid; league: Grid; mode: MapMode; zone?: Zone | null; onCell?: (e: number, a: number) => void; label: string; compact?: boolean
}) {
  const total = mine.flat().reduce((s, c) => s + c.n, 0) || 1, rtotal = refGrid.flat().reduce((s, c) => s + c.n, 0) || 1
  let maxShare = 0, maxDiff = 0
  mine.forEach((r, e) => r.forEach((c, a) => { const s = c.n / total; maxShare = Math.max(maxShare, s); maxDiff = Math.max(maxDiff, Math.abs(s - refGrid[e][a].n / rtotal)) }))
  const fill = (e: number, a: number): string => {
    if (mode === 'density') return mix(PAPER, ORANGE, maxShare > 0 ? (mine[e][a].n / total / maxShare) ** 0.7 : 0)
    if (mode === 'diff') { const d = mine[e][a].n / total - refGrid[e][a].n / rtotal; return d >= 0 ? mix(PAPER, ORANGE, maxDiff > 0 ? d / maxDiff : 0) : mix(PAPER, BLUE, maxDiff > 0 ? -d / maxDiff : 0) }
    const x = league[e][a].n >= 30 ? cellX(league[e][a]) : null
    return x == null ? '#f4f1ea' : mix([244, 241, 234], [86, 74, 52], (x - 0.05) / 1.1)
  }
  const ticksEv = [40, 60, 80, 100], ticksLa = [-60, -40, -20, 0, 20, 40, 60]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block', maxWidth: compact ? 520 : 760 }}>
      {Array.from({ length: GRID.evBins }, (_, e) => Array.from({ length: GRID.laBins }, (_, a) => (
        <rect key={`${e}-${a}`} x={ML + a * CW} y={MT + (GRID.evBins - 1 - e) * CH} width={CW} height={CH} fill={fill(e, a)} stroke="#fff" strokeWidth={0.5}
          onPointerEnter={onCell ? () => onCell(e, a) : undefined} onPointerDown={onCell ? () => onCell(e, a) : undefined} />
      )))}
      {mode === 'dots' && balls.map((b, i) => <circle key={i} cx={xOf(b[1])} cy={yOf(evOf(b))} r={compact ? 1.8 : 2.3} fill={isHit(b) ? '#FF5722' : '#6b6558'} fillOpacity={isHit(b) ? 0.75 : 0.5} pointerEvents="none" />)}
      <path d={`M${xOf(26)},${yOf(98)} L${xOf(8)},${yOf(116)} L${xOf(50)},${yOf(116)} L${xOf(30)},${yOf(98)} Z`} fill="none" stroke="#1A1A1A" strokeWidth={1.2} strokeDasharray="4 3" pointerEvents="none" />
      <text x={xOf(29)} y={yOf(114) + 12} fontSize={9.5} fontWeight={800} fill="#1A1A1A" textAnchor="middle" pointerEvents="none">barrel zone</text>
      <line x1={xOf(8)} x2={xOf(8)} y1={yOf(116)} y2={yOf(40)} stroke="#1A1A1A" strokeOpacity={0.35} strokeDasharray="2 3" pointerEvents="none" />
      <line x1={xOf(32)} x2={xOf(32)} y1={yOf(116)} y2={yOf(40)} stroke="#1A1A1A" strokeOpacity={0.35} strokeDasharray="2 3" pointerEvents="none" />
      {zone && <rect x={xOf(zone.laMin)} y={yOf(zone.evMax)} width={xOf(zone.laMax) - xOf(zone.laMin)} height={yOf(zone.evMin) - yOf(zone.evMax)} fill="#FDE047" fillOpacity={0.22} stroke="#B83A0E" strokeWidth={2} pointerEvents="none" />}
      {ticksEv.map(v => <text key={v} x={ML - 6} y={yOf(v) + 3.5} fontSize={11} fill="#5b5347" textAnchor="end" fontWeight={600}>{v}</text>)}
      {ticksLa.map(v => <text key={v} x={xOf(v)} y={H - MB + 15} fontSize={11} fill="#5b5347" textAnchor="middle" fontWeight={600}>{v}°</text>)}
      <text x={ML + (GRID.laBins * CW) / 2} y={H - 4} fontSize={11.5} fill="#1A1A1A" textAnchor="middle" fontWeight={800}>Launch angle</text>
      <text transform={`translate(11 ${MT + (GRID.evBins * CH) / 2}) rotate(-90)`} fontSize={11.5} fill="#1A1A1A" textAnchor="middle" fontWeight={800}>Exit velocity (mph)</text>
    </svg>
  )
}
