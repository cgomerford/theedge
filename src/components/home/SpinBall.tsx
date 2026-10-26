import { pitchColor } from '@/lib/lab/pitch-meta'

// A small baseball whose stitching turns the way that pitch's ball turns: the direction follows the pitch's average movement
// (induced vertical + horizontal break: surface runs the way the ball is pushed, so backspin turns upward) and the speed follows its
// average spin rate. Real spin is 20-40 turns a second, so it is slowed ~40x: 2,400 rpm = one stitch cycle a second.
// Server-rendered, CSS-only motion; held still for visitors who prefer reduced motion. The ring keeps the pitch colour.

const PERIOD = 14
const SIZE = 22

export type SpinInfo = { rpm: number | null; ivb: number | null; hb: number | null }

export default function SpinBall({ code, spin }: { code: string; spin?: SpinInfo | null }) {
  const color = pitchColor(code)
  const has = !!spin && spin.rpm != null && spin.ivb != null && spin.hb != null
  const angle = has ? (Math.atan2(-spin!.ivb!, spin!.hb!) * 180) / Math.PI : 0
  const secs = has ? Math.min(4, Math.max(0.6, 2400 / spin!.rpm!)) : 0
  const id = `sb-${code}`
  const cx = SIZE / 2
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" style={{ flex: '0 0 auto', display: 'inline-block' }}>
      <defs><clipPath id={id}><circle cx={cx} cy={cx} r={cx - 1.5} /></clipPath></defs>
      <circle cx={cx} cy={cx} r={cx - 1} fill="#fff" stroke={color} strokeWidth={2} />
      <g clipPath={`url(#${id})`}>
        <g transform={`rotate(${angle.toFixed(1)} ${cx} ${cx})`}>
          <g className={has ? 'x9-spin' : undefined} style={has ? ({ ['--x9-spin-dur' as string]: `${secs.toFixed(2)}s`, ['--x9-spin-by' as string]: `${PERIOD}px` } as React.CSSProperties) : undefined}>
            {Array.from({ length: 5 }, (_, k) => {
              const x = (k - 2) * PERIOD + cx
              return (
                <g key={k} stroke="#C0392B" strokeWidth={1} fill="none" strokeDasharray="1.6 1.2" strokeLinecap="round">
                  <path d={`M${x - 3} ${cx - 12} C ${x - 7} ${cx - 4}, ${x - 7} ${cx + 4}, ${x - 3} ${cx + 12}`} />
                  <path d={`M${x + 3} ${cx - 12} C ${x + 7} ${cx - 4}, ${x + 7} ${cx + 4}, ${x + 3} ${cx + 12}`} />
                </g>
              )
            })}
          </g>
        </g>
      </g>
    </svg>
  )
}

/** Put once on the page that uses SpinBall. */
export function SpinBallStyles() {
  return <style>{`@keyframes x9spin{from{transform:translateX(0)}to{transform:translateX(var(--x9-spin-by))}}.x9-spin{animation:x9spin var(--x9-spin-dur) linear infinite}@media (prefers-reduced-motion:reduce){.x9-spin{animation:none}}`}</style>
}
