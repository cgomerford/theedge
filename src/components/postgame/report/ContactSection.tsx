// src/components/postgame/report/ContactSection.tsx
//
// §7 Spray & contact — one tab per club: a spray chart of every ball it put in play (hits filled
// orange, outs hollow, hard-hit larger, barrels ringed in black), hard-hit % and barrel % for the
// game beside the club's season figure, and its five hardest-hit balls. The chart is server-rendered
// SVG on Gameday's 250×250 grid (home plate ≈ (125, 204), scale ≈ 0.42 grid units per foot).

import { getPostData } from '@/lib/postgame/data'
import { getContact, HARD_HIT_MPH, type Ball, type ContactSide } from '@/lib/postgame/contact'
import ClubHeader from '@/components/scout/ClubHeader'
import Tabs from '@/components/scout/Tabs'
import TipLayer from './TipLayer'
import { Empty, Foot, Stat, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

const HX = 125, HY = 204, U = 0.42                 // home plate and grid units per foot
const P = (dx: number, dy: number) => `${(HX + dx * U).toFixed(1)},${(HY - dy * U).toFixed(1)}`

function Field({ balls, color, label }: { balls: Ball[]; color: string; label: string }) {
  // diamond (90 ft), foul lines to the fence, and the outfield wall at ~400 ft
  const first = P(63.6, 63.6), third = P(-63.6, 63.6), second = P(0, 127.3)
  const fence = 400
  const a = (deg: number) => [Math.sin((deg * Math.PI) / 180) * fence, Math.cos((deg * Math.PI) / 180) * fence] as const
  const [lx, ly] = a(-45), [rx, ry] = a(45)
  return (
    <svg viewBox="0 0 250 220" className="w-full h-auto block" role="img" aria-label={label}>
      <path d={`M${P(0, 0)} L${P(lx, ly)} A${fence * U},${fence * U} 0 0 1 ${P(rx, ry)} Z`} fill="#f5f3ee" stroke="#d6d3d1" />
      <path d={`M${P(0, 0)} L${first} L${second} L${third} Z`} fill="#ebe7dc" stroke="#c9c4b6" />
      {[first, second, third].map((b, i) => <rect key={i} x={Number(b.split(',')[0]) - 2} y={Number(b.split(',')[1]) - 2} width={4} height={4} fill="#fff" stroke="#a8a29e" strokeWidth={0.6} transform={`rotate(45 ${b.split(',')[0]} ${b.split(',')[1]})`} />)}
      {balls.map((b, i) => {
        const r = b.hard ? 4 : 3
        return (
          <g key={i} data-tip={i} style={{ cursor: 'pointer' }}>
            <circle cx={b.x} cy={b.y} r={r + 5} fill="transparent" />
            <circle cx={b.x} cy={b.y} r={r} fill={b.hit ? color : '#fff'} fillOpacity={b.hit ? 0.9 : 0.85} stroke={b.barrel ? '#1A1A1A' : b.hit ? color : '#78716c'} strokeWidth={b.barrel ? 1.8 : 1} />
          </g>
        )
      })}
    </svg>
  )
}

function Panel({ c, ctx }: { c: ContactSide; ctx: PostgameContext }) {
  const club = ctx[c.side], color = SIDE_COLOR[c.side]
  if (c.balls.length === 0) return <Empty>{club.name} put no balls in play with tracking data.</Empty>
  const hardPct = c.bbe ? (c.hardHit / c.bbe) * 100 : null, brlPct = c.bbe ? (c.barrels / c.bbe) * 100 : null
  const top = [...c.balls].filter((b) => b.ev != null).sort((a, b) => (b.ev as number) - (a.ev as number)).slice(0, 5)
  const vs = (game: number | null, season: number | null) => (game != null && season != null ? `season ${season.toFixed(1)}%` : 'season n/a')
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
      <div>
        <TipLayer tips={c.balls.map((b) => ({ ...b.tip, flag: b.barrel ? 'Barrel' : b.hard ? 'Hard hit (95+ mph)' : undefined }))}><Field balls={c.balls} color={color} label={`${club.name} balls in play`} /></TipLayer>
        <p className="text-[9.5px] font-mono text-stone-400 mt-1"><span style={{ color }}>●</span> hit &nbsp; ○ out &nbsp; larger = {HARD_HIT_MPH}+ mph &nbsp; black ring = barrel &nbsp; · hover or tap a ball for the at-bat</p>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Balls in play" value={c.bbe} sub={`${c.balls.length - c.bbe > 0 ? `+${c.balls.length - c.bbe} untracked` : 'all tracked'}`} />
          <Stat label={`Hard-hit ${HARD_HIT_MPH}+`} value={hardPct != null ? `${hardPct.toFixed(0)}%` : '—'} sub={`${c.hardHit} of ${c.bbe} · ${vs(hardPct, c.seasonHardPct)}`} />
          <Stat label="Barrels" value={brlPct != null ? `${brlPct.toFixed(0)}%` : '—'} sub={`${c.barrels} of ${c.bbe} · ${vs(brlPct, c.seasonBarrelPct)}`} />
          <Stat label="Avg / max exit velo" value={c.avgEv != null ? c.avgEv.toFixed(1) : '—'} sub={c.maxEv != null ? `max ${c.maxEv.toFixed(1)} mph` : undefined} />
        </div>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mb-1">Hardest-hit balls</p>
          <table className="w-full text-[11.5px]">
            <tbody>
              {top.map((b, i) => (
                <tr key={i} className="border-b border-stone-100 last:border-0">
                  <td className="py-1 font-sans font-semibold text-stone-800">{b.batter.split(' ').slice(-1)[0]}</td>
                  <td className="font-sans text-stone-600">{b.result}</td>
                  <td className="text-right font-mono text-stone-900 font-bold">{(b.ev as number).toFixed(1)} <span className="font-normal text-[9px] text-stone-400">mph</span></td>
                  <td className="text-right font-mono text-stone-500 w-12">{b.la != null ? `${b.la.toFixed(0)}°` : ''}</td>
                  <td className="text-right font-mono text-[9px] text-stone-900 w-14">{b.barrel ? 'BARREL' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default async function ContactSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const sides = data ? await getContact(data, ctx.gameDate) : []
  if (sides.length === 0 || sides.every((s) => s.balls.length === 0)) return <Empty>No tracked batted balls are available for this game.</Empty>
  return (
    <div className="space-y-3">
      <Tabs tabs={sides.map((c) => ({ id: c.side, label: `${ctx[c.side].abbr} batting`, content: (
        <div className="space-y-3"><ClubHeader club={{ ...ctx[c.side], probableId: null, probableName: null }} side={c.side} /><Panel c={c} ctx={ctx} /></div>
      ) }))} />
      <Foot>Hard-hit = exit velocity {HARD_HIT_MPH}+ mph. Barrel = Statcast&apos;s definition (98+ mph at 26–30°, the window widening with speed), rebuilt from the feed&apos;s exit speed and launch angle. Season figures are Savant&apos;s team leaderboard (balls in play with tracking). Bunts and untracked balls are plotted but not counted in the percentages.</Foot>
    </div>
  )
}
