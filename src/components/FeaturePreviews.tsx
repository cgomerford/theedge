// src/components/FeaturePreviews.tsx
//
// Visual "preview the toolkit" section for the maintenance-mode homepage —
// illustrative mini-renderings of the marquee features behind the Sept 18
// wall. These are EXAMPLE visuals (clearly labelled), not live game data,
// so they don't violate the empty-state / no-fabrication rule: nothing here
// claims to be tonight's real numbers.
//
// Server component — pure presentational, CSS-only hover, no client JS.

type Preview = {
  tag: string
  sport: 'MLB' | 'NFL'
  title: string
  body: string
  visual: React.ReactNode
}

/* ---------- mini visuals (illustrative) ---------- */

function HotZone() {
  // 5x5 heat grid, illustrative intensities (0..1)
  const heat = [
    0.1, 0.2, 0.35, 0.2, 0.1,
    0.2, 0.55, 0.8, 0.5, 0.15,
    0.3, 0.85, 1.0, 0.7, 0.25,
    0.2, 0.6, 0.75, 0.45, 0.15,
    0.1, 0.25, 0.3, 0.2, 0.1,
  ]
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto">
      {heat.map((v, i) => {
        const x = (i % 5) * 24
        const y = Math.floor(i / 5) * 24
        return <rect key={i} x={x} y={y} width="23" height="23" fill={`rgba(255,87,34,${0.08 + v * 0.85})`} />
      })}
      {/* strike zone outline */}
      <rect x="24" y="24" width="72" height="72" fill="none" stroke="#1A1A1A" strokeWidth="1.5" />
    </svg>
  )
}

function Arsenal() {
  const pitches = [
    { k: 'FF', v: 0.34 },
    { k: 'SW', v: 0.26 },
    { k: 'CH', v: 0.18 },
    { k: 'SI', v: 0.14 },
    { k: 'SL', v: 0.08 },
  ]
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto">
      {pitches.map((p, i) => {
        const y = i * 23 + 4
        return (
          <g key={p.k}>
            <text x="0" y={y + 12} fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#8A8577">{p.k}</text>
            <rect x="22" y={y + 3} width={p.v * 260} height="12" fill="#FF5722" opacity={1 - i * 0.13} />
            <text x={22 + p.v * 260 + 4} y={y + 12} fontFamily="'JetBrains Mono', monospace" fontSize="8" fill="#8A8577">
              {Math.round(p.v * 100)}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function SprayChart() {
  const hits = [
    [60, 60], [40, 45], [80, 48], [30, 62], [92, 58],
    [52, 30], [70, 34], [46, 74], [78, 70], [60, 20],
  ]
  const hr: [number, number][] = [[22, 34], [100, 30]]
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto">
      {/* outfield wedge */}
      <path d="M60 110 L14 34 A64 64 0 0 1 106 34 Z" fill="none" stroke="#DEDACE" strokeWidth="1.5" />
      {/* foul lines */}
      <line x1="60" y1="110" x2="14" y2="34" stroke="#DEDACE" strokeWidth="1" />
      <line x1="60" y1="110" x2="106" y2="34" stroke="#DEDACE" strokeWidth="1" />
      {hits.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="#1A1A1A" opacity="0.65" />)}
      {hr.map(([x, y], i) => <circle key={`hr${i}`} cx={x} cy={y} r="3.4" fill="#FF5722" />)}
      <circle cx="60" cy="110" r="3" fill="#FDE047" />
    </svg>
  )
}

function Coverage() {
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto">
      {/* field */}
      <rect x="6" y="6" width="108" height="108" fill="none" stroke="#DEDACE" strokeWidth="1" />
      <line x1="6" y1="46" x2="114" y2="46" stroke="#DEDACE" strokeWidth="0.75" strokeDasharray="3 3" />
      {/* three deep zones (Cover 3) */}
      {[24, 60, 96].map((cx, i) => (
        <circle key={i} cx={cx} cy="30" r="15" fill="rgba(255,87,34,0.12)" stroke="#FF5722" strokeWidth="0.75" />
      ))}
      {/* defenders */}
      {[[24, 30], [60, 30], [96, 30], [36, 62], [84, 62], [60, 84]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill="#1A1A1A" />
      ))}
      {/* ball / LOS */}
      <rect x="57" y="98" width="6" height="4" fill="#FDE047" />
    </svg>
  )
}

function EdgeFactors() {
  // 8 factors leaning left/right of centre; 5 lean right (orange)
  const factors = [0.6, -0.3, 0.5, 0.2, -0.15, 0.4, 0.35, -0.25]
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto">
      <line x1="60" y1="6" x2="60" y2="114" stroke="#DEDACE" strokeWidth="1" />
      {factors.map((f, i) => {
        const y = i * 13 + 6
        const w = Math.abs(f) * 52
        const x = f >= 0 ? 60 : 60 - w
        return <rect key={i} x={x} y={y} width={w} height="8" fill={f >= 0 ? '#FF5722' : '#8A8577'} opacity={f >= 0 ? 1 : 0.5} />
      })}
    </svg>
  )
}

const PREVIEWS: Preview[] = [
  { tag: 'Pitching Lab', sport: 'MLB', title: 'Hot zone matchups', body: "Every hitter's hot and cold zones against tonight's exact starter, mapped by handedness.", visual: <HotZone /> },
  { tag: 'Pitching Lab', sport: 'MLB', title: 'Full pitch arsenal', body: 'Usage, velocity, movement and put-away rates for every pitch a starter throws.', visual: <Arsenal /> },
  { tag: 'Scout Report', sport: 'MLB', title: 'Spray charts', body: 'Where every ball in play actually lands, scaled to the real ballpark.', visual: <SprayChart /> },
  { tag: 'NFL', sport: 'NFL', title: 'Coverage matchups', body: 'What a defense runs by down and distance — and where it leaves the field open.', visual: <Coverage /> },
  { tag: 'The Edge', sport: 'MLB', title: 'Factor breakdown', body: 'The eight factors behind every read, and which side each one leans.', visual: <EdgeFactors /> },
]

export default function FeaturePreviews() {
  return (
    <div className="border-b border-[#DEDACE] bg-[#F4F1EA]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center justify-center gap-2 mb-4">
          <span>§</span><span>Preview the toolkit</span>
        </div>
        <h2 className="edge-display text-[34px] text-center mb-4">A look behind the wall.</h2>
        <p className="font-serif italic text-center text-[#4A4740] max-w-lg mx-auto mb-12">
          A preview of what every report holds — full versions reopen September 18.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PREVIEWS.map((p) => (
            <div key={p.title} className="group bg-white border border-[#DEDACE] p-6 hover:border-[#1A1A1A] transition-colors">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577]">{p.tag}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[#DEDACE] text-[#8A8577]">{p.sport}</span>
              </div>
              <div className="bg-[#FAF8F3] border border-[#DEDACE] p-4 mb-4">
                <div className="max-w-[160px] mx-auto">{p.visual}</div>
              </div>
              <h3 className="font-serif text-lg mb-1 group-hover:text-[#FF5722] transition-colors">{p.title}</h3>
              <p className="text-sm text-[#4A4740] font-serif leading-relaxed">{p.body}</p>
            </div>
          ))}

          {/* trailing CTA cell */}
          <div className="bg-[#1A1A1A] text-[#FAF8F3] p-6 flex flex-col justify-center">
            <div className="edge-display text-[26px] leading-none mb-3">All of it, every game.</div>
            <p className="font-mono text-xs text-[#FAF8F3]/60 leading-relaxed mb-4">
              These are previews. The full toolkit reopens September 18.
            </p>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#FDE047]">Sign up to get in first ↑</span>
          </div>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] text-center mt-8">
          Illustrative previews — not tonight's live data
        </p>
      </div>
    </div>
  )
}
