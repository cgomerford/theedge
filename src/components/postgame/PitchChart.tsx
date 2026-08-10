// src/components/postgame/PitchChart.tsx
//
// Plain inline SVG — no recharts/Plotly/Chart.js dependency, matching the
// project's existing pattern of hand-rolled SVG (see the chevron/lock icons
// in MatchupTilt.tsx). Two charts:
//
//  - PitchLocationChart: strike-zone scatter for one pitcher, colored by
//    pitch type, using pitchData.coordinates (pX/pZ) against the batter's
//    actual strike zone for that pitch (strikeZoneTop/Bottom vary pitch to
//    pitch with batter height/stance, so we use the average zone for the
//    frame rather than a fixed rectangle).
//
//  - SprayChart: generic fan-shaped field outline with battedBalls plotted
//    from Statcast-style coordX/coordY. This is NOT stadium-accurate
//    geometry (real outfield walls vary park to park) — it's a standard
//    generic diamond, same convention Baseball Savant uses for its spray
//    chart when no park-specific SVG is loaded.

import type { PitchRecord, BattedBallRecord } from '@/types/postgame'

const TYPE_COLORS: Record<string, string> = {
  FF: '#FF5722', SI: '#1A1A1A', ST: '#FDE047', SL: '#2C6E8F',
  CH: '#6b6b66', FS: '#8B5CF6', CU: '#15803d', KC: '#DC2626',
  FC: '#EA580C',
}
const DEFAULT_COLOR = '#A8A29E'

export function PitchLocationChart({ pitches }: { pitches: PitchRecord[] }) {
  const withCoords = pitches.filter(p => p.plateX != null && p.plateZ != null)
  if (withCoords.length === 0) {
    return <div className="font-mono text-[11px] text-stone-400 py-8 text-center">No pitch coordinate data for this pitcher.</div>
  }

  const avgTop = avg(withCoords.map(p => p.strikeZoneTop).filter((n): n is number => n != null)) ?? 3.4
  const avgBottom = avg(withCoords.map(p => p.strikeZoneBottom).filter((n): n is number => n != null)) ?? 1.6

  // view: -2.5..2.5 ft horizontal, 0..5 ft vertical, catcher's-eye-view (SVG y flips)
  const W = 260, H = 300, PAD = 20
  const xScale = (ftX: number) => PAD + ((ftX + 2.5) / 5) * (W - PAD * 2)
  const yScale = (ftZ: number) => H - PAD - ((ftZ - 0) / 5) * (H - PAD * 2)

  const zoneLeft = xScale(-0.7083)  // 17in plate half-width in feet
  const zoneRight = xScale(0.7083)
  const zoneTop = yScale(avgTop)
  const zoneBottom = yScale(avgBottom)

  const typesPresent = Array.from(new Set(withCoords.map(p => p.typeCode).filter(Boolean))) as string[]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Pitch location chart">
        <rect x={0} y={0} width={W} height={H} fill="#FAF8F3" />
        {/* strike zone */}
        <rect
          x={zoneLeft} y={zoneTop} width={zoneRight - zoneLeft} height={zoneBottom - zoneTop}
          fill="none" stroke="#1A1A1A" strokeWidth={1.5}
        />
        {/* home plate hint */}
        <line x1={PAD} y1={H - PAD + 4} x2={W - PAD} y2={H - PAD + 4} stroke="#D9D5C9" strokeWidth={1} />
        {withCoords.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.plateX!)}
            cy={yScale(p.plateZ!)}
            r={4}
            fill={TYPE_COLORS[p.typeCode ?? ''] ?? DEFAULT_COLOR}
            fillOpacity={0.75}
            stroke="#fff"
            strokeWidth={0.75}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {typesPresent.map(t => (
          <span key={t} className="inline-flex items-center gap-1 font-mono text-[9.5px] text-stone-500">
            <span className="inline-block w-2 h-2" style={{ background: TYPE_COLORS[t] ?? DEFAULT_COLOR }} />
            {pitches.find(p => p.typeCode === t)?.typeDescription ?? t}
          </span>
        ))}
      </div>
    </div>
  )
}

export function SprayChart({ battedBalls }: { battedBalls: BattedBallRecord[] }) {
  const withCoords = battedBalls.filter(b => b.coordX != null && b.coordY != null)
  if (withCoords.length === 0) {
    return <div className="font-mono text-[11px] text-stone-400 py-8 text-center">No batted-ball coordinate data for this game.</div>
  }

  // Savant-style raw coords run roughly 0-250 on both axes, home plate near
  // (125, 204) with y increasing downward. Mapped directly into a square
  // viewBox — generic field proportions, not a specific park's dimensions.
  const SIZE = 320
  const scale = SIZE / 250
  const hardHitThreshold = 95 // mph — used purely for dot sizing/emphasis here

  // Field geometry, all computed from home plate + trig rather than
  // independently-guessed coordinates, so the foul lines, fence arc, and
  // infield diamond are actually consistent with each other.
  const home = { x: SIZE * 0.5, y: SIZE * 0.86 }
  const fenceRadius = SIZE * 0.66
  const infieldRadius = SIZE * 0.11
  // angle 0° = +x (right), 90° = +y (down, since SVG y grows downward).
  // "Straight up the middle" from home is -90°. Foul lines sit 45° either
  // side of that, i.e. -135° (left field line) and -45° (right field line).
  const toXY = (center: { x: number; y: number }, angleDeg: number, r: number) => ({
    x: center.x + r * Math.cos((angleDeg * Math.PI) / 180),
    y: center.y + r * Math.sin((angleDeg * Math.PI) / 180),
  })
  const leftFoulPole = toXY(home, -135, fenceRadius)
  const rightFoulPole = toXY(home, -45, fenceRadius)
  const firstBase = toXY(home, -45, infieldRadius)
  const thirdBase = toXY(home, -135, infieldRadius)
  const secondBase = toXY(home, -90, infieldRadius * Math.SQRT2)
  const mound = toXY(home, -90, infieldRadius * 1.05)

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="mx-auto" role="img" aria-label="Spray chart">
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="#FAF8F3" />

      {/* outfield fence — true arc centered on home, so it actually meets
          the foul lines instead of floating disconnected from them */}
      <path
        d={`M ${leftFoulPole.x} ${leftFoulPole.y} A ${fenceRadius} ${fenceRadius} 0 0 1 ${rightFoulPole.x} ${rightFoulPole.y}`}
        fill="none" stroke="#D9D5C9" strokeWidth={2}
      />
      {/* foul lines — home plate to the fence, along the same angles used
          to compute the fence endpoints above */}
      <line x1={home.x} y1={home.y} x2={leftFoulPole.x} y2={leftFoulPole.y} stroke="#D9D5C9" strokeWidth={1.25} />
      <line x1={home.x} y1={home.y} x2={rightFoulPole.x} y2={rightFoulPole.y} stroke="#D9D5C9" strokeWidth={1.25} />

      {/* infield dirt diamond */}
      <polygon
        points={`${home.x},${home.y} ${firstBase.x},${firstBase.y} ${secondBase.x},${secondBase.y} ${thirdBase.x},${thirdBase.y}`}
        fill="#EFE7D6" stroke="#D9D5C9" strokeWidth={1}
      />
      <circle cx={mound.x} cy={mound.y} r={3} fill="#D9D5C9" />
      {[firstBase, secondBase, thirdBase].map((base, i) => (
        <rect key={i} x={base.x - 2.5} y={base.y - 2.5} width={5} height={5} fill="#fff" stroke="#B8B2A0" strokeWidth={0.75} />
      ))}

      {withCoords.map((b, i) => {
        const isHit = b.resultEvent && ['single', 'double', 'triple', 'home_run'].includes(b.resultEvent)
        const hard = (b.launchSpeed ?? 0) >= hardHitThreshold
        return (
          <circle
            key={i}
            cx={b.coordX! * scale}
            cy={b.coordY! * scale}
            r={hard ? 5.5 : 3.5}
            fill={isHit ? '#FF5722' : '#A8A29E'}
            fillOpacity={isHit ? 0.9 : 0.55}
            stroke="#fff"
            strokeWidth={0.75}
          />
        )
      })}
      <circle cx={home.x} cy={home.y} r={2.5} fill="#1A1A1A" />
    </svg>
  )
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}