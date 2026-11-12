'use client'

// src/components/pitch-shape/PitcherSubTabs.tsx
//
// The panels of a chosen pitcher's story in the v3 Pitch Shape Lab, each one question with one job:
//   PitchOverview   the results on the pitch that is open (his own against what league pitches with his shape produced, and his full stat line on the pitch), then a summary of his other pitches
//   SeasonMonths    how the pitch moved month by month this season, how far each month deviated from his own season average, and what the results were in those months
//   LevelsPanel     the same pitch at each level he has thrown at (shape only; results are never compared across levels)
//   WhyPanel        why the results are what they are: platoon, speed, extension, arm angle, location and sequencing against league pitches with his shape
// Fantasy facts (rostered share, ERA, xERA, FIP) live only in the Fantasy tab, not here. Descriptions of what already happened; nothing here says why in a causal way beyond naming which measured factors differ.

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/components/team/ui'
import type { BoardRow } from '@/lib/pitch-shape/results'
import { type Level } from '@/lib/milb-shape/levels'
import { pitcherDetail, pitcherMonths, pitcherPitches, pitcherWhy, type DetailBundle, type MonthRow, type MonthsResult, type OtherPitch, type PitchesResult, type WhyActionResult } from '@/app/mlb/lab/pitch-shape/actions'
import PitchStatLine from './PitchStatLine'
import ShapeMap from './ShapeMap'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { pitchColor } from '@/lib/mlb'
import PitcherShapeLevels from './PitcherShapeLevels'
import { WhySection } from './ShapeResultsKit'
import { log } from '@/lib/log'

const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase' }
const sg = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const d3 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const pc = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GOOD = '#13694F', BAD = '#A8391F'

// ---------- This pitch: his results on it against its shape ----------

export function PitchOverview({ row, id, name, type, level, season, pitchName }: { row: BoardRow | null; id: number; name: string; type: string; level: string; season: number; pitchName: string }) {
  const lc = pitchName.toLowerCase()
  type R = { label: string; his: number | null; shape: number | null; fmt: (v: number) => string; diff: (d: number) => string; up: boolean; band: number }
  const own = row ? { w: row.own.whiff ?? row.ownRaw.whiff, saved: row.own.saved ?? row.ownRaw.saved, woba: row.own.woba ?? row.ownRaw.woba, xwoba: row.own.xwoba ?? row.ownRaw.xwoba, avg: row.own.avg ?? row.ownRaw.avg, slg: row.own.slg ?? row.ownRaw.slg } : null
  const shp = row ? { w: row.shape.whiff ?? row.shapeRaw.whiff, saved: row.shape.saved ?? row.shapeRaw.saved, woba: row.shape.woba ?? row.shapeRaw.woba, xwoba: row.shape.xwoba ?? row.shapeRaw.xwoba, avg: row.shape.avg ?? row.shapeRaw.avg, slg: row.shape.slg ?? row.shapeRaw.slg } : null
  const rows: R[] = own && shp ? [
    { label: 'Whiffs per swing', his: own.w, shape: shp.w, fmt: v => `${(v * 100).toFixed(1)}%`, diff: d => `${sg(d * 100, 1)} pts`, up: true, band: 0.03 },
    { label: 'Runs saved per 100 pitches', his: own.saved, shape: shp.saved, fmt: v => sg(v, 2), diff: d => sg(d, 2), up: true, band: 0.4 },
    { label: 'wOBA against', his: own.woba, shape: shp.woba, fmt: v => d3(v), diff: d => sg(d, 3).replace('0.', '.'), up: false, band: 0.03 },
    { label: 'xwOBA against', his: own.xwoba, shape: shp.xwoba, fmt: v => d3(v), diff: d => sg(d, 3).replace('0.', '.'), up: false, band: 0.03 },
    { label: 'Batting average against', his: own.avg, shape: shp.avg, fmt: v => d3(v), diff: d => sg(d, 3).replace('0.', '.'), up: false, band: 0.025 },
    { label: 'Slugging against', his: own.slg, shape: shp.slg, fmt: v => d3(v), diff: d => sg(d, 3).replace('0.', '.'), up: false, band: 0.05 },
  ] : []
  const th: React.CSSProperties = { ...k, textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}` }
  const td: React.CSSProperties = { padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const lvl = level as Level
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="psl-ov" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 28, alignItems: 'start' }}>
        <style>{'@media(max-width:1000px){.psl-ov{grid-template-columns:1fr !important}}'}</style>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>The results on this {lc}</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>{name}’s own {season} results, set against what league {lc}s with his shape produced (all seasons together).</p>
          {rows.length === 0 ? <div style={{ fontSize: 13, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '10px 12px' }}>He is not on the {lc} board (it needs 100+ of the pitch), so his results are not set against his shape here. Nothing is estimated in its place.</div> : (
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 420 }}>
                <thead><tr><th style={{ ...th, textAlign: 'left' }}>Measure</th><th style={th}>His {lc}</th><th style={th}>His shape</th><th style={th}>Difference</th></tr></thead>
                <tbody>{rows.map(r => {
                  const d = r.his != null && r.shape != null ? r.his - r.shape : null
                  const z = d == null ? 0 : ((r.up ? 1 : -1) * d) / r.band
                  const tone = z > 1 ? GOOD : z < -1 ? BAD : null
                  return <tr key={r.label} style={{ borderTop: `1px solid ${C.soft}` }}>
                    <td style={{ padding: '8px' }}>{r.label}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{r.his == null ? '—' : r.fmt(r.his)}</td>
                    <td style={{ ...td, color: '#5b5347' }}>{r.shape == null ? '—' : r.fmt(r.shape)}</td>
                    <td style={{ ...td, fontWeight: 800, color: tone ?? '#5b5347', background: tone === GOOD ? '#E6F3EC' : tone === BAD ? '#FBE9E5' : 'transparent', borderRadius: 4 }}>{d == null ? '—' : `${r.diff(d)}${tone ? '' : ' (about level)'}`}</td>
                  </tr>
                })}</tbody>
              </table>
            </div>
          )}
          {row && <p style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, margin: '6px 0 0' }}>Green is better for the pitcher than his shape produced, red is worse, and “about level” means inside the usual noise. His own measures with under {row.small ? 'the usual minimum' : '300'} pitches are shown but are a small sample. {row.small ? 'His sample on this pitch is small.' : ''}</p>}
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>His {lc}: the full stat line</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>What happened on the plate appearances that ended on this pitch, how hitters swung and the contact that came back.</p>
          <PitchStatLine pitcherId={id} season={season} level={lvl} pitchType={type} pitchName={pitchName} era={null} fip={null} xera={null} ip={null} />
        </div>
      </div>
    </div>
  )
}

// ---------- Over the season: months against his own average ----------

const MIN_MONTH = 50, MIN_SWINGS = 40
const THRESH = { speed: 1, ivb: 1, hb: 1 }   // the same flag sizes the lab's change detection uses: 1 mph, 1 inch of ride, 1 inch of run

export function SeasonMonths({ id, type, lc, name }: { id: number; type: string; lc: string; name: string }) {
  const [res, setRes] = useState<MonthsResult | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setRes(undefined)
    pitcherMonths({ id, type }).then(r => { if (live) setRes(r) }).catch(e => { log.error('SeasonMonths', 'pitcherMonths failed', e instanceof Error ? e.message : String(e)); if (live) setRes(null) })
    return () => { live = false }
  }, [id, type])
  if (res === undefined) return <div style={{ fontSize: 13, color: C.mute }}>Reading his months…</div>
  if (!res || !res.ok) return <div style={{ fontSize: 13, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '10px 12px', lineHeight: 1.5 }}>{res && !res.ok && res.error === 'pro' ? 'The month-by-month read for this pitch type is part of Pro.' : `There is no month-by-month record of his ${lc}s (it covers MLB for the current and previous season). Nothing is estimated in its place.`}</div>
  const latest = res.seasons[res.seasons.length - 1]
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {res.seasons.slice().reverse().map(se => <SeasonBlock key={se.season} season={se.season} months={se.months} lc={lc} name={name} isLatest={se.season === latest.season} />)}
      <p style={{ margin: 0, fontSize: 12, color: '#6b6355', lineHeight: 1.5 }}>Months need {MIN_MONTH}+ pitches to count (thin months are greyed and left out of the averages); whiffs per swing needs {MIN_SWINGS}+ swings. A month is flagged when its speed, ride or run is {THRESH.speed} mph or {THRESH.ivb} in away from his own season average. Other things may have changed too (role, health, usage, opponents): this shows what changed and what happened, not why.</p>
    </div>
  )
}

function SeasonBlock({ season, months, lc, name, isLatest }: { season: number; months: MonthRow[]; lc: string; name: string; isLatest: boolean }) {
  const full = months.filter(m => m.n >= MIN_MONTH)
  const stat = useMemo(() => {
    const n = full.reduce((t, m) => t + m.n, 0)
    if (n === 0) return null
    const w = (f: (m: MonthRow) => number) => full.reduce((t, m) => t + f(m) * m.n, 0) / n
    const sw = full.reduce((t, m) => t + (m.swings ?? 0), 0), wh = full.reduce((t, m) => t + (m.whiffs ?? 0), 0)
    return { n, speed: w(m => m.speed), ivb: w(m => m.ivb), hb: w(m => m.hb), swings: sw, whiff: sw >= MIN_SWINGS ? wh / sw : null }
  }, [full])
  if (!stat) return <div style={{ fontSize: 13, color: '#5b5347' }}>No month of {season} has {MIN_MONTH}+ {lc}s, so there is no month-by-month comparison.</div>
  const dev = (m: MonthRow) => ({ speed: m.speed - stat.speed, ivb: m.ivb - stat.ivb, hb: m.hb - stat.hb })
  const flagged = (m: MonthRow) => { const d = dev(m); return Math.abs(d.speed) >= THRESH.speed || Math.abs(d.ivb) >= THRESH.ivb || Math.abs(d.hb) >= THRESH.hb }
  const biggest = full.slice().sort((a, b) => Math.abs(dev(b).ivb) / THRESH.ivb + Math.abs(dev(b).speed) / THRESH.speed - (Math.abs(dev(a).ivb) / THRESH.ivb + Math.abs(dev(a).speed) / THRESH.speed))[0]
  const mw = (m: MonthRow) => (m.swings != null && m.swings >= MIN_SWINGS && m.whiffs != null ? m.whiffs / m.swings : null)
  const th: React.CSSProperties = { ...k, textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}`, whiteSpace: 'nowrap' }
  return (
    <div>
      <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>{season}{isLatest ? ' so far' : ''}, month by month</h3>
      <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, color: '#3d382f', maxWidth: 900 }}>
        {name}’s {season} {lc} averaged <b>{stat.speed.toFixed(1)} mph</b>, <b>{stat.ivb.toFixed(1)} in</b> of ride and <b>{stat.hb.toFixed(1)} in</b> of run over {stat.n.toLocaleString('en-US')} pitches{stat.whiff != null ? <>, drawing whiffs on <b>{pc(stat.whiff)}</b> of swings</> : ''}.
        {biggest && flagged(biggest) ? <> The month furthest from that average was <b>{MON[biggest.month]}</b>: speed {sg(dev(biggest).speed)} mph, ride {sg(dev(biggest).ivb)} in and run {sg(dev(biggest).hb)} in against his season average ({biggest.n.toLocaleString('en-US')} pitches){mw(biggest) != null && stat.whiff != null ? <>; whiffs per swing that month were <b>{pc(mw(biggest))}</b> against <b>{pc(stat.whiff)}</b> for the season ({(biggest.swings ?? 0).toLocaleString('en-US')} swings)</> : ''}.</> : <> No month moved {THRESH.speed} mph or {THRESH.ivb} in away from that average.</>}
      </p>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 700, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Month</th><th style={th}>Pitches</th><th style={th}>Speed (mph)</th><th style={th}>Ride (in)</th><th style={th}>Run (in)</th><th style={th}>Whiffs per swing</th><th style={th}>vs his season</th></tr></thead>
          <tbody>
            {months.map(m => {
              const thin = m.n < MIN_MONTH, d = dev(m), flag = !thin && flagged(m), w = mw(m)
              const dl = (v: number, thr: number, unit = '') => <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: thin ? C.faint : Math.abs(v) >= thr ? '#2F6DB5' : C.faint }}>{sg(v)}{unit}</span>
              const wd = w != null && stat.whiff != null ? (w - stat.whiff) * 100 : null
              return (
                <tr key={m.month} style={{ borderTop: `1px solid ${C.soft}`, color: thin ? C.faint : C.ink, background: flag ? '#FFF8F3' : 'transparent' }}>
                  <td style={{ padding: '8px', fontWeight: 800 }}>{MON[m.month]}{thin && <span style={{ fontWeight: 600, fontSize: 11, marginLeft: 6 }}>thin</span>}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{m.n.toLocaleString('en-US')}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}><b>{m.speed.toFixed(1)}</b>{dl(d.speed, THRESH.speed)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}><b>{m.ivb.toFixed(1)}</b>{dl(d.ivb, THRESH.ivb)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}><b>{m.hb.toFixed(1)}</b>{dl(d.hb, THRESH.hb)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}><b>{w == null ? '—' : pc(w)}</b>{w != null && wd != null && <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: Math.abs(wd) < 2 ? C.faint : wd > 0 ? GOOD : BAD }}>{sg(wd)} pts</span>}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: flag ? C.orange : C.faint }}>{thin ? '—' : flag ? 'Shape moved' : 'Close to average'}</td>
                </tr>
              )
            })}
            <tr style={{ borderTop: `2px solid ${C.ink}`, fontWeight: 800 }}>
              <td style={{ padding: '8px' }}>Season</td><td style={{ padding: '8px', textAlign: 'right' }}>{stat.n.toLocaleString('en-US')}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{stat.speed.toFixed(1)}</td><td style={{ padding: '8px', textAlign: 'right' }}>{stat.ivb.toFixed(1)}</td><td style={{ padding: '8px', textAlign: 'right' }}>{stat.hb.toFixed(1)}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{pc(stat.whiff)}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Across levels ----------

export function LevelsPanel({ id, type, lc }: { id: number; type: string; lc: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5, maxWidth: 900 }}>Where his {lc} sat at each level he has thrown at this season: the ring is his average at that level and the dots are a sample of his pitches. A change here is the same arm in a different league. Results are never compared across levels because the hitters differ, so only the shape is shown.</p>
      <PitcherShapeLevels pitcherId={id} initialType={type} />
    </div>
  )
}

// ---------- Why the results ----------

export function WhyPanel({ row, id, type, hand, level, lc }: { row: BoardRow | null; id: number; type: string; hand: 'R' | 'L'; level: string; lc: string }) {
  const [why, setWhy] = useState<WhyActionResult | null | undefined>(undefined)
  const [bundle, setBundle] = useState<DetailBundle | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setWhy(undefined); setBundle(undefined)
    pitcherWhy({ id, type, level }).then(r => { if (live) setWhy(r) }).catch(e => { log.error('WhyPanel', 'pitcherWhy failed', e instanceof Error ? e.message : String(e)); if (live) setWhy(null) })
    pitcherDetail({ id, type, hand, level }).then(r => { if (live) setBundle(r.ok ? r.bundle : null) }).catch(() => { if (live) setBundle(null) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, level])
  if (level !== 'mlb') return <div style={{ fontSize: 13.5, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '12px 14px', lineHeight: 1.5 }}>The platoon, location and sequencing breakdown needs a per-pitch log with league comparisons, which only exists for MLB. At this level the Overview tab has his results against his shape.</div>
  if (!row) return <div style={{ fontSize: 13.5, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '12px 14px', lineHeight: 1.5 }}>He is not on the {lc} board (it needs 100+ of the pitch), so there is nothing to explain against his shape. Nothing is estimated in its place.</div>
  const sec: React.CSSProperties = { ...k, color: '#B83A0E', margin: '0 0 6px' }
  const state = why === undefined ? undefined : why && why.ok ? why.why : why && !why.ok && why.error === 'pro' ? ('locked' as const) : null
  return (
    <div style={{ maxWidth: 1100 }}>
      <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, color: '#3d382f' }}>
        {row.gap != null ? (Math.abs(row.gap) < 0.4 ? <>His {lc} results lined up with what his shape produced, so there is little gap to explain.</> : row.gap > 0 ? <>His {lc} results were <b>{row.gap.toFixed(2)} runs per 100 pitches above</b> what league pitches with his shape produced. Below are the measured differences between his pitch and those league pitches.</> : <>His {lc} results were <b>{Math.abs(row.gap).toFixed(2)} runs per 100 pitches below</b> what league pitches with his shape produced. Below are the measured differences between his pitch and those league pitches.</>) : 'There are too few of his own pitches to set his results against his shape.'}
      </p>
      <WhySection sel={row} lc={lc} why={state} bins={bundle ? bundle.bins : undefined} verdictGap={row.gap} diagnosis={bundle ? bundle.diagnosis : undefined} sec={sec} pill={() => ({})} />
    </div>
  )
}

// ---------- Overall: the quick view ----------

type SeasonLine = { era: number | null; xera: number | null; fip: number | null; ip: number | null } | null

/**
 * The first tab of a pitcher's story, a quick view of the whole pitcher: his season line (ERA, xERA, FIP, innings, role), every pitch he throws with how often, how it moves and how it is doing against its shape, and
 * the average shape of every pitch drawn on one movement map. The deeper tabs take one pitch at a time; this one is for knowing the pitcher at a glance.
 */
export function PitcherOverall({ id, name, level, openType, line, role, season }: { id: number; name: string; level: string; openType: string; line: SeasonLine; role: string | null; season: number }) {
  const [res, setRes] = useState<PitchesResult | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setRes(undefined)
    pitcherPitches({ id, level }).then(r => { if (live) setRes(r) }).catch(e => { log.error('PitcherOverall', 'pitcherPitches failed', e instanceof Error ? e.message : String(e)); if (live) setRes(null) })
    return () => { live = false }
  }, [id, level])
  // The map revolves through his pitches one at a time (every 2.6 seconds, paused while the pointer is over it or after a pitch is chosen), so each average shape is picked out in turn.
  const [turn, setTurn] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = res && res.ok ? res.rows.length : 0
  useEffect(() => {
    if (paused || count < 2) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setTurn(v => v + 1), 2600)
    return () => clearInterval(t)
  }, [paused, count])
  const tile: React.CSSProperties = { background: C.soft, borderRadius: 6, padding: '10px 12px' }
  const big: React.CSSProperties = { fontSize: 26, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }
  const th: React.CSSProperties = { ...k, textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const n2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
  const gap = line && line.era != null && line.xera != null ? line.era - line.xera : null
  const ROLE: Record<string, string> = { starter: 'Starter', closer: 'Closer', setup: 'Setup', reliever: 'Reliever' }
  const rows = res && res.ok ? res.rows : []
  const cur = rows.length ? rows[((turn % rows.length) + rows.length) % rows.length] : null
  // the ball turns the way the pitch moves; his spin rate is not loaded on this tab, so every ball turns at the same steady rate and the rate is not a claim
  const ball = (r: OtherPitch, size: number) => <SpinBall code={r.code} size={size} spin={{ rpm: 2400, ivb: r.ivb, hb: r.hb }} />
  const gapChip = (r: OtherPitch) => {
    const g = r.results
    if (!g || g.verdict == null || g.gap == null) return g && g.gapRaw != null ? <span style={{ color: C.mute, fontSize: 12, fontWeight: 700 }} title="Thin sample: the gap is not coloured">{sg(g.gapRaw, 2)} · thin</span> : <span style={{ color: C.faint }}>—</span>
    const t = g.verdict === 'ahead' ? { bg: '#E6F3EC', fg: GOOD } : g.verdict === 'behind' ? { bg: '#FBE9E5', fg: BAD } : { bg: C.soft, fg: '#5b5347' }
    return <span style={{ background: t.bg, color: t.fg, fontWeight: 800, fontSize: 12, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>{g.verdict === 'ahead' ? 'Above' : g.verdict === 'behind' ? 'Below' : 'In line'}{g.verdict === 'level' ? '' : ` ${sg(g.gap, 2)}`}</span>
  }
  const hrefFor = (code: string) => `/mlb/lab/pitch-shape?pitcher=${id}&type=${code}${level !== 'mlb' ? `&level=${level}` : ''}`
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <SpinBallStyles />
      <div className="psl-ovl" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(300px,430px)', gap: 28, alignItems: 'start' }}>
        <style>{'@media(max-width:1000px){.psl-ovl{grid-template-columns:1fr !important}}'}</style>
        <div style={{ minWidth: 0, display: 'grid', gap: 22 }}>
      <div>
        <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>{name}: the season at a glance</h3>
        <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>His {season} season across all his pitches.</p>
        {line ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <div style={tile}><div style={k}>ERA</div><div style={big}>{n2(line.era)}</div></div>
              <div style={tile}><div style={k}>xERA</div><div style={big}>{n2(line.xera)}</div><div style={{ fontSize: 11.5, color: '#5b5347' }}>from contact quality</div></div>
              <div style={tile}><div style={k}>FIP</div><div style={big}>{n2(line.fip)}</div><div style={{ fontSize: 11.5, color: '#5b5347' }}>strikeouts, walks, homers</div></div>
              <div style={tile}><div style={k}>Innings</div><div style={big}>{line.ip == null ? '—' : line.ip.toFixed(1)}</div></div>
              <div style={tile}><div style={k}>Role</div><div style={{ ...big, fontSize: 22 }}>{role ? ROLE[role] : '—'}</div></div>
              <div style={tile}><div style={k}>Pitch types</div><div style={big}>{rows.length || '—'}</div><div style={{ fontSize: 11.5, color: '#5b5347' }}>{rows.length ? `${rows.reduce((t, r) => t + r.n, 0).toLocaleString('en-US')} pitches` : ''}</div></div>
            </div>
            {gap != null && <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: '#3d382f', maxWidth: 900 }}>{Math.abs(gap) < 0.4 ? 'His ERA and xERA are close: his results lined up with the contact quality he allowed.' : gap > 0 ? `His ERA is ${gap.toFixed(2)} runs above his xERA, so his results were worse than the contact quality he allowed would usually give.` : `His ERA is ${Math.abs(gap).toFixed(2)} runs below his xERA, so his results were better than the contact quality he allowed would usually give.`}</p>}
          </>
        ) : rows.length > 0 ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <div style={tile}><div style={k}>Pitches thrown</div><div style={big}>{rows.reduce((t, r) => t + r.n, 0).toLocaleString('en-US')}</div></div>
              <div style={tile}><div style={k}>Pitch types</div><div style={big}>{rows.length}</div></div>
              <div style={tile}><div style={k}>Most thrown</div><div style={{ ...big, fontSize: 22 }}>{rows[0].name}</div><div style={{ fontSize: 11.5, color: '#5b5347' }}>{Math.round(rows[0].usage * 100)}% of his pitches</div></div>
              <div style={tile}><div style={k}>Fastest</div><div style={big}>{Math.max(...rows.map(r => r.velo)).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 700 }}> mph</span></div></div>
              <div style={tile}><div style={k}>Whiffs / swing</div><div style={big}>{rows.reduce((t, r) => t + r.swings, 0) >= 50 ? pc(rows.reduce((t, r) => t + r.whiffs, 0) / rows.reduce((t, r) => t + r.swings, 0)) : '—'}</div><div style={{ fontSize: 11.5, color: '#5b5347' }}>{rows.reduce((t, r) => t + r.swings, 0).toLocaleString('en-US')} swings</div></div>
              <div style={tile}><div style={k}>Role</div><div style={{ ...big, fontSize: 22 }}>{role ? ROLE[role] : '—'}</div></div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: '#5b5347', maxWidth: 900 }}>ERA, xERA and FIP are not shown because season lines are kept for MLB only. These figures are counted from his pitches at this level. Nothing is estimated in their place.</p>
          </>
        ) : <div style={{ fontSize: 13, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '10px 12px' }}>His season line is not available at this level. Nothing is estimated in its place.</div>}
      </div>

          <div>
          <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>Every pitch he throws</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>How often, how it moves and how it is doing against what its shape usually produces. Choose a pitch to open its story.</p>
          {res === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Reading his pitches…</div>
            : !res || !res.ok ? <div style={{ fontSize: 13, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '10px 12px' }}>His pitch mix could not be read for this level and season. Nothing is estimated in its place.</div>
            : (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, overflowX: 'auto' }}>
                <div style={{ padding: '12px 12px 4px' }}>
                  <div role="img" aria-label={`Pitch mix: ${rows.map(r => `${r.name} ${Math.round(r.usage * 100)}%`).join(', ')}`} style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>{rows.map(r => <div key={r.code} style={{ flex: r.usage, background: pitchColor(r.code) }} />)}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 10 }}>{rows.map(r => <span key={r.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14 }}>{ball(r, 26)}<b>{r.name}</b> {Math.round(r.usage * 100)}%</span>)}</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 700 }}>
                  <thead><tr><th style={{ ...th, textAlign: 'left' }}>Pitch</th><th style={th}>Usage</th><th style={th}>Thrown</th><th style={th}>Speed</th><th style={th}>Ride</th><th style={th}>Run</th><th style={th}>Whiffs / swing</th><th style={th}>Shape Score</th><th style={th}>Against its shape</th></tr></thead>
                  <tbody>{rows.map(r => (
                    <tr key={r.code} onMouseEnter={() => { setPaused(true); setTurn(rows.indexOf(r)) }} onMouseLeave={() => setPaused(false)} style={{ borderTop: `1px solid ${C.soft}`, background: cur?.code === r.code ? '#FFF3EC' : 'transparent' }}>
                      <td style={{ padding: '8px' }}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 8 }}>{ball(r, 22)}</span><a href={hrefFor(r.code)} style={{ color: C.ink, fontWeight: 800, textDecoration: 'underline', textDecorationColor: C.line, textUnderlineOffset: 3 }}>{r.name}</a></td>
                      <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}><span aria-hidden style={{ display: 'inline-block', height: 8, width: Math.max(3, r.usage * 70), background: pitchColor(r.code), borderRadius: 2 }} /><b>{Math.round(r.usage * 100)}%</b></span></td>
                      <td style={td}>{r.n.toLocaleString('en-US')}</td>
                      <td style={td}>{r.velo.toFixed(1)}</td><td style={td}>{r.ivb.toFixed(1)}</td><td style={td}>{r.hb.toFixed(1)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{r.swings >= 50 ? pc(r.whiffs / r.swings) : <span style={{ color: C.faint, fontWeight: 600 }}>—</span>}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{r.results?.score ?? <span style={{ color: C.faint, fontWeight: 600 }} title="Fewer than 300 league pitches in the window around this shape">thin</span>}</td>
                      <td style={td}>{gapChip(r)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {res.lockedTypes > 0 && <div style={{ fontSize: 12, color: '#6b6355', padding: '6px 8px' }}>+ {res.lockedTypes} more pitch type{res.lockedTypes === 1 ? '' : 's'} in Pro.</div>}
              </div>
            )}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>The shape of each pitch</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>Each ring is where one of his pitches lands on average, as on the league movement map. The spotlight goes round his pitches one at a time.</p>
          {rows.length > 0 && cur && (
            <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
              <ShapeMap label={`${name}'s pitches on the movement map: the average ride and run of each. Ride up, run toward the arm side.`} minRange={14} rings={rows.map(r => ({ hb: r.hb, ivb: r.ivb, color: pitchColor(r.code), label: r.name, strong: r.code === cur.code }))} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.soft, borderRadius: 6, padding: '10px 14px', marginTop: 8 }}>
                {ball(cur, 52)}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{cur.name} <span style={{ fontSize: 13, fontWeight: 700, color: '#5b5347' }}>{Math.round(cur.usage * 100)}% of his pitches</span></div>
                  <div style={{ fontSize: 13, color: '#5b5347', fontVariantNumeric: 'tabular-nums' }}>{cur.velo.toFixed(1)} mph · {cur.ivb.toFixed(1)} in of ride · {cur.hb.toFixed(1)} in of run · {cur.n.toLocaleString('en-US')} thrown</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }} aria-hidden>{rows.map(r => <span key={r.code} style={{ width: 8, height: 8, borderRadius: 4, background: r.code === cur.code ? pitchColor(r.code) : '#d6d0c2' }} />)}</div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, marginTop: 4 }}>Ride is up, run is toward the arm side (right) or glove side (left). The pitch in the spotlight is drawn larger and moves to the next one every few seconds; hover to hold it.</div>
        </div>
      </div>
    </div>
  )
}
