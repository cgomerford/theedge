// src/components/postgame/report/HitterCheckSection.tsx
//
// Pro: "Hitters — hot, cooling, or turning a corner?" One tab per lineup. Left: every ball in play as exit speed vs launch angle
// (the barrel window shaded), so hard-hit outs and soft hits stand out; hover a dot for the at-bat. Right: per hitter, a contact
// read and his season damage zones (yellow wash, xwOBA) next to where he did damage tonight — plus a form row: tonight vs his own
// last 15 games on five factors, a verdict in factor-count language, and a trend line. Small samples get an empty state, not a read.

import { getPostData } from '@/lib/postgame/data'
import { getContact, HARD_HIT_MPH } from '@/lib/postgame/contact'
import { FORM, getHitterChecks, HARD, SOFT, type Factor, type FormRead, type HitterRow } from '@/lib/postgame/hittercheck'
import ClubHeader from '@/components/scout/ClubHeader'
import Tabs from '@/components/scout/Tabs'
import TipLayer from './TipLayer'
import ZoneGrid from './ZoneGrid'
import { Empty, Foot, SIDE_COLOR, Stat } from './ui'
import type { ReactNode } from 'react'
import type { PostgameContext } from './types'
import type { Ball } from '@/lib/postgame/contact'
import type { Tip } from '@/lib/postgame/tip'

const W = 520, H = 330, PL = 38, PR = 8, PT = 8, PB = 26
const LA0 = -40, LA1 = 70, EV0 = 40, EV1 = 115
const x = (la: number) => PL + ((la - LA0) / (LA1 - LA0)) * (W - PL - PR)
const y = (ev: number) => PT + (1 - (ev - EV0) / (EV1 - EV0)) * (H - PT - PB)
const MONO = { font: '400 9px ui-monospace, monospace' } as const

function Scatter({ balls, color }: { balls: Ball[]; color: string }) {
  const band = [[98, 26], [98, 30], [115, 47], [115, 9]].map(([ev, la]) => `${x(la)},${y(ev)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block bg-stone-50 border border-stone-200" role="img" aria-label="Exit velocity against launch angle for every ball in play">
      {[60, 80, 100].map((v) => <g key={v}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#eeeeec" /><text x={PL - 5} y={y(v) + 3} textAnchor="end" className="fill-stone-400" style={MONO}>{v}</text></g>)}
      {[-30, 0, 30, 60].map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={PT} y2={H - PB} stroke="#eeeeec" /><text x={x(v)} y={H - PB + 12} textAnchor="middle" className="fill-stone-400" style={MONO}>{v}°</text></g>)}
      <polygon points={band} fill="#FDE047" fillOpacity={0.45} stroke="#d4b400" strokeWidth={0.8} />
      <line x1={PL} x2={W - PR} y1={y(HARD)} y2={y(HARD)} stroke="#a8a29e" strokeDasharray="4 3" />
      <text x={W - PR - 4} y={y(HARD) - 3} textAnchor="end" className="fill-stone-500" style={MONO}>95 mph</text>
      <text x={x(38)} y={y(112)} textAnchor="middle" style={{ font: '700 9px ui-monospace, monospace', fill: '#a16207' }}>BARREL</text>
      {balls.map((b, i) => b.ev != null && b.la != null ? (
        <g key={i} data-tip={i} style={{ cursor: 'pointer' }}>
          <circle cx={x(b.la)} cy={y(b.ev)} r={9} fill="transparent" />
          <circle cx={x(b.la)} cy={y(b.ev)} r={4.5} fill={b.hit ? color : '#fff'} stroke={b.hit ? color : '#57534e'} strokeWidth={1.5} />
        </g>
      ) : null)}
      <text x={PL + 4} y={PT + 10} className="fill-stone-400" style={MONO}>exit velocity ↑ · launch angle →</text>
    </svg>
  )
}

const READ_STYLE: Record<string, string> = {
  'Hit harder than the box shows': 'bg-orange-500 text-white border-orange-600',
  'Results ahead of contact': 'bg-stone-900 text-yellow-300 border-stone-900',
  Even: 'bg-stone-100 text-stone-500 border-stone-200',
  'No balls in play': 'bg-white text-stone-400 border-stone-300 border-dashed',
}

const FORM_STYLE = {
  up: 'bg-orange-500 text-white border-orange-600',
  down: 'bg-stone-900 text-yellow-300 border-stone-900',
  flat: 'bg-stone-100 text-stone-500 border-stone-200',
} as const
const ARROW = { up: '▲', down: '▼', flat: '●', na: '–' } as const
const CELL_STYLE = {
  up: 'border-orange-400 bg-orange-50', down: 'border-stone-800 bg-stone-100', flat: 'border-stone-200 bg-stone-50', na: 'border-stone-200 bg-stone-50 opacity-50',
} as const
const fmtFactor = (f: Factor, v: number | null) => v == null ? '–' : f.key === 'ev' ? v.toFixed(1) : f.key === 'xw' ? v.toFixed(3).replace(/^0/, '') : `${Math.round(v * 100)}%`

/** xwOBA on contact by game, last 15 games then tonight (orange dot); dashed line = his season xwOBA on contact. */
function Spark({ read }: { read: Extract<FormRead, { kind: 'read' }> }) {
  const W = 150, H = 34, P = 3
  const pts = [...read.spark.map((g) => g.xw), read.tonightXw]
  const X = (i: number) => P + (i * (W - 2 * P)) / Math.max(pts.length - 1, 1)
  const Y = (v: number) => H - P - (Math.min(Math.max(v, 0), 0.9) / 0.9) * (H - 2 * P)
  const segs: { x: number; y: number }[][] = []
  let cur: { x: number; y: number }[] = []
  pts.slice(0, -1).forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = [] } else cur.push({ x: X(i), y: Y(v) }) })
  if (cur.length) segs.push(cur)
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="xwOBA on contact by game, last 15 games then tonight">
      {read.seasonXw != null && <line x1={P} x2={W - P} y1={Y(read.seasonXw)} y2={Y(read.seasonXw)} stroke="#1A1A1A" strokeDasharray="2 2" strokeWidth={0.8} />}
      {segs.filter((sg) => sg.length > 1).map((sg, i) => <polyline key={i} points={sg.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} fill="none" stroke="#8A8577" strokeWidth={1.4} />)}
      {segs.flat().map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={1.6} fill="#8A8577" />)}
      {last != null && <circle cx={X(pts.length - 1)} cy={Y(last)} r={4} fill="#FF5722" stroke="#1A1A1A" strokeWidth={1} />}
    </svg>
  )
}

function FormBlock({ form }: { form: FormRead }): ReactNode {
  if (form.kind === 'nodata') return <p className="text-[10px] font-mono text-stone-400 italic">{form.reason}. No form read.</p>
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) 156px' }}>
        {form.factors.map((f) => (
          <div key={f.key} title={f.why} className={`relative border px-2 py-1.5 ${CELL_STYLE[f.state]}`}>
            <p className="text-[8.5px] font-mono uppercase tracking-wider text-stone-500 pr-3">{f.label}</p>
            <p className="text-[16px] font-mono font-bold text-stone-900 leading-tight">{fmtFactor(f, f.tonight)}</p>
            <p className="text-[9px] font-mono text-stone-400">L15 {fmtFactor(f, f.l15)}</p>
            <span className={`absolute top-1 right-1.5 text-[10px] ${f.state === 'up' ? 'text-orange-500' : 'text-stone-900'}`}>{ARROW[f.state]}</span>
          </div>
        ))}
        <div className="flex flex-col justify-center pl-1"><Spark read={form} /><p className="text-[8.5px] font-mono text-stone-400 leading-tight">xwOBA on contact, last 15 → tonight</p></div>
      </div>
      {form.luck && (
        <p className={`text-[10px] font-mono px-2 py-1 border ${form.luck.kind === 'behind' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-stone-900 bg-yellow-300 text-stone-900'}`}>
          Results {form.luck.kind} contact · last 15 xwOBA {form.luck.xw.toFixed(3).replace(/^0/, '')} vs actual {form.luck.wo.toFixed(3).replace(/^0/, '')}
        </p>
      )}
    </div>
  )
}

function Row({ r, color }: { r: HitterRow; color: string }) {
  const heat: Record<string, number> = {}
  const vals = Object.values(r.season)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  for (const [k, v] of Object.entries(r.season)) heat[k] = hi > lo ? (v - lo) / (hi - lo) : 0.5
  const f = r.form
  return (
    <>
    <tr className="align-middle">
      <td className="py-2 pr-2 font-mono text-[10px] text-stone-400 w-4">{r.slot}</td>
      <td className="pr-3 whitespace-nowrap"><p className="font-sans font-semibold text-[12px] text-stone-900">{r.name}</p><p className="font-mono text-[9.5px] text-stone-500">{r.bip.length} in play · {r.hard} hard-hit</p></td>
      <td className="pr-3"><span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 border whitespace-nowrap ${READ_STYLE[r.read]}`}>{r.read}</span></td>
      <td className="pr-2">{r.seasonTop.length ? <ZoneGrid heat={heat} size={64} label={`${r.name}: season xwOBA by zone`} /> : <span className="text-[10px] font-sans italic text-stone-300">no map</span>}</td>
      <td className="pr-3">{r.seasonTop.length ? <ZoneGrid counts={r.damage} color={color} size={64} label={`${r.name}: where he did damage tonight`} /> : null}</td>
      <td className="font-sans text-[11px] text-stone-600">{r.zoneRead}</td>
    </tr>
    <tr className="border-b border-stone-100 last:border-0">
      <td />
      <td colSpan={5} className="pb-3 pr-2">
        <div className="flex items-center gap-2 mb-1.5">
          {f.kind === 'read'
            ? <><span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 border whitespace-nowrap ${FORM_STYLE[f.tone]}`}>{f.verdict}</span>
                <span className="text-[10px] font-mono text-stone-500">{f.up} of {f.counted} factors up · {f.down} down vs his last 15</span></>
            : <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 border border-dashed border-stone-300 text-stone-400 whitespace-nowrap">Small sample</span>}
        </div>
        <FormBlock form={f} />
      </td>
    </tr>
    </>
  )
}

export default async function HitterCheckSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  if (!data) return <Empty>The game feed isn&apos;t available.</Empty>
  const [contact, checks] = await Promise.all([getContact(data, ctx.gameDate), getHitterChecks(data, ctx.gameDate)])
  if (contact.every((c) => c.balls.length === 0)) return <Empty>No tracked balls in play for this game.</Empty>
  return (
    <div className="space-y-3">
      <Tabs tabs={contact.map((c) => {
        const rows = checks.find((k) => k.side === c.side)?.rows.filter((r) => r.bip.length > 0) ?? []
        const hardOuts = c.balls.filter((b) => (b.ev ?? 0) >= HARD_HIT_MPH && !b.hit).length, softHits = c.balls.filter((b) => b.ev != null && b.ev < SOFT && b.hit).length
        const tips: Tip[] = c.balls.map((b) => ({ ...b.tip, flag: b.ev != null && b.ev >= HARD_HIT_MPH && !b.hit ? 'Hard-hit out' : b.ev != null && b.ev < SOFT && b.hit ? 'Soft hit' : b.barrel ? 'Barrel' : undefined }))
        return { id: c.side, label: `${ctx[c.side].abbr} hitters`, content: (
          <div className="space-y-4">
            <ClubHeader club={{ ...ctx[c.side], probableId: null, probableName: null }} side={c.side} />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
              <div className="space-y-2">
                <TipLayer tips={tips}><Scatter balls={c.balls} color={SIDE_COLOR[c.side]} /></TipLayer>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Hard-hit outs" value={hardOuts} sub={`${HARD_HIT_MPH}+ mph, no hit`} />
                  <Stat label="Soft hits" value={softHits} sub={`hits under ${SOFT} mph`} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-left border-b border-stone-200"><th /><th className="py-1">Hitter</th><th>Contact read</th><th>Season damage</th><th>Tonight</th><th>Zone read</th></tr></thead>
                  <tbody>{rows.map((r) => <Row key={r.id} r={r} color={SIDE_COLOR[c.side]} />)}</tbody>
                </table>
              </div>
            </div>
          </div>
        ) }
      })} />
      <Foot>Form: five factors compare tonight with the hitter&apos;s own last 15 games — exit velocity, hard-hit %, xwOBA on contact, whiff % and chase %. A factor without a big enough sample tonight (under {FORM.MIN_SWINGS} swings or {FORM.MIN_OUTSIDE} pitches outside the zone) is skipped, not guessed; xwOBA lands after the game&apos;s Statcast data loads overnight. {FORM.EV}+ mph, {Math.round(FORM.HH * 100)}+ points or {FORM.XW.toFixed(3).replace(/^0/, '')}+ xwOBA apart counts as up or down (8+ points for whiff and chase). 2+ more factors up than down reads as turning a corner (staying hot if his last 15 already ran .030+ above his season xwOBA on contact); 2+ more down reads as dropping off (cooling if he was running hot); otherwise steady. A hitter needs {FORM.MIN_BIP}+ balls in play tonight and {FORM.MIN_GAMES}+ games of history, or the row says small sample. Results ahead of / behind contact compares his last-15 xwOBA on contact with what actually happened. One game is a small sample: read it as a signal to watch, not a forecast. Contact read — hit harder than the box shows: 2+ balls at {HARD}+ mph that were outs and no more hits than hard-hit outs; results ahead of contact: 2+ hits under {SOFT} mph and fewer hard-hit balls than that. Damage = a {HARD}+ mph ball or an extra-base hit; season damage zones are the three strike-zone cells with the highest xwOBA (yellow wash, darker = higher).</Foot>
    </div>
  )
}
