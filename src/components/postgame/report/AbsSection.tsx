// src/components/postgame/report/AbsSection.tsx
//
// §8 ABS & challenges — each club's challenges used / kept / remaining, a timeline of every challenge
// placed on the game's win-probability path (filled = call overturned, hollow = call stood), and a
// table of who challenged what, in what count, and how it ended. Where the pitch was thrown is the
// Pro "ABS deep" section (§20); this is the who / when / result view.

import { getPostData } from '@/lib/postgame/data'
import { buildSwing } from '@/lib/postgame/recap'
import { buildAbs, type AbsSide, type Challenge } from '@/lib/postgame/abs'
import { Empty, Foot, SIDE_COLOR, ordinal } from './ui'
import type { PostgameContext } from './types'

const W = 760, H = 150, L = 34, R = 12, T = 12, B = 22

function Timeline({ ch, ctx, points, inningStarts }: { ch: Challenge[]; ctx: PostgameContext; points: { i: number; homeWp: number }[]; inningStarts: { inning: number; i: number }[] }) {
  const nPts = points.length
  const x = (i: number) => L + (i / (nPts - 1)) * (W - L - R)
  const y = (wp: number) => T + ((100 - wp) / 100) * (H - T - B)
  const path = points.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.homeWp).toFixed(1)}`).join(' ')
  // several challenges can share one plate appearance: nudge them apart so they don't stack
  const seen = new Map<number, number>()
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Win probability with ABS challenges marked">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#fafaf9" stroke="#e7e5e4" />
      {inningStarts.map((s) => (
        <g key={s.inning}>
          <line x1={x(s.i)} x2={x(s.i)} y1={T} y2={H - B} stroke="#eeeeec" />
          <text x={x(s.i) + 3} y={H - B + 12} className="fill-stone-400" style={{ font: '400 9px ui-monospace, monospace' }}>{s.inning}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(50)} y2={y(50)} stroke="#a8a29e" strokeDasharray="4 3" />
      <path d={path} fill="none" stroke="#a8a29e" strokeWidth={1.5} strokeLinejoin="round" />
      {[100, 50, 0].map((v) => <text key={v} x={L - 5} y={y(v) + 3} textAnchor="end" className="fill-stone-400" style={{ font: '400 9px ui-monospace, monospace' }}>{v}%</text>)}
      <text x={L + 5} y={T + 11} style={{ font: '700 9px ui-monospace, monospace', fill: SIDE_COLOR.home }}>{ctx.home.abbr} ▲</text>
      <text x={L + 5} y={H - B - 5} style={{ font: '700 9px ui-monospace, monospace', fill: SIDE_COLOR.away }}>{ctx.away.abbr} ▼</text>
      {ch.filter((c) => c.wpIndex != null && points[c.wpIndex as number]).map((c) => {
        const k = seen.get(c.wpIndex as number) ?? 0
        seen.set(c.wpIndex as number, k + 1)
        const cx = x(c.wpIndex as number) + k * 13, cy = y(points[c.wpIndex as number].homeWp)
        const col = SIDE_COLOR[c.side]
        return (
          <g key={c.n}>
            <circle cx={cx} cy={cy} r={8} fill={c.overturned ? col : '#fff'} stroke={col} strokeWidth={2}><title>{`#${c.n} · ${c.who.name} (${ctx[c.side].abbr} ${c.who.role.toLowerCase()}) · ${c.overturned ? 'overturned' : 'call stood'}`}</title></circle>
            <text x={cx} y={cy + 3.2} textAnchor="middle" style={{ font: '700 9px ui-monospace, monospace', fill: c.overturned ? '#fff' : col }}>{c.n}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Tile({ s, ctx }: { s: AbsSide; ctx: PostgameContext }) {
  const c = SIDE_COLOR[s.side]
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: c }}>{ctx[s.side].abbr}</p>
      <p className="text-[18px] font-mono font-bold text-stone-900 leading-tight mt-0.5">{s.successful}<span className="text-stone-300"> of </span>{s.used}<span className="text-[10px] font-normal text-stone-500"> overturned</span></p>
      <p className="text-[10.5px] font-mono text-stone-500 mt-0.5">{s.remaining != null ? `${s.remaining} challenge${s.remaining === 1 ? '' : 's'} left at the end` : 'remaining n/a'}</p>
    </div>
  )
}

export default async function AbsSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  if (!data) return <Empty>The game feed isn&apos;t available, so challenges can&apos;t be listed.</Empty>
  const abs = buildAbs(data)
  if (abs.challenges.length === 0) return <Empty>No ABS challenges were used in this game.</Empty>
  const swing = buildSwing(data)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 max-w-md">{abs.sides.map((s) => <Tile key={s.side} s={s} ctx={ctx} />)}</div>
      {swing && <Timeline ch={abs.challenges} ctx={ctx} points={swing.points} inningStarts={swing.inningStarts} />}
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] min-w-[560px]">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-left border-b border-stone-200">
            <th className="py-1 w-6">#</th><th>When</th><th>Challenged by</th><th>Batter vs pitcher</th><th>Count</th><th>Call → result</th>
          </tr></thead>
          <tbody>
            {abs.challenges.map((c) => (
              <tr key={c.n} className="border-b border-stone-100 last:border-0 text-stone-700">
                <td className="py-1.5 font-mono font-bold" style={{ color: SIDE_COLOR[c.side] }}>{c.n}</td>
                <td className="font-mono text-[10.5px] whitespace-nowrap">{c.top ? 'Top' : 'Bot'} {ordinal(c.inning)}</td>
                <td className="font-sans"><span className="font-semibold text-stone-900">{c.who.name}</span> <span className="font-mono text-[9px] text-stone-400">{ctx[c.side].abbr} {c.who.role.toLowerCase()}</span></td>
                <td className="font-sans text-stone-600">{c.batter.split(' ').slice(-1)[0]} vs {c.pitcher.split(' ').slice(-1)[0]}</td>
                <td className="font-mono">{c.count}</td>
                <td className="font-sans">{c.originalCall.toLowerCase()} {c.overturned ? <>→ <b className="text-orange-600">{c.finalCall.toLowerCase()}</b></> : <span className="text-stone-400">stood</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Foot>Challenges come from the MLB game feed: those tagged on a pitch, plus challenges on the pitch that ended a plate appearance (ball four, strike three), which the feed only records in the play description — together they match MLB&apos;s official per-club totals. Count = balls-strikes before the challenged pitch. A club keeps its challenge when it wins one and loses it when it doesn&apos;t.</Foot>
    </div>
  )
}
