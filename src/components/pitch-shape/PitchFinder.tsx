'use client'

// src/components/pitch-shape/PitchFinder.tsx
//
// The Pitch Shape Lab's front door: "Find where pitches work". A league-wide movement map at 0.1 in resolution
// (arm-side break x induced vertical break) coloured by whiffs per swing, the spots where pitches of this type have
// been most effective, and, for any spot you choose, who throws a pitch that moves like that and how their results
// compare with the league rate for their own shape. A shortlist for scouting and roster work, not a forecast.
//
// Map maths is shared with MovementHeat (heatGrid.ts). One 0.1 in box holds about one pitch, so each box shows the
// whiffs per swing of every league pitch within a chosen radius of it; windows under 40 swings stay blank.
// Free for four-seam and sweeper; every other pitch type is Pro and refused by the API, not just dimmed here.
// `isPro` is a REQUIRED prop.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { C, Empty, Foot } from '@/components/team/ui'
import type { MovementCellsPayload, Thrower } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'
import { RAMP } from './parts'
import { PV_CSS } from './pvCss'
import { GOLD } from './monthStats'
import { hexToRgb, makeGrid, stats, type Grid, type Span } from './heatGrid'
import LocationPanel from './LocationPanel'

const MIN_WINDOW_SWINGS = 40
const SPOT_MIN_SWINGS = 200      // a "most effective spot" needs a real sample, more than a blank-or-not map box
const MIN_OWN_SWINGS = 100       // a pitcher's own whiff rate needs this many swings
const HALF = 12
const RADII = [0.5, 1, 2] as const
type Mode = 'whiff' | 'density'
type Sort = 'most' | 'beats' | 'trails'
type Spot = { hb: number; ivb: number; rate: number; swings: number }

const cells = new Map<string, MovementCellsPayload | null>()

function topSpots(g: Grid, r10: number, n = 3, minGapIn = 4): Spot[] {
  const found: Spot[] = []
  const lo = g.m10, hi = g.size - g.m10
  for (let y = lo; y < hi; y += 5) for (let x = lo; x < hi; x += 5) {
    const s = stats(g, g.gx0 + x, g.gy0 + y, r10)
    if (s.swings >= SPOT_MIN_SWINGS) found.push({ hb: (g.gx0 + x) / 10, ivb: (g.gy0 + y) / 10, rate: s.whiffs / s.swings, swings: s.swings })
  }
  found.sort((a, b) => b.rate - a.rate)
  const out: Spot[] = []
  for (const f of found) {
    if (out.every(o => Math.hypot(o.hb - f.hb, o.ivb - f.ivb) >= minGapIn)) out.push(f)
    if (out.length === n) break
  }
  return out
}

export default function PitchFinder({ isPro, pitchTypes }: { isPro: boolean; pitchTypes: string[] }) {
  const isFree = (t: string) => (FREE_SANDBOX_TYPES as readonly string[]).includes(t)
  const [type, setType] = useState(pitchTypes.find(isFree) ?? pitchTypes[0] ?? 'FF')
  const [hand, setHand] = useState<Hand>('R')
  const [span, setSpan] = useState<Span>('latest')
  const [mode, setMode] = useState<Mode>('whiff')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1)
  const key = `${type}|${hand}`
  const [payload, setPayload] = useState<MovementCellsPayload | null | undefined>(cells.get(key))   // undefined = loading
  const [target, setTarget] = useState<{ hb: number; ivb: number } | null>(null)
  const [hover, setHover] = useState<{ hb: number; ivb: number } | null>(null)
  const [throwers, setThrowers] = useState<Thrower[] | null | undefined>(null)
  const [sort, setSort] = useState<Sort>('most')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const locked = !isPro && !isFree(type)

  useEffect(() => {
    setTarget(null); setThrowers(null)
    if (locked) { setPayload(null); return }
    if (cells.has(key)) { setPayload(cells.get(key)); return }
    setPayload(undefined)
    let live = true
    fetch(`/api/mlb/pitch-shape/cells?type=${type}&hand=${hand}&center=league&half=${HALF}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { payload: MovementCellsPayload | null }) => { cells.set(key, j.payload); if (live) setPayload(j.payload) })
      .catch(e => { console.error('[PitchFinder] cells fetch failed:', e instanceof Error ? e.message : e); if (live) setPayload(null) })
    return () => { live = false }
  }, [key, type, hand, locked])

  const grids = useMemo(() => (payload ? { latest: makeGrid(payload, 'latest'), all: makeGrid(payload, 'all') } : null), [payload])
  const grid = grids ? grids[span] : null
  const N = grid ? 2 * grid.h10 + 1 : 0
  const r10 = Math.round(radius * 10)
  const lw = grid && grid.swings > 0 ? grid.whiffs / grid.swings : 0.25
  const SCALE_LO = Math.max(0.02, lw * 0.4), SCALE_HI = lw * 2.2
  const lc = (PITCH_NAMES[type] ?? type).toLowerCase()
  const latest = payload?.latest ?? new Date().getFullYear()
  const spots = useMemo(() => (grid ? topSpots(grid, Math.max(r10, 10)) : []), [grid, r10])

  // who throws it here (latest season's pitcher rows)
  useEffect(() => {
    if (!target || !payload || locked) { setThrowers(null); return }
    setThrowers(undefined)
    let live = true
    fetch(`/api/mlb/pitch-shape/throwers?type=${type}&hand=${hand}&hb=${target.hb.toFixed(1)}&ivb=${target.ivb.toFixed(1)}&radius=1&season=${latest}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { throwers: Thrower[] }) => { if (live) setThrowers(j.throwers) })
      .catch(e => { console.error('[PitchFinder] throwers fetch failed:', e instanceof Error ? e.message : e); if (live) setThrowers(null) })
    return () => { live = false }
  }, [target, payload, type, hand, latest, locked])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    const ramp = RAMP.map(hexToRgb)
    const pick = (t: number) => ramp[Math.round(Math.max(0, Math.min(1, t)) * (ramp.length - 1))]
    let maxP = 1
    if (mode === 'density') {
      for (let yy = 0; yy < N; yy += 6) for (let xx = 0; xx < N; xx += 6) {
        const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
        if (s.pitches > maxP) maxP = s.pitches
      }
    }
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
      const o = ((N - 1 - yy) * N + xx) * 4
      let rgb: [number, number, number] | null = null
      if (mode === 'whiff') { if (s.swings >= MIN_WINDOW_SWINGS) rgb = pick((s.whiffs / s.swings - SCALE_LO) / (SCALE_HI - SCALE_LO)) }
      else if (s.pitches > 0) rgb = pick(Math.sqrt(s.pitches / maxP))
      if (rgb) { img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255 }
      else { img.data[o] = 241; img.data[o + 1] = 238; img.data[o + 2] = 230; img.data[o + 3] = 255 }
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, mode, r10, N, SCALE_LO, SCALE_HI])

  const rate = (g: Grid, hb: number, ivb: number) => {
    const s = stats(g, Math.round(hb * 10), Math.round(ivb * 10), r10)
    return { ...s, rate: s.swings >= MIN_WINDOW_SWINGS ? s.whiffs / s.swings : null }
  }
  const rows = useMemo(() => {
    if (!throwers || !grid) return []
    const r = throwers.map(t => {
      const own = t.nSwings >= MIN_OWN_SWINGS ? t.nWhiffs / t.nSwings : null
      const lg = stats(grid, Math.round(t.hb * 10), Math.round(t.ivb * 10), 10)   // his own spot, ±1 in
      const lgRate = lg.swings >= MIN_WINDOW_SWINGS ? lg.whiffs / lg.swings : null
      return { t, own, lgRate, gapPts: own != null && lgRate != null ? (own - lgRate) * 100 : null }
    })
    if (sort === 'beats') return [...r].sort((a, b) => (b.gapPts ?? -999) - (a.gapPts ?? -999))
    if (sort === 'trails') return [...r].sort((a, b) => (a.gapPts ?? 999) - (b.gapPts ?? 999))
    return r
  }, [throwers, grid, sort])

  const ticks: number[] = []
  if (payload) for (let v = Math.ceil(payload.hb0 - HALF / 1); v <= Math.floor(payload.hb0 + HALF); v++) if (v % 5 === 0) ticks.push(v)
  const yticks: number[] = []
  if (payload) for (let v = Math.ceil(payload.ivb0 - HALF); v <= Math.floor(payload.ivb0 + HALF); v++) if (v % 5 === 0) yticks.push(v)
  const toBox = (hb: number, ivb: number) => (grid && payload ? { x: hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (ivb * 10 - (grid.gy0 + grid.m10) + 0.5) } : { x: 0, y: 0 })
  const probe = hover ?? target
  const pr = probe && grid ? rate(grid, probe.hb, probe.ivb) : null
  const f1 = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)

  return (
    <div>
      <style>{PV_CSS}</style>
      <style>{'.pv-tbl td.pc-gold{background:#FFF4CC;color:#7A5800}.pc-n{font-size:10.5px;color:#a89e8c;font-weight:500}'}</style>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div className="pv-k">The idea</div>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#3a352c', margin: '4px 0 8px' }}>
          <b>A pitch is, first, a shape.</b> Pitches with the same shape have tended to get similar results, so every pitch can be judged against the league’s pitches shaped like it. This map shows where on the shape map pitches of a type have been most effective, and for any spot you choose, <b>who throws a pitch that moves like that</b> and whether their results are ahead of, or behind, what that shape usually gets.
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#5b5347', margin: 0 }}>
          A front office could read it as a scouting shortlist: a pitch in an effective spot whose results trail the league rate for its shape is a pitch where something beyond shape is holding it back, and one that beats its shape is getting help from something shape does not capture. Either way it is a place to begin looking, not a verdict. It describes what already happened. <Link href="/mlb/lab/pitch-map" style={{ color: C.orange, fontWeight: 700 }}>Where this comes from, with the sources →</Link>
        </p>
      </div>

      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">Pitch</span>
        {pitchTypes.map(t => {
          const lockedT = !isPro && !isFree(t)
          return <button key={t} type="button" disabled={lockedT} title={lockedT ? 'Pro' : undefined} className={`pv-pill${t === type ? ' on' : ''}`} style={lockedT ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => setType(t)}>{PITCH_NAMES[t] ?? t}{lockedT ? ' · Pro' : ''}</button>
        })}
        <span className="pv-k" style={{ marginLeft: 10 }}>Thrown by</span>
        <button type="button" className={`pv-pill${hand === 'R' ? ' on' : ''}`} onClick={() => setHand('R')}>Right-handers</button>
        <button type="button" className={`pv-pill${hand === 'L' ? ' on' : ''}`} onClick={() => setHand('L')}>Left-handers</button>
      </div>
      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">League pitches</span>
        <button type="button" className={`pv-pill${span === 'latest' ? ' on' : ''}`} onClick={() => setSpan('latest')}>{latest} only</button>
        {payload && payload.seasons.length > 1 && <button type="button" className={`pv-pill${span === 'all' ? ' on' : ''}`} onClick={() => setSpan('all')}>{payload.seasons[0].season}–{latest}</button>}
        <span className="pv-k" style={{ marginLeft: 10 }}>Show</span>
        <button type="button" className={`pv-pill${mode === 'whiff' ? ' on' : ''}`} onClick={() => setMode('whiff')}>Whiffs per swing</button>
        <button type="button" className={`pv-pill${mode === 'density' ? ' on' : ''}`} onClick={() => setMode('density')}>Where pitches live</button>
        <span className="pv-k" style={{ marginLeft: 10 }}>Window</span>
        {RADII.map(r => <button key={r} type="button" className={`pv-pill${radius === r ? ' on' : ''}`} onClick={() => setRadius(r)}>±{r} in</button>)}
      </div>

      {locked ? <Empty>The {lc} map is part of Pro. Four-seam and sweeper are free.</Empty>
        : payload === undefined ? <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Loading the league map…</div>
        : payload === null || !grid ? <Empty>The 0.1-inch league map isn’t built for {hand === 'L' ? 'left' : 'right'}-handed {lc}s yet.</Empty>
        : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,560px) minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="pf-grid">
          <style>{'@media(max-width:900px){.pf-grid{grid-template-columns:1fr !important}}'}</style>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gridTemplateRows: 'auto 22px' }}>
              <div style={{ position: 'relative' }}>
                {yticks.map(v => <span key={v} style={{ position: 'absolute', right: 4, top: `${((payload.ivb0 + HALF - v) / (2 * HALF)) * 100}%`, transform: 'translateY(-50%)', fontSize: 10, color: C.mute }}>{v}</span>)}
              </div>
              <div style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', cursor: 'crosshair' }}
                onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover({ hb: payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb: payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF }) }}
                onMouseLeave={() => setHover(null)}
                onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setTarget({ hb: Math.round((payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF) * 10) / 10, ivb: Math.round((payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF) * 10) / 10 }) }}>
                <canvas ref={canvasRef} role="img" aria-label={`League ${lc} movement map at 0.1 inch resolution`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
                <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {spots.map((s, i) => { const b = toBox(s.hb, s.ivb); return (<g key={i}><circle cx={b.x} cy={b.y} r={N / 40} fill={GOLD.fill} stroke={C.ink} strokeWidth={N / 300} /><text x={b.x} y={b.y + N / 120} textAnchor="middle" fontSize={N / 28} fontWeight={800} fill={C.ink}>{i + 1}</text></g>) })}
                  {target && (() => { const b = toBox(target.hb, target.ivb); const rr = 15; return (<g><rect x={b.x - rr} y={b.y - rr} width={2 * rr} height={2 * rr} fill="none" stroke={C.ink} strokeWidth={N / 200} strokeDasharray={`${N / 60} ${N / 100}`} /><line x1={b.x - N / 30} x2={b.x + N / 30} y1={b.y} y2={b.y} stroke={C.ink} strokeWidth={N / 150} /><line y1={b.y - N / 30} y2={b.y + N / 30} x1={b.x} x2={b.x} stroke={C.ink} strokeWidth={N / 150} /></g>) })()}
                </svg>
              </div>
              <div />
              <div style={{ position: 'relative' }}>
                {ticks.map(v => <span key={v} style={{ position: 'absolute', left: `${((v - (payload.hb0 - HALF)) / (2 * HALF)) * 100}%`, transform: 'translateX(-50%)', top: 4, fontSize: 10, color: C.mute }}>{v}</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: '.12em', fontWeight: 800, color: C.mute, margin: '2px 0 6px', paddingLeft: 28 }}><span>↑ INDUCED VERTICAL BREAK (IN)</span><span>ARM-SIDE BREAK (IN) →</span></div>
            <div className="pv-row" style={{ fontSize: 11, color: C.mute, gap: 8 }}>
              {mode === 'whiff'
                ? <><span>Whiffs per swing</span><span>{(SCALE_LO * 100).toFixed(0)}%</span><span style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>{RAMP.map(c => <span key={c} style={{ width: 20, height: 10, background: c }} />)}</span><span>{(SCALE_HI * 100).toFixed(0)}%</span><span>(league rate {(lw * 100).toFixed(1)}%) · blank = under {MIN_WINDOW_SWINGS} swings in the window</span></>
                : <><span>Fewer pitches</span><span style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>{RAMP.map(c => <span key={c} style={{ width: 20, height: 10, background: c }} />)}</span><span>More pitches in the window</span></>}
            </div>
          </div>

          <div>
            <div className="pv-k">Where {lc}s are most effective</div>
            {spots.length === 0 ? <p className="pv-note">No spot has enough swings to rank yet.</p> : spots.map((s, i) => (
              <button key={i} type="button" onClick={() => setTarget({ hb: Math.round(s.hb * 10) / 10, ivb: Math.round(s.ivb * 10) / 10 })}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: GOLD.soft, border: `1px solid ${GOLD.line}`, borderRadius: 12, padding: '8px 12px', marginTop: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: GOLD.ink, textTransform: 'uppercase' }}>Spot {i + 1}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: C.ink }}>{(s.rate * 100).toFixed(1)}% whiffs per swing</div>
                <div style={{ fontSize: 12, color: '#5b5347' }}>HB {s.hb.toFixed(1)} in, IVB {s.ivb.toFixed(1)} in · {s.swings.toLocaleString()} swings within ±{Math.max(radius, 1)} in · league {(lw * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: GOLD.ink, marginTop: 2 }}>Click to see who throws it →</div>
              </button>
            ))}
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', fontSize: 12.5, color: '#5b5347', marginTop: 12, minHeight: 56 }}>
              {probe && pr
                ? <><b style={{ color: C.ink }}>{hover ? 'Under the cursor' : 'Chosen spot'}:</b> HB {probe.hb.toFixed(1)} in, IVB {probe.ivb.toFixed(1)} in. Within ±{radius} in: {pr.pitches.toLocaleString()} pitches, {pr.swings.toLocaleString()} swings, whiffs per swing <b style={{ color: C.ink }}>{pr.rate == null ? 'too few swings' : f1(pr.rate)}</b>.</>
                : <>Click anywhere on the map, or a gold spot, to choose a place. Hover to read any box.</>}
            </div>
            <div style={{ marginTop: 14, maxWidth: 270 }}>
              <LocationPanel pitchType={type} hand={hand} probe={probe ?? { hb: payload.hb0, ivb: payload.ivb0 }} radius={radius} span={span} scope="league" pitchName={PITCH_NAMES[type] ?? type} />
            </div>
          </div>
        </div>
      )}

      {target && !locked && payload && grid && (
        <div style={{ marginTop: 18 }}>
          <div className="pv-k">Who throws a {lc} like this · {latest}</div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.01em', margin: '2px 0 6px', color: C.ink }}>
            {hand === 'L' ? 'Left' : 'Right'}-handers who throw a {lc} within 1 in of HB {target.hb.toFixed(1)}, IVB {target.ivb.toFixed(1)}
          </div>
          <div className="pv-row" style={{ marginTop: 0 }}>
            <span className="pv-k">Sort</span>
            <button type="button" className={`pv-pill${sort === 'most' ? ' on' : ''}`} onClick={() => setSort('most')}>Throw it most</button>
            <button type="button" className={`pv-pill${sort === 'beats' ? ' on' : ''}`} onClick={() => setSort('beats')}>Results ahead of their shape</button>
            <button type="button" className={`pv-pill${sort === 'trails' ? ' on' : ''}`} onClick={() => setSort('trails')}>Results behind their shape</button>
          </div>
          {throwers === undefined ? <div style={{ padding: 16, color: C.mute, fontSize: 13 }}>Finding pitchers…</div>
            : rows.length === 0 ? <Empty>No {hand === 'L' ? 'left' : 'right'}-handed pitcher with 300+ {lc}s threw enough of them into that spot in {latest} (3 or more of his sampled pitches). Try another spot.</Empty>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="pv-tbl">
                  <thead><tr><th>Pitcher</th><th>Team</th><th>His {lc}s</th><th>In this spot</th><th>Avg HB</th><th>Avg IVB</th><th>Velo</th><th>Whiffs / swing</th><th>League at his average</th><th>Ahead (+) or behind (−)</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 15).map(({ t, own, lgRate, gapPts }) => (
                      <tr key={t.pitcherId}>
                        <td style={{ fontWeight: 800 }}>{t.name}</td><td>{t.teamAbbr}</td><td>{t.nPitches.toLocaleString()}</td><td><b>{(t.share * 100).toFixed(0)}%</b><span className="pc-n"> ≈{t.estPitches.toLocaleString()} ({t.inSpot} of {t.sample})</span></td><td>{t.hb.toFixed(1)}</td><td>{t.ivb.toFixed(1)}</td><td>{t.velo.toFixed(1)}</td>
                        <td>{f1(own)}<span className="pc-n"> ({t.nSwings})</span></td>
                        <td>{f1(lgRate)}</td>
                        <td className={gapPts != null && gapPts >= 3 ? 'pc-gold' : ''} style={{ fontWeight: 800 }}>{gapPts == null ? '—' : `${gapPts >= 0 ? '+' : '−'}${Math.abs(gapPts).toFixed(1)} pts`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <Foot>
            {latest} regular season, pitchers with 300+ of this pitch type. “In this spot” is the share of up to 60 of his sampled pitches that landed within ±1 in of the spot, with a rough count for the whole season (a small random sample, so treat it as approximate); 3 or more sampled pitches are needed to be listed. Whiffs per swing is his own (shown from {MIN_OWN_SWINGS} swings, swings in brackets). League at his average is the rate for every league {lc} within ±1 in of his own average movement ({span === 'latest' ? latest : `${payload.seasons[0].season}–${latest}`}, needs {MIN_WINDOW_SWINGS}+ swings). The last column is the difference, in percentage points; gold = 3 or more points ahead. Shape is not everything: command, deception, sequencing and health are not in it, and a pitcher’s season is a small sample. Descriptions of what already happened.
          </Foot>
        </div>
      )}
      {!target && !locked && payload && <Foot>Each 0.1 in box shows the whiffs per swing of every league {lc} thrown by {hand === 'L' ? 'left' : 'right'}-handers within ±{radius} in of it, pooled over every velocity and arm angle. Boxes with under {MIN_WINDOW_SWINGS} swings in the window are blank, not estimated. Gold spots are the three windows with the highest rate among those with {SPOT_MIN_SWINGS}+ swings, at least 4 in apart.</Foot>}
    </div>
  )
}
