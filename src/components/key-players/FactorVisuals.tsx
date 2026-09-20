// src/components/key-players/FactorVisuals.tsx
//
// Micro-graphics for the Key Players "5 things that favour him" rows. Pure
// SVG/HTML, no state — each takes a FactorVisual (key-player-factors.ts) and
// renders it at one of two sizes: `compact` (the ~80×44px slot on the card
// row) or full (the popup tile). Colours follow the card's own language:
// emerald = favours the key player, rose = works against, stone = neutral,
// orange = the site's accent.

import type { FactorVisual, FactorPitchRow, FactorFielder } from '@/lib/key-player-factors'

const fmt3 = (n: number) => n.toFixed(3).replace(/^0/, '')

// ─── Sparkline ──────────────────────────────────────────────────────────

function Spark({ v, compact }: { v: Extract<FactorVisual, { kind: 'spark' }>; compact: boolean }) {
  const w = compact ? 76 : 180, h = compact ? 34 : 56, pad = 4
  const vals = v.values
  const lo = Math.min(...vals, v.goodAbove), hi = Math.max(...vals, v.goodAbove)
  const span = hi - lo || 1
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1)
  const y = (val: number) => h - pad - ((val - lo) / span) * (h - pad * 2)
  const pts = vals.map((val, i) => `${x(i)},${y(val)}`).join(' ')
  const last = vals[vals.length - 1]
  const good = last >= v.goodAbove
  return (
    <div className="flex flex-col items-center">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={v.caption}>
        <line x1={pad} x2={w - pad} y1={y(v.goodAbove)} y2={y(v.goodAbove)} className="stroke-stone-300" strokeDasharray="2 3" strokeWidth="1" />
        <polyline points={pts} fill="none" className={good ? 'stroke-emerald-500' : 'stroke-rose-400'} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        {vals.map((val, i) => (
          <circle key={i} cx={x(i)} cy={y(val)} r={i === vals.length - 1 ? 3 : 1.6}
            className={val >= v.goodAbove ? 'fill-emerald-500' : 'fill-rose-400'} />
        ))}
      </svg>
      {!compact && <p className="text-[9px] font-mono text-stone-400 mt-1">{v.caption}</p>}
    </div>
  )
}

// ─── Split bars (vs LHP/RHP, day/night, home/away…) ─────────────────────

function Split({ v, compact }: { v: Extract<FactorVisual, { kind: 'split' }>; compact: boolean }) {
  const [lo, hi] = v.scale
  const pct = (val: number) => Math.max(8, Math.min(100, ((val - lo) / (hi - lo)) * 100))
  return (
    <div className={`space-y-1 ${compact ? 'w-[76px]' : 'w-full max-w-[220px]'}`}>
      {v.rows.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5">
          <span className={`font-mono shrink-0 ${compact ? 'text-[7px] w-7' : 'text-[9px] w-10'} ${r.active ? 'text-stone-800 font-bold' : 'text-stone-400'}`}>{r.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div className={`h-full rounded-full ${r.active ? 'bg-emerald-500' : 'bg-stone-300'}`} style={{ width: `${pct(r.value)}%` }} />
          </div>
          {!compact && <span className={`font-mono text-[10px] w-14 text-right ${r.active ? 'text-stone-800 font-bold' : 'text-stone-400'}`}>{r.display}</span>}
        </div>
      ))}
      {compact && <p className="text-[7px] font-mono text-stone-400 text-center">{v.rows.find((r) => r.active)?.display}</p>}
    </div>
  )
}

// ─── Percentile meters ──────────────────────────────────────────────────

const TONE_BAR = { good: 'bg-emerald-500', bad: 'bg-rose-400', mid: 'bg-stone-300' } as const

function Meter({ v, compact }: { v: Extract<FactorVisual, { kind: 'meter' }>; compact: boolean }) {
  const rows = compact ? v.rows.slice(0, 2) : v.rows
  return (
    <div className={`space-y-1.5 ${compact ? 'w-[76px]' : 'w-full max-w-[240px]'}`}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className={`flex justify-between font-mono ${compact ? 'text-[7px]' : 'text-[9px]'} text-stone-500`}>
            <span>{r.label}</span>{!compact && <span className="font-bold text-stone-700">{r.display} · {r.pct}th</span>}
          </div>
          <div className="relative h-1.5 rounded-full bg-stone-100">
            <div className={`h-full rounded-full ${TONE_BAR[r.tone]}`} style={{ width: `${Math.max(4, r.pct)}%` }} />
            <span className="absolute top-[-1px] bottom-[-1px] w-px bg-stone-400/70" style={{ left: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Mini strike zone with the key zone lit ─────────────────────────────

function Zone({ v, compact }: { v: Extract<FactorVisual, { kind: 'zone' }>; compact: boolean }) {
  const size = compact ? 40 : 84
  const lit = v.tone === 'edge' ? 'fill-emerald-500' : 'fill-rose-500'
  const cell = 10
  const core = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  const chase: Record<string, [number, number]> = { '11': [0, 0], '12': [45, 0], '13': [0, 45], '14': [45, 45] }
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" role="img" aria-label={`Zone ${v.zone}`}>
      {Object.entries(chase).map(([z, [cx, cy]]) => (
        <rect key={z} x={cx} y={cy} width="15" height="15" rx="2" className={z === v.zone ? lit : 'fill-stone-200'} />
      ))}
      {core.map((z, i) => (
        <rect key={z} x={15 + (i % 3) * cell} y={15 + Math.floor(i / 3) * cell} width={cell - 1} height={cell - 1} rx="1.5"
          className={z === v.zone ? lit : 'fill-stone-300'} />
      ))}
    </svg>
  )
}

// ─── Pitch-by-pitch bars ────────────────────────────────────────────────

const EDGE_CHIP: Record<NonNullable<FactorPitchRow['edge']>, string> = {
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bad: 'bg-rose-50 text-rose-700 border-rose-200',
  even: 'bg-stone-50 text-stone-600 border-stone-200',
}

function Pitches({ v, compact }: { v: Extract<FactorVisual, { kind: 'pitches' }>; compact: boolean }) {
  const rows = compact ? v.rows.slice(0, 3) : v.rows
  const maxUsage = Math.max(...rows.map((r) => r.usage ?? 0), 1)
  return (
    <div className={`space-y-1 ${compact ? 'w-[92px]' : 'w-full'}`}>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-1.5">
          <span className={`font-mono truncate ${compact ? 'text-[7px] w-9' : 'text-[10px] w-28'} text-stone-600`}>{r.name.replace('4-Seam Fastball', '4-Seam').replace('Sweeper', 'Sweep')}</span>
          <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full bg-orange-300 rounded-full" style={{ width: `${((r.usage ?? 0) / maxUsage) * 100}%` }} />
          </div>
          {r.ba != null ? (
            <span className={`font-mono border rounded ${compact ? 'text-[7px] px-0.5' : 'text-[10px] px-1 py-0.5'} ${r.edge ? EDGE_CHIP[r.edge] : 'bg-stone-50 text-stone-500 border-stone-200'}`}>{fmt3(r.ba)}</span>
          ) : (
            <span className={`font-mono text-stone-300 ${compact ? 'text-[7px]' : 'text-[10px]'}`}>—</span>
          )}
        </div>
      ))}
      {!compact && <p className="text-[9px] font-mono text-stone-400 pt-0.5">Bar = how often he throws it · chip = {v.baLabel.toLowerCase()} (n = {v.nUnit})</p>}
    </div>
  )
}

// ─── Field diagram — pull side vs defenders, or defense behind a pitcher ─

const FIELD_POS: Record<string, [number, number]> = {
  '3B': [37, 68], SS: [49, 57], '2B': [71, 57], '1B': [83, 68],
  LF: [24, 27], CF: [60, 15], RF: [96, 27],
}

function Field({ v, compact }: { v: Extract<FactorVisual, { kind: 'field' }>; compact: boolean }) {
  const w = compact ? 76 : 200
  const dot = (f: FactorFielder) => f.oaa == null ? 'fill-stone-300' : f.oaa >= 3 ? 'fill-emerald-500' : f.oaa <= -3 ? 'fill-rose-500' : 'fill-stone-400'
  return (
    <svg width={w} height={w * 0.85} viewBox="0 0 120 102" role="img" aria-label="Pull side versus defenders">
      <path d="M60 92 L4 38 Q60 -14 116 38 Z" className="fill-stone-50 stroke-stone-200" strokeWidth="1" />
      <path d="M60 92 L37 68 L60 46 L83 68 Z" className="fill-stone-100 stroke-stone-200" strokeWidth="1" />
      {v.wedge === 'left' && <path d="M60 92 L4 38 Q22 14 60 40 Z" className="fill-orange-300/40" />}
      {v.wedge === 'right' && <path d="M60 92 L116 38 Q98 14 60 40 Z" className="fill-orange-300/40" />}
      <rect x="57" y="89" width="6" height="6" transform="rotate(45 60 92)" className="fill-stone-400" />
      {v.fielders.map((f) => {
        const pos = FIELD_POS[f.pos]
        if (!pos) return null
        const showLabel = !compact || f.flag
        return (
          <g key={f.pos}>
            {f.flag && <circle cx={pos[0]} cy={pos[1]} r="8.5" className="fill-none stroke-orange-400" strokeWidth="1.5" />}
            <circle cx={pos[0]} cy={pos[1]} r="5" className={dot(f)} />
            {showLabel && (
              <text x={pos[0]} y={pos[1] + 13} textAnchor="middle" className="fill-stone-600" style={{ fontSize: compact ? 8 : 7, fontFamily: 'monospace' }}>
                {f.oaa != null ? `${f.oaa > 0 ? '+' : ''}${f.oaa}` : f.pos}
              </text>
            )}
            {!compact && (
              <text x={pos[0]} y={pos[1] - 8} textAnchor="middle" className="fill-stone-400" style={{ fontSize: 6, fontFamily: 'monospace' }}>{f.pos}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Big-number tile ────────────────────────────────────────────────────

function Stat({ v, compact }: { v: Extract<FactorVisual, { kind: 'stat' }>; compact: boolean }) {
  return (
    <div className={`text-center ${compact ? 'w-[76px]' : ''}`}>
      <p className={`font-mono font-bold leading-none ${compact ? 'text-[15px]' : 'text-[26px]'} ${v.tone === 'edge' ? 'text-emerald-600' : 'text-rose-600'}`}>{v.big}</p>
      <p className={`font-mono text-stone-400 mt-1 leading-tight ${compact ? 'text-[7px]' : 'text-[9px]'}`}>{v.sub}</p>
    </div>
  )
}

// ─── Dispatcher ─────────────────────────────────────────────────────────

export default function FactorGraphic({ visual, compact = false }: { visual: FactorVisual | null; compact?: boolean }) {
  if (!visual) return null
  switch (visual.kind) {
    case 'spark': return <Spark v={visual} compact={compact} />
    case 'split': return <Split v={visual} compact={compact} />
    case 'meter': return <Meter v={visual} compact={compact} />
    case 'zone': return <Zone v={visual} compact={compact} />
    case 'pitches': return <Pitches v={visual} compact={compact} />
    case 'field': return <Field v={visual} compact={compact} />
    case 'stat': return <Stat v={visual} compact={compact} />
  }
}
