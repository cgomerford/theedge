'use client'

// src/components/sequencing-lab/FlightResult.tsx
//
// One pitch seen from behind the plate (the Pitching Lab's Scene), with a ring and the result drawn at the plate once the ball lands. Shared by the League pitch finder and the
// stacked at-bat player. `p` is the progress of the flight, 0 to 1; the parent owns the clock.

import { C } from '@/components/team/ui'
import { H, PLATE_Y, Scene, W, proj, type PitchPath } from '@/components/pitching-lab/PitchFlight'
import { RESULTS, type ResultCode } from '@/lib/sequencing-lab/sequence'

export const RES_COLOR: Record<ResultCode, string> = { B: '#9DB4D6', C: '#0072B2', W: '#D55E00', F: '#E69F00', XH: '#c0392b', XO: '#8a8275' }

export default function FlightResult({ path, p, result }: { path: PitchPath; p: number; result: ResultCode | null }) {
  const plate = proj({ x: path.plate.x, y: PLATE_Y, z: path.plate.z })
  const col = result ? RES_COLOR[result] : C.mute
  return (
    <div style={{ position: 'relative' }}>
      <Scene paths={[path]} p={p} showPlate />
      {p >= 1 && result && (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
          <circle cx={plate.sx} cy={plate.sy} r={15} fill={col} fillOpacity={0.25} stroke={col} strokeWidth={2} />
          {result !== 'B' && result !== 'C' && <path d={`M ${plate.sx - 34} ${plate.sy + 14} Q ${plate.sx} ${plate.sy - 30} ${plate.sx + 34} ${plate.sy + 14}`} fill="none" stroke="#1A1A1A" strokeWidth={3} strokeLinecap="round" strokeOpacity={0.55} />}
          <text x={plate.sx} y={plate.sy - 22} textAnchor="middle" fontSize={12} fontWeight={800} fill="#1A1A1A">{RESULTS.find(r => r.code === result)?.label}</text>
        </svg>
      )}
    </div>
  )
}
