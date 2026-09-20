// src/components/postgame/report/SwingSection.tsx
//
// §2 How the game swung — the win-probability path across every plate appearance (home side
// up, away side down, shaded toward whoever was ahead), inning gridlines, and numbered
// markers on the 3–5 plays that moved it most, listed underneath with what happened and how
// many points of win probability it moved. Numbers are the MLB feed's own per-play values.
// Server-rendered SVG, hover titles; no client JS.

import { getPostData } from '@/lib/postgame/data'
import { buildSwing } from '@/lib/postgame/recap'
import { CHART_BLUE, CHART_ORANGE } from '@/components/scout/charts/LineChart'
import type { PostgameContext } from './types'

const W = 760, H = 280, L = 44, R = 14, T = 16, B = 26

export default async function SwingSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const sw = data ? buildSwing(data) : null
  if (!sw) return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Win probability isn&apos;t available for this game, so there is no chart.</p>
  const nPts = sw.points.length
  const x = (i: number) => L + (i / (nPts - 1)) * (W - L - R)
  const y = (wp: number) => T + ((100 - wp) / 100) * (H - T - B)
  const series = [{ i: 0, homeWp: sw.start }, ...sw.points.map((p) => ({ i: p.i, homeWp: p.homeWp }))]
  // step chart: the probability holds until the next plate appearance resolves it
  const path = series.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.homeWp).toFixed(1)}`).join(' ')
  const area = `${path} L${x(nPts - 1)} ${y(50)} L${x(0)} ${y(50)} Z`
  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Win probability by plate appearance for ${ctx.home.abbr} (top) and ${ctx.away.abbr} (bottom)`}>
        <defs>
          <clipPath id="wp-top"><rect x={L} y={T} width={W - L - R} height={y(50) - T} /></clipPath>
          <clipPath id="wp-bot"><rect x={L} y={y(50)} width={W - L - R} height={H - B - y(50)} /></clipPath>
        </defs>
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#fafaf9" stroke="#e7e5e4" />
        {sw.inningStarts.map((s) => (
          <g key={s.inning}>
            <line x1={x(s.i)} x2={x(s.i)} y1={T} y2={H - B} stroke="#eeeeec" />
            <text x={x(s.i) + 3} y={H - B + 12} className="fill-stone-400" style={{ font: '400 9px ui-monospace, monospace' }}>{s.inning}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(50)} y2={y(50)} stroke="#a8a29e" strokeDasharray="4 3" />
        <path d={area} fill={CHART_BLUE} fillOpacity={0.22} clipPath="url(#wp-top)" />
        <path d={area} fill={CHART_ORANGE} fillOpacity={0.22} clipPath="url(#wp-bot)" />
        <path d={path} fill="none" stroke="#292524" strokeWidth={1.75} strokeLinejoin="round" />
        {[100, 75, 50, 25, 0].map((v) => <text key={v} x={L - 6} y={y(v) + 3} textAnchor="end" className="fill-stone-400" style={{ font: '400 9px ui-monospace, monospace' }}>{v}%</text>)}
        <text x={L + 6} y={T + 12} className="fill-stone-600" style={{ font: '700 10px ui-monospace, monospace', fill: CHART_BLUE }}>{ctx.home.abbr} ahead ▲</text>
        <text x={L + 6} y={H - B - 6} style={{ font: '700 10px ui-monospace, monospace', fill: CHART_ORANGE }}>{ctx.away.abbr} ahead ▼</text>
        {sw.inflections.map((f) => (
          <g key={f.n}>
            <circle cx={x(f.i)} cy={y(f.homeWp)} r={9} fill="#1A1A1A" stroke="#FDE047" strokeWidth={2}><title>{`${f.kind} · ${f.text}`}</title></circle>
            <text x={x(f.i)} y={y(f.homeWp) + 3.5} textAnchor="middle" fill="#FDE047" style={{ font: '700 10px ui-monospace, monospace' }}>{f.n}</text>
          </g>
        ))}
      </svg>

      <ol className="grid gap-2 md:grid-cols-2">
        {sw.inflections.map((f) => {
          const club = f.helped === 'home' ? ctx.home : ctx.away
          return (
            <li key={f.n} className="flex gap-2.5 rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="w-5 h-5 shrink-0 bg-stone-900 text-yellow-300 text-[10px] font-mono font-bold flex items-center justify-center">{f.n}</span>
              <div className="min-w-0">
                <p className="text-[9.5px] font-mono uppercase tracking-wider text-stone-400">{f.top ? 'Top' : 'Bot'} {f.inning} · <span className="text-orange-600 font-semibold">{f.kind}</span> · {club.abbr} +{Math.round(f.gain)} pts</p>
                <p className="text-[11.5px] font-sans text-stone-700 leading-snug">{f.text.length > 150 ? `${f.text.slice(0, 147)}…` : f.text}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">Win probability comes from the MLB game feed, updated after every plate appearance. The circled plays are the largest single swings (at least 6 points), spaced apart so they don&apos;t stack; pts = percentage points of win probability the play moved toward that club.</p>
    </div>
  )
}
