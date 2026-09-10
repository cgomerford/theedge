// src/components/nfl/diagrams/NflFieldBase.tsx
//
// Shared field background for every formation/coverage diagram.
// Coordinate system: viewBox 0-533 x, 0-300 y (533 = field width in
// feet-ish scale for clean numbers, 300 = ~30 yards of field length
// shown, enough for a formation/coverage snapshot). Line of scrimmage
// fixed at y=150 (vertical center) so offense diagrams draw upward
// (negative y = downfield) and defense diagrams draw downward
// (positive y = downfield from the defense's perspective) — actually
// simpler: LOS at y=150, offense always ABOVE it (y<150), defense
// always BELOW it (y>150), matching how a broadcast top-down look
// reads with offense driving toward the top of the diagram.

export const FIELD_WIDTH = 533
export const FIELD_HEIGHT = 300
export const LOS_Y = 150
export const HASH_LEFT_X = 533 * 0.35
export const HASH_RIGHT_X = 533 * 0.65

export function NflFieldBase({ children, ballOnHash = 'middle' }: { children: React.ReactNode; ballOnHash?: 'left' | 'middle' | 'right' }) {
  return (
    <svg viewBox={`0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`} style={{ width: '100%', height: 'auto', background: '#2D5A3D' }}>
      {/* Yard line stripes, every 30 units (~3 yards) for texture */}
      {Array.from({ length: 10 }, (_, i) => (
        <line key={i} x1={0} y1={i * 30} x2={FIELD_WIDTH} y2={i * 30} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      ))}
      {/* Hash marks, left and right, running the length of the field */}
      {Array.from({ length: 10 }, (_, i) => (
        <g key={`hash-${i}`}>
          <line x1={HASH_LEFT_X - 4} y1={i * 30} x2={HASH_LEFT_X + 4} y2={i * 30} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
          <line x1={HASH_RIGHT_X - 4} y1={i * 30} x2={HASH_RIGHT_X + 4} y2={i * 30} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        </g>
      ))}
      {/* Sidelines */}
      <line x1={4} y1={0} x2={4} y2={FIELD_HEIGHT} stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
      <line x1={FIELD_WIDTH - 4} y1={0} x2={FIELD_WIDTH - 4} y2={FIELD_HEIGHT} stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
      {/* Line of scrimmage */}
      <line x1={0} y1={LOS_Y} x2={FIELD_WIDTH} y2={LOS_Y} stroke="#FFD84D" strokeWidth={2} strokeDasharray="6 3" />
      {children}
    </svg>
  )
}

export type PlayerMarker = {
  x: number
  y: number
  label: string // position abbreviation, e.g. "QB", "X", "Z", "CB"
  jersey?: number
  side: 'offense' | 'defense'
}

const OFFENSE_COLOR = '#FF5722'
const DEFENSE_COLOR = '#1A1A1A'

export function NflPlayerDot({ x, y, label, jersey, side }: PlayerMarker) {
  const color = side === 'offense' ? OFFENSE_COLOR : DEFENSE_COLOR
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill={color} stroke="#fff" strokeWidth={1.5} />
      {jersey != null && (
        <text x={x} y={y + 3.5} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize={9} fontWeight={700} fill="#fff">
          {jersey}
        </text>
      )}
      <text x={x} y={y + 22} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize={9} fontWeight={700} fill="#fff" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
        {label}
      </text>
    </g>
  )
}