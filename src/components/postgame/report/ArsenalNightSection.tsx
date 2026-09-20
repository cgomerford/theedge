// src/components/postgame/report/ArsenalNightSection.tsx
//
// Pro §17 Full arsenal night chart — each starter's pitch mix tonight as stacked bars, three ways: by
// count bucket, by hitter hand and by time through the order. Every bar is 100% of the pitches in that
// row (n shown), coloured by pitch type. Feed only.

import { getPostData } from '@/lib/postgame/data'
import { buildArsenalNight, type ArsenalNight, type MixRowN } from '@/lib/postgame/arsenalnight'
import { pitchColor } from '@/lib/mlb'
import { Empty, Eyebrow, Foot, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

function Bars({ title, rows }: { title: string; rows: MixRowN[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[84px_minmax(0,1fr)_34px] items-center gap-2">
            <span className="text-[10.5px] font-mono text-stone-600">{r.label}</span>
            <div className="flex h-5 overflow-hidden bg-stone-100">
              {r.mix.map((m) => <div key={m.type} title={`${m.name}: ${m.n} of ${r.n} (${m.pct.toFixed(0)}%)`} className="flex items-center justify-center text-[9px] font-mono font-bold text-white overflow-hidden" style={{ width: `${m.pct}%`, background: pitchColor(m.type) }}>{m.pct >= 14 ? Math.round(m.pct) : ''}</div>)}
            </div>
            <span className="text-[10px] font-mono text-stone-400 text-right">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Card({ a, ctx }: { a: ArsenalNight; ctx: PostgameContext }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-4">
      <p className="text-[13.5px] font-sans font-bold text-stone-900"><span style={{ color: SIDE_COLOR[a.side] }}>{ctx[a.side].abbr}</span> · {a.name} <span className="font-mono font-normal text-[10px] text-stone-400">{a.pitches} pitches</span></p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">{a.types.map((t) => <span key={t.type} className="inline-flex items-center gap-1 text-[10px] font-mono text-stone-600"><span className="w-2 h-2" style={{ background: pitchColor(t.type) }} />{t.name}</span>)}</div>
      <Bars title="By count" rows={a.byCount} />
      <Bars title="By hitter hand" rows={a.byHand} />
      <Bars title="Time through the order" rows={a.byTto} />
    </div>
  )
}

export default async function ArsenalNightSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const arsenals = data ? buildArsenalNight(data) : []
  if (arsenals.length === 0 || arsenals.every((a) => a.pitches === 0)) return <Empty>No pitch data is available for this game.</Empty>
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">{arsenals.map((a) => <Card key={a.id} a={a} ctx={ctx} />)}</div>
      <Foot>Each bar is 100% of the starter&apos;s pitches in that row; the number at the right is how many. Counts are the count when the pitch was thrown (ahead = more strikes than balls, behind = more balls, two strikes has its own row). Hand is the side the batter actually hit from. Time through the order = the nth time that batter faced him. Labels show a pitch&apos;s share where it is 14% or more.</Foot>
    </div>
  )
}
