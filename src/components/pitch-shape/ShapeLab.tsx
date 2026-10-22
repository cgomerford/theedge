'use client'

// src/components/pitch-shape/ShapeLab.tsx
//
// Body of the Pitching Lab "Shape" tab (mockups/pitch-shape-lab.html, left page). Six numbered
// sections — [Pitch] over the years · How does it compare · The Pitch Map · Where they're vulnerable · What changed · Method —
// using the shared team-page building blocks. Descriptions of what pitches shaped like his have
// produced, with the sample behind every number; nothing here looks forward.
//
// `isPro` is a REQUIRED prop. The lab route is Pro-gated server-side; the data is only fetched by
// the server page when isPro, and this component renders a locked card (no numbers) otherwise.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { C, SANS, Card, Empty, Foot, Section, Tile } from '@/components/team/ui'
import ProPanel from '@/components/profile/ProPanel'
import {
  PITCH_NAMES, fmtN, indexBins, leagueAverages, lookup, pct, sgn, slotStrip, vulnerableSpots, woba,
  GATE, type ShapeLabData,
} from '@/lib/pitch-shape/model'
import MovementHeat from './MovementHeat'
import PitchView from './PitchView'
import PitchCompare from './PitchCompare'
import { LockedCard, MapLegend, OutcomeBars, SHAPE_CSS, SlotStrip, StatusBadge } from './parts'

export default function ShapeLab({ data, isPro }: { data: ShapeLabData; isPro: boolean }) {
  const [sel, setSel] = useState(data.pitches[0]?.pitchType ?? '')
  const P = data.pitches.find(p => p.pitchType === sel) ?? data.pitches[0]
  const bins = useMemo(() => (P ? data.bins[P.pitchType] ?? [] : []), [data.bins, P])
  const index = useMemo(() => indexBins(bins), [bins])
  const league = useMemo(() => leagueAverages(bins), [bins])

  if (!isPro) {
    return <LockedCard title="Pitch Shape Lab" features={['Where his pitch sits among every pitch of its type with a similar shape', 'What batters have done against pitches shaped like his', 'What changed in his shape this season']} />
  }
  if (!P) return <Empty>No pitch types with enough pitches this season to describe a shape.</Empty>

  const name = PITCH_NAMES[P.pitchType] ?? P.pitchType
  const lc = name.toLowerCase()
  const cur = P.current
  const L = lookup(index, cur)
  const Lprev = P.prev ? lookup(index, P.prev) : null
  const spots = vulnerableSpots(index, cur, P.points)
  const slots = slotStrip(index, cur)
  const diffPts = L.whiff.value != null && P.own.whiff != null ? (P.own.whiff - L.whiff.value) * 100 : null
  const counts = data.counts[P.pitchType] ?? null
  const sides = data.batterSides[P.pitchType] ?? null
  const viewMonths = data.view[P.pitchType] ?? []
  const viewSeasons = Object.keys(data.viewSeasons).map(Number).sort((x, y) => x - y)
    .map(season => ({ season, months: data.viewSeasons[String(season)]?.[P.pitchType] ?? [] })).filter(x => x.months.length > 0)
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthSpan = viewMonths.length ? `${MON3[viewMonths[0].month - 1]}–${MON3[viewMonths[viewMonths.length - 1].month - 1]}` : '—'
  const monthly = (data.monthly[P.pitchType] ?? null)?.filter(m => m.velo != null && m.pitches >= 50) ?? null

  return (
    <div>
      <style>{SHAPE_CSS}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: `1px solid ${C.ink}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>Pitch Shape Lab · {data.hand === 'R' ? 'RHP' : 'LHP'} · {data.teamAbbr}</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(20px,3.4vw,26px)', letterSpacing: '-.01em', margin: '2px 0 0', color: C.ink }}>{data.name} · {name} · {data.season}</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {([
            ['Pitches', fmtN(cur.n)],
            ['Months', monthSpan],
            ['Min. sample', '50 P'],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}><span style={{ display: 'block', fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }}>{k}</span><b style={{ fontSize: 15, fontWeight: 800 }}>{v}</b></div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0 4px' }}>
        <span style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: C.orange, textTransform: 'uppercase', marginRight: 4 }}>Pitch</span>
        {data.pitches.map(p => (
          <button key={p.pitchType} type="button" className={`ps-chip${p.pitchType === P.pitchType ? ' on' : ''}`} onClick={() => setSel(p.pitchType)} style={{ fontFamily: SANS }}>
            {PITCH_NAMES[p.pitchType] ?? p.pitchType}<small style={{ fontSize: 10, opacity: 0.7, marginLeft: 4, fontWeight: 500 }}>n={fmtN(p.current.n)}</small>
          </button>
        ))}
      </div>

      <Section id="story" num="01" title={`${name} over the years`} sub={`Release point and movement for the ${lc}, month by month, next to the results in each month. Switch to By year to see how the pitch has changed from one season to the next.`}>
        <PitchView key={P.pitchType} seasons={viewSeasons} pitchName={name} hand={data.hand} isPro={isPro} />
      </Section>

      <Section id="question" num="02" title={`How does the ${lc} compare vs other ${lc}s?`} sub={`His ${lc} next to the three ${lc}s closest to it in shape, each pitch animated side by side, then what the results say: who gets more swings, whose calls were borderline, and what sets the pitch up.`}>
        <PitchCompare key={P.pitchType} field={data.compare[P.pitchType] ?? []} pitchName={name} hand={data.hand} season={data.season} isPro={isPro} />
        <div className="pv-k" style={{ margin: '22px 0 8px' }}>Against pitches with his exact shape</div>
        <div className="ps-tiles">
          <Tile label="Shape neighborhood whiff%" value={pct(L.whiff.value)} sub={L.whiff.value == null ? 'Not enough swings' : `n = ${fmtN(L.swings)} swings${L.reach === 2 ? ' · widened to ±2 bins' : ''}`} />
          <Tile label={`League avg · ${lc}`} value={pct(league.whiff)} sub="all shapes, same hand" />
          <Tile label="His own whiff%" value={pct(P.own.whiff)} sub={`n = ${fmtN(P.own.swings)} swings, ${data.season}`} />
          <Tile label="His results vs the shape" value={diffPts == null ? '—' : `${sgn(diffPts)} pts`} sub="his whiff% minus the neighborhood's" />
        </div>
        <Foot>Shape = velocity, induced vertical break (IVB), horizontal break (HB, arm-side positive; left-handers flipped) and arm slot. Neighborhood = the same pitch type and hand within ±1 bin of his average shape, {data.leagueSpan}. Source: Baseball Savant pitch-level data.</Foot>
      </Section>

      <Section id="pitch-map" num="03" title="The Pitch Map" sub="Where his pitch is grouped among every pitch of its type with a similar shape, and what batters have done against pitches shaped like it.">
        <Card title="Where this comes from" style={{ marginBottom: 16 }}>
          <p style={{ color: '#3a352c', fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
            <b>A pitch is, first, a shape:</b> speed, movement, release and arm angle. Pitches with the same shape have tended to get similar results, so the fair comparison for his {lc} is every other {lc} shaped like it. That is the same core move behind Statcast’s movement leaderboard (movement judged against pitches at a similar velocity and release point), MLB.com’s pitch-similarity work, FanGraphs’ Stuff+ and SABR research that groups pitches by shape.
          </p>
          <p style={{ color: '#5b5347', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 8px' }}>
            Clubs keep their own pitch models private, so we only cite public work. Shape is not everything: command, deception and sequencing are not in the map. It describes what happened; it does not predict.
          </p>
          <Link href="/mlb/lab/pitch-map" style={{ color: C.orange, fontWeight: 700, fontSize: 13 }}>Read where this comes from, with the sources →</Link>
        </Card>
        <div className="ps-grid2">
          <Card title="Movement map · 0.1 in">
            <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 12px' }}>Every league {lc} by how it moves, in 0.1-inch boxes, coloured by whiffs per swing. His pitches go on top as dots, so you can see where they are grouped and what the league has done from that spot.</p>
            <MovementHeat pitchType={P.pitchType} pitchName={name} hand={data.hand} avg={{ hb: cur.hb, ivb: cur.ivb, sdHb: cur.sdHb, sdIvb: cur.sdIvb }} points={P.points} season={data.season} isPro={isPro} />
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <Card title="Outcome profile">
              <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 12px' }}>Separates “the shape misses bats” from “the shape suppresses damage”. Neighborhood vs league average for {lc}s.</p>
              <OutcomeBars look={L} league={league} />
              <Foot>Black tick = league average for this pitch type. Each row has its own sample gate.</Foot>
            </Card>
            <Card title="Slot context">
              <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 12px' }}>The same shape from other arm angles. Ride reads differently from a 30° slot than a 60° slot.</p>
              <SlotStrip reads={slots} />
            </Card>
          </div>
        </div>
        <ProPanel
          title="Expand: this shape by count"
          blurb="Whiff% for the same shape when ahead, even and behind."
          features={['Whiff% for the same shape when ahead, even and behind', 'Sample behind every split']}
          isPro={isPro}
        >
          {counts ? (
            <>
              <table className="ps-tbl"><thead><tr><th>Count state</th><th className="r">Whiff% per swing</th><th className="r">Swings</th></tr></thead>
                <tbody>{counts.map(c => <tr key={c.label}><td>{c.label}</td><td className="r"><b>{pct(c.whiff)}</b></td><td className="r">{fmtN(c.swings)}</td></tr>)}</tbody></table>
              <Foot>Uses balls / strikes from the pitch rows. Same gates apply; a split under {GATE.swings} swings shows —.</Foot>
            </>
          ) : <Empty>Count splits aren’t built for this pitch yet.</Empty>}
        </ProPanel>
      </Section>

      <Section id="vulnerable" num="04" title="Where they're vulnerable" sub="Shape neighborhoods where he throws this pitch and contact has been hardest (expected wOBA on contact), with the batted-ball sample behind each.">
        <Card>
          {spots.length === 0 ? <Empty>Not enough of his pitches in any one movement cell to break this out.</Empty> : (
            <table className="ps-tbl">
              <thead><tr><th>Neighborhood</th><th>Where (HB / IVB)</th><th className="r">His pitches here</th><th className="r">xwOBA on contact</th><th className="r">Batted balls</th></tr></thead>
              <tbody>{spots.map(r => (
                <tr key={`${r.hb}|${r.ivb}`}>
                  <td><b>{r.label}</b></td>
                  <td>{sgn(r.hb)}&quot; / {sgn(r.ivb)}&quot;</td>
                  <td className="r"><span style={{ display: 'inline-block', height: 8, width: r.share * 100, borderRadius: 2, background: C.orange, verticalAlign: 'middle', marginRight: 6 }} />{Math.round(r.share * 100)}%</td>
                  <td className="r">{r.look.xwobaCon.value == null ? <span style={{ background: C.soft, color: C.mute, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', borderRadius: 6, padding: '3px 7px', textTransform: 'uppercase' }}>Not enough sample</span> : <><b>{woba(r.look.xwobaCon.value)}</b> {r.look.xwobaCon.reach === 2 && <StatusBadge reach={2} />}</>}</td>
                  <td className="r">{fmtN(r.look.bbe)}</td>
                </tr>))}
              </tbody>
            </table>
          )}
          <Foot>League xwOBA on contact for {lc}s: {woba(league.xwobaCon)}. A neighborhood needs ≥{GATE.bbe} batted balls ({data.leagueSpan}) before a number is shown; thinner ones are left blank rather than estimated.</Foot>
        </Card>
        <ProPanel title="Expand: by batter side" blurb="Contact quality against left- and right-handed batters." features={['xwOBA on contact vs left- and right-handed batters', 'Batted-ball count behind each side']} isPro={isPro}>
          {sides ? (
            <table className="ps-tbl"><thead><tr><th>Batter</th><th className="r">xwOBA on contact</th><th className="r">Batted balls</th></tr></thead>
              <tbody>{sides.map(s => <tr key={s.label}><td>{s.label}</td><td className="r"><b>{woba(s.xwobaCon)}</b></td><td className="r">{fmtN(s.bbe)}</td></tr>)}</tbody></table>
          ) : <Empty>Batter-side splits aren’t built for this pitch yet.</Empty>}
        </ProPanel>
      </Section>

      <Section id="changed" num="05" title="What changed" sub="His average shape this season against last, and what the matching neighborhood produced each year.">
        {P.prev ? (
          <>
            <div className="ps-shift">
              {([['Velocity (mph)', P.prev.velo, cur.velo, 1], ['Induced vert. (in)', P.prev.ivb, cur.ivb, 1], ['Horiz. break (in)', P.prev.hb, cur.hb, 1], ['Arm angle (°)', P.prev.slot, cur.slot, 0]] as [string, number, number, number][]).map(([k, a, b, d]) => (
                <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, background: '#fff' }}>
                  <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                    <span style={{ color: C.faint, fontSize: 15, fontWeight: 600 }}>{a.toFixed(d)}</span><span>→</span><b style={{ fontSize: 24, fontWeight: 800 }}>{b.toFixed(d)}</b>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{sgn(b - a, d)}</div>
                  <div style={{ fontSize: 11, color: C.mute }}>{data.prevSeason} n={fmtN(P.prev!.n)} · {data.season} n={fmtN(cur.n)}</div>
                </div>
              ))}
            </div>
            <div className="ps-grid2e" style={{ marginTop: 14 }}>
              <Card title="Same neighborhood, two seasons">
                <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 12px' }}>Whiff% of the bin his average shape fell in each year.</p>
                <table className="ps-tbl"><tbody>
                  <tr><td>{data.prevSeason} shape</td><td className="r"><b>{pct(Lprev?.whiff.value ?? null)}</b></td><td className="r">n = {fmtN(Lprev?.swings ?? 0)}</td></tr>
                  <tr><td>{data.season} shape</td><td className="r"><b>{pct(L.whiff.value)}</b></td><td className="r">n = {fmtN(L.swings)}</td></tr>
                </tbody></table>
                <Foot>The dashed line on the movement map in § 02 traces the same shift.</Foot>
              </Card>
              <ProPanel title="Expand: month by month" blurb="Average velocity by month." features={['Monthly average velocity and shape', 'Months under 50 pitches left off']} isPro={isPro}>
                {monthly && monthly.length > 1 ? (
                  <>
                    <div role="img" aria-label={`Monthly average ${lc} velocity`} style={{ height: 120 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthly} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.mute }} tickLine={false} axisLine={false} />
                          <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} hide />
                          <Line type="monotone" dataKey="velo" stroke={C.orange} strokeWidth={2} dot={{ r: 3.5, fill: C.orange, stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <Foot>Monthly average {lc} velocity (mph). Months under 50 pitches are left off.</Foot>
                  </>
                ) : <Empty>Not enough months with 50+ pitches yet.</Empty>}
              </ProPanel>
            </div>
          </>
        ) : <Empty>He didn’t throw this pitch enough in {data.prevSeason} to compare shapes.</Empty>}
      </Section>

      <Section id="method" num="06" title="Method">
        <Card>
          <p style={{ color: '#5b5347', fontSize: 13.5, margin: '6px 0' }}><b style={{ color: C.ink }}>Neighborhood lookup.</b> We take the bin his average shape falls in, plus one bin either side in velocity (1 mph), IVB (2 in) and HB (2 in) — at most 27 bins, same pitch type, hand and arm-slot band (10°). Bins closer to his shape count a little more. Rates come from summed counts, never from averaging rates.</p>
          <div className="ps-gates">
            {[[`${GATE.swings} swings`, 'before we show whiff%'], [`${GATE.pitches} pitches`, 'before we show CSW%'], [`${GATE.bbe} batted balls`, 'before we show xwOBA on contact']].map(([b, s]) => (
              <div key={b} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', background: '#fff' }}><b style={{ fontSize: 20, fontWeight: 800, display: 'block' }}>{b}</b><span style={{ fontSize: 11, color: C.mute }}>{s}</span></div>
            ))}
          </div>
          <p style={{ color: '#5b5347', fontSize: 13.5, margin: '6px 0' }}>If a neighborhood is too thin we widen to ±2 bins and say so. If it is still too thin we show an empty state — no number.</p>
          <p style={{ color: '#5b5347', fontSize: 13.5, margin: '6px 0' }}><b style={{ color: C.ink }}>How closely this description matches what happened.</b> Two public checks, recomputed by the validation job:</p>
          <div className="ps-grid2e" style={{ marginTop: 8 }}>
            <Tile label="Stability across seasons" value={data.validation.stability ? `r = ${data.validation.stability.r.toFixed(2)}` : '—'} sub={data.validation.stability?.detail ?? 'Not computed yet'} />
            <Tile label="Match within a season" value={data.validation.within ? `r = ${data.validation.within.r.toFixed(2)}` : '—'} sub={data.validation.within?.detail ?? 'Not computed yet'} />
          </div>
          <Foot>These describe how closely the shape description lines up with results already recorded; they say nothing about future games.</Foot>
        </Card>
      </Section>
    </div>
  )
}
