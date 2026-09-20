// src/components/postgame/report/ZoneGrid.tsx
//
// The strike zone as Statcast numbers it, catcher's view: the 3×3 zone (1 = top-left … 9 = bottom-right)
// over four "outside" quadrants (11 top-left, 12 top-right, 13 bottom-left, 14 bottom-right). Cells shade
// with `counts` (pitches there), get a heavy outline when they're in `usual` (the pitcher's map), and a
// yellow fill for `highlight` (a hitter's damage zone), or a graded yellow wash from `heat` (0–1 per zone, e.g. season xwOBA). Pure SVG, server-rendered.

const CELL: Record<string, [number, number, number, number]> = {
  '1': [25, 25, 17, 17], '2': [42, 25, 16, 17], '3': [58, 25, 17, 17],
  '4': [25, 42, 17, 16], '5': [42, 42, 16, 16], '6': [58, 42, 17, 16],
  '7': [25, 58, 17, 17], '8': [42, 58, 16, 17], '9': [58, 58, 17, 17],
  '11': [4, 4, 46, 46], '12': [50, 4, 46, 46], '13': [4, 50, 46, 46], '14': [50, 50, 46, 46],
}

export default function ZoneGrid({ counts = {}, usual = [], highlight, heat, color = '#FF5722', size = 120, label }: {
  counts?: Record<string, number>; usual?: string[]; highlight?: number; heat?: Record<string, number>; color?: string; size?: number; label: string
}) {
  const max = Math.max(1, ...Object.values(counts))
  const order = ['11', '12', '13', '14', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label} className="block shrink-0">
      {order.map((z) => {
        const [x, y, w, h] = CELL[z], n = counts[z] ?? 0, hi = highlight === Number(z), inZone = Number(z) <= 9
        return (
          <g key={z}>
            <rect x={x} y={y} width={w} height={h} fill={hi ? '#FDE047' : inZone ? '#fff' : '#f5f5f4'} stroke="#d6d3d1" strokeWidth={0.6} />
            {heat && heat[z] != null && <rect x={x} y={y} width={w} height={h} fill="#FDE047" fillOpacity={0.15 + 0.85 * heat[z]} />}
            {n > 0 && <rect x={x} y={y} width={w} height={h} fill={color} fillOpacity={0.15 + 0.7 * (n / max)} />}
            {n > 0 && <text x={x + w / 2} y={y + h / 2 + 3.4} textAnchor="middle" style={{ font: '700 9px ui-monospace, monospace', fill: '#1A1A1A' }}>{n}</text>}
          </g>
        )
      })}
      {usual.filter((z) => CELL[z]).map((z) => { const [x, y, w, h] = CELL[z]; return <rect key={`u${z}`} x={x + 0.8} y={y + 0.8} width={w - 1.6} height={h - 1.6} fill="none" stroke="#1A1A1A" strokeWidth={1.6} strokeDasharray="3 2" /> })}
      <rect x={25} y={25} width={50} height={50} fill="none" stroke="#1A1A1A" strokeWidth={1.4} />
    </svg>
  )
}
