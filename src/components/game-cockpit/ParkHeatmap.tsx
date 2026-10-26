// Smooth heatmap of every hit (single, double, triple, home run) hit at a ballpark, last 3 seasons, both teams.
// Server-rendered SVG: a Gaussian density on a grid of 8 ft cells, drawn behind the park's real outfield wall (MLB fieldInfo distances).
// Data: park_hit_map (scripts/compute-park-hits.ts). Positions are Statcast landing coordinates in feet from home plate.
import ThroughDate from '@/components/data/ThroughDate'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { ParkHitMap } from '@/lib/park-index'
import type { VenueFieldDimensions } from '@/lib/venue-dimensions'

const CELL = 10         // feet per grid cell
const SIGMA = 14        // feet: how far each hit spreads (the smoothing)
const X0 = -300, X1 = 300, Y0 = -10, Y1 = 440

function ramp(t: number): string {
  // 0 = faint yellow, 1 = deep red-orange (brand yellow -> orange)
  const a = Math.min(1, Math.max(0, t))
  const mix = (c1: number[], c2: number[], k: number) => c1.map((v, i) => Math.round(v + (c2[i] - v) * k))
  const yellow = [253, 224, 71], orange = [255, 87, 34], deep = [150, 30, 10]
  const rgb = a < 0.55 ? mix(yellow, orange, a / 0.55) : mix(orange, deep, (a - 0.55) / 0.45)
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}

function density(points: number[], kinds: number[]): { cells: { x: number; y: number; v: number }[]; max: number } {
  const nx = Math.ceil((X1 - X0) / CELL), ny = Math.ceil((Y1 - Y0) / CELL)
  const g = new Float32Array(nx * ny)
  const R = Math.ceil((SIGMA * 2.5) / CELL)
  for (let i = 0; i < points.length; i += 3) {
    if (!kinds.includes(points[i + 2])) continue
    const px = points[i], py = points[i + 1]
    const cx = Math.floor((px - X0) / CELL), cy = Math.floor((py - Y0) / CELL)
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const gx = cx + dx, gy = cy + dy
      if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) continue
      const ex = X0 + (gx + 0.5) * CELL - px, ey = Y0 + (gy + 0.5) * CELL - py
      g[gy * nx + gx] += Math.exp(-(ex * ex + ey * ey) / (2 * SIGMA * SIGMA))
    }
  }
  let max = 0
  for (const v of g) if (v > max) max = v
  const cells: { x: number; y: number; v: number }[] = []
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) {
    const v = g[gy * nx + gx] / (max || 1)
    if (v > 0.06) cells.push({ x: X0 + gx * CELL, y: Y0 + gy * CELL, v })
  }
  return { cells, max }
}

function wallPath(d: VenueFieldDimensions | null): string | null {
  if (!d) return null
  const marks: [number, number | null][] = [[-45, d.leftLine], [-22.5, d.leftCenter], [0, d.center], [22.5, d.rightCenter], [45, d.rightLine]]
  const P = marks.filter((m): m is [number, number] => m[1] != null).map(([deg, ft]) => [ft * Math.sin((deg * Math.PI) / 180), -ft * Math.cos((deg * Math.PI) / 180)] as [number, number])
  if (P.length < 3) return null
  let s = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] ?? P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] ?? P[i + 1]
    s += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return s
}

const VIEWS = [
  { id: 'all', label: 'All hits', kinds: [1, 2, 3, 4] },
  { id: 's', label: 'Singles', kinds: [1] },
  { id: 'd', label: 'Doubles', kinds: [2] },
  { id: 't', label: 'Triples', kinds: [3] },
  { id: 'h', label: 'Home runs', kinds: [4] },
] as const

function Heat({ cells }: { cells: { x: number; y: number; v: number }[] }) {
  return (
    <g shapeRendering="crispEdges">
      {cells.map((c, i) => <rect key={i} x={c.x} y={-(c.y + CELL)} width={CELL + 0.4} height={CELL + 0.4} fill={ramp(c.v)} fillOpacity={Math.min(0.9, 0.12 + c.v * 0.85)} />)}
    </g>
  )
}
// Home runs are rings, triples are filled triangles: shape as well as colour, so they read on top of the heat.
function Dots({ points, kind }: { points: number[]; kind: 3 | 4 }) {
  const out: React.ReactNode[] = []
  for (let i = 0; i < points.length; i += 3) {
    if (points[i + 2] !== kind) continue
    const x = points[i], y = -points[i + 1]
    out.push(kind === 4
      ? <circle key={i} cx={x} cy={y} r={5} fill="#fff" fillOpacity={0.55} stroke="#1A1A1A" strokeWidth={1.6} />
      : <polygon key={i} points={`${x},${y - 7} ${x - 6},${y + 5} ${x + 6},${y + 5}`} fill="#1A1A1A" fillOpacity={0.85} />)
  }
  return <g>{out}</g>
}

export default function ParkHeatmap({ map, dims, venue }: { map: ParkHitMap; dims: VenueFieldDimensions | null; venue: string }) {
  const heat123 = density(map.points, [1, 2, 3]).cells
  const heatS = density(map.points, [1]).cells
  const heatD = density(map.points, [2]).cells
  const counts: Record<string, number> = { all: 0, s: 0, d: 0, t: 0, h: 0 }
  for (let i = 2; i < map.points.length; i += 3) { const k = map.points[i]; counts.all++; counts[k === 1 ? 's' : k === 2 ? 'd' : k === 3 ? 't' : 'h']++ }
  const wall = wallPath(dims)
  const lf = dims?.leftLine, rf = dims?.rightLine
  const foulEnd = (deg: number, ft: number): [string, string] => [(ft * Math.sin((deg * Math.PI) / 180)).toFixed(1), (-ft * Math.cos((deg * Math.PI) / 180)).toFixed(1)]
  const small = VIEWS.some(v => counts[v.id] < MIN_SAMPLE.sprayBBE)
  const css = VIEWS.map(v => `#ph-${v.id}:checked ~ svg .pv-${v.id}{display:inline}#ph-${v.id}:checked ~ .ph-chips label[for=ph-${v.id}]{border-bottom-color:#FF5722;color:#1A1A1A}`).join('')
  return (
    <figure style={{ margin: '14px 0 0', position: 'relative' }}>
      <style>{`.ph-v{display:none}${css}.ph-chips{display:flex;flex-wrap:wrap;gap:4px 16px;margin-bottom:6px}.ph-chips label{cursor:pointer;font-size:13px;font-weight:800;color:#8a8275;border-bottom:3px solid transparent;padding:4px 0 3px}.ph-radio{position:absolute;opacity:0;pointer-events:none}.ph-radio:focus-visible ~ .ph-chips{outline:2px solid #1A1A1A}`}</style>
      {VIEWS.map((v, i) => <input key={v.id} className="ph-radio" type="radio" name="ph-view" id={`ph-${v.id}`} defaultChecked={i === 0} aria-label={v.label} />)}
      <div className="ph-chips" role="group" aria-label="Hit type">
        {VIEWS.map(v => <label key={v.id} htmlFor={`ph-${v.id}`}>{v.label} <span style={{ fontWeight: 500 }}>n {counts[v.id].toLocaleString('en-US')}{counts[v.id] < MIN_SAMPLE.sprayBBE ? <span style={{ color: '#FF5722' }}>*</span> : null}</span></label>)}
      </div>
      <svg viewBox={`${X0} ${-Y1} ${X1 - X0} ${Y1 - Y0 + 10}`} width="100%" role="img" aria-label={`Where hits landed at ${venue}, ${map.nHits.toLocaleString('en-US')} hits`} style={{ display: 'block' }}>
        <polygon points="0,0 63.6,-63.6 0,-127.3 -63.6,-63.6" fill="none" stroke="#d9d2c3" strokeWidth="1.5" />
        {lf ? <line x1="0" y1="0" x2={foulEnd(-45, lf)[0]} y2={foulEnd(-45, lf)[1]} stroke="#d9d2c3" strokeWidth="1.5" /> : null}
        {rf ? <line x1="0" y1="0" x2={foulEnd(45, rf)[0]} y2={foulEnd(45, rf)[1]} stroke="#d9d2c3" strokeWidth="1.5" /> : null}
        <g className="ph-v pv-all"><Heat cells={heat123} /><Dots points={map.points} kind={4} /></g>
        <g className="ph-v pv-s"><Heat cells={heatS} /></g>
        <g className="ph-v pv-d"><Heat cells={heatD} /></g>
        <g className="ph-v pv-t"><Dots points={map.points} kind={3} /></g>
        <g className="ph-v pv-h"><Dots points={map.points} kind={4} /></g>
        {wall ? <path d={wall} fill="none" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" /> : null}
        <circle cx="0" cy="0" r="4" fill="#1A1A1A" />
      </svg>
      <figcaption style={{ fontSize: 13, color: '#8a8275', fontVariantNumeric: 'tabular-nums' }}>
        Where hits landed at {venue}, both teams. n = {map.nHits.toLocaleString('en-US')} hits, {map.seasons}. Singles and doubles are a heat map (darker = more hits); home runs are rings and triples are triangles.
        {wall ? '' : ' Outfield wall not drawn: the park\'s distances are not published.'}
        <ThroughDate date={map.through} />
        {small ? <div>* Small sample size: under {MIN_SAMPLE.sprayBBE} hits of that type. Read with caution.</div> : null}
      </figcaption>
    </figure>
  )
}
