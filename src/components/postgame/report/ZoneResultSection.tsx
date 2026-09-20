// src/components/postgame/report/ZoneResultSection.tsx
//
// Pro §16 Zone clash result — each hitter's season damage zone (yellow) with where the starter's pitches
// to him actually went (shading), and the result: Fired / Contained / Avoided. Rules in lib/postgame/zoneresult.ts.

import { getPostData } from '@/lib/postgame/data'
import { getZoneClash, MIN_PITCHES, type ClashRow, type ClashSide, type ZoneVerdict } from '@/lib/postgame/zoneresult'
import { ZONE_LABELS } from '@/lib/hot-zones'
import ClubHeader from '@/components/scout/ClubHeader'
import Tabs from '@/components/scout/Tabs'
import ZoneGrid from './ZoneGrid'
import { Empty, Foot, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

const V: Record<ZoneVerdict, string> = { Fired: 'bg-orange-500 text-white border-orange-600', Contained: 'bg-stone-100 text-stone-600 border-stone-200', Avoided: 'bg-white text-stone-400 border-stone-300 border-dashed' }

function Row({ r, color }: { r: ClashRow; color: string }) {
  return (
    <tr className="border-b border-stone-100 last:border-0 align-middle">
      <td className="py-1.5 pr-2 font-mono text-[10px] text-stone-400 w-5">{r.slot}</td>
      <td className="font-sans font-semibold text-stone-900 whitespace-nowrap pr-3">{r.name}</td>
      <td className="pr-3"><ZoneGrid counts={r.tonight} highlight={r.zone} color={color} size={58} label={`${r.name}: damage zone ${r.zone} and tonight's pitches`} /></td>
      <td className="font-sans text-[11.5px] text-stone-700 pr-3">Zone {r.zone}, {ZONE_LABELS[String(r.zone)] ?? ''}<span className="block font-mono text-[9.5px] text-stone-400">xwOBA {r.xwoba.toFixed(3).replace(/^0/, '')} · {r.sample} season pitches</span></td>
      <td className="font-mono text-[11px] text-stone-700 pr-3">{r.seen} pitch{r.seen === 1 ? '' : 'es'} there{r.seen > 0 && <span className="block text-[9.5px] text-stone-500">{r.swings} swing{r.swings === 1 ? '' : 's'}, {r.whiffs} miss{r.whiffs === 1 ? '' : 'es'}</span>}</td>
      <td className="font-sans text-[11px] text-stone-600 pr-3">{r.contact.length ? r.contact.map((c, i) => <span key={i} className="block">{c.result}{c.ev != null ? ` · ${c.ev.toFixed(0)} mph` : ''}</span>) : <span className="text-stone-300">—</span>}</td>
      <td className="text-right"><span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 border ${V[r.verdict]}`}>{r.verdict}</span></td>
    </tr>
  )
}

function Panel({ s, ctx }: { s: ClashSide; ctx: PostgameContext }) {
  const bat = s.side === 'away' ? 'home' : 'away'
  const fired = s.rows.filter((r) => r.verdict === 'Fired').length
  return (
    <div className="space-y-2">
      <ClubHeader club={{ ...ctx[bat], probableId: null, probableName: null }} side={bat} />
      <p className="text-[11.5px] font-mono text-stone-600">Against {s.starter}: <b className="text-stone-900">{fired}</b> of {s.rows.length} hitters&apos; damage zones fired</p>
      {s.rows.length === 0 ? <Empty>No hitter with a usable zone map faced the starter.</Empty> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><tbody>{s.rows.map((r) => <Row key={r.id} r={r} color={SIDE_COLOR[s.side]} />)}</tbody></table></div>
      )}
      {s.thin.length > 0 && <p className="text-[10.5px] font-sans italic text-stone-400">No usable zone map (sample too small): {s.thin.join(', ')}.</p>}
    </div>
  )
}

export default async function ZoneResultSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const sides = data ? await getZoneClash(data, ctx.gameDate) : []
  if (sides.length === 0) return <Empty>The starters couldn&apos;t be identified, so there is no zone comparison.</Empty>
  return (
    <div className="space-y-3">
      <Tabs tabs={sides.map((s) => { const bat = s.side === 'away' ? 'home' : 'away'; return { id: bat, label: `${ctx[bat].abbr} hitters`, content: <Panel s={s} ctx={ctx} /> } })} />
      <Foot>Damage zone = the strike-zone cell (1–9) with the highest season xwOBA for that hitter, from cells with {MIN_PITCHES}+ pitches. Grid shading = the starter&apos;s pitches to him tonight; yellow = his damage zone. Fired: a hit, or a ball hit 95+ mph, off a pitch in that zone. Contained: pitches went there but did no damage. Avoided: none did. Only the opposing starter&apos;s pitches count.</Foot>
    </div>
  )
}
