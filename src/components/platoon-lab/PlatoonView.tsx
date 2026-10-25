'use client'

// src/components/platoon-lab/PlatoonView.tsx
//
// The Platoon Lab's panels, shared by the mockup (/dev/platoon-mockup, demo rows) and the live pages (the Batting Lab Platoon tab and /mlb/lab/platoon). Is a hitter's split against
// left-handed vs right-handed pitching real, or sample size? Process metrics (bat speed, chase, contact point) settle in a few dozen swings; outcome splits (wOBA) take 1,000+ PA. The
// panels put both side by side: every readout shows its value and its n; a side below a metric's minimum sample shows "Not enough data yet (n = X of Y needed)". No quality tiers.
//
// Light only: the site's cream page, white cards and #e7e2d8 hairlines (orange = vs LHP, yellow = vs RHP). There is no dark theme.
// One font only (Red Hat): the console feel comes from uppercase labels, letter-spacing and tabular numbers. Animations: all about 500 ms, none looping, none after first load except the
// morph when the hitter or side changes; prefers-reduced-motion turns them all off. Descriptions only. Inline styles plus one scoped <style> block with plain @media.
// Props are plain data (the PlatoonHitter rows); nothing here fetches.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SANS } from '@/components/team/ui'
import { CONTACT_CSS, SprayGrid } from '@/components/contact-lab/ContactTab'
import type { ContactRow } from '@/lib/contact-profile/model'
import {
  CP, DEF, METRICS, WOBA_STEADY_FROM, WOBA_STEADY_TO, belowMinimum, cpOf, fmtVal, paOf, platoonCall, sprayOf, statOf,
  type Hand, type MetricDef, type MetricKey, type PlatoonHitter, type PlatoonRow,
} from '@/lib/platoon/model'

const fmt = (n: number) => n.toLocaleString('en-US')
/** Smallest multiple of `step` that holds every value's absolute size. */
const niceMax = (vals: number[], step: number) => Math.max(step, Math.ceil(Math.max(...vals.map(v => Math.abs(v))) * 1.04 / step - 1e-9) * step)
/** Evenly spaced ticks from -max to +max, at most about `per` on each side of zero. */
const ticksFor = (max: number, step: number, per: number) => { const k = Math.max(1, Math.ceil(max / step / (per * 2))) * step, out: number[] = [0]; for (let v = k; v <= max + 1e-9; v += k) out.push(v, -v); return out.sort((a, b) => a - b) }
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const BOOT_MS = 900   // the first-load stagger window: after it, bars and markers just morph, with no delay

export type Bucket = 'should' | 'everyday' | 'notworth'
export type LeagueDot = { batterId: number; name: string; paL: number; wobaGap: number; batGap: number | null; chaseGap: number | null; bucket?: Bucket; note?: string }

/** The scoped root: carries the reduced-motion switch for every panel inside it. */
export function PlatoonShell({ reduce, embedded, children }: { reduce: boolean; embedded?: boolean; children: React.ReactNode }) {
  return (
    <div className={`pl${embedded ? ' embedded' : ''}`} data-reduce={reduce ? 'y' : 'n'} style={{ fontFamily: SANS }}>
      <style>{CSS}</style>
      <style>{CONTACT_CSS}</style>
      {children}
    </div>
  )
}
export function useReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

/** Panels 01 to 05 for one hitter and one batting side (a switch hitter's sides are never mixed). */
export function PlatoonPanels({ hitter, side, reduce, asOf, hot, setHot }: {
  hitter: PlatoonHitter; side: Hand; reduce: boolean; asOf: { label: string; value: string }; hot: MetricKey | null; setHot: (k: MetricKey | null) => void
}) {
  const lastGameDay = asOf.value
  const rows = hitter.bySide[side]
  const verdict = useMemo(() => platoonCall(rows, hitter.league[side]), [rows, hitter, side])
  const [cview, setCview] = useState<'both' | Hand>('both')
  const [grown, setGrown] = useState(false)               // flips true one frame after mount, so the bars grow out from the centre line
  const [boot, setBoot] = useState(true)
  const [tick, setTick] = useState(0)                     // status-strip tick-up, 0 to 1, once
  useEffect(() => {
    if (reduce) { setGrown(true); setBoot(false); setTick(1); return }
    const raf = requestAnimationFrame(() => setGrown(true))
    const t = setTimeout(() => setBoot(false), BOOT_MS)
    const t0 = performance.now()
    let id = 0
    const step = (now: number) => { const p = clamp((now - t0) / 500, 0, 1); setTick(p); if (p < 1) id = requestAnimationFrame(step) }
    id = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); clearTimeout(t); cancelAnimationFrame(id) }
  }, [reduce])
  const delay = (i: number, extra = 0) => (boot && !reduce ? `${i * 40 + extra}ms` : '0ms')
  const paL = statOf(rows, 'woba', 'L').n, paR = statOf(rows, 'woba', 'R').n
  const era = hitter.coordEra === '2026' ? '2026 · ABS COORDINATES' : `${hitter.coordEra} · PRE-ABS COORDINATES`

  return (
    <>
      <div className="pl-strip" role="status">
        <span><i className="pl-dot" />LIVE</span>
        <span>{asOf.label} <b>{asOf.value}</b></span>
        <span>{hitter.name.toUpperCase()} · BATS <b>{hitter.bats}</b>{hitter.bats === 'S' ? <> · SHOWING <b>BATTING {side === 'L' ? 'LEFT' : 'RIGHT'}</b></> : null}</span>
        <span>PA VS L <b className="pl-orange">{fmt(Math.round(paL * tick))}</b></span>
        <span>PA VS R <b className="pl-yellow">{fmt(Math.round(paR * tick))}</b></span>
        <span>DATA ERA <b>{era}</b></span>
      </div>
      <main className="pl-grid">
        <Panel code="PNL-01" title="PLATOON VERDICT" wide>
          <div className="pl-verdict">
            <span className={`pl-vbadge ${verdict.call}`}>{verdict.badge}</span>
            <p className="pl-vsent">{verdict.sentence}</p>
          </div>
          <div className="pl-chips">
            {METRICS.filter(m => m.group === 'process').map(m => {
              const st = verdict.moved.includes(m.key) ? 'moved' : verdict.matched.includes(m.key) ? 'matched' : 'na'
              return <span key={m.key} className={`pl-chip ${st}`} onMouseEnter={() => setHot(m.key)} onMouseLeave={() => setHot(null)}>{m.label.replace(/ \(.*\)/, '')}: {st === 'moved' ? 'differs' : st === 'matched' ? 'matches' : 'not enough data'}</span>
            })}
          </div>
          <Foot>How the call is made: his weaker side is the pitcher hand he has the lower wOBA against. Platoon: Yes needs (1) a wOBA gap of .040 or more against that hand, (2) at least two of the four swing-quality measures (bat speed, squared-up rate, zone-contact rate, chase rate) differing by more than their practical gap and worse against that hand, outnumbering any that are better there, and (3) a wOBA against that hand below the league’s for batters on his side. Anything else is Platoon: No, including a real split that still leaves him at or above league average against his weaker side. A call needs 100 PA against each hand and the minimum sample on at least three swing measures, or it reads Not enough data yet. Practical gaps: bat speed 1 mph, swing tilt 3°, contact depth 2 in, attack direction 3°, chase 5 pts, zone contact 4 pts, squared-up 4 pts, Pull AIR% 5 pts. These thresholds are working values. Outcome splits usually take {fmt(WOBA_STEADY_FROM)} to {fmt(WOBA_STEADY_TO)} PA to settle (The Book). Updated {lastGameDay}.</Foot>
        </Panel>

        <Panel code="PNL-02" title="PROCESS SPLITS · RESULT SPLITS" wide hero>
          <div className="pl-bfhead"><span className="pl-orange">◄ VS LHP</span><span className="pl-mute">FAST-SETTLING PROCESS FIRST · SLOW OUTCOMES LAST</span><span className="pl-yellow">VS RHP ►</span></div>
          <div className="pl-bf">
            {METRICS.map((def, i) => (
              <div key={def.key} className={`pl-bfrow${hot === def.key ? ' hot' : ''}${def.group === 'outcome' && METRICS[i - 1]?.group === 'process' ? ' sep' : ''}`} onMouseEnter={() => setHot(def.key)} onMouseLeave={() => setHot(null)}>
                <Side def={def} hand="L" rows={rows} grown={grown} idx={i} delay={delay} />
                <div className="pl-bfmid"><b>{def.label}</b><small>{def.unit && def.kind === 'mean' ? def.unit : def.kind === 'rate' ? '% of ' + def.nUnit : 'per PA'}</small></div>
                <Side def={def} hand="R" rows={rows} grown={grown} idx={i} delay={delay} />
              </div>
            ))}
          </div>
          <div className="pl-legend"><span><i className="solid" />Bar length = the size of the readout against that row’s own scale</span><span><i className="gate" />Dashed box = below that metric’s minimum sample</span></div>
          <Foot>Each side shows its readout and its sample (n); bars grow from the centre line and the sign is in the readout. A side below its minimum shows no bar. Bat speed is location-matched: each side’s swings are reweighted to the league’s pitch-location mix over a 5 × 5 grid of the zone (direct standardization), full swings (60+ mph) only. Chase and zone contact use the {hitter.coordEra === '2026' ? '2026 ABS-era' : hitter.coordEra} zone and are never pooled across eras. {hitter.season} regular season. Updated {lastGameDay}.</Foot>
        </Panel>

        <Panel code="PNL-03" title="SAMPLE LADDER">
          <p className="pl-cap">How much data each readout has, against its minimum and the sample at which a read is usually steady. Bat speed gets there in a few dozen swings; wOBA takes years.</p>
          <div className="pl-ladder">
            {METRICS.map(def => <LadderRow key={def.key} def={def} rows={rows} hot={hot} setHot={setHot} grown={grown} delay={delay} />)}
          </div>
          <Foot>Each track runs from 0 to a little past that metric’s steady sample. The grey tick is the minimum shown; the green tick is where a read is usually steady. Orange = vs LHP, yellow = vs RHP; the number is the side’s own n. wOBA’s green tick follows the top of The Book’s range ({fmt(WOBA_STEADY_FROM)} to {fmt(WOBA_STEADY_TO)} PA); the other steady points are working values until split-half reliability is computed on 2024–2026 pitch data.</Foot>
        </Panel>

        <Panel code="PNL-04" title="CONTACT-POINT MAP">
          <div className="pl-row"><div className="pl-seg" role="group" aria-label="Contact-point side">
            {(['both', 'L', 'R'] as const).map(v => <button key={v} type="button" aria-pressed={cview === v} className={cview === v ? 'on' : ''} onClick={() => setCview(v)}>{v === 'both' ? 'Both' : v === 'L' ? 'Vs LHP' : 'Vs RHP'}</button>)}
          </div></div>
          <ContactMap rows={rows} view={cview} hot={hot} />
          <Foot>Where the bat met the ball (Savant’s intercept point: x = across, y = depth, in inches) against each side. The soft shading is the share of his full swings (60+ mph) that met the ball in each 4-inch cell, blurred for readability; each side is scaled to its own busiest cell, so the n matters. The cross is the side’s mean. Orange = vs LHP, yellow = vs RHP. Updated {lastGameDay}.</Foot>
        </Panel>

        <Panel code="PNL-05" title="SPRAY SPLIT" wide hl={hot === 'pull_air'}>
          <div className="pl-spray">
            {(['L', 'R'] as const).map(hand => <SprayPanel key={hand} rows={rows} league={hitter.league[side]} hand={hand} />)}
          </div>
          <Foot>Share of all batted balls in each spot, with the gap to MLB (the same side batting, same pitcher hand); orange tint = above MLB. Pull is always his pull side (mirrored for left-handed batting). Air = fly balls, line drives and popups. Needs {DEF.pull_air.gate} batted balls on a side. n shown per side. Updated {lastGameDay}.</Foot>
        </Panel>
      </main>
    </>
  )
}

export function Panel({ code, title, children, wide, hero, hl }: { code: string; title: string; children: React.ReactNode; wide?: boolean; hero?: boolean; hl?: boolean }) {
  return (
    <section className={`pl-panel${wide ? ' wide' : ''}${hero ? ' hero' : ''}${hl ? ' hl' : ''}`}>
      <div className="pl-corner">{code} · {title}</div>
      {children}
    </section>
  )
}
export const Foot = ({ children }: { children: React.ReactNode }) => <p className="pl-fn">{children}</p>

/** One half of a butterfly row: a bar that grows outward from the centre line, its readout and its n. Below the metric's minimum: no bar, just what is missing. */
function Side({ def, hand, rows, grown, idx, delay }: { def: MetricDef; hand: Hand; rows: PlatoonRow[]; grown: boolean; idx: number; delay: (i: number, extra?: number) => string }) {
  const st = statOf(rows, def.key, hand)
  const len = st.mean == null ? 0 : clamp(Math.abs(st.mean) / def.scaleMax, 0, 1)
  return (
    <div className={`pl-side ${hand}`}>
      {belowMinimum(def, st.n) ? (
        <div className="pl-gate">Not enough data yet (n = {fmt(st.n)} of {fmt(def.gate)} needed)</div>
      ) : (
        <>
          <div className="pl-track"><i className={`pl-bar ${hand}`} style={{ width: grown ? `${len * 100}%` : '0%', transitionDelay: delay(idx) }} /></div>
          <div className="pl-readout"><b>{fmtVal(def, st.mean)}</b><span>n = {fmt(st.n)}</span></div>
        </>
      )}
    </div>
  )
}

function LadderRow({ def, rows, hot, setHot, grown, delay }: { def: MetricDef; rows: PlatoonRow[]; hot: MetricKey | null; setHot: (k: MetricKey | null) => void; grown: boolean; delay: (i: number, extra?: number) => string }) {
  const dmax = def.steady * 1.3, pos = (n: number) => `${clamp(n / dmax, 0, 1) * 100}%`
  const nL = statOf(rows, def.key, 'L').n, nR = statOf(rows, def.key, 'R').n
  const i = METRICS.indexOf(def)
  return (
    <div className={`pl-lrow${hot === def.key ? ' hot' : ''}`} onMouseEnter={() => setHot(def.key)} onMouseLeave={() => setHot(null)}>
      <div className="pl-llab"><b>{def.label.replace(/ \(.*\)/, '')}</b><small>{def.nUnit}</small></div>
      <div className="pl-ltrack">
        <i className="pl-tick" style={{ left: pos(def.gate) }} title={`minimum shown: ${def.gate}`} />
        <i className="pl-tick steady" style={{ left: pos(def.steady) }} title={`usually steady by: ${def.steady}`} />
        <i className="pl-mk L" style={{ left: grown ? pos(nL) : '0%', transitionDelay: delay(i, 80) }} title={`vs LHP n = ${nL}`} />
        <i className="pl-mk R" style={{ left: grown ? pos(nR) : '0%', transitionDelay: delay(i, 80) }} title={`vs RHP n = ${nR}`} />
      </div>
      <div className="pl-lnum"><span className="pl-orange">{fmt(nL)}</span> / <span className="pl-yellow">{fmt(nR)}</span> <small>min {fmt(def.gate)} · steady {fmt(def.steady)}</small></div>
    </div>
  )
}

function ContactMap({ rows, view, hot }: { rows: PlatoonRow[]; view: 'both' | Hand; hot: MetricKey | null }) {
  const W = 380, H = 300, pl = 40, pr = 12, pt = 12, pb = 34
  const xr: [number, number] = [CP.x0, CP.x0 + CP.nx * CP.step], yr: [number, number] = [CP.y0, CP.y0 + CP.ny * CP.step]
  const X = (v: number) => pl + ((v - xr[0]) / (xr[1] - xr[0])) * (W - pl - pr), Y = (v: number) => pt + ((v - yr[0]) / (yr[1] - yr[0])) * (H - pt - pb)
  const grid = { L: cpOf(rows, 'L'), R: cpOf(rows, 'R') }
  const side = (hand: Hand) => ({ x: statOf(rows, 'contact_x', hand), y: statOf(rows, 'contact_depth', hand) })
  const hl = hot === 'contact_depth' || hot === 'attack_direction'
  const op = (hand: Hand) => (view === 'both' || view === hand ? 1 : 0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Contact-point heatmap against left-handed and right-handed pitchers" className={hl ? 'pl-hl' : ''}>
      <defs><filter id="pl-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7" /></filter><clipPath id="pl-clip"><rect x={pl} y={pt} width={W - pl - pr} height={H - pt - pb} /></clipPath></defs>
      <rect x={pl} y={pt} width={W - pl - pr} height={H - pt - pb} className="pl-gridbg" />
      {[30, 40, 50].map(v => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={pt} y2={H - pb} className="pl-gl" /><text x={X(v)} y={H - pb + 14} textAnchor="middle" className="pl-ax">{v}</text></g>)}
      {[20, 30, 40, 50, 60].map(v => <g key={`y${v}`}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} className="pl-gl" /><text x={pl - 6} y={Y(v) + 3} textAnchor="end" className="pl-ax">{v}</text></g>)}
      {(['L', 'R'] as const).map(hand => {
        const g = grid[hand], s = side(hand)
        const ok = g != null && !belowMinimum(DEF.contact_depth, s.y.n)
        if (!ok) return view === 'both' || view === hand ? <text key={hand} x={pl + 8} y={pt + (hand === 'L' ? 16 : 32)} className={`pl-meanlbl ${hand}`}>vs {hand === 'L' ? 'LHP' : 'RHP'}: not enough data yet (n = {fmt(s.y.n)} of {DEF.contact_depth.gate})</text> : null
        // each side is scaled to its own busiest cell, so the shape is comparable even when one side has far fewer swings (the n is printed beside the mean)
        const top = Math.max(...g.cells.flat())
        return (
          <g key={hand} style={{ opacity: op(hand), transition: 'opacity .45s' }}>
            <g clipPath="url(#pl-clip)"><g filter="url(#pl-soft)" style={{ mixBlendMode: 'multiply' }}>
              {g.cells.flatMap((row, by) => row.map((c, bx) => c > 0 ? (
                <rect key={`${by}-${bx}`} x={X(CP.x0 + bx * CP.step)} y={Y(CP.y0 + by * CP.step)} width={X(CP.x0 + CP.step) - X(CP.x0) + 0.5} height={Y(CP.y0 + CP.step) - Y(CP.y0) + 0.5} className={`pl-heat ${hand}`} style={{ opacity: 0.9 * Math.pow(c / top, 0.8) }}>
                  <title>{`vs ${hand === 'L' ? 'LHP' : 'RHP'}: ${c} of ${g.total} swings in this 4-inch cell`}</title>
                </rect>) : null))}
            </g></g>
            {s.x.mean != null && s.y.mean != null && (() => { const cx = X(s.x.mean as number), cy = Y(s.y.mean as number); return (
              <g><line x1={cx - 9} x2={cx + 9} y1={cy} y2={cy} className={`pl-mean ${hand}`} /><line x1={cx} x2={cx} y1={cy - 9} y2={cy + 9} className={`pl-mean ${hand}`} />
                <text x={cx + 12} y={hand === 'L' ? cy - 9 : cy + 17} className={`pl-meanlbl ${hand}`}>vs {hand === 'L' ? 'LHP' : 'RHP'} · n {fmt(s.y.n)}</text></g>) })()}
          </g>
        )
      })}
      <text x={(pl + W - pr) / 2} y={H - 2} textAnchor="middle" className="pl-ax">intercept x (in)</text>
      <text transform={`translate(11 ${(pt + H - pb) / 2}) rotate(-90)`} textAnchor="middle" className="pl-ax">intercept y (in)</text>
    </svg>
  )
}

function SprayPanel({ rows, league, hand }: { rows: PlatoonRow[]; league: PlatoonRow[]; hand: Hand }) {
  const s = sprayOf(rows, hand), l = sprayOf(league, hand)
  const need = DEF.pull_air.gate
  const base = { batter_id: 0, season: 2026, period: 'season' as const, month: 0, name: null, team: null, weak: 0, topped: 0, under: 0, flare_burner: 0, solid: 0, barrel: 0 }
  const row = (c: ReturnType<typeof sprayOf>): ContactRow => ({ ...base, n_bbe: c.n, gb: c.gb.reduce((a, b) => a + b, 0), air: c.air.reduce((a, b) => a + b, 0), pull_gb: c.gb[0], straight_gb: c.gb[1], oppo_gb: c.gb[2], pull_air: c.air[0], straight_air: c.air[1], oppo_air: c.air[2] })
  return (
    <div className="pl-spraycol">
      <div className={`pl-spraytitle ${hand}`}>VS {hand === 'L' ? 'LHP' : 'RHP'} <small>n = {fmt(s.n)} batted balls</small></div>
      {s.n < need ? <div className="pl-gate" style={{ margin: '8px 0' }}>Not enough data yet (n = {fmt(s.n)} of {need} needed)</div> : <SprayGrid cur={row(s)} lge={l.n ? row(l) : null} />}
    </div>
  )
}

const BUCKETS: { key: Bucket; title: string; short: string; blurb: string }[] = [
  { key: 'should', title: 'Should be platooned, isn’t', short: 'Should be platooned', blurb: 'The call is Platoon: Yes, and he still faces his weaker hand about as often as hitters on his side usually do.' },
  { key: 'everyday', title: 'Platooned, but hits that hand fine', short: 'Platooned, hits it fine', blurb: 'He faces one hand far less than usual (under 60% of the normal share), yet across 2024–2026 his wOBA against it is within .040 of his wOBA against the other hand (100+ PA).' },
  { key: 'notworth', title: 'Split is real, not worth a platoon', short: 'Not worth platooning', blurb: 'The results and the swing both split, but even against his weaker hand his wOBA is at or above the league’s.' },
]

/** Panel 06. Each dot is a hitter: x = a swing gap (bat speed or chase, never combined), y = the wOBA gap (vs LHP minus vs RHP). The axes size themselves to the data. */
export function LeagueView({ sets, mine, linkBase }: {
  sets: { single: LeagueDot[]; pooled: LeagueDot[] }   // the season on its own, and 2024–2026 pooled (bat speed only: chase is zone-based and never pooled across eras)
  mine?: { name: string; batGap: number | null; chaseGap: number | null; wobaGap: number | null; paL: number } | null
  linkBase?: string   // when set, a dot links to `${linkBase}/${batterId}/platoon`
}) {
  const [filter, setFilter] = useState<'bat' | 'chase'>('bat')
  const [pooled, setPooled] = useState(false)
  const [pick, setPick] = useState<Bucket | null>(null)
  const eff = pooled ? 'bat' : filter
  const dots = (pooled ? sets.pooled : sets.single).filter(d => (eff === 'bat' ? d.batGap : d.chaseGap) != null)
  const W = 760, H = 400, pl = 54, pr = 16, pt = 14, pb = 44
  const practical = eff === 'bat' ? DEF.bat_speed.practical : DEF.chase.practical, wthr = DEF.woba.practical
  // The axes size themselves to the data: the largest gap on either side (plus the highlighted hitter), rounded up to a tidy step, so no dot is ever clipped to the edge.
  const myX = mine ? (eff === 'bat' ? mine.batGap : mine.chaseGap) : null
  const xStep = eff === 'bat' ? 1 : 0.05, yStep = 0.05
  const xmax = niceMax([...dots.map(d => (eff === 'bat' ? d.batGap : d.chaseGap) as number), myX ?? 0, practical], xStep)
  const ymax = niceMax([...dots.map(d => d.wobaGap), mine?.wobaGap ?? 0, wthr], yStep)
  const xs = ticksFor(xmax, xStep, 2), ys = ticksFor(ymax, yStep, 2)
  const X = (v: number) => pl + ((v + xmax) / (2 * xmax)) * (W - pl - pr), Y = (v: number) => pt + ((ymax - v) / (2 * ymax)) * (H - pt - pb)
  const lists = BUCKETS.map(b => ({ ...b, rows: sets.single.filter(d => d.bucket === b.key).sort((a, c) => Math.abs(c.wobaGap) - Math.abs(a.wobaGap)) }))
  const haveLists = !pooled && lists.some(l => l.rows.length > 0)
  const title = eff === 'bat' ? 'wOBA gap vs bat speed gap, LHP vs RHP' : 'wOBA gap vs chase-rate gap, LHP vs RHP'
  return (
    <div>
      <h3 className="pl-ctitle">{title}</h3>
      <p className="pl-csub">One dot per hitter. Each gap is his number against left-handed pitching minus his number against right-handed pitching.</p>
      <div className="pl-row">
        <div className="pl-seg" role="group" aria-label="Swing measure">
          <button type="button" aria-pressed={eff === 'bat'} className={eff === 'bat' ? 'on' : ''} onClick={() => setFilter('bat')}>Bat speed gap</button>
          <button type="button" aria-pressed={eff === 'chase'} className={eff === 'chase' ? 'on' : ''} disabled={pooled} onClick={() => setFilter('chase')}>Chase gap</button>
        </div>
        <div className="pl-seg" role="group" aria-label="Window">
          <button type="button" aria-pressed={!pooled} className={!pooled ? 'on' : ''} onClick={() => setPooled(false)}>One season</button>
          <button type="button" aria-pressed={pooled} className={pooled ? 'on' : ''} onClick={() => { setPooled(true); setPick(null) }}>2024–2026 pooled</button>
        </div>
        {haveLists && (
          <div className="pl-seg" role="group" aria-label="Highlight a group">
            <button type="button" aria-pressed={pick == null} className={pick == null ? 'on' : ''} onClick={() => setPick(null)}>All hitters</button>
            {lists.map(l => <button key={l.key} type="button" aria-pressed={pick === l.key} className={pick === l.key ? 'on' : ''} onClick={() => setPick(pick === l.key ? null : l.key)}>{l.short} <small>· {l.rows.length}</small></button>)}
          </div>
        )}
        {pooled && <span className="pl-mute" style={{ fontSize: 11 }}>Chase is zone-based and is never pooled across tracking eras, so the pooled window shows bat speed only. The three groups are not shown pooled.</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title}>
        <rect x={pl} y={pt} width={W - pl - pr} height={H - pt - pb} className="pl-gridbg" />
        <rect x={X(-practical)} y={pt} width={X(practical) - X(-practical)} height={H - pt - pb} className="pl-band" />
        {ys.map(v => <g key={v}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} className={v === 0 ? 'pl-zero' : 'pl-gl'} /><text x={pl - 8} y={Y(v) + 3} textAnchor="end" className="pl-ax">{v > 0 ? '+' : ''}{(v * 1000).toFixed(0)}</text></g>)}
        {xs.map(v => <g key={v}><line x1={X(v)} x2={X(v)} y1={pt} y2={H - pb} className={v === 0 ? 'pl-zero' : 'pl-gl'} /><text x={X(v)} y={H - pb + 15} textAnchor="middle" className="pl-ax">{eff === 'bat' ? `${v > 0 ? '+' : ''}${+v.toFixed(1)} mph` : `${v > 0 ? '+' : ''}${Math.round(v * 100)} pts`}</text></g>)}
        <line x1={pl} x2={W - pr} y1={Y(wthr)} y2={Y(wthr)} className="pl-thr" /><line x1={pl} x2={W - pr} y1={Y(-wthr)} y2={Y(-wthr)} className="pl-thr" />
        {dots.map(d => {
          const x = (eff === 'bat' ? d.batGap : d.chaseGap) as number, over = d.paL >= WOBA_STEADY_FROM, r = 2.6 + Math.sqrt(d.paL) / 5.5
          const on = pick != null && d.bucket === pick, dim = pick != null && !on
          const circle = (
            <circle cx={X(x)} cy={Y(d.wobaGap)} r={r} className={`pl-dot2 ${on ? 'pick' : over ? 'solid' : 'hollow'}${dim ? ' dim' : ''}`}><title>{`${d.name}: wOBA gap ${(d.wobaGap * 1000).toFixed(0)} points, ${eff === 'bat' ? `bat speed gap ${x.toFixed(1)} mph` : `chase gap ${(x * 100).toFixed(0)} pts`}, ${d.paL} PA vs LHP`}</title></circle>
          )
          return linkBase && d.batterId ? <Link key={`${d.batterId}`} href={`${linkBase}/${d.batterId}/platoon`}>{circle}</Link> : <g key={d.name}>{circle}</g>
        })}
        {mine && myX != null && mine.wobaGap != null && <g><circle cx={X(myX)} cy={Y(mine.wobaGap)} r={2.6 + Math.sqrt(mine.paL) / 5.5 + 4} className="pl-me" /><text x={X(myX) + 12} y={Y(mine.wobaGap) - 8} className="pl-meanlbl R">{mine.name}</text></g>}
        <text x={(pl + W - pr) / 2} y={H - 3} textAnchor="middle" className="pl-ax">{eff === 'bat' ? 'bat speed gap (mph)' : 'chase-rate gap (points)'}, vs LHP minus vs RHP</text>
        <text transform={`translate(12 ${(pt + H - pb) / 2}) rotate(-90)`} textAnchor="middle" className="pl-ax">wOBA gap (points), vs LHP minus vs RHP</text>
      </svg>
      <div className="pl-legend"><span><i className="solid" />{fmt(WOBA_STEADY_FROM)}+ PA vs LHP</span><span><i className="hollow" />under {fmt(WOBA_STEADY_FROM)} PA vs LHP</span><span>Dot size = PA vs LHP</span><span>Shaded band = swing gap under its practical threshold; dashed lines = wOBA gap of .040</span></div>
      {haveLists && (
        <div className="pl-lists">
          {lists.map(l => (
            <div key={l.key} className={`pl-list${pick === l.key ? ' on' : ''}`}>
              <h4>{l.title} <small>{l.rows.length}</small></h4>
              <p>{l.blurb}</p>
              {l.rows.length === 0 ? <p className="pl-mute">None this season.</p> : (
                <ul>{l.rows.slice(0, 15).map(d => (
                  <li key={d.batterId}>{linkBase ? <Link href={`${linkBase}/${d.batterId}/platoon`}>{d.name}</Link> : <b>{d.name}</b>}<span>{d.note}</span></li>
                ))}</ul>
              )}
              {l.rows.length > 15 && <p className="pl-mute">Showing the 15 largest wOBA gaps of {l.rows.length}.</p>}
            </div>
          ))}
        </div>
      )}
      <Foot>Each dot is a hitter ({fmt(dots.length)} shown; switch hitters are left out because their split is between two batting sides). x = the swing gap (the bat speed filter and the chase filter are separate, never combined into one score); y = the wOBA gap. A dot is hollow while the hitter has under {fmt(WOBA_STEADY_FROM)} PA against left-handers; in a single season almost all are. The three groups combine how often he faces each pitcher hand against the league norm for his batting side (sheltered = under 60% of the usual share, faces it fully = 75% or more; hitters under 150 PA this season are not sorted) with the call on his page (this season) or, for the platooned group, his 2024–2026 wOBA against the hand he is sheltered from. {pooled ? 'Window: 2024–2026 pooled (bat speed only).' : 'Window: one season.'}</Foot>
    </div>
  )
}

export { paOf }

const CSS = `
.pl{--bg:#FAF8F3;--card:#fff;--card2:#f1eee6;--line:#e7e2d8;--ink:#1A1A1A;--mute:#8a8275;--grid:rgba(26,26,26,.06);--L:#FF5722;--R:#E3B800;--good:#1D9E75;--warn:#B58300;
  background:var(--bg);color:var(--ink);min-height:100vh;padding:20px 24px 80px;font-variant-numeric:tabular-nums}
.pl.embedded{min-height:0;padding:18px;border-radius:16px}
.pl *{box-sizing:border-box}
.pl button{font:inherit;color:inherit;cursor:pointer}
.pl button:focus-visible,.pl a:focus-visible{outline:2px solid var(--L);outline-offset:2px}
.pl-head{max-width:1240px;margin:0 auto;display:flex;gap:18px;justify-content:space-between;flex-wrap:wrap;align-items:flex-start}
.pl-crumb{font-size:11px;letter-spacing:.14em;font-weight:700;color:var(--mute)}
.pl-demo{margin-left:10px;color:var(--bg);background:var(--R);border-radius:4px;padding:1px 7px;font-size:10px}
.pl-h1{margin:6px 0 4px;font-weight:800;font-size:clamp(34px,5vw,52px);letter-spacing:-.03em;line-height:1}
.pl-sub{margin:0;color:var(--mute);font-size:15px;max-width:60ch}
.pl-ctl{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.pl-seg{display:inline-flex;gap:4px;flex-wrap:wrap}
.pl-seg button{border:1px solid var(--line);background:transparent;border-radius:999px;padding:6px 13px;font-size:12px;font-weight:700;letter-spacing:.02em}
.pl-seg button small{font-weight:500;opacity:.7}
.pl-seg button.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.pl-seg button:disabled{opacity:.35;cursor:not-allowed}
.pl-strip{max-width:1240px;margin:16px auto 0;display:flex;gap:6px 22px;flex-wrap:wrap;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:9px 14px;font-size:11px;letter-spacing:.1em;color:var(--mute);font-weight:600}
.pl-strip b{color:var(--ink);font-weight:800;margin-left:4px}
.pl-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--good);margin-right:6px}
.pl-orange{color:var(--L)}.pl-yellow{color:var(--R)}.pl-mute{color:var(--mute)}
.pl-grid{max-width:1240px;margin:16px auto 0;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px}
.pl-panel{position:relative;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:34px 18px 16px;min-width:0}
.pl-panel.wide{grid-column:1/-1}.pl-panel.hero{background:var(--card2)}.pl-panel.hl{border-color:var(--ink)}
.pl-corner{position:absolute;top:10px;left:14px;font-size:10px;letter-spacing:.16em;font-weight:700;color:var(--mute)}
.pl-fn{margin:14px 0 0;padding-top:10px;border-top:1px dashed var(--line);font-size:10.5px;line-height:1.55;color:var(--mute)}
.pl-cap{margin:0 0 12px;font-size:13px;color:var(--mute)}
.pl-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
.pl-verdict{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.pl-vbadge{font-size:12px;letter-spacing:.06em;font-weight:800;text-transform:uppercase;border-radius:8px;padding:6px 12px;border:1.5px solid}
.pl-vbadge.yes{color:var(--L);border-color:var(--L)}.pl-vbadge.no{color:var(--good);border-color:var(--good)}
.pl-vbadge.not_enough{color:var(--mute);border-color:var(--line);border-style:dashed}
.pl-vsent{flex:1 1 420px;margin:0;font-size:clamp(16px,1.7vw,20px);line-height:1.4;font-weight:600;letter-spacing:-.005em}
.pl-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.pl-chip{font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;border:1px solid var(--line);color:var(--mute)}
.pl-chip.matched{color:var(--good);border-color:var(--good)}.pl-chip.moved{color:var(--L);border-color:var(--L)}
.pl-bfhead{display:flex;justify-content:space-between;font-size:11px;font-weight:800;letter-spacing:.12em;margin-bottom:8px}
.pl-bf{display:flex;flex-direction:column}
.pl-bfrow{display:grid;grid-template-columns:minmax(0,1fr) 200px minmax(0,1fr);gap:12px;align-items:center;padding:8px 6px;border-radius:8px;border-top:1px solid var(--grid)}
.pl-bfrow.sep{margin-top:10px;border-top:1px dashed var(--line);padding-top:14px}
.pl-bfrow.hot{background:var(--card2);box-shadow:inset 0 0 0 1px var(--ink)}
.pl-bfmid{text-align:center}.pl-bfmid b{display:block;font-size:13px}.pl-bfmid small{display:block;font-size:10px;letter-spacing:.06em;color:var(--mute);text-transform:uppercase}
.pl-side{display:flex;flex-direction:column;gap:4px;min-width:0}
.pl-side.L{align-items:flex-end}.pl-side.R{align-items:flex-start}
.pl-track{width:100%;height:18px;display:flex;background-image:linear-gradient(var(--grid),var(--grid));background-size:100% 1px;background-position:center;background-repeat:no-repeat}
.pl-side.L .pl-track{justify-content:flex-end}
.pl-bar{display:block;height:18px;border-radius:3px;transition:width .5s cubic-bezier(.2,.7,.2,1)}
.pl-bar.L{background:var(--L)}.pl-bar.R{background:var(--R)}
.pl-readout{display:flex;gap:8px;align-items:baseline;font-size:12px;color:var(--mute);flex-wrap:wrap}
.pl-side.L .pl-readout{justify-content:flex-end}
.pl-readout b{color:var(--ink);font-size:14px}
.pl-gate{width:100%;border:1px dashed var(--line);border-radius:8px;padding:8px 10px;font-size:11.5px;color:var(--mute);text-align:center}
.pl-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--mute);margin-top:12px;align-items:center}
.pl-legend i{display:inline-block;width:20px;height:9px;border-radius:2px;margin-right:6px;border:1.5px solid var(--ink)}
.pl-legend i.solid{background:var(--ink)}.pl-legend i.gate{border-style:dashed;border-color:var(--mute)}.pl-legend i.hollow{background:transparent}
.pl-ladder{display:flex;flex-direction:column;gap:4px}
.pl-lrow{display:grid;grid-template-columns:120px minmax(0,1fr) 130px;gap:10px;align-items:center;padding:5px 6px;border-radius:8px}
.pl-lrow.hot{background:var(--card2);box-shadow:inset 0 0 0 1px var(--ink)}
.pl-llab b{display:block;font-size:12px}.pl-llab small{display:block;font-size:9.5px;color:var(--mute);line-height:1.2}
.pl-ltrack{position:relative;height:22px;background:linear-gradient(var(--grid),var(--grid)) center/100% 2px no-repeat}
.pl-tick{position:absolute;top:4px;bottom:4px;width:1px;background:var(--mute)}.pl-tick.steady{background:var(--good);width:2px}
.pl-mk{position:absolute;top:50%;width:11px;height:11px;border-radius:50%;transform:translate(-50%,-50%);transition:left .5s cubic-bezier(.2,.7,.2,1);border:2px solid var(--bg)}
.pl-mk.L{background:var(--L);margin-top:-4px}.pl-mk.R{background:var(--R);margin-top:4px}
.pl-lnum{font-size:11px;font-weight:700;color:var(--mute);text-align:right}.pl-lnum small{display:block;font-weight:500;font-size:9.5px}
.pl-gridbg{fill:var(--card);stroke:var(--line)}
.pl-gl{stroke:var(--grid)}.pl-zero{stroke:var(--line)}.pl-thr{stroke:var(--line);stroke-dasharray:4 4}
.pl-band{fill:var(--grid)}
.pl-ax{font-size:10px;fill:var(--mute);font-family:inherit}
.pl-heat.L{fill:var(--L)}.pl-heat.R{fill:var(--R)}
.pl-mean{stroke-width:2.2}.pl-mean.L{stroke:var(--L)}.pl-mean.R{stroke:var(--R)}
.pl-meanlbl{font-size:10px;font-weight:700;font-family:inherit;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}.pl-meanlbl.L{fill:var(--L)}.pl-meanlbl.R{fill:var(--R)}
.pl-hl .pl-gridbg{stroke:var(--ink)}
.pl-spray{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pl-spraytitle{font-size:12px;font-weight:800;letter-spacing:.1em;margin-bottom:8px}.pl-spraytitle small{font-weight:500;color:var(--mute);letter-spacing:0;margin-left:6px}
.pl-spraytitle.L{color:var(--L)}.pl-spraytitle.R{color:var(--R)}
.pl-dot2{stroke:var(--ink);stroke-width:1.1}
.pl-dot2.solid{fill:var(--ink);fill-opacity:.8}.pl-dot2.hollow{fill:transparent;stroke-opacity:.55}
.pl-me{fill:var(--R);stroke:var(--ink);stroke-width:2.2}
.pl-dot2.pick{fill:var(--L);fill-opacity:.9;stroke:var(--ink)}.pl-dot2.dim{opacity:.22}
.pl-ctitle{margin:0 0 2px;font-size:20px;font-weight:800;letter-spacing:-.01em}.pl-csub{margin:0 0 12px;font-size:13px;color:var(--mute)}
.pl-lists{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}
.pl-list{border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:0}.pl-list.on{border-color:var(--ink);background:var(--card2)}
.pl-list h4{margin:0 0 4px;font-size:14px;font-weight:800}.pl-list h4 small{font-weight:600;color:var(--mute);margin-left:4px}
.pl-list>p{margin:0 0 8px;font-size:11.5px;color:var(--mute);line-height:1.45}
.pl-list ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.pl-list li{font-size:12.5px;line-height:1.35}.pl-list li a,.pl-list li b{font-weight:800;color:var(--ink);text-decoration:none;display:block}.pl-list li a:hover{color:var(--L)}
.pl-list li span{display:block;font-size:11px;color:var(--mute)}
.pl-foot{max-width:1240px;margin:24px auto 0;font-size:11px;color:var(--mute);text-align:center}
.pl[data-reduce="y"] *{transition:none !important}
@media(max-width:900px){
  .pl{padding:16px 14px 60px}.pl.embedded{padding:12px}
  .pl-grid{grid-template-columns:minmax(0,1fr)}.pl-spray{grid-template-columns:minmax(0,1fr)}
  .pl-ctl{align-items:flex-start}
  .pl-bfrow{grid-template-columns:minmax(0,1fr);gap:6px}.pl-side.L,.pl-side.R{align-items:stretch}.pl-side.L .pl-track{justify-content:flex-start}.pl-side.L .pl-readout{justify-content:flex-start}
  .pl-bfmid{order:-1;text-align:left}
  .pl-lrow{grid-template-columns:minmax(0,1fr)}.pl-lnum{text-align:left}
  .pl-lists{grid-template-columns:minmax(0,1fr)}
}
`
