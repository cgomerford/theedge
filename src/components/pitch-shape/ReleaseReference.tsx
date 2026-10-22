'use client'

// src/components/pitch-shape/ReleaseReference.tsx
//
// A plain reference for what "release point" means, drawn to scale for the selected period: a side view
// (height and extension) and a catcher's view (side to side), with the pitcher's own numbers placed on them.
// Definitions only; no league comparisons are made here (we hold no league release-point table).
import { C } from '@/components/team/ui'
import type { PitchViewMonth } from '@/lib/pitch-shape/model'
import { periodLabel } from './monthStats'

const INK = '#1A1A1A'

export default function ReleaseReference({ r, hand }: { r: PitchViewMonth; hand: 'L' | 'R' }) {
  const z = r.releaseZ, x = r.releaseX, e = r.extension
  const arm = hand === 'L' ? 'first-base' : 'third-base'
  // Side view: 0 = rubber, +ft toward the plate. Scale 22 px per foot, ground at y=130.
  const ft = 17, gy = 140, rx = 250
  const dotX = rx - (e ?? 6.5) * ft, dotY = gy - z * ft
  // Catcher view: 0 = middle of the rubber, +x toward first base (to the right). Scale 40 px per foot.
  const cx = 130, px = 40, cy = gy
  const catX = cx + x * px
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginTop: 4 }}>
      <div className="pv-k">Reference · what release point means · {periodLabel(r)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginTop: 8 }}>
        <svg viewBox="0 0 290 160" role="img" aria-label="Side view of the release point: height and extension" style={{ width: '100%', maxWidth: 380, height: 'auto' }}>
          <text x="4" y="12" fontSize="9" fontWeight="800" letterSpacing="1.2" fill={C.mute}>SIDE VIEW · THROWING DIRECTION ←</text>
          <line x1="0" y1={gy} x2="290" y2={gy} stroke={C.line} strokeWidth="1" />
          <path d={`M ${rx - 70} ${gy} Q ${rx - 20} ${gy - 20} ${rx + 20} ${gy - 12} L ${rx + 60} ${gy} Z`} fill="#f1eee6" />
          <rect x={rx - 3} y={gy - 16} width="6" height="3" fill={INK} />
          <line x1={rx} y1={gy - 12} x2={rx} y2={gy - 20} stroke={C.mute} strokeDasharray="2 2" />
          <text x={rx} y={gy + 12} textAnchor="middle" fontSize="9" fill={C.mute}>rubber</text>
          {e != null && (
            <>
              <line x1={dotX} y1={gy - 8} x2={rx} y2={gy - 8} stroke={C.orange} strokeWidth="1.5" />
              <text x={(dotX + rx) / 2} y={gy - 12} textAnchor="middle" fontSize="9" fontWeight="800" fill={C.orange}>extension {e.toFixed(2)} ft</text>
            </>
          )}
          <line x1={dotX} y1={gy} x2={dotX} y2={dotY} stroke={C.orange} strokeWidth="1.5" strokeDasharray="3 2" />
          <text x={dotX - 6} y={(gy + dotY) / 2} textAnchor="end" fontSize="9" fontWeight="800" fill={C.orange}>height {z.toFixed(2)} ft</text>
          <circle cx={dotX} cy={dotY} r="6" fill={C.orange} stroke="#fff" strokeWidth="2" />
          <text x="4" y="156" fontSize="9" fill={C.faint}>Plate is off to the left, 60.5 ft from the rubber.</text>
        </svg>
        <svg viewBox="0 0 260 160" role="img" aria-label="Catcher view of the release point: side to side" style={{ width: '100%', maxWidth: 380, height: 'auto' }}>
          <text x="4" y="12" fontSize="9" fontWeight="800" letterSpacing="1.2" fill={C.mute}>CATCHER’S VIEW</text>
          <line x1="0" y1={cy} x2="260" y2={cy} stroke={C.line} />
          <line x1={cx} y1="26" x2={cx} y2={cy} stroke={C.line} strokeDasharray="3 3" />
          <rect x={cx - 12} y={cy - 4} width="24" height="4" fill={INK} />
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill={C.mute}>middle of the rubber</text>
          <text x="6" y="30" fontSize="9" fill={C.mute}>third base side</text>
          <text x="254" y="30" textAnchor="end" fontSize="9" fill={C.mute}>first base side</text>
          <line x1={cx} y1={cy - 30} x2={catX} y2={cy - 30} stroke={C.orange} strokeWidth="1.5" />
          <text x={(cx + catX) / 2} y={cy - 36} textAnchor="middle" fontSize="9" fontWeight="800" fill={C.orange}>{Math.abs(x).toFixed(2)} ft {x >= 0 ? 'toward first' : 'toward third'}</text>
          <line x1={catX} y1={cy} x2={catX} y2={cy - z * ft} stroke={C.orange} strokeDasharray="3 2" />
          <circle cx={catX} cy={cy - z * ft} r="6" fill={C.orange} stroke="#fff" strokeWidth="2" />
        </svg>
      </div>
      <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.55, color: '#5b5347' }}>
        <li><b style={{ color: INK }}>Release point</b> is where the ball leaves the hand, tracked on every pitch and averaged for the {periodLabel(r)} dot you see.</li>
        <li><b style={{ color: INK }}>Height</b> ({z.toFixed(2)} ft) sets the angle the pitch comes down at: a higher release comes down steeper, a lower one flatter.</li>
        <li><b style={{ color: INK }}>Side to side</b> ({Math.abs(x).toFixed(2)} ft {x >= 0 ? 'first-base' : 'third-base'} side) sets the angle across the plate. As a {hand === 'L' ? 'left' : 'right'}-hander his arm side is the {arm} side.</li>
        <li><b style={{ color: INK }}>Extension</b> ({e != null ? `${e.toFixed(2)} ft` : 'n/a'}) is how far toward the plate he is when he lets go. More extension means the ball starts closer, so hitters have a little less time.</li>
        <li><b style={{ color: INK }}>Why it moves by month:</b> a drifting release point can come from a new arm slot, a mechanical tweak or fatigue. Clubs compare it with a pitcher’s own baseline; here that baseline is the first dot.</li>
      </ul>
    </div>
  )
}
