// src/components/lab/LabArt.tsx
//
// Number-free placeholder illustrations for Labs teaser pages: static SVG outlines in the
// site's cream/line palette, no data in them (empty state over fabricated data). Server-safe.
import type { LabsMenuItem } from '@/lib/nav/labsMenu'

const LINE = '#e7e2d8'
const SOFT = '#f1eee6'
const ORANGE = '#FF5722'

export default function LabArt({ art }: { art: LabsMenuItem['art'] }) {
  return (
    <svg viewBox="0 0 320 180" width="100%" role="img" aria-label="Placeholder illustration" style={{ display: 'block', maxWidth: 320 }}>
      <rect x="0.5" y="0.5" width="319" height="179" rx="14" fill="#fff" stroke={LINE} />
      {art === 'zones' && (
        <g>
          {[0, 1, 2].flatMap(r => [0, 1, 2].map(c => (
            <rect key={`${r}${c}`} x={110 + c * 34} y={34 + r * 34} width="32" height="32" rx="4" fill={r === 1 && c === 1 ? '#FDE04766' : SOFT} stroke={LINE} />
          )))}
        </g>
      )}
      {art === 'bars' && (
        <g>
          {[70, 100, 58, 118, 84, 134].map((h, i) => (
            <rect key={i} x={50 + i * 40} y={150 - h} width="26" height={h} rx="4" fill={i === 5 ? ORANGE : SOFT} stroke={LINE} />
          ))}
        </g>
      )}
      {art === 'field' && (
        <g fill="none" stroke={LINE} strokeWidth="1.5">
          <path d="M160 150 L50 70 A150 150 0 0 1 270 70 Z" fill={SOFT} />
          <path d="M160 150 L160 104 M160 104 L130 80 M160 104 L190 80" />
          {[[160, 60], [110, 84], [210, 84], [135, 112], [185, 112]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill="#fff" stroke={i === 0 ? ORANGE : LINE} />)}
        </g>
      )}
      {art === 'chat' && (
        <g fill={SOFT} stroke={LINE}>
          <rect x="60" y="32" width="150" height="40" rx="12" />
          <rect x="110" y="88" width="150" height="40" rx="12" fill="#FDE04733" />
          <rect x="60" y="140" width="80" height="14" rx="7" />
        </g>
      )}
      {(art === 'shape' || !art) && (
        <g fill="none" stroke={LINE} strokeWidth="1.5">
          <circle cx="160" cy="90" r="56" fill={SOFT} />
          <path d="M104 90 H216 M160 34 V146" />
          <circle cx="160" cy="90" r="5" fill={ORANGE} stroke="none" />
        </g>
      )}
    </svg>
  )
}
