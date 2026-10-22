'use client'

// src/components/contact-lab/ContactTab.tsx
//
// Body of the Batting Lab "Contact" tab (mockups/contact-engine.html). How hard, and where, a hitter hits the ball:
// summary tiles · § 01 Contact quality (bucket bar against the league) · § 02 Where it goes (spray fan + spray-by-type table) ·
// § 03 What changed (any contact metric by season or by month, against the league). COUNTS in, rates out: every rate
// shows the batted-ball count behind it, every group has a reliability badge, every chart a source/method footnote.
// Sign-up gate only — the batting-lab layout checks it; there is no Pro data on this tab. Descriptions only.

import { useMemo, useState } from 'react'
import { C, Card, Empty, Foot, Section } from '@/components/team/ui'
import {
  BUCKETS, METRICS, MIN_LEADERBOARD, MIN_MONTH_POINT, MIN_SHOWN, MODERATE_BBE, STABLE_BBE, TIER_LABEL, monthLabel, numerator, rate, tierOf,
  type ContactLeaders, type ContactProfile, type ContactRow, type MetricKey,
} from '@/lib/contact-profile/model'
import ContactScatter from './ContactScatter'

const pct = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const fmt = (n: number) => n.toLocaleString('en-US')

export default function ContactTab({ data, leaders }: { data: ContactProfile | null; leaders: ContactLeaders | null }) {
  const [metric, setMetric] = useState<MetricKey>('pullAir')
  const [mode, setMode] = useState<'season' | 'month'>('season')

  if (!data) return <Empty>Contact data isn’t built for this hitter yet. It refreshes weekly from Baseball Savant.</Empty>
  const cur = data.seasons[data.seasons.length - 1]
  const lge = data.league.seasons.find(r => r.season === cur.season) ?? null
  if (cur.n_bbe < MIN_SHOWN) {
    return <Card><div style={{ textAlign: 'center', padding: '26px 10px' }}>
      <div style={{ fontWeight: 800, fontSize: 20 }}>Not enough batted balls yet (n = {fmt(cur.n_bbe)} of {MIN_SHOWN} needed)</div>
      <div style={{ color: C.mute, fontSize: 13, marginTop: 4 }}>The contact view appears once a hitter has {MIN_SHOWN} batted balls in the season.</div>
    </div></Card>
  }
  const tile = (k: string, v: string, s: string) => (
    <div key={k} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.15, marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 12, color: C.mute }}>{s}</div>
    </div>
  )
  const mt = (k: MetricKey, label: string) => tile(label, pct(rate(cur, k)), `${fmt(numerator(cur, k))} of ${fmt(cur.n_bbe)} · league ${pct(rate(lge, k))}`)

  return (
    <div>
      <style>{CONTACT_CSS}</style>
      <div className="ct-tiles">
        {tile('Batted balls', fmt(cur.n_bbe), `${cur.season} regular season`)}
        {mt('barrel', 'Barrel%')}
        {mt('solidBarrel', 'Solid + barrel%')}
        {mt('gb', 'Ground-ball%')}
        {mt('pullAir', 'Pull AIR%')}
      </div>

      <Section id="quality" num="01" title="Contact quality" sub="Every batted ball sorted by its exit velocity and launch angle.">
        <Card title="Quality of contact">
          <div className="ct-row"><Badge n={cur.n_bbe} /></div>
          <p className="ct-cap">Share of his {fmt(cur.n_bbe)} batted balls in each bucket, against the league’s. Barrels: {fmt(cur.barrel)} of {fmt(cur.n_bbe)} ({pct(rate(cur, 'barrel'))}), league {pct(rate(lge, 'barrel'))}.</p>
          <QualityBars cur={cur} lge={lge} />
          <Foot>Source: Baseball Savant via pybaseball (launch_speed_angle). Buckets are Statcast’s own, from exit velocity and launch angle: weak, topped, under, flare/burner, solid contact, barrel. Share = batted balls in the bucket ÷ all his batted balls (n = {fmt(cur.n_bbe)}); the league bar is every {cur.season} batted ball{lge ? ` (n = ${fmt(lge.n_bbe)})` : ''}. Only balls with launch_speed_angle, batted-ball type and spray coordinates are counted.</Foot>
        </Card>
      </Section>

      <Section id="spray" num="02" title="Where it goes" sub="Spray direction by ball type. Pull is always his pull side, whichever side he bats.">
        <div className="ct-two">
          <Card title="Spray fan">
            <div className="ct-row"><Badge n={cur.n_bbe} /></div>
            <SprayFan cur={cur} />
            <Foot>Source: Baseball Savant via pybaseball (hc_x, hc_y, bb_type). Inner ring: ground balls (n = {fmt(cur.gb)}). Outer ring: air balls, meaning fly balls, line drives and popups (n = {fmt(cur.air)}). Each wedge shows the share of that ring’s balls and the count. Darker = a larger share. Direction comes from the spray angle: pull is more than 15° toward his pull side, oppo more than 15° the other way, straight in between.</Foot>
          </Card>
          <Card title="Spray by type">
            <div className="ct-row"><Badge n={cur.n_bbe} /></div>
            <p className="ct-cap">Share of each type that went pull, straight and oppo, with the count under it. The orange tick is the league share.</p>
            <SprayTable cur={cur} lge={lge} />
            <Foot>Same source and definitions as the fan. Pull AIR% = pulled air balls ÷ all his batted balls: {fmt(cur.pull_air)} of {fmt(cur.n_bbe)} ({pct(rate(cur, 'pullAir'))}), league {pct(rate(lge, 'pullAir'))}.</Foot>
          </Card>
        </div>
      </Section>

      <Section id="league" num="03" title="Where he sits in the league" sub="Pull AIR% against Barrel% for every hitter with 100+ batted balls, with him highlighted.">
        <Card title="Pull AIR% vs Barrel%">
          {leaders && leaders.rows.length > 0
            ? <ContactScatter rows={leaders.rows} season={leaders.season} selectedId={data.batterId} />
            : <Empty>The league scatter isn’t built yet.</Empty>}
        </Card>
      </Section>

      <Section id="changed" num="04" title="What changed" sub="Any of these rates over time, against the league’s.">
        <Card title="Trend">
          <div className="ct-row">
            <div className="ct-seg" role="group">{METRICS.map(m => <button key={m.key} type="button" aria-pressed={metric === m.key} className={metric === m.key ? 'on' : ''} onClick={() => setMetric(m.key)}>{m.label}</button>)}</div>
            <div className="ct-seg" role="group">
              <button type="button" aria-pressed={mode === 'season'} className={mode === 'season' ? 'on' : ''} onClick={() => setMode('season')}>By season</button>
              <button type="button" aria-pressed={mode === 'month'} className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>{cur.season} by month</button>
            </div>
          </div>
          <Trend data={data} metric={metric} mode={mode} />
        </Card>
      </Section>
    </div>
  )
}

export function Badge({ n }: { n: number }) {
  const t = tierOf(n)
  const dot = t === 'stable' ? C.good : t === 'moderate' ? '#E0A800' : C.faint
  return (
    <span className="ct-badge"><i style={{ background: dot }} />{t ? TIER_LABEL[t] : 'Not shown'} <small>n = {fmt(n)} batted balls</small></span>
  )
}

export function QualityBars({ cur, lge }: { cur: ContactRow; lge: ContactRow | null }) {
  const bar = (r: ContactRow, who: string) => (
    <div className="ct-qrow"><b>{who}</b>
      <div className="ct-qb" role="img" aria-label={`${who}: ${BUCKETS.map(b => `${b.label} ${pct(r[b.key] / r.n_bbe, 0)}`).join(', ')}`}>
        {BUCKETS.map(b => { const w = (r[b.key] / r.n_bbe) * 100; return <div key={b.key} style={{ width: `${w}%`, background: b.bg, color: b.fg }} title={`${b.label}: ${r[b.key]} of ${r.n_bbe}`}>{w >= 6 ? `${Math.round(w)}%` : ''}</div> })}
      </div>
    </div>
  )
  return (
    <div>
      {bar(cur, 'Him')}
      {lge ? bar(lge, 'League') : null}
      <div className="ct-qrow"><b />
        <table className="ct-tbl" style={{ marginTop: 6 }}>
          <thead><tr><th>Bucket</th><th className="r">His count</th><th className="r">His share</th><th className="r">League share</th></tr></thead>
          <tbody>{BUCKETS.map(b => (
            <tr key={b.key}><td><i className="ct-sw" style={{ background: b.bg }} />{b.label}</td><td className="r">{fmt(cur[b.key])}</td><td className="r"><b>{pct(cur[b.key] / cur.n_bbe)}</b></td><td className="r">{lge ? pct(lge[b.key] / lge.n_bbe) : '—'}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function SprayTable({ cur, lge }: { cur: ContactRow; lge: ContactRow | null }) {
  const rows: { label: string; n: number; vals: [number, number, number]; lgv: [number, number, number] | null }[] = [
    { label: 'Ground balls', n: cur.gb, vals: [cur.pull_gb, cur.straight_gb, cur.oppo_gb], lgv: lge && lge.gb ? [lge.pull_gb / lge.gb, lge.straight_gb / lge.gb, lge.oppo_gb / lge.gb] : null },
    { label: 'Air balls', n: cur.air, vals: [cur.pull_air, cur.straight_air, cur.oppo_air], lgv: lge && lge.air ? [lge.pull_air / lge.air, lge.straight_air / lge.air, lge.oppo_air / lge.air] : null },
  ]
  return (
    <div className="ct-tw"><table className="ct-tbl">
      <thead><tr><th>Type</th><th className="r">Pull</th><th className="r">Straight</th><th className="r">Oppo</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.label}>
          <td><b>{r.label}</b><small>n = {fmt(r.n)}</small></td>
          {r.vals.map((v, i) => (
            <td key={i} className="r"><span className="ct-cb"><b>{r.n ? pct(v / r.n, 0) : '—'}</b><small>{fmt(v)}</small>
              <i style={{ width: `${r.n ? (v / r.n) * 100 : 0}%` }} />{r.lgv && <u style={{ left: `${r.lgv[i] * 100}%` }} />}</span></td>
          ))}
        </tr>
      ))}</tbody>
    </table></div>
  )
}

const POLAR = (cx: number, cy: number, r: number, deg: number): [number, number] => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)]
function wedge(cx: number, cy: number, a0: number, a1: number, r0: number, r1: number) {
  const [x0, y0] = POLAR(cx, cy, r1, a0), [x1, y1] = POLAR(cx, cy, r1, a1), [x2, y2] = POLAR(cx, cy, r0, a1), [x3, y3] = POLAR(cx, cy, r0, a0)
  return `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`
}
function SprayFan({ cur }: { cur: ContactRow }) {
  const cx = 190, cy = 232
  const sectors = [{ k: 'pull', a0: -45, a1: -15, label: 'Pull' }, { k: 'straight', a0: -15, a1: 15, label: 'Straight' }, { k: 'oppo', a0: 15, a1: 45, label: 'Oppo' }] as const
  const rings = [
    { r0: 40, r1: 108, n: cur.gb, v: { pull: cur.pull_gb, straight: cur.straight_gb, oppo: cur.oppo_gb } },
    { r0: 114, r1: 196, n: cur.air, v: { pull: cur.pull_air, straight: cur.straight_air, oppo: cur.oppo_air } },
  ]
  return (
    <svg viewBox="0 0 380 250" width="100%" style={{ maxWidth: 520, display: 'block' }} role="img"
      aria-label={`Spray fan. Ground balls: pull ${cur.pull_gb}, straight ${cur.straight_gb}, oppo ${cur.oppo_gb}. Air balls: pull ${cur.pull_air}, straight ${cur.straight_air}, oppo ${cur.oppo_air}.`}>
      {rings.map((ring, ri) => {
        const max = Math.max(1, ...sectors.map(s => (ring.n ? ring.v[s.k] / ring.n : 0)))
        return sectors.map(s => {
          const share = ring.n ? ring.v[s.k] / ring.n : 0, mid = (s.a0 + s.a1) / 2, [tx, ty] = POLAR(cx, cy, (ring.r0 + ring.r1) / 2, mid)
          return (
            <g key={`${ri}-${s.k}`}>
              <path d={wedge(cx, cy, s.a0, s.a1, ring.r0, ring.r1)} fill={`rgba(255,87,34,${0.1 + 0.78 * (share / max)})`} stroke="#fff" strokeWidth={2} />
              <text x={tx} y={ty - 1} textAnchor="middle" fontSize={15} fontWeight={800} fill={C.ink}>{ring.n ? `${Math.round(share * 100)}%` : '—'}</text>
              <text x={tx} y={ty + 13} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#5b5347">{ring.v[s.k]}</text>
            </g>
          )
        })
      })}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={9} fontWeight={800} fill={C.mute} letterSpacing=".08em">GROUND</text>
      <text x={POLAR(cx, cy, 160, -45)[0] - 4} y={cy - 138} textAnchor="end" fontSize={10} fontWeight={800} fill={C.mute}>← PULL SIDE</text>
      <text x={POLAR(cx, cy, 160, 45)[0] + 4} y={cy - 138} textAnchor="start" fontSize={10} fontWeight={800} fill={C.mute}>OPPO SIDE →</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#5b5347">Inner ring ground balls (n = {cur.gb}) · outer ring air balls (n = {cur.air})</text>
    </svg>
  )
}

export type Pt = { x: string; n: number; v: number | null; lge: number | null; solid: boolean }

function Trend({ data, metric, mode }: { data: ContactProfile; metric: MetricKey; mode: 'season' | 'month' }) {
  const def = METRICS.find(m => m.key === metric)!
  const pts: Pt[] = useMemo(() => {
    if (mode === 'season') {
      return data.seasons.map(r => ({ x: String(r.season), n: r.n_bbe, v: rate(r, metric), lge: rate(data.league.seasons.find(l => l.season === r.season), metric), solid: r.n_bbe >= STABLE_BBE }))
    }
    return data.months.filter(r => r.n_bbe >= MIN_MONTH_POINT).map(r => ({
      x: monthLabel(r.month), n: r.n_bbe, v: rate(r, metric), lge: rate(data.league.months.find(l => l.month === r.month), metric), solid: r.n_bbe >= MODERATE_BBE,
    }))
  }, [data, metric, mode])
  if (mode === 'season' && pts.length > 0) return <SeasonBars pts={pts} label={def.label} define={def.define} />
  if (pts.length === 0) return <Empty>{mode === 'month' ? `No month has ${MIN_MONTH_POINT}+ batted balls yet.` : 'No season to show yet.'}</Empty>
  const vals = pts.flatMap(p => [p.v, p.lge]).filter((v): v is number => v != null)
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals), padv = Math.max(0.02, (hi0 - lo0) * 0.35)
  const lo = Math.max(0, Math.floor((lo0 - padv) * 20) / 20), hi = Math.ceil((hi0 + padv) * 20) / 20
  const W = 680, H = 270, L = 48, R = 18, T = 22, B = 44
  const X = (i: number) => L + ((W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)))
  const Y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo))
  const path = (get: (p: Pt) => number | null) => pts.map((p, i) => ({ p, i, v: get(p) })).filter(o => o.v != null).map((o, k) => `${k ? 'L' : 'M'}${X(o.i)},${Y(o.v as number)}`).join(' ')
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += 0.05) ticks.push(Math.round(v * 100) / 100)
  return (
    <div>
      <p className="ct-cap">Black: his {def.label}. Orange dashed: the league’s. Filled dot: {mode === 'season' ? `${STABLE_BBE}+` : `${MODERATE_BBE}+`} batted balls in that {mode === 'season' ? 'season' : 'month'}; hollow dot: fewer, so read it with care.{pts.length === 1 && mode === 'season' ? ' Only one season is built so far; earlier seasons appear after the next full refresh.' : ''}</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 760 }} role="img" aria-label={`${def.label} by ${mode}: ${pts.map(p => `${p.x} ${pct(p.v)} (n = ${p.n})`).join(', ')}`}>
        {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={C.line} /><text x={L - 8} y={Y(v) + 4} fontSize={11} textAnchor="end" fill={C.mute}>{Math.round(v * 100)}%</text></g>)}
        <path d={path(p => p.lge)} fill="none" stroke={C.orange} strokeWidth={2} strokeDasharray="5 4" />
        <path d={path(p => p.v)} fill="none" stroke={C.ink} strokeWidth={2.4} />
        {pts.map((p, i) => p.v == null ? null : (
          <g key={p.x}>
            <circle cx={X(i)} cy={Y(p.v)} r={6} fill={p.solid ? C.ink : '#fff'} stroke={C.ink} strokeWidth={2} />
            <text x={X(i)} y={Y(p.v) - 12} fontSize={12} fontWeight={800} textAnchor="middle">{pct(p.v)}</text>
            <text x={X(i)} y={H - 20} fontSize={11} fontWeight={700} textAnchor="middle" fill="#5b5347">{p.x}</text>
            <text x={X(i)} y={H - 6} fontSize={10} textAnchor="middle" fill={C.mute}>n={p.n}</text>
          </g>
        ))}
      </svg>
      <Foot>Source: Baseball Savant via pybaseball. {def.label} = {def.define}, in the period shown; n under each point is that period’s batted balls. {mode === 'month' ? `Months under ${MIN_MONTH_POINT} batted balls are left out. ` : 'Regular seasons only. '}Spray direction is mirrored for left-handed hitters.</Foot>
    </div>
  )
}

/** The computed note under the season bars, in the mockup's wording: "Stable profile", "Rising" or "Falling" (a move under 3 points is stable),
 *  using only seasons with MIN_LEADERBOARD+ batted balls. */
function seasonNote(pts: Pt[], label: string): { lead: string; text: string } {
  const q = pts.filter(p => p.n >= MIN_LEADERBOARD && p.v != null)
  if (q.length < 2) return { lead: pts.length < 2 ? 'One season so far.' : `One season with ${MIN_LEADERBOARD}+ batted balls.`, text: pts.length < 2 ? 'Earlier seasons appear after the next full refresh.' : 'There is no season-to-season comparison yet.' }
  const a = q[0], b = q[q.length - 1], d = ((b.v as number) - (a.v as number)) * 100
  const lg = b.lge != null ? ` the ${pct(b.lge)} league rate` : ' the league rate'
  if (Math.abs(d) < 3) {
    const vs = q.map(p => p.v as number)
    return { lead: 'Stable profile.', text: `His ${label} has held between ${pct(Math.min(...vs))} and ${pct(Math.max(...vs))} since ${a.x}${b.lge != null ? `, ${(b.v as number) < b.lge ? 'below' : 'above'}${lg}` : ''}.` }
  }
  return { lead: d > 0 ? 'Rising.' : 'Falling.', text: `His ${label} ${d > 0 ? 'rose' : 'fell'} from ${pct(a.v)} in ${a.x} (n = ${a.n}) to ${pct(b.v)} in ${b.x} (n = ${b.n})${b.lge != null ? `, against${lg}` : ''}.` }
}

/** Bars by season. A season under MIN_LEADERBOARD batted balls is hatched and shows only its n, not a rate (a rate on a handful of balls misleads);
 *  the best qualified season is orange; the orange tick is the league's rate that season. */
export function SeasonBars({ pts, label, define }: { pts: Pt[]; label: string; define: string }) {
  const vals = pts.flatMap(p => [p.n >= MIN_LEADERBOARD ? p.v : null, p.lge]).filter((v): v is number => v != null)
  const hi = Math.max(0.1, Math.ceil((Math.max(...vals, 0.05) + 0.02) * 20) / 20)
  const W = 680, H = 270, L = 48, R = 18, T = 22, B = 44, slot = (W - L - R) / pts.length, bw = Math.min(90, slot * 0.64)
  const Y = (v: number) => T + (H - T - B) * (1 - v / hi)
  const ticks: number[] = []
  for (let v = 0; v <= hi + 1e-9; v += 0.05) ticks.push(Math.round(v * 100) / 100)
  const best = Math.max(...pts.filter(p => p.n >= MIN_LEADERBOARD && p.v != null).map(p => p.v as number), -1)
  const note = seasonNote(pts, label)
  return (
    <div>
      <p className="ct-cap">Bars: his {label}, by season. Orange tick: the league’s. A hatched season has under {MIN_LEADERBOARD} batted balls, so no rate is shown for it.</p>
      <p style={{ fontSize: 14, margin: '0 0 8px', color: C.ink }}><b>{note.lead}</b> {note.text}</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 760 }} role="img" aria-label={`${label} by season: ${pts.map(p => (p.n >= MIN_LEADERBOARD ? `${p.x} ${pct(p.v)} (n = ${p.n})` : `${p.x} too few batted balls (n = ${p.n})`)).join(', ')}`}>
        <defs><pattern id="ct-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill={C.soft} /><line x1="0" y1="0" x2="0" y2="7" stroke={C.line} strokeWidth="2" /></pattern></defs>
        {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={C.line} /><text x={L - 8} y={Y(v) + 4} fontSize={11} textAnchor="end" fill={C.mute}>{Math.round(v * 100)}%</text></g>)}
        {pts.map((p, i) => {
          const cx = L + slot * (i + 0.5), thin = p.n < MIN_LEADERBOARD
          return (
            <g key={p.x}>
              {thin
                ? <><rect x={cx - bw / 2} y={Y(hi * 0.6)} width={bw} height={Y(0) - Y(hi * 0.6)} rx={5} fill="url(#ct-hatch)" /><text x={cx} y={Y(hi * 0.3)} textAnchor="middle" fontSize={11} fill={C.mute}>n={p.n}</text></>
                : p.v != null && <><rect x={cx - bw / 2} y={Y(p.v)} width={bw} height={Y(0) - Y(p.v)} rx={5} fill={p.v === best ? C.orange : '#CFC5B3'}><title>{`${p.x}: ${pct(p.v)} (n = ${p.n} batted balls)`}</title></rect><text x={cx} y={Y(p.v) - 6} fontSize={12} fontWeight={p.v === best ? 800 : 500} textAnchor="middle">{pct(p.v)}</text></>}
              {p.lge != null && <line x1={cx - bw / 2 - 8} x2={cx + bw / 2 + 8} y1={Y(p.lge)} y2={Y(p.lge)} stroke={C.ink} strokeWidth={2.4} strokeDasharray="5 3" />}
              <text x={cx} y={H - 20} fontSize={11} fontWeight={700} textAnchor="middle" fill="#5b5347">{p.x}</text>
              {!thin && <text x={cx} y={H - 6} fontSize={10} textAnchor="middle" fill={C.mute}>n={p.n}</text>}
            </g>
          )
        })}
      </svg>
      <Foot>Source: Baseball Savant via pybaseball. {label} = {define}, in each regular season; n is that season’s batted balls. Seasons under {MIN_LEADERBOARD} batted balls are hatched and not shown as a rate. The dashed tick is the league’s rate that season. The note compares the first and last season with {MIN_LEADERBOARD}+ batted balls; a change under 3 points is called stable. Spray direction is mirrored for left-handed hitters.</Foot>
    </div>
  )
}

/** The mockup's spray grid: share of ALL his batted balls in each (ball type × direction) cell, with the gap to the league in points; orange tint = above the league. */
export function SprayGrid({ cur, lge }: { cur: ContactRow; lge: ContactRow | null }) {
  const dirs: [string, 'pull' | 'straight' | 'oppo'][] = [['Pull', 'pull'], ['Straight', 'straight'], ['Oppo', 'oppo']]
  const types: [string, 'gb' | 'air'][] = [['Ground', 'gb'], ['Air', 'air']]
  const cnt = (r: ContactRow, d: 'pull' | 'straight' | 'oppo', t: 'gb' | 'air') => (r as unknown as Record<string, number>)[`${d}_${t}`]
  return (
    <div className="ct-sg" role="table" aria-label="Spray by type, share of all batted balls">
      <div />
      {dirs.map(([l]) => <div key={l} className="h">{l}</div>)}
      {types.map(([tl, t]) => (
        <div key={t} style={{ display: 'contents' }}>
          <div className="rl">{tl}</div>
          {dirs.map(([, d]) => {
            const v = cnt(cur, d, t) / cur.n_bbe, m = lge ? cnt(lge, d, t) / lge.n_bbe : null, diff = m == null ? null : (v - m) * 100
            const a = diff == null ? 0 : Math.min(Math.max(diff / 14, 0), 0.6)
            return (
              <div key={d} className="c" style={{ background: diff != null && diff > 0 ? `rgba(255,87,34,${a.toFixed(2)})` : '#fff', borderColor: d === 'pull' && t === 'air' ? C.ink : C.line, borderWidth: d === 'pull' && t === 'air' ? 2 : 1 }}>
                <b>{pct(v)}</b><small>{diff == null ? '' : `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} vs MLB`}</small><small>{cnt(cur, d, t)} of {cur.n_bbe}</small>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export const CONTACT_CSS = `
.ct-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.ct-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.ct-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
.ct-cap{color:#5b5347;font-size:13px;margin:0 0 12px}
.ct-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;border:1px solid ${C.line};background:#fff}
.ct-badge i{width:8px;height:8px;border-radius:50%;display:inline-block}
.ct-badge small{font-weight:500;color:${C.mute}}
.ct-seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.ct-seg button{border:1px solid ${C.line};background:#fff;border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;color:${C.ink}}
.ct-seg button.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.ct-seg button:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}
.ct-qrow{display:grid;grid-template-columns:64px 1fr;gap:10px;align-items:center;margin-bottom:10px}
.ct-qrow>b{font-size:12px}
.ct-qb{display:flex;height:44px;border-radius:10px;overflow:hidden;border:1px solid ${C.line}}
.ct-qb div{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;min-width:0;overflow:hidden;white-space:nowrap}
.ct-tw{overflow-x:auto;border:1px solid ${C.line};border-radius:10px}
.ct-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.ct-tbl th{background:${C.soft};text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${C.mute};padding:8px 12px;font-weight:700;white-space:nowrap}
.ct-tbl td{padding:8px 12px;border-top:1px solid ${C.line};white-space:nowrap;font-variant-numeric:tabular-nums}
.ct-tbl .r{text-align:right}
.ct-tbl small{color:${C.mute};font-size:11px;margin-left:5px}
.ct-sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:8px;vertical-align:-1px}
.ct-sg{display:grid;grid-template-columns:70px repeat(3,minmax(0,1fr));gap:6px;align-items:stretch}
.ct-sg .h{font-size:11px;font-weight:700;color:${C.mute};text-transform:uppercase;letter-spacing:.08em;text-align:center}
.ct-sg .rl{font-size:12px;font-weight:800;display:flex;align-items:center}
.ct-sg .c{border:1px solid ${C.line};border-radius:10px;padding:8px 6px;text-align:center;display:flex;flex-direction:column;gap:1px;min-width:0}
.ct-sg .c b{font-size:18px;font-weight:800}.ct-sg .c small{font-size:10.5px;color:${C.mute}}
.ct-cb{position:relative;display:inline-block;width:100%;padding-bottom:6px}
.ct-cb i{position:absolute;left:0;bottom:0;height:3px;background:${C.ink};border-radius:2px}
.ct-cb u{position:absolute;bottom:-2px;width:2px;height:8px;background:${C.orange};text-decoration:none}
@media(max-width:900px){.ct-tiles{grid-template-columns:1fr 1fr}.ct-two{grid-template-columns:1fr}.ct-qrow{grid-template-columns:1fr}}
`
