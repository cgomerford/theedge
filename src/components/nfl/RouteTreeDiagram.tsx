// src/components/nfl/RouteTreeDiagram.tsx
//
// Pure glossary/explainer content -- NOT derived from any real game
// data, unlike every other chart built in this session. The numbered
// route tree is a standard, widely-taught football coaching
// convention (not proprietary to any team or publisher), so this is
// safe to render as a static reference diagram the same way the
// coverage-shell explainer on the team page works.
//
// Numbering convention used here: odd = outside-breaking, even =
// inside-breaking, which is the most commonly taught version -- but
// this genuinely varies by program/team, so the caption says that
// explicitly rather than presenting it as the one true standard.

'use client'

const MONO = "'JetBrains Mono', ui-monospace, monospace"
const SERIF = "'Fraunces', serif"

interface RouteDef {
  num: number
  name: string
  startX: number // % across the field width
  path: string // SVG path, relative to a local 0,0 origin at the receiver's start point
  labelOffset: { x: number; y: number }
  breaking: 'in' | 'out' | 'vertical'
}

// Field is drawn 0 (top, deep) to 100 (bottom, LOS) in the y direction,
// so paths go from y=90 (near LOS) upward -- more negative y is further
// downfield. x is 0-100 across the width.
const ROUTES: RouteDef[] = [
  { num: 0, name: 'Flat', startX: 10, path: 'M 0 0 L 14 -4', labelOffset: { x: 16, y: -4 }, breaking: 'out' },
  { num: 1, name: 'Slant', startX: 26, path: 'M 0 0 L 10 -14', labelOffset: { x: 12, y: -16 }, breaking: 'in' },
  { num: 2, name: 'Hitch', startX: 40, path: 'M 0 0 L 0 -16 L -3 -13', labelOffset: { x: 3, y: -18 }, breaking: 'in' },
  { num: 3, name: 'Out', startX: 54, path: 'M 0 0 L 0 -18 L 16 -18', labelOffset: { x: 18, y: -20 }, breaking: 'out' },
  { num: 4, name: 'Curl', startX: 68, path: 'M 0 0 L 0 -22 L -6 -18', labelOffset: { x: -2, y: -25 }, breaking: 'in' },
  { num: 6, name: 'Dig / In', startX: 40, path: 'M 0 0 L 0 -34 L -18 -34', labelOffset: { x: -20, y: -36 }, breaking: 'in' },
  { num: 7, name: 'Corner', startX: 54, path: 'M 0 0 L 0 -30 L 20 -46', labelOffset: { x: 22, y: -48 }, breaking: 'out' },
  { num: 8, name: 'Post', startX: 68, path: 'M 0 0 L 0 -34 L -18 -50', labelOffset: { x: -20, y: -52 }, breaking: 'in' },
  { num: 9, name: 'Go / Fly', startX: 82, path: 'M 0 0 L 0 -58', labelOffset: { x: 3, y: -60 }, breaking: 'vertical' },
]

const TONE: Record<RouteDef['breaking'], string> = {
  in: '#FF5722',
  out: '#3B82F6',
  vertical: '#FDE047',
}

export function RouteTreeDiagram() {
  return (
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.06)', borderRadius: 20, padding: 20 }}>
      <p style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#FF5722', margin: 0 }}>
        § Glossary
      </p>
      <h3 style={{ fontFamily: SERIF, fontSize: 24, margin: '4px 0 12px' }}>The Route Tree</h3>

      <div style={{ position: 'relative', width: '100%', maxWidth: 640, margin: '0 auto', paddingBottom: '39.7%', borderRadius: 12, overflow: 'hidden' }}>
        <svg viewBox="0 0 100 62" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="100" height="62" fill="#1b3d24" />
          {[10, 20, 30, 40, 50, 60].map((y) => (
            <line key={y} x1={0} y1={y} x2={100} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
          ))}
          <line x1={0} y1={60} x2={100} y2={60} stroke="rgba(255,255,255,0.5)" strokeWidth={0.5} />

          <defs>
            {(['in', 'out', 'vertical'] as const).map((k) => (
              <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE[k]} />
              </marker>
            ))}
          </defs>

          {ROUTES.map((r) => (
            <g key={r.num} transform={`translate(${r.startX}, 60)`}>
              <circle cx={0} cy={0} r={1.4} fill="#FAF8F3" />
              <path d={r.path} fill="none" stroke={TONE[r.breaking]} strokeWidth={0.6} markerEnd={`url(#arrow-${r.breaking})`} />
              <text
                x={0}
                y={2.5}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize={2.2}
                fontWeight={700}
                fill="#FAF8F3"
              >
                {r.num}
              </text>
              <text
                x={r.labelOffset.x}
                y={r.labelOffset.y}
                textAnchor={r.labelOffset.x < 0 ? 'end' : r.labelOffset.x > 15 ? 'start' : 'middle'}
                fontFamily={MONO}
                fontSize={2}
                fill="rgba(255,255,255,0.75)"
              >
                {r.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {([
          { tone: TONE.in, label: 'Inside-breaking (even #)' },
          { tone: TONE.out, label: 'Outside-breaking (odd #)' },
          { tone: TONE.vertical, label: 'Vertical' },
        ] as const).map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, background: l.tone, display: 'inline-block', borderRadius: 2 }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: '#78716C' }}>{l.label}</span>
          </div>
        ))}
      </div>

      <p style={{ fontFamily: MONO, fontSize: 9, color: '#A3A3A3', lineHeight: 1.6, marginTop: 12 }}>
        Numbering shown here (odd = outside-breaking, even = inside-breaking) is the most commonly taught
        convention, not a universal standard — some programs number routes differently. Use this as a plain-language
        key when reading route-distribution charts elsewhere on the site, not as official terminology.
      </p>
    </div>
  )
}
