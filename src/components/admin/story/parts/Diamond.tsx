// Flat SVG diamond on ink, cream lines. A SQUARE viewBox drawn into a SQUARE box
// (xMidYMid meet), so the mound and bases are never stretched. All coordinates
// come from diamondGeo.ts — the same map the fielder tags use.

import { FIRST, HOME, MOUND, SECOND, THIRD, VIEW } from '../diamondGeo'

export default function Diamond({ box }: { box: number }) {
  const line = 'rgba(250,248,243,.28)'
  const d = 45 * (Math.PI / 180)
  const reach = 820
  const lf = { x: HOME.x - Math.sin(d) * reach, y: HOME.y - Math.cos(d) * reach }
  const rf = { x: HOME.x + Math.sin(d) * reach, y: HOME.y - Math.cos(d) * reach }
  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid meet" width={box} height={box} style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs><clipPath id="story-diamond-clip"><rect x={0} y={0} width={VIEW} height={VIEW} /></clipPath></defs>
      <g clipPath="url(#story-diamond-clip)">
        {/* fence: arc centred on home plate */}
        <circle cx={HOME.x} cy={HOME.y} r={reach} fill="none" stroke={line} strokeWidth={4} />
        {/* foul lines at ±45° */}
        <path d={`M ${HOME.x} ${HOME.y} L ${lf.x} ${lf.y}`} stroke={line} strokeWidth={3} />
        <path d={`M ${HOME.x} ${HOME.y} L ${rf.x} ${rf.y}`} stroke={line} strokeWidth={3} />
        {/* infield: 90° at every corner, all sides 90 ft */}
        <path d={`M ${HOME.x} ${HOME.y} L ${FIRST.x} ${FIRST.y} L ${SECOND.x} ${SECOND.y} L ${THIRD.x} ${THIRD.y} Z`} fill="rgba(250,248,243,.04)" stroke="rgba(250,248,243,.5)" strokeWidth={4} />
        {[FIRST, SECOND, THIRD].map((b, i) => (
          <rect key={i} x={b.x - 16} y={b.y - 16} width={32} height={32} transform={`rotate(45 ${b.x} ${b.y})`} fill="#FAF8F3" />
        ))}
        <path d={`M ${HOME.x - 18} ${HOME.y - 18} h36 v18 l-18 18 l-18 -18 Z`} fill="#FAF8F3" />
        <circle data-mound cx={MOUND.x} cy={MOUND.y} r={MOUND.r} fill="none" stroke={line} strokeWidth={5} />
      </g>
    </svg>
  )
}
