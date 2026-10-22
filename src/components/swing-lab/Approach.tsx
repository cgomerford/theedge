'use client'

// src/components/swing-lab/Approach.tsx
//
// Body of the Batting Lab "Approach" tab (the old Decisions tab, renamed). What does he swing at, and when? § 01 The question (Selection and
// Aggression, plus how often he swings at pitches in the zone and outside it, and the count ladder) · § 02 Zone vs chase (swing rate in the
// heart of the zone, the rest of the zone and outside it, against the league on the same pitches) · § 03 What changed (last 30 days vs season) ·
// § 04 Method. NO count or pitch-family split by default: the zone-vs-chase view covers every pitch he saw until a viewer chooses a split.
// Built from the same precomputed rows as the old grid (batter_swing_decisions + the league table), so a rate always has its n.
// Sign-up gate only (the batting-lab layout checks it); there is no Pro data on this tab. Descriptions only. Props are plain data.

import { useMemo, useState } from 'react'
import { C, Card, Empty, Foot, Section } from '@/components/team/ui'
import {
  COUNT_GROUPS, FAMILIES, GATE, HANDS, inZone, aggregate, filterRows, ladderFor, leagueIndex, summarize,
  type Agg, type CountGroup, type Family, type HandFilter, type SwingDecisionRow, type SwingLabData, type LeagueIndex,
} from '@/lib/swing-decisions/model'

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const fmt = (n: number) => n.toLocaleString('en-US')
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return (Number(t) === 0 ? '' : v > 0 ? '+' : '−') + t }
const famLabel = (k: Family) => FAMILIES.find(f => f.key === k)!.label.toLowerCase()

export default function Approach({ data }: { data: SwingLabData | null }) {
  const [count, setCount] = useState<CountGroup | null>(null)
  const [family, setFamily] = useState<Family | null>(null)
  const [hand, setHand] = useState<HandFilter>('all')
  const idx = useMemo(() => (data ? leagueIndex(data.league) : null), [data])

  if (!data || !idx) return <Empty>Approach data isn’t built for this hitter yet. It refreshes weekly from Baseball Savant.</Empty>
  if (data.nSeason < GATE.season) {
    return <Card><div style={{ textAlign: 'center', padding: '26px 10px' }}>
      <div style={{ fontWeight: 800, fontSize: 20 }}>Not enough pitches yet (n = {fmt(data.nSeason)} of {GATE.season} needed)</div>
      <div style={{ color: C.mute, fontSize: 13, marginTop: 4 }}>The approach view appears once a season has {GATE.season} pitches in the {data.season} location era.</div>
    </div></Card>
  }
  const rows = filterRows(data.rows, count, family, hand)
  const M = summarize(rows, idx)
  const groups = zoneGroups(rows, idx)
  const ladder = ladderFor(data.ladder, data.leagueCounts, family, hand)
  const split = count != null || family != null || hand !== 'all'
  const scope = split
    ? [count ? `${COUNT_GROUPS.find(g => g.key === count)!.label.toLowerCase()} counts` : null, family ? famLabel(family) : null, hand !== 'all' ? (hand === 'R' ? 'right-handers' : 'left-handers') : null].filter(Boolean).join(' · ')
    : 'every pitch he saw'

  const tile = (k: string, v: string, s: string) => (
    <div key={k} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.15, marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 12, color: C.mute }}>{s}</div>
    </div>
  )
  const rate = (k: string, a: Pick<Agg, 'n' | 'swing' | 'lg'>, flip: boolean, note: string) => {
    if (a.n < GATE.cell || a.swing == null || a.lg == null) return tile(k, '—', `n = ${a.n} (under ${GATE.cell})`)
    return tile(k, pct(flip ? 1 - a.swing : a.swing), `n = ${fmt(a.n)} · league ${pct(flip ? 1 - a.lg : a.lg)} · ${note}`)
  }
  const zone = groups.zone, chase = groups.chase

  return (
    <div>
      <style>{CSS}</style>

      <Section id="question" num="01" title="The question" sub="Does he swing at the pitches worth swinging at, and take the rest? Then, count by count, how aggressive is he?">
        <div className="ap-tiles">
          {rate('Zone swing rate', zone, false, 'pitches in the zone')}
          {rate('Chase rate', chase, false, 'pitches outside it')}
          {rate('Selection', M.junk, true, 'takes where a swing loses runs')}
          {rate('Aggression', M.hit, false, 'swings where a swing gains runs')}
          {tile('Pitches in view', fmt(M.all.n), `${scope} · season total ${fmt(data.nSeason)}`)}
        </div>
        <Card title="The count ladder" style={{ marginTop: 16 }}>
          <p className="ap-cap">Swing rate in each count (bar) against the league’s on the same pitches (orange tick). {split && (family || hand !== 'all') ? `${[family ? famLabel(family) : null, hand !== 'all' ? (hand === 'R' ? 'right-handers' : 'left-handers') : null].filter(Boolean).join(' · ')}.` : 'All pitches.'} Counts under {GATE.count} pitches are hatched.</p>
          {ladder.map((x, i) => {
            const thin = x.n < GATE.count
            return (
              <div key={`${x.balls}-${x.strikes}`}>
                {i > 0 && x.strikes === 0 && ladder[i - 1].strikes !== 0 && <div className="ap-sep" />}
                <div className="ap-lr">
                  <span className="ap-ll">{x.balls}-{x.strikes}</span>
                  <div className="ap-lt">{thin ? <i className="ap-lb ap-thin" style={{ width: '100%' }} /> : <><i className="ap-lb" style={{ width: `${(x.swing / 0.8) * 100}%` }} /><i className="ap-lk" style={{ left: `${(x.lg / 0.8) * 100}%` }} /></>}</div>
                  <span className="ap-lv">{thin ? <em>n = {x.n}, not estimated</em> : <><b>{pct(x.swing)}</b><em>league {pct(x.lg)} · {sgn(Math.round((x.swing - x.lg) * 100), 0)} pts · n={fmt(x.n)}</em></>}</span>
                </div>
              </div>
            )
          })}
          <Foot>Source: Baseball Savant via pybaseball. Swing rate = swings ÷ pitches seen in that count. A single count needs {GATE.count} pitches to be shown.</Foot>
        </Card>
      </Section>

      <Section id="zone" num="02" title="Zone vs chase" sub={`How often he swings at pitches in the heart of the zone, in the rest of the zone and outside it: ${scope}.`}>
        <Card title="Swing rate by where the pitch was">
          <div className="ap-split">
            <div><div className="ap-lbl">Count</div><Seg items={[{ key: 'all', label: 'All counts' }, ...COUNT_GROUPS]} cur={count ?? 'all'} on={k => setCount(k === 'all' ? null : (k as CountGroup))} /></div>
            <div><div className="ap-lbl">Pitch family</div><Seg items={[{ key: 'all', label: 'All pitches' }, ...FAMILIES]} cur={family ?? 'all'} on={k => setFamily(k === 'all' ? null : (k as Family))} /></div>
            <div><div className="ap-lbl">Pitcher hand</div><Seg items={HANDS} cur={hand} on={k => setHand(k as HandFilter)} /></div>
          </div>
          {zone.n >= GATE.cell && chase.n >= GATE.cell && zone.swing != null && chase.swing != null && zone.lg != null && chase.lg != null ? (
            <p className="ap-sent">He swung at <b>{pct(zone.swing)}</b> of the {fmt(zone.n)} pitches in the zone (league {pct(zone.lg)}) and <b>{pct(chase.swing)}</b> of the {fmt(chase.n)} outside it (league {pct(chase.lg)}).
              {' '}That is {sgn(Math.round((zone.swing - zone.lg) * 100), 0)} points on in-zone pitches and {sgn(Math.round((chase.swing - chase.lg) * 100), 0)} points on pitches outside it, against the league on the same pitches.</p>
          ) : <p className="ap-sent" style={{ color: C.mute }}>Not enough pitches in this split to compare (zone n = {zone.n}, outside n = {chase.n}; {GATE.cell} needed in each).</p>}
          {[['Heart of the zone', 'the middle cell of the 3 × 3', groups.heart], ['Rest of the zone', 'the other eight cells', groups.zoneRest], ['Outside the zone', 'the sixteen cells around it (chase)', chase]].map(([label, def, a]) => {
            const g = a as ReturnType<typeof aggregate>, thin = g.n < GATE.cell || g.swing == null || g.lg == null
            return (
              <div key={label as string} className="ap-zr">
                <div className="ap-zl"><b>{label as string}</b><small>{def as string}</small></div>
                <div className="ap-lt ap-zt">{thin ? <i className="ap-lb ap-thin" style={{ width: '100%' }} /> : <><i className="ap-lb" style={{ width: `${(g.swing as number) * 100}%` }} /><i className="ap-lk" style={{ left: `${(g.lg as number) * 100}%` }} /></>}</div>
                <div className="ap-zv">{thin ? <em>n = {g.n}, not estimated</em> : <><b>{pct(g.swing)}</b><em>league {pct(g.lg)} · {sgn(Math.round(((g.swing as number) - (g.lg as number)) * 100), 0)} pts · n={fmt(g.n)}</em></>}</div>
              </div>
            )
          })}
          <Foot>Source: Baseball Savant via pybaseball. The zone is the rulebook zone: his own height with ball-width padding, drawn in the batter’s frame. Swing rate = swings ÷ pitches seen there. The league rate is the league’s swing rate on the same pitches (same count, pitch family, pitcher hand and spot as each of his), so the gap is not a difference in the pitches he saw. Counts, pitch family and hand are not split unless you choose a split above. A spot needs {GATE.cell} pitches to be shown.</Foot>
        </Card>
      </Section>

      <Section id="changed" num="03" title="What changed" sub="The last 30 days against the season, all counts and pitch families, under the same minimum-pitch gates.">
        <Changed data={data} idx={idx} />
      </Section>

      <Section id="method" num="04" title="Method">
        <Card title="How it’s built">
          <p className="ap-cap" style={{ marginBottom: 0 }}>
            For every count group, pitch family, pitcher hand and spot, the league’s pitches give a swing rate and an average run result for a swing and for a take. A pitch is “hittable” when the league’s swing beats its take in that spot.
            <b> Selection</b> is the share of the other pitches he took; <b>Aggression</b> is the share of hittable pitches he swung at. Zone swing rate and chase rate are plain swing rates inside and outside the zone. His own contact results are in none of them.
            Inspired by Baseball Prospectus’s SEAGER framework; not a replica. Each number is a description of what happened, with its sample, not a forecast.
          </p>
        </Card>
      </Section>
    </div>
  )
}

/** Swing rate groups over the filtered rows: the heart (middle cell), the rest of the zone and outside the zone, each with the league rate on the same pitches. */
function zoneGroups(rows: SwingDecisionRow[], idx: LeagueIndex) {
  const heart = rows.filter(x => x.zone_r === 2 && x.zone_c === 2)
  const zoneRest = rows.filter(x => inZone(x.zone_r, x.zone_c) && !(x.zone_r === 2 && x.zone_c === 2))
  const zone = rows.filter(x => inZone(x.zone_r, x.zone_c))
  const out = rows.filter(x => !inZone(x.zone_r, x.zone_c))
  return { heart: aggregate(heart, idx), zoneRest: aggregate(zoneRest, idx), zone: aggregate(zone, idx), chase: aggregate(out, idx) }
}

function Seg<T extends string>({ items, cur, on }: { items: { key: T; label: string }[]; cur: T; on: (k: T) => void }) {
  return (
    <div className="ap-seg" role="group">
      {items.map(i => <button key={i.key} type="button" aria-pressed={i.key === cur} className={i.key === cur ? 'on' : ''} onClick={() => on(i.key)}>{i.label}</button>)}
    </div>
  )
}

function Changed({ data, idx }: { data: SwingLabData; idx: LeagueIndex }) {
  const nL = data.nL30
  if (nL < GATE.season) {
    return <Card><div style={{ textAlign: 'center', padding: '22px 10px' }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>Not enough pitches in the last 30 days (n = {fmt(nL)} of {GATE.season} needed)</div>
      <div style={{ color: C.mute, fontSize: 13 }}>The comparison appears once the last 30 days reach the same minimum as the season view.</div>
    </div></Card>
  }
  const A = summarize(data.rows, idx), B = summarize(data.l30Rows, idx)
  const za = aggregate(data.rows.filter(x => inZone(x.zone_r, x.zone_c)), idx), zb = aggregate(data.l30Rows.filter(x => inZone(x.zone_r, x.zone_c)), idx)
  const defs = [
    { k: 'Zone swing rate', a: za.swing, b: zb.swing, na: za.n, nb: zb.n, dom: [0.4, 0.9] as [number, number], rate: true },
    { k: 'Chase rate', a: A.out.swing, b: B.out.swing, na: A.out.n, nb: B.out.n, dom: [0.1, 0.5] as [number, number], rate: true },
    { k: 'Selection', a: A.junk.swing == null ? null : 1 - A.junk.swing, b: B.junk.swing == null ? null : 1 - B.junk.swing, na: A.junk.n, nb: B.junk.n, dom: [0.3, 0.9] as [number, number], rate: true },
    { k: 'Aggression', a: A.hit.swing, b: B.hit.swing, na: A.hit.n, nb: B.hit.n, dom: [0.3, 0.9] as [number, number], rate: true },
    { k: 'Decision runs', a: A.all.dv, b: B.all.dv, na: A.all.n, nb: B.all.n, dom: [-2, 2] as [number, number], rate: false },
  ]
  return (
    <Card title="Last 30 days vs season">
      <p className="ap-cap">Hollow dot: season. Filled dot: last 30 days. Decision runs are per 100 pitches across every spot.</p>
      {defs.map(m => {
        const low = m.nb < GATE.cell || m.na < GATE.cell || m.a == null || m.b == null
        const sub = `L30 n=${fmt(m.nb)} · season n=${fmt(m.na)}`
        if (low) return <div key={m.k} className="ap-dr"><div className="ap-dl">{m.k}<small>{sub}</small></div><div className="ap-dt" /><div className="ap-dd"><small>Not estimated</small></div></div>
        const p = (v: number) => clamp((v - m.dom[0]) / (m.dom[1] - m.dom[0]), 0, 1) * 100, a = p(m.a!), b = p(m.b!)
        const val = (v: number) => (m.rate ? pct(v) : `${sgn(v)} /100`)
        const delta = m.rate ? `${sgn(Math.round((m.b! - m.a!) * 100), 0)} pts` : `${sgn(m.b! - m.a!)} per 100`
        return (
          <div key={m.k} className="ap-dr"><div className="ap-dl">{m.k}<small>{sub}</small></div>
            <div className="ap-dt"><i className="ap-dline" style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }} /><i className="ap-dot ap-dots" style={{ left: `${a}%` }} /><i className="ap-dot ap-dotn" style={{ left: `${b}%` }} /></div>
            <div className="ap-dd"><b>{val(m.b!)}</b> <small>from {val(m.a!)} · {delta}</small></div></div>
        )
      })}
      <Foot>Source: Baseball Savant via pybaseball. Same method and minimums as the season view. “Last 30 days” ends on the last game day in the data.</Foot>
    </Card>
  )
}

const CSS = `
.ap-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.ap-cap{color:#5b5347;font-size:13px;margin:0 0 12px}
.ap-split{display:flex;gap:22px;flex-wrap:wrap;margin:0 0 14px}
.ap-lbl{font-size:10px;letter-spacing:.14em;font-weight:700;color:${C.orange};text-transform:uppercase;margin-bottom:6px}
.ap-seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.ap-seg button{border:1px solid ${C.line};background:#fff;border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;color:${C.ink}}
.ap-seg button.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.ap-seg button:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}
.ap-sent{margin:0 0 14px;color:${C.ink};font-size:15px;background:#fffdf3;border:1px solid ${C.line};border-radius:12px;padding:12px 14px}
.ap-lr{display:grid;grid-template-columns:44px 1fr 250px;gap:10px;align-items:center;padding:5px 0}
.ap-ll{font-weight:800;font-size:14px}
.ap-lt{position:relative;height:16px;background:${C.soft};border-radius:8px;overflow:hidden}
.ap-lb{position:absolute;left:0;top:0;bottom:0;background:${C.ink};border-radius:8px}
.ap-lb.ap-thin{background:repeating-linear-gradient(135deg,#d9d3c4 0 4px,#efe9dc 4px 5px)}
.ap-lk{position:absolute;top:0;bottom:0;width:3px;background:${C.orange};transform:translateX(-1px)}
.ap-lv{font-size:13px;white-space:nowrap}.ap-lv em,.ap-zv em{font-style:normal;color:${C.mute};font-size:11px;margin-left:4px}
.ap-sep{border-top:1px dashed ${C.line};margin:4px 0}
.ap-zr{display:grid;grid-template-columns:200px 1fr 260px;gap:14px;align-items:center;padding:10px 0;border-top:1px solid ${C.line}}
.ap-zl b{display:block;font-size:14px}.ap-zl small{color:${C.mute};font-size:11px}
.ap-zt{height:20px;border-radius:10px}
.ap-zv{font-size:14px;white-space:nowrap}
.ap-dr{display:grid;grid-template-columns:190px 1fr 210px;gap:14px;align-items:center;padding:10px 0;border-top:1px solid ${C.line}}
.ap-dl{font-weight:700;font-size:13px}.ap-dl small{display:block;font-weight:500;color:${C.mute};font-size:11px}
.ap-dt{position:relative;height:22px}.ap-dt::before{content:"";position:absolute;left:0;right:0;top:10px;height:2px;background:${C.soft}}
.ap-dline{position:absolute;top:9px;height:4px;background:${C.ink};opacity:.35;border-radius:2px}
.ap-dot{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;transform:translateX(-8px);border:2.5px solid ${C.ink}}
.ap-dots{background:#fff}.ap-dotn{background:${C.ink}}
.ap-dd{font-size:13px;white-space:nowrap}.ap-dd small{color:${C.mute};font-size:11px}
@media(max-width:900px){
  .ap-tiles{grid-template-columns:1fr 1fr}
  .ap-lr{grid-template-columns:40px 1fr}.ap-lr .ap-lv{grid-column:1/-1;padding-left:50px;white-space:normal}
  .ap-zr,.ap-dr{grid-template-columns:1fr;gap:6px}.ap-zv{white-space:normal}
}
`
