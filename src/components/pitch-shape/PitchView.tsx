'use client'

// src/components/pitch-shape/PitchView.tsx
//
// "[Pitch] over the years" — first section of the Pitching Lab Shape tab (mockups/pitch-view.html, approved).
// A clean 3D model plus a month table, two tabs:
//   Release point    one dot per month on a 1-inch grid: how his release point has moved (what changed)
//   Pitch movement   the pitch as thrown next to the same pitch with no spin: speed, vertical break, horizontal break
// Descriptions of what was measured, with the pitch count behind every month. Months under 50 pitches are drawn
// faint and left out of the change figures. All 3D work lives in pitchViewScene.ts.
//
// `months` come from pitch_shape_monthly (month order). The Shape tab is Pro-gated on the server; the data is only
// fetched when Pro, so this component holds no gating of its own beyond the parent's required `isPro`.

import { useEffect, useMemo, useRef, useState } from 'react'
import { C, SANS, Empty, Foot } from '@/components/team/ui'
import type { PitchViewMonth } from '@/lib/pitch-shape/model'
import MonthOutcomes from './MonthOutcomes'
import { PV_CSS } from './pvCss'
import PitchRecap from './PitchRecap'
import ReleaseReference from './ReleaseReference'
import { GATES, GOLD, METRICS, aggregateSeason, isThinWeak, overallStandout, periodLabel, periodValues, standout, type Metric } from './monthStats'
import { MIN_N, PRESET_NAMES, createPitchViewScene, monthColor, type CamName, type SceneApi, type Tab } from './pitchViewScene'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mname = (m: number) => (m >= 1000 ? String(m) : MON[m - 1] ?? String(m))   // 2025 -> '2025' (a whole-season point)
const hex = (i: number, n: number) => `#${monthColor(i, n).getHexString()}`

type SeasonMonths = { season: number; months: PitchViewMonth[] }

export default function PitchView({ seasons, pitchName, hand, isPro }: { seasons: SeasonMonths[]; pitchName: string; hand: 'L' | 'R'; isPro: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<SceneApi | null>(null)
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState('')

  // Scope: the months of one season, or one point per season (pitch-weighted average) to compare years.
  const latest = seasons.length ? seasons[seasons.length - 1].season : 0
  const [scope, setScope] = useState<'months' | 'years'>('months')
  const [seasonSel, setSeasonSel] = useState(latest)
  const canYears = seasons.length >= 2
  const months = useMemo<PitchViewMonth[]>(() => {
    if (scope === 'years' && canYears) return seasons.map(s => aggregateSeason(s.season, s.months)).filter((x): x is PitchViewMonth => x != null)
    return (seasons.find(s => s.season === seasonSel) ?? seasons[seasons.length - 1])?.months ?? []
  }, [scope, canYears, seasons, seasonSel])
  const unit: 'month' | 'season' = scope === 'years' && canYears ? 'season' : 'month'
  const scopeLabel = unit === 'season' ? `${seasons[0]?.season}–${latest} by year` : `${seasonSel} by month`
  const modelRef = useRef<HTMLDivElement>(null)
  const nM = months.length
  const valsAll = useMemo(() => months.map(periodValues), [months])
  const overall = useMemo(() => overallStandout(valsAll), [valsAll])
  const goldIdx = overall.index
  const full = useMemo(() => months.map((m, i) => (m.n >= MIN_N ? i : -1)).filter(i => i >= 0), [months])
  const baseI = full.length ? full[0] : 0
  const lastI = full.length ? full[full.length - 1] : nM - 1
  const [tab, setTab] = useState<Tab>('release')
  const [sel, setSel] = useState(lastI)
  const [cam, setCam] = useState<CamName>('Catcher view')
  const [allOn, setAllOn] = useState(false)
  const [ex, setEx] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)

  // one scene per set of months; torn down when the pitch type changes or the component unmounts
  useEffect(() => {
    if (!isPro || !canvasRef.current || !labelsRef.current || nM === 0) return
    let a: SceneApi | null = null
    try {
      a = createPitchViewScene({ canvas: canvasRef.current, labels: labelsRef.current, months, hand, monthLabel: mname, goldIndex: goldIdx, onCamName: setCam, onNote: setNote })
    } catch (e) {
      console.error('[PitchView] 3D scene failed to load:', e instanceof Error ? e.message : e)
      setFailed(true)
      return
    }
    setFailed(false)
    setApi(a)
    return () => { a?.dispose(); setApi(null) }
  }, [months, hand, isPro, nM, goldIdx])

  useEffect(() => { setSel(lastI); setAllOn(false); setEx(false); setPlaying(true); setSpeed(1) }, [months, lastI])
  // The animation steps through the months (or seasons) on its own: every few seconds it moves to the next one with
  // enough pitches. Choosing a month yourself, or pressing Pause, stops it.
  useEffect(() => {
    if (!playing || allOn || full.length < 2) return
    const id = setInterval(() => setSel(cur => { const pos = full.indexOf(cur); return full[(pos + 1) % full.length] ?? full[0] }), 4000 / speed)
    return () => clearInterval(id)
  }, [playing, allOn, full, speed])
  useEffect(() => { api?.setTab(tab); setAllOn(false); setEx(false) }, [api, tab])
  useEffect(() => { api?.setSel(sel) }, [api, sel])
  useEffect(() => { api?.setAll(allOn) }, [api, allOn, tab])
  useEffect(() => { if (tab === 'move') api?.setExaggerate(ex) }, [api, ex, tab])
  useEffect(() => { api?.setPlaying(playing) }, [api, playing])
  useEffect(() => { api?.setSpeed(speed) }, [api, speed])

  if (nM === 0 || full.length === 0) return <Empty>Release and movement over the year isn’t built for this pitch yet.</Empty>

  const r = months[sel] ?? months[lastI]
  const a = months[baseI]
  const xs = full.map(i => months[i].releaseX), zs = full.map(i => months[i].releaseZ)
  const winX = (Math.max(...xs) - Math.min(...xs)) * 12, winZ = (Math.max(...zs) - Math.min(...zs)) * 12
  const armSide = hand === 'L' ? 'first-base' : 'third-base'   // arm side is toward first base for a left-hander (catcher's view)
  const gloveSide = hand === 'L' ? 'third-base' : 'first-base'

  const vals = valsAll
  const stand = Object.fromEntries(METRICS.map(m => [m.key, standout(vals, m.key)])) as Record<Metric, { best: number | null; worst: number | null }>
  const lab = (m: PitchViewMonth) => periodLabel(m)
  const spark = (vals: number[]) => {
    if (vals.length < 2) return null
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 54).toFixed(1)},${(14 - ((v - lo) / span) * 12).toFixed(1)}`).join(' ')
    return <svg width="54" height="16" aria-hidden="true"><polyline fill="none" stroke={C.orange} strokeWidth="1.6" points={pts} /></svg>
  }
  // [label, value, unit, delta vs the baseline month (in the unit shown), delta unit, series, tab that highlights it]
  type Row = { k: string; v: string; u: string; d: number | null; du: string; vals: number[]; tab: Tab }
  const q = full.map(i => months[i])
  const rows: Row[] = [
    { k: 'Velo', v: r.speed.toFixed(1), u: 'mph', d: r.speed - a.speed, du: '', vals: q.map(m => m.speed), tab: 'move' },
    { k: 'Spin', v: r.spin != null ? Math.round(r.spin).toLocaleString() : '—', u: r.spin != null ? 'rpm' : '', d: r.spin != null && a.spin != null ? r.spin - a.spin : null, du: '', vals: q.map(m => m.spin).filter((x): x is number => x != null), tab: 'move' },
    { k: 'IVB', v: r.ivb.toFixed(1), u: 'in', d: r.ivb - a.ivb, du: '', vals: q.map(m => m.ivb), tab: 'move' },
    { k: 'HB (arm side)', v: r.hb.toFixed(1), u: 'in', d: r.hb - a.hb, du: '', vals: q.map(m => m.hb), tab: 'move' },
    { k: 'Release X', v: r.releaseX.toFixed(2), u: 'ft', d: (r.releaseX - a.releaseX) * 12, du: 'in', vals: q.map(m => m.releaseX), tab: 'release' },
    { k: 'Release Z', v: r.releaseZ.toFixed(2), u: 'ft', d: (r.releaseZ - a.releaseZ) * 12, du: 'in', vals: q.map(m => m.releaseZ), tab: 'release' },
    { k: 'Extension', v: r.extension != null ? r.extension.toFixed(2) : '—', u: r.extension != null ? 'ft' : '', d: r.extension != null && a.extension != null ? (r.extension - a.extension) * 12 : null, du: 'in', vals: q.map(m => m.extension).filter((x): x is number => x != null), tab: 'release' },
  ]
  const fmtD = (d: number | null, du: string, isBase: boolean) => (isBase ? 'base' : d == null ? '—' : `${d >= 0 ? '+' : '−'}${Math.abs(d) >= 100 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1)}${du ? ` ${du}` : ''}`)
  const dash = (v: number | null, f: (x: number) => string) => (v == null ? '—' : f(v))

  return (
    <div style={{ fontFamily: SANS }}>
      <style>{PV_CSS}</style>
      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">Compare</span>
        <button type="button" className={`pv-pill${unit === 'month' ? ' on' : ''}`} onClick={() => setScope('months')}>By month</button>
        {canYears && <button type="button" className={`pv-pill${unit === 'season' ? ' on' : ''}`} onClick={() => setScope('years')}>By year</button>}
        {unit === 'month' && seasons.length > 1 && (
          <>
            <span className="pv-k" style={{ marginLeft: 10 }}>Season</span>
            {seasons.map(x => (
              <button key={x.season} type="button" className={`pv-pill${x.season === seasonSel ? ' on' : ''}`} onClick={() => setSeasonSel(x.season)}>{x.season}</button>
            ))}
          </>
        )}
        {unit === 'season' && <span style={{ fontSize: 12, color: C.mute }}>Each point is that season’s pitch-weighted average.</span>}
      </div>

      <PitchRecap periods={months} pitchName={pitchName} scopeLabel={scopeLabel} onDrill={() => modelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      <div ref={modelRef} style={{ scrollMarginTop: 72 }} />
      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">View</span>
        {(['release', 'move'] as Tab[]).map(t => (
          <button key={t} type="button" className={`pv-pill${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t === 'release' ? 'Release point' : 'Movement'}</button>
        ))}
      </div>

      <div className="pv-grid">
        <div style={{ minWidth: 0 }}>
          <div className="pv-stage">
            {failed
              ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.mute, fontSize: 13, padding: 20, textAlign: 'center' }}>The 3D model can’t run in this browser. The month log below has the same numbers.</div>
              : <canvas ref={canvasRef} aria-label={`${pitchName} ${tab === 'release' ? 'release point by month' : 'path with and without spin'}`} role="img" style={{ width: '100%', height: '100%', display: 'block' }} />}
            <div ref={labelsRef} />
            <span className="pv-k" style={{ position: 'absolute', left: 12, top: 10, pointerEvents: 'none' }}>Scope · {cam} · {lab(r)}</span>
            <span className="pv-k" style={{ position: 'absolute', right: 12, bottom: 10, pointerEvents: 'none', color: C.mute }}>{note || (tab === 'release' ? 'Grid 1 in per square' : ex ? 'Exaggerate ×4' : 'Exaggerate ×1')}</span>
          </div>
          <div className="pv-row">
            <span className="pv-k">Camera</span>
            {PRESET_NAMES[tab].map(n => (
              <button key={n} type="button" className={`pv-pill${cam === n ? ' on' : ''}`} onClick={() => api?.setCam(n)}>{n}</button>
            ))}
            {tab === 'move' && (
              <>
                <button type="button" className={`pv-pill${ex ? ' on' : ''}`} onClick={() => setEx(v => !v)}>Exaggerate ×4</button>
                <button type="button" className={`pv-pill${allOn ? ' on' : ''}`} onClick={() => setAllOn(v => !v)}>All months</button>
              </>
            )}
            <button type="button" className="pv-pill" onClick={() => setPlaying(v => !v)}>{playing ? 'Pause cycle' : 'Cycle months'}</button>
            <button type="button" className="pv-pill" onClick={() => setSpeed(s => (s === 1 ? 0.25 : 1))}>{speed === 1 ? '1×' : '0.25×'}</button>
          </div>
          <div className="pv-row">
            <span className="pv-k">Month</span>
            {months.map((m, i) => (
              <button key={m.month} type="button" className={`pv-pill${i === sel ? ' on' : ''}${i === goldIdx ? ' gold' : ''}`} onClick={() => { setPlaying(false); setSel(i) }}>
                <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', marginRight: 6, background: hex(i, nM), boxShadow: i === sel ? `0 0 0 2px ${C.cream}` : undefined }} />
                {i === goldIdx ? '' : ''}{lab(m)}
              </button>
            ))}
          </div>
          {tab === 'release' && <ReleaseReference r={r} hand={hand} />}
        </div>

        <div className="pv-side">
          <div className="pv-panel">
            <div className="pv-k">Readout · {lab(r)} · n={r.n}{r.n < MIN_N ? ' (small)' : ''}</div>
            <table className="pv-read">
              <tbody>
                {rows.map(x => (
                  <tr key={x.k} className={x.tab === tab ? 'hl' : ''}>
                    <td>{x.k}</td>
                    <td className="v">{x.v}{x.u ? <small>{x.u}</small> : null}</td>
                    <td className="d">{fmtD(x.d, x.du, sel === baseI)}</td>
                    <td className="s">{spark(x.vals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pv-foot">Change is against {lab(a)}, the first {unit} with {MIN_N}+ pitches. Lines run {unit} by {unit}. {tab === 'release' ? `Across the ${unit}s with enough pitches the release stayed inside a ${winX.toFixed(1)} in by ${winZ.toFixed(1)} in box.` : ''}</div>
          </div>

          <details className="pv-panel pv-notes">
            <summary><span className="pv-k">Notes · how to read this ▾</span></summary>
            {tab === 'release' ? (
              <>
                <p className="pv-note"><b>Dots</b> are each {unit}’s average release point. The dark cross is {lab(a)}. Grid squares are 1 in.</p>
                <p className="pv-note"><b>Direction.</b> Release X is measured from the middle of the rubber, positive toward first base (catcher’s view). A left-hander’s arm side is the {armSide} side.</p>
                <p className="pv-note"><b>Why it matters.</b> Clubs compare release point and extension with a pitcher’s own baseline to spot mechanical drift and workload strain.</p>
              </>
            ) : (
              <>
                <p className="pv-note"><b>Dashed line</b> is the same pitch with no spin: gravity pulls it down and nothing pushes it sideways. The orange line is the pitch as thrown.</p>
                <p className="pv-note"><b>At the plate</b> the gap is {Math.abs(r.ivb).toFixed(1)} in vertically ({r.ivb >= 0 ? 'carries higher than a spinless pitch' : 'drops more than a spinless pitch'}) and {Math.abs(r.hb).toFixed(1)} in horizontally (toward the {r.hb >= 0 ? armSide : gloveSide} side).</p>
                <p className="pv-note"><b>Why it matters.</b> Clubs group pitches by speed, spin and movement to design pitches, compare arms and notice when a pitch has changed shape.</p>
                <div className="pv-leg"><span><b /> As thrown</span><span><b className="d" /> No spin</span></div>
              </>
            )}
          </details>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <div className="pv-k" style={{ marginBottom: 6 }}>{unit === 'season' ? 'Season' : 'Month'} log · shape and results · <span style={{ color: GOLD.ink }}>gold = standout</span></div>
        <table className="pv-tbl">
          <thead>
            <tr><th>{unit === 'season' ? 'Season' : 'Month'}</th><th>P</th><th>Velo</th><th>Spin</th><th>IVB</th><th>HB</th><th>Break</th><th>Rel X</th><th>Rel Z</th><th>Ext</th><th>Whiff% / swing</th><th>Swings</th><th>xwOBA con</th><th>Weak %</th><th>BBE</th><th>ABS upheld</th></tr>
          </thead>
          <tbody>
            {months.map((m, i) => {
              const v = vals[i]
              const gold = (k: Metric) => (stand[k].best === i ? ' gold' : '')
              const lows: string[] = []
              if (stand.whiff.worst === i) lows.push('Lowest whiff')
              if (stand.xw.worst === i) lows.push('Worst contact')
              const star = (k: Metric) => (stand[k].best === i ? '' : '')
              return (
                <tr key={`${m.season}-${m.month}`} className={`${i === sel ? 'sel' : ''}${m.n < MIN_N ? ' small' : ''}`}>
                  <td>
                    <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: hex(i, nM), marginRight: 7 }} />{lab(m)}{m.n < MIN_N ? ' *' : ''}
                    {i === goldIdx && <span className="pv-flag gd">Overall</span>}
                    {lows.map(t => <span key={t} className="pv-flag r">{t}</span>)}
                  </td>
                  <td>{m.n}</td>
                  <td className={gold('velo')}>{star('velo')}{m.speed.toFixed(1)}</td>
                  <td className={gold('spin')}>{star('spin')}{m.spin != null ? Math.round(m.spin).toLocaleString() : '—'}</td>
                  <td className={tab === 'move' ? 'hl' : ''}>{m.ivb.toFixed(1)}</td>
                  <td className={tab === 'move' ? 'hl' : ''}>{m.hb.toFixed(1)}</td>
                  <td className={gold('move')}>{star('move')}{Math.hypot(m.ivb, m.hb).toFixed(1)}</td>
                  <td className={tab === 'release' ? 'hl' : ''}>{m.releaseX.toFixed(2)}</td>
                  <td className={tab === 'release' ? 'hl' : ''}>{m.releaseZ.toFixed(2)}</td>
                  <td className={tab === 'release' ? 'hl' : ''}>{m.extension != null ? m.extension.toFixed(2) : '—'}</td>
                  <td className={gold('whiff')}>{star('whiff')}{v.whiff == null ? '—' : v.whiff.toFixed(1)}</td>
                  <td>{m.nSwings ?? '—'}</td>
                  <td className={gold('xw')}>{star('xw')}{v.xw == null ? '—' : v.xw.toFixed(3).replace(/^0/, '')}</td>
                  <td className={gold('weak')}>{star('weak')}{v.weak == null ? '—' : v.weak.toFixed(1)}{v.weak != null && isThinWeak(m) ? <sup title={`Only ${m.nBbe} balls in play: a thinner sample`}> †</sup> : null}</td>
                  <td>{m.nBbe ?? '—'}</td>
                  <td className={gold('abs')}>{star('abs')}{v.abs == null ? (m.absN ? `— (${m.absN})` : '—') : `${v.abs.toFixed(0)}% (${m.absN})`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Foot>
        * Under {MIN_N} pitches: drawn faint and left out of the change figures and of the gold marks. Release X is measured from the middle of the rubber (positive toward first base, catcher’s view). IVB = rise compared with a pitch with no spin; HB = arm-side run (left-handers flipped); Break = total movement, √(IVB² + HB²). Whiff% = whiffs ÷ swings ({GATES.swings}+ swings); xwOBA con = expected wOBA on balls in play ({GATES.bbe}+ balls in play, lower is better for the pitcher); Weak % = balls in play Savant classes Weak or Topped, shown from {GATES.weak}+ balls in play (a lower bar than the others, so † marks a thinner sample: harder to judge); ABS upheld = challenged calls on this pitch that stood, with the number of challenges ({GATES.abs}+ to rank). Otherwise —.
        Gold = the standout {unit} for that measure (needs two or more {unit}s with enough sample). Season rows are pitch-weighted averages of the months. {pitchName}.
      </Foot>
      <MonthOutcomes periods={months} pitchName={pitchName} unit={unit} />
    </div>
  )
}

export { PV_CSS } from './pvCss'
