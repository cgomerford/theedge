// src/components/postgame/report/BullpenSection.tsx
//
// §9 Bullpen used tonight — every reliever, one tab per club: when he came in (inning, outs, the
// score from his club's side), his line, and "into tomorrow" chips: pitches thrown tonight plus the
// two days before, with a plain back-to-back flag. Chip colour is only the three-day pitch total
// (under 30 light, 30–44 moderate, 45+ heavy) — a workload fact, not a prediction of availability.

import { Fragment } from 'react'
import { getPostData } from '@/lib/postgame/data'
import { getBullpenNight, type PenSide, type Reliever } from '@/lib/postgame/bullpen'
import { pitchColor } from '@/lib/mlb'
import ClubHeader from '@/components/scout/ClubHeader'
import Tabs from '@/components/scout/Tabs'
import { Empty, Foot, ordinal } from './ui'
import type { PostgameContext } from './types'

const heat = (n: number) => (n >= 45 ? 'bg-orange-500 text-white border-orange-600' : n >= 30 ? 'bg-yellow-200 text-stone-900 border-yellow-400' : 'bg-stone-50 text-stone-600 border-stone-200')
const day = (v: number | null) => (v == null ? '—' : String(v))
const entry = (e: Reliever['entered']) => {
  if (!e) return '—'
  const sit = e.margin === 0 ? 'tied' : e.margin > 0 ? `up ${e.margin}` : `down ${Math.abs(e.margin)}`
  return `${e.top ? 'Top' : 'Bot'} ${ordinal(e.inning)}, ${e.outs} out · ${sit}`
}
const DEC_LABEL: Record<string, string> = { W: 'W', L: 'L', S: 'SV', H: 'HLD', BS: 'BS' }

function Table({ pen }: { pen: PenSide }) {
  if (pen.relievers.length === 0) return <Empty>The starter went the distance — no relievers pitched.</Empty>
  const ip = `${Math.floor(pen.outs / 3)}.${pen.outs % 3}`
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-mono text-stone-600">{pen.relievers.length} reliever{pen.relievers.length === 1 ? '' : 's'} · {ip} IP · {pen.pitches} pitches</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] min-w-[640px]">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
            <th className="py-1 text-left font-semibold">Reliever</th><th className="text-left font-semibold">Entered</th><th>IP</th><th>H</th><th>ER</th><th>BB</th><th>K</th><th>P</th><th className="text-left pl-3">Into tomorrow (pitches)</th>
          </tr></thead>
          <tbody>
            {pen.relievers.map((r) => (
              <Fragment key={r.id}>
              <tr className="text-right text-stone-700">
                <td className="text-left py-1.5 font-sans font-semibold text-stone-900">{r.name}{r.dec && <span className="ml-1.5 font-mono text-[9px] text-orange-600 font-bold">{DEC_LABEL[r.dec]}</span>}</td>
                <td className="text-left font-mono text-[10.5px] text-stone-600 whitespace-nowrap">{entry(r.entered)}</td>
                <td className="font-mono">{r.line.ip}</td><td className="font-mono">{r.line.h}</td><td className={`font-mono ${r.line.er > 0 ? 'font-bold text-stone-900' : ''}`}>{r.line.er}</td><td className="font-mono">{r.line.bb}</td><td className="font-mono">{r.line.k}</td><td className="font-mono">{r.line.pitches}</td>
                <td className="text-left pl-3">
                  <span className={`inline-block text-[10px] font-mono border px-1.5 py-0.5 ${heat(r.threeDay)}`} title="Pitches: tonight / yesterday / two days ago">
                    {r.line.pitches} · {day(r.d1)} · {day(r.d2)} <span className="opacity-70">= {r.threeDay}</span>
                  </span>
                  {r.streak && <span className="ml-1.5 text-[9px] font-mono uppercase tracking-wider text-orange-600 font-bold">{r.streak}</span>}
                </td>
              </tr>
              <tr className="border-b border-stone-100 last:border-0">
                <td colSpan={9} className="pb-2 pt-0.5">
                  {r.mix.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="flex h-2.5 w-40 overflow-hidden bg-stone-100 shrink-0">{r.mix.map((m) => <div key={m.type} style={{ width: `${m.pct}%`, background: pitchColor(m.type) }} title={`${m.name}: ${m.n} (${m.pct.toFixed(0)}%)`} />)}</div>
                      <p className="text-[10px] font-mono text-stone-500 text-left">
                        {r.mix.map((m) => `${m.name} ${m.pct.toFixed(0)}%${m.velo != null ? ` ${m.velo.toFixed(1)}` : ''}${m.whiffs ? ` (${m.whiffs} miss${m.whiffs > 1 ? 'es' : ''})` : ''}`).join(' · ')}
                        <span className="text-stone-400"> · Zone {r.zone != null ? `${r.zone.toFixed(0)}%` : '—'} · Whiff {r.whiff != null ? `${r.whiff.toFixed(0)}%` : '—'}</span>
                      </p>
                    </div>
                  )}
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function BullpenSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const pens = data ? await getBullpenNight(data, ctx.gameDate) : []
  if (pens.length === 0) return <Empty>Pitching lines aren&apos;t available for this game.</Empty>
  return (
    <div className="space-y-3">
      <Tabs tabs={pens.map((p) => ({ id: p.side, label: `${ctx[p.side].abbr} bullpen`, badge: String(p.relievers.length), content: (
        <div><ClubHeader club={{ ...ctx[p.side], probableId: null, probableName: null }} side={p.side} /><Table pen={p} /></div>
      ) }))} />
      <Foot>Under each reliever: what he threw (share, average mph, swinging misses), his Zone% and Whiff% (misses per swing) for the outing. Into tomorrow shows pitches thrown tonight · yesterday · two days ago, then the three-day total: under 30 light, 30–44 moderate (yellow), 45+ heavy (orange). A dash means that day&apos;s workload isn&apos;t recorded for the club. An earlier game the same day (doubleheader) isn&apos;t included. It is a workload record, not a forecast of who is available.</Foot>
    </div>
  )
}
