// src/components/postgame/report/CountAuditSection.tsx
//
// Pro §15 Count spot audit — for each starter, five strike-zone maps (first pitch / ahead / even /
// behind / two strikes). Shading = where his pitches actually went tonight; dashed outline = the zones
// his season map points to in that kind of count. Beneath each: how many pitches landed on their usual
// spot for that pitch type and count.

import { getPostData } from '@/lib/postgame/data'
import { getCountAudit, MIN_N, type CountStarter } from '@/lib/postgame/countaudit'
import ZoneGrid from './ZoneGrid'
import { Empty, Foot, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

function Card({ s, ctx }: { s: CountStarter; ctx: PostgameContext }) {
  const club = ctx[s.side], pct = s.graded ? (s.onSpot / s.graded) * 100 : 0
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[13.5px] font-sans font-bold text-stone-900"><span style={{ color: SIDE_COLOR[s.side] }}>{club.abbr}</span> · {s.name}</p>
        <p className="text-[11.5px] font-mono text-stone-600"><b className="text-stone-900">{s.onSpot}</b> of {s.graded} pitches on their usual spot ({pct.toFixed(0)}%)</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
        {s.groups.map((g) => (
          <div key={g.group} className="flex flex-col items-center text-center">
            <p className="text-[9px] font-mono uppercase tracking-wider text-stone-500 mb-1">{g.group}</p>
            <ZoneGrid counts={g.zones} usual={g.usualZones} color={SIDE_COLOR[s.side]} size={104} label={`${s.name}, ${g.group}: tonight's pitch locations against his usual spots`} />
            <p className="text-[10px] font-mono text-stone-600 mt-1">{g.n} pitches</p>
            <p className="text-[10px] font-mono text-stone-400">{g.graded ? `${g.onSpot}/${g.graded} on spot` : 'no spot map'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function CountAuditSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const a = data ? await getCountAudit(data, ctx.gameDate) : { starters: [], missing: [] }
  if (a.starters.length === 0) return <Empty>{a.missing.length ? `No season count-by-pitch map is on file for ${a.missing.join(' or ')}.` : 'Count data isn’t available for this game.'}</Empty>
  return (
    <div className="space-y-3">
      <div className="grid gap-4 xl:grid-cols-2">{a.starters.map((s) => <Card key={s.id} s={s} ctx={ctx} />)}</div>
      <Foot>Catcher&apos;s view. Zones 1–9 are the strike zone (1 = top-left); the four large corners are pitches outside it. Shading and the number in a cell = pitches tonight. Dashed outline = a zone his season data says he throws a pitch to in that kind of count (pitch/count pairs with at least {MIN_N} season pitches and a 10%+ share). On spot = the pitch landed in the zone that pitch type most often goes to in that exact count.</Foot>
    </div>
  )
}
