// Smooth heatmap of every hit (single, double, triple, home run) hit at a ballpark, last 3 seasons, both teams.
// Server-rendered SVG: a Gaussian density on a grid of 8 ft cells, drawn behind the park's real outfield wall (MLB fieldInfo distances).
// Data: park_hit_map (scripts/compute-park-hits.ts). Positions are Statcast landing coordinates in feet from home plate.
import ThroughDate from '@/components/data/ThroughDate'
import type { ParkHitMap } from '@/lib/park-index'
import type { VenueFieldDimensions } from '@/lib/venue-dimensions'

const CELL = 8          // feet per grid cell
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

function density(points: number[]): { cells: { x: number; y: number; v: number }[]; max: number } {
  const nx = Math.ceil((X1 - X0) / CELL), ny = Math.ceil((Y1 - Y0) / CELL)
  const g = new Float32Array(nx * ny)
  const R = Math.ceil((SIGMA * 2.5) / CELL)
  for (let i = 0; i < points.length; i += 3) {
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
    if (v > 0.04) cells.push({ x: X0 + gx * CELL, y: Y0 + gy * CELL, v })
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

export default function ParkHeatmap({ map, dims, venue }: { map: ParkHitMap; dims: VenueFieldDimensions | null; venue: string }) {
  const { cells } = density(map.points)
  const wall = wallPath(dims)
  const lf = dims?.leftLine, rf = dims?.rightLine
  const foul = (deg: number, ft: number) => `${(ft * Math.sin((deg * Math.PI) / 180)).toFixed(1)},${(-ft * Math.cos((deg * Math.PI) / 180)).toFixed(1)}`
  return (
    <figure style={{ margin: '14px 0 0' }}>
      <svg viewBox={`${X0} ${-Y1} ${X1 - X0} ${Y1 - Y0 + 10}`} width="100%" role="img" aria-label={`Where hits landed at ${venue}, ${map.nHits.toLocaleString('en-US')} hits`} style={{ display: 'block' }}>
        {/* infield diamond, 90 ft bases */}
        <polygon points={`0,0 ${63.6},${-63.6} 0,${-127.3} ${-63.6},${-63.6}`} fill="none" stroke="#d9d2c3" strokeWidth="1.5" />
        {lf ? <line x1="0" y1="0" x2={foul(-45, lf).split(',')[0]} y2={foul(-45, lf).split(',')[1]} stroke="#d9d2c3" strokeWidth="1.5" /> : null}
        {rf ? <line x1="0" y1="0" x2={foul(45, rf).split(',')[0]} y2={foul(45, rf).split(',')[1]} stroke="#d9d2c3" strokeWidth="1.5" /> : null}
        <g shapeRendering="crispEdges">
          {cells.map((c, i) => <rect key={i} x={c.x} y={-(c.y + CELL)} width={CELL + 0.4} height={CELL + 0.4} fill={ramp(c.v)} fillOpacity={Math.min(0.9, 0.12 + c.v * 0.85)} />)}
        </g>
        {wall ? <path d={wall} fill="none" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" /> : null}
        <circle cx="0" cy="0" r="4" fill="#1A1A1A" />
      </svg>
      <figcaption style={{ fontSize: 13, color: '#8a8275', fontVariantNumeric: 'tabular-nums' }}>
        Where hits landed at {venue}: singles, doubles, triples and home runs, both teams. n = {map.nHits.toLocaleString('en-US')} hits, {map.seasons}. Darker = more hits.
        {wall ? '' : ' Outfield wall not drawn: the park\'s distances are not published.'}
        <ThroughDate date={map.through} />
      </figcaption>
    </figure>
  )
}
