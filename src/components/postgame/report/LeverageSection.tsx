// src/components/postgame/report/LeverageSection.tsx
//
// Pro §19 Leverage timeline — MLB's leverage index for every plate appearance across the game (bars, coloured by
// which club was batting, dark where it hit 2.0+), a result strip underneath (what happened in each), the
// highest-leverage plate appearances listed, and each club's results in high-leverage spots.

import { getPostData } from '@/lib/postgame/data'
import { buildLeverage, HIGH_LI, type Cat } from '@/lib/postgame/leverage'
import { Empty, Eyebrow, Foot, SIDE_COLOR, Stat, ordinal } from './ui'
import type { PostgameContext } from './types'

const W = 760, H = 170, L = 30, R = 10, T = 10, B = 22
const CAT: Record<Cat, { c: string; l: string }> = { hr: { c: '#FF5722', l: 'HR' }, hit: { c: '#FDE047', l: 'H' }, walk: { c: '#78716c', l: 'BB' }, k: { c: '#1A1A1A', l: 'K' }, out: { c: '#e7e5e4', l: '·' }, other: { c: '#e7e5e4', l: '·' } }

export default async function LeverageSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const lev = data ? buildLeverage(data) : null
  if (!lev) return <Empty>Leverage data isn&apos;t available for this game.</Empty>
  const n = lev.pas.length, ymax = Math.max(3, Math.ceil(lev.peak))
  const bw = (W - L - R) / n
  const y = (v: number) => T + (1 - v / ymax) * (H - T - B)
  const inningStarts = lev.pas.filter((p, i) => i === 0 || p.inning !== lev.pas[i - 1].inning)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Peak leverage" value={lev.peak.toFixed(1)} sub="1.0 = an average spot" />
        <Stat label="High-leverage PAs" value={`${lev.high} of ${lev.total}`} sub={`${HIGH_LI.toFixed(1)}+ leverage`} />
        {lev.sides.map((s) => (
          <Stat key={s.side} label={`${ctx[s.side].abbr} in high leverage`} value={s.pa ? `${s.h}-for-${s.ab}` : '—'} sub={s.pa ? `${s.k} K · ${s.bb} BB${s.hr ? ` · ${s.hr} HR` : ''}` : 'no plate appearances'} />
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 26}`} className="w-full h-auto block" role="img" aria-label="Leverage index by plate appearance with results">
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#fafaf9" stroke="#e7e5e4" />
        {[1, 2, 3].filter((v) => v <= ymax).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === HIGH_LI ? '#a8a29e' : '#eeeeec'} strokeDasharray={v === HIGH_LI ? '4 3' : undefined} /><text x={L - 5} y={y(v) + 3} textAnchor="end" className="fill-stone-400" style={{ font: '400 9px ui-monospace, monospace' }}>{v}.0</text></g>)}
        {lev.pas.map((p, i) => (
          <g key={i}>
            <rect x={L + i * bw + 0.5} y={y(p.li)} width={Math.max(1, bw - 1)} height={H - B - y(p.li)} fill={SIDE_COLOR[p.top ? 'away' : 'home']} fillOpacity={p.li >= HIGH_LI ? 1 : 0.4}>
              <title>{`${p.top ? 'Top' : 'Bot'} ${ordinal(p.inning)} · ${p.batter}: ${p.event} · leverage ${p.li.toFixed(2)}`}</title>
            </rect>
            <rect x={L + i * bw + 0.5} y={H - B + 4} width={Math.max(1, bw - 1)} height={10} fill={CAT[p.cat].c} stroke={p.cat === 'out' ? '#d6d3d1' : 'none'} strokeWidth={0.5} />
          </g>
        ))}
        {inningStarts.map((p) => <text key={p.i} x={L + p.i * bw + 1} y={H + 22} className="fill-stone-400" style={{ font: '400 9px ui-monospace, monospace' }}>{p.inning}</text>)}
      </svg>
      <p className="text-[9.5px] font-mono text-stone-500"><span style={{ color: SIDE_COLOR.away }}>■</span> {ctx.away.abbr} batting &nbsp; <span style={{ color: SIDE_COLOR.home }}>■</span> {ctx.home.abbr} batting &nbsp; · strip: <span style={{ color: '#FF5722' }}>■</span> HR <span style={{ color: '#d4b400' }}>■</span> hit <span style={{ color: '#78716c' }}>■</span> walk/HBP ■ strikeout □ other out</p>
      <div>
        <Eyebrow>Highest-leverage plate appearances</Eyebrow>
        <ul className="grid gap-2 md:grid-cols-2">
          {lev.top.map((p) => (
            <li key={p.i} className="flex gap-2.5 rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="shrink-0 w-10 text-center text-[11px] font-mono font-bold py-0.5 bg-stone-900 text-yellow-300 self-start">{p.li.toFixed(1)}</span>
              <div className="min-w-0">
                <p className="text-[9.5px] font-mono uppercase tracking-wider text-stone-400">{p.top ? 'Top' : 'Bot'} {ordinal(p.inning)} · <span style={{ color: SIDE_COLOR[p.top ? 'away' : 'home'] }} className="font-bold">{ctx[p.top ? 'away' : 'home'].abbr} bat</span> · {p.wpa >= 0 ? '+' : '−'}{Math.abs(p.wpa).toFixed(0)} pts for the batting club</p>
                <p className="text-[11.5px] font-sans text-stone-700 leading-snug">{p.text.length > 140 ? `${p.text.slice(0, 137)}…` : p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Foot>Leverage index is MLB&apos;s own figure for each plate appearance (the feed&apos;s leverageIndex): how much the next result can swing the game, where 1.0 is an average situation. 2.0+ is treated as high leverage. Points = the change in the batting club&apos;s win probability on that plate appearance.</Foot>
    </div>
  )
}
