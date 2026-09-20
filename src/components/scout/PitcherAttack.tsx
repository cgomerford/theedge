'use client'

// src/components/scout/PitcherAttack.tsx
//
// §9 Pitcher attack deep — both starters side by side, driven by one shared control
// bar (hitter hand + count). Per starter:
//   Count × pitch matrix — share of his pitches by type in every count; click a count
//                          row to select it
//   Count spot map       — the selected count on the 13-zone board: the most-used zone
//                          for each pitch, over a background of where he throws overall
//   What's next          — the pitch that follows each pitch inside a plate appearance
//   Hand split           — pitch mix against left- vs right-handed hitters
// Cells under MIN_ROW pitches are faded. Movement / stuff stay in Pitching Lab.

import { useState } from 'react'
import Link from 'next/link'
import { TiltBoard, CHASE_ALIGN } from '@/components/pitching-lab/ZoneGrid'
import { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import { COUNTS, type PitcherAttackData, type SplitKey } from '@/lib/scout/pitcher-attack'

export type AttackMeta = { clubName: string; abbr: string; logo: string; pitcherName: string; pitcherId: number | null }

const MIN_ROW = 25
const MIN_NEXT = 25
const HANDS: { key: SplitKey; label: string }[] = [
  { key: 'all', label: 'All hitters' }, { key: 'vs_lhb', label: 'vs lefties' }, { key: 'vs_rhb', label: 'vs righties' },
]
const ZONE_WORDS: Record<string, string> = {
  '1': 'high in', '2': 'high mid', '3': 'high away', '4': 'mid in', '5': 'middle', '6': 'mid away', '7': 'low in', '8': 'low mid', '9': 'low away',
  '11': 'up & in (off)', '12': 'up & away (off)', '13': 'down & in (off)', '14': 'down & away (off)',
}

function Header({ meta }: { meta: AttackMeta }) {
  return (
    <div className="flex items-center gap-2.5 pb-2.5 mb-3 border-b border-stone-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={meta.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight truncate">{meta.pitcherName}</p>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{meta.abbr} probable starter</p>
      </div>
      {meta.pitcherId && <Link href={`/mlb/pitching-lab/${meta.pitcherId}/overlay`} className="ml-auto text-[9px] font-mono uppercase tracking-widest text-orange-600 hover:text-orange-700 shrink-0">Pitching Lab →</Link>}
    </div>
  )
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-1.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold">{children}</p>
      {hint && <p className="text-[9px] font-mono text-stone-300">{hint}</p>}
    </div>
  )
}

function Column({ data, meta, hand, count, setCount }: { data: PitcherAttackData | null; meta: AttackMeta; hand: SplitKey; count: string; setCount: (c: string) => void }) {
  const [prev, setPrev] = useState<string | null>(null)
  const [spot, setSpot] = useState<string | null>(null)
  if (!data) return <div><Header meta={meta} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">{meta.pitcherName === 'TBD' ? 'No probable starter is listed yet.' : `No pitch-by-pitch profile is available for ${meta.pitcherName} yet.`}</p></div>

  const sp = data.splits[hand] ?? data.splits.all
  if (!sp) return <div><Header meta={meta} /><p className="text-[12px] font-sans italic text-stone-400 py-6">No data for this hitter hand.</p></div>
  const cols = data.order.filter((pt) => Object.values(sp.counts).some((c) => c.pitches.some((p) => p.pt === pt && p.pct >= 1))).slice(0, 8)
  const bucket = sp.counts[count]
  const countPitches = (bucket?.pitches ?? []).filter((p) => p.pct >= 3)
  const spotPt = spot && countPitches.some((p) => p.pt === spot) ? spot : (countPitches[0]?.pt ?? null)
  const topInCount = spotPt ? (countPitches.find((p) => p.pt === spotPt)?.zone ? { zone: countPitches.find((p) => p.pt === spotPt)!.zone as string } : null) : null
  const maxShare = Math.max(1, ...Object.values(spotPt ? sp.pitchZones[spotPt] ?? {} : {}))
  const prevPt = prev && sp.seq[prev] ? prev : (data.order.find((pt) => sp.seq[pt]) ?? null)
  const nextRow = prevPt ? sp.seq[prevPt] : null
  const L = data.splits.vs_lhb, R = data.splits.vs_rhb

  return (
    <div className="space-y-5">
      <Header meta={meta} />

      <section>
        <Label hint={`${sp.total.toLocaleString()} pitches · ${HANDS.find((h) => h.key === hand)?.label}`}>Count × pitch — share of his pitches</Label>
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px] border-separate border-spacing-[2px]">
            <thead>
              <tr className="text-[9px] font-mono uppercase text-stone-400">
                <th className="text-left font-semibold pr-1">Count</th>
                {cols.map((pt) => <th key={pt} className="font-semibold" title={data.pitchNames[pt]}>{pt}</th>)}
                <th className="font-semibold text-right pl-1">n</th>
              </tr>
            </thead>
            <tbody>
              {COUNTS.map((c) => {
                const row = sp.counts[c]; const thin = !row || row.total < MIN_ROW
                return (
                  <tr key={c} className={thin ? 'opacity-40' : ''}>
                    <td className="pr-1"><button type="button" onClick={() => setCount(c)} aria-pressed={count === c}
                      className={`w-full text-left font-mono px-1.5 py-0.5 rounded ${count === c ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>{c}</button></td>
                    {cols.map((pt) => {
                      const cell = row?.pitches.find((p) => p.pt === pt)
                      const pctv = cell?.pct ?? 0
                      const a = 0.05 + (Math.min(pctv, 70) / 70) * 0.85
                      return (
                        <td key={pt} title={cell ? `${data.pitchNames[pt]}: ${pctv}% of ${row.total} pitches` : ''} className="text-center font-mono rounded"
                          style={{ background: pctv > 0 ? `rgba(42,120,214,${a.toFixed(2)})` : '#f5f5f4', color: a > 0.5 ? '#fff' : '#44403c' }}>{pctv >= 2 ? Math.round(pctv) : ''}</td>
                      )
                    })}
                    <td className="text-right font-mono text-stone-400 pl-1">{row?.total ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {bucket && bucket.total > 0 && (
          <p className={`text-[11.5px] font-sans text-stone-700 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 mt-2 leading-snug ${bucket.total < MIN_ROW ? 'opacity-60' : ''}`}>
            When the count is <span className="font-mono font-bold">{count}</span>, {data.name} has thrown{' '}
            {countPitches.length > 0 ? countPitches.slice(0, 4).map((p, i) => <span key={p.pt}>{i > 0 ? ', ' : ''}<span className="font-semibold">{data.pitchNames[p.pt] ?? p.pt}</span> {Math.round(p.pct)}%</span>) : 'no single pitch more than 3% of the time'}
            {' '}<span className="font-mono text-[10px] text-stone-400">({bucket.total} pitches{bucket.total < MIN_ROW ? ' — too few to read' : ''})</span>.
          </p>
        )}
        <p className="text-[9.5px] font-mono text-stone-300 mt-1">Count = balls-strikes <em>before</em> the pitch is thrown, so the 3-0 row is only pitches thrown with the count already 3-0. Each row adds to 100%. Click a count to map it below. Rows under {MIN_ROW} pitches are faded. {cols.map((pt) => `${pt} = ${data.pitchNames[pt]}`).join(' · ')}</p>
      </section>

      <section>
        <Label hint={bucket ? `${count} count · ${bucket.total} pitches` : count}>Count spot map — where the pitch goes</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {(bucket?.pitches ?? []).filter((p) => p.pct >= 3).map((p) => (
            <button key={p.pt} type="button" aria-pressed={spotPt === p.pt} onClick={() => setSpot(p.pt)} title={`${data.pitchNames[p.pt]} — ${p.pct}% of his ${count} pitches`}
              className={`text-[10px] font-mono px-2 py-1 rounded-md border ${spotPt === p.pt ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}>{p.pt} <span className="opacity-60">{Math.round(p.pct)}%</span></button>
          ))}
          {(!bucket || bucket.pitches.filter((p) => p.pct >= 3).length === 0) && <span className="text-[11px] font-sans italic text-stone-400">No pitches recorded in this count.</span>}
        </div>
        <TiltBoard size={46} renderZone={(zone, isChase) => {
          const share = spotPt ? (sp.pitchZones[spotPt]?.[zone] ?? 0) : 0
          const isTop = !!topInCount && topInCount.zone === zone
          return (
            <div title={`${ZONE_WORDS[zone] ?? zone}: ${share.toFixed(1)}% of his ${spotPt ? data.pitchNames[spotPt] : 'pitches'}${isTop ? ` · the zone it goes to most in the ${count} count` : ''}`}
              className={`w-full h-full rounded-md flex flex-col leading-none ${isChase ? `p-1.5 ${CHASE_ALIGN[zone]}` : 'items-center justify-center'}`}
              style={{ background: `rgba(235,104,52,${(0.05 + (share / maxShare) * 0.7).toFixed(2)})`, border: isTop ? '2.5px solid #292524' : '1px solid #e7e5e4' }}>
              <span className="text-[10px] font-mono font-bold" style={{ color: share / maxShare > 0.55 ? '#fff' : '#57534e' }}>{share >= 3 ? `${Math.round(share)}%` : ''}</span>
              {isTop && <span className="text-[7px] font-mono uppercase text-stone-700 mt-0.5">{count}</span>}
            </div>
          )
        }} />
        <p className="text-[9.5px] font-mono text-stone-300 mt-1 text-center">Shading = where {spotPt ? data.pitchNames[spotPt] : 'the pitch'} lands over the season (% of that pitch). Dark outline = its most-used zone in the {count} count. The four outer corners are off the plate.</p>
      </section>

      <section>
        <Label hint={nextRow ? `${nextRow.total} pitches followed` : undefined}>What&apos;s next — the pitch after…</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {data.order.filter((pt) => sp.seq[pt]).map((pt) => (
            <button key={pt} type="button" aria-pressed={prevPt === pt} onClick={() => setPrev(pt)} title={data.pitchNames[pt]}
              className={`text-[10px] font-mono px-2 py-1 rounded-md border ${prevPt === pt ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}>{pt}</button>
          ))}
        </div>
        {nextRow ? (
          <ul className={`space-y-1 ${nextRow.total < MIN_NEXT ? 'opacity-40' : ''}`}>
            {nextRow.next.slice(0, 5).map((n) => (
              <li key={n.pt} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-[11px] font-sans text-stone-700">
                <span className="truncate">{data.pitchNames[n.pt] ?? n.pt}</span>
                <span className="h-2 rounded-[3px] bg-stone-100 overflow-hidden"><span className="block h-full rounded-[3px]" style={{ width: `${Math.max(2, n.pct)}%`, background: CHART_BLUE }} /></span>
                <span className="font-mono text-[10px] text-stone-500 text-right">{Math.round(n.pct)}% · {n.n}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[11.5px] font-sans italic text-stone-400">No sequencing data yet.</p>}
        {nextRow && nextRow.total < MIN_NEXT && <p className="text-[9.5px] font-mono text-amber-700 mt-1">Only {nextRow.total} pitches followed this one — too few to read.</p>}
      </section>

      {L && R && (
        <section>
          <Label>Mix by hitter hand</Label>
          <ul className="space-y-1.5">
            {data.order.filter((pt) => (L.mix[pt] ?? 0) >= 2 || (R.mix[pt] ?? 0) >= 2).slice(0, 8).map((pt) => (
              <li key={pt}>
                <div className="flex items-baseline justify-between text-[11px] font-sans text-stone-700"><span>{data.pitchNames[pt] ?? pt}</span><span className="font-mono text-[10px] text-stone-500">L {Math.round(L.mix[pt] ?? 0)}% · R {Math.round(R.mix[pt] ?? 0)}%</span></div>
                <div className="space-y-[2px] mt-0.5">
                  <div className="h-1.5 rounded-[2px] bg-stone-100 overflow-hidden"><div className="h-full" style={{ width: `${Math.max(1, L.mix[pt] ?? 0)}%`, background: CHART_BLUE }} /></div>
                  <div className="h-1.5 rounded-[2px] bg-stone-100 overflow-hidden"><div className="h-full" style={{ width: `${Math.max(1, R.mix[pt] ?? 0)}%`, background: CHART_ORANGE }} /></div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[9.5px] font-mono text-stone-500 flex gap-4 mt-1"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_BLUE }} />vs left-handed hitters ({L.total})</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_ORANGE }} />vs right-handed ({R.total})</span></p>
        </section>
      )}
    </div>
  )
}

export default function PitcherAttack({ data, meta }: { data: (PitcherAttackData | null)[]; meta: AttackMeta[] }) {
  const [hand, setHand] = useState<SplitKey>('all')
  const [count, setCount] = useState('0-0')
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label="Hitter hand">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mr-1">Hitters</span>
          {HANDS.map((h) => (
            <button key={h.key} type="button" aria-pressed={hand === h.key} onClick={() => setHand(h.key)}
              className={`text-[10.5px] font-mono px-2 py-1 rounded-md border ${hand === h.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}>{h.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-stone-500">Count
          <select value={count} onChange={(e) => setCount(e.target.value)} className="text-[11px] font-sans normal-case text-stone-700 border border-stone-200 rounded-md px-1.5 py-1 bg-white">
            {COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <p className="text-[10px] font-sans text-stone-400">One control set drives both starters, so you can compare them on the same hand and count.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
        <Column data={data[0]} meta={meta[0]} hand={hand} count={count} setCount={setCount} />
        <div className="lg:pl-6"><Column data={data[1]} meta={meta[1]} hand={hand} count={count} setCount={setCount} /></div>
      </div>
    </div>
  )
}
