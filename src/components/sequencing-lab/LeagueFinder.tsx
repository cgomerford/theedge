'use client'

// src/components/sequencing-lab/LeagueFinder.tsx
//
// Sequencing Lab → League: choose a pitch (type, throwing hand, speed, break, zone, result) and it plays that pitch from behind the plate, then counts what has
// happened to league pitches like it. The animation is drawn from the matching pitches' own average release point, speed, break and plate crossing (buildFlight);
// the counts come from the stored pitch_events rows through /api/sequencing/finder. A selection under MIN pitches shows "Small sample" instead of shares.
// "Like it" = within ±SPEED_WIN mph, ±MOVE_WIN inches of arm-side break and ±MOVE_WIN inches of induced rise. These are counts of what has happened, never a forecast.

import { useEffect, useMemo, useRef, useState } from 'react'
import SpinBall from '@/components/home/SpinBall'
import SmallSample from '@/components/data/SmallSample'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel, PITCH_ORDER } from '@/lib/lab/pitch-meta'
import { RESULTS, type ResultCode } from '@/lib/sequencing-lab/sequence'
import { buildFlight, type FinderStats } from '@/lib/sequencing-lab/flight'
import { H, Scene, SpeedToggle, W, proj, PLATE_Y } from '@/components/pitching-lab/PitchFlight'
import { NEUTRAL, ORANGE, Pills, VH, VW, cellRect, kick, labelAt, mix, note, px, pz, star, tile } from '@/components/pitching-lab/LocationExplorer'
import type { FinderRow } from '@/app/api/sequencing/finder/route'

const MIN = MIN_SAMPLE.zoneCellPitches
const SPEED_WIN = 1.5, MOVE_WIN = 3
const ZONES = ['11', '12', '13', '14', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const RES_COLOR: Record<ResultCode, string> = { B: '#9DB4D6', C: '#0072B2', W: '#D55E00', F: '#E69F00', XH: '#c0392b', XO: '#8a8275' }
const TYPES = PITCH_ORDER.filter(c => ['FF', 'SI', 'FC', 'SL', 'ST', 'SV', 'CU', 'KC', 'CH', 'FS'].includes(c))
// Typical speed per pitch, only used to pick a cheap window for the first lookup (the sliders then start at the real average inside it).
const TYPICAL_SPEED: Record<string, number> = { FF: 95, SI: 94, FC: 89, SL: 86, ST: 80, SV: 81, CU: 79, KC: 80, CH: 86, FS: 85 }
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)

/** Weighted mean of one measure across result rows (each row's mean counts as many times as it has pitches). */
function wmean(rows: FinderRow[], k: 'plateX' | 'plateZ' | 'relX' | 'relZ' | 'ext' | 'speed' | 'spin' | 'hb' | 'ivb'): number | null {
  let s = 0, n = 0
  for (const r of rows) { const v = r[k]; if (v != null) { s += v * r.n; n += r.n } }
  return n ? s / n : null
}
function statsOf(rows: FinderRow[], hand: 'R' | 'L'): FinderStats | null {
  const g = (k: Parameters<typeof wmean>[1]) => wmean(rows, k)
  const v = { plateX: g('plateX'), plateZ: g('plateZ'), relX: g('relX'), relZ: g('relZ'), ext: g('ext'), speed: g('speed'), hb: g('hb'), ivb: g('ivb') }
  if (Object.values(v).some(x => x == null)) return null
  return { ...(v as Omit<FinderStats, 'spin' | 'hand'>), spin: g('spin'), hand }
}

export default function LeagueFinder({ season }: { season: number }) {
  const [type, setType] = useState('FF')
  const [hand, setHand] = useState<'R' | 'L'>('R')
  const [stand, setStand] = useState<'any' | 'R' | 'L'>('any')
  const [speed, setSpeed] = useState<number | null>(null)
  const [hb, setHb] = useState<number | null>(null)
  const [ivb, setIvb] = useState<number | null>(null)
  const [zone, setZone] = useState<string | null>(null)
  const [res, setRes] = useState<ResultCode | null>(null)
  const [rows, setRows] = useState<FinderRow[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'unavailable'>('loading')
  const [slow, setSlow] = useState(6)
  const [run, setRun] = useState(0)
  const [p, setP] = useState(0)

  // Step 1: when the pitch or hand changes, ask for the pitches of that type and hand near its usual speed to find the typical speed and break, and start the sliders there.
  useEffect(() => {
    const ac = new AbortController()
    setState('loading'); setSpeed(null); setHb(null); setIvb(null); setZone(null)
    const ts = TYPICAL_SPEED[type] ?? 90
    fetch(`/api/sequencing/finder?type=${type}&hand=${hand}&season=${season}&slo=${ts - 5}&shi=${ts + 5}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { rows: FinderRow[] }) => {
        const sp = wmean(j.rows, 'speed'), h = wmean(j.rows, 'hb'), v = wmean(j.rows, 'ivb')
        if (sp == null || h == null || v == null) { setRows([]); setState('ok'); return }
        setSpeed(Math.round(sp * 2) / 2); setHb(Math.round(h)); setIvb(Math.round(v))
      })
      .catch(e => { if (e?.name !== 'AbortError') setState('unavailable') })
    return () => ac.abort()
  }, [type, hand, season])

  // Step 2: every change to the sliders, zone or batter side asks for the pitches inside the windows (after a short pause so dragging stays smooth).
  useEffect(() => {
    if (speed == null || hb == null || ivb == null) return
    const ac = new AbortController()
    const t = setTimeout(() => {
      const q = new URLSearchParams({ type, hand, season: String(season), slo: String(speed - SPEED_WIN), shi: String(speed + SPEED_WIN), hlo: String(hb - MOVE_WIN), hhi: String(hb + MOVE_WIN), vlo: String(ivb - MOVE_WIN), vhi: String(ivb + MOVE_WIN) })
      if (zone) q.set('zone', zone)
      if (stand !== 'any') q.set('stand', stand)
      fetch(`/api/sequencing/finder?${q}`, { signal: ac.signal })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { rows: FinderRow[] }) => { setRows(j.rows); setState('ok'); setRun(x => x + 1) })
        .catch(e => { if (e?.name !== 'AbortError') setState('unavailable') })
    }, 300)
    return () => { clearTimeout(t); ac.abort() }
  }, [type, hand, stand, speed, hb, ivb, zone, season])

  const total = (rows ?? []).reduce((s, r) => s + r.n, 0)
  const shown = useMemo(() => (rows ?? []).filter(r => !res || r.result === res), [rows, res])
  const shownN = shown.reduce((s, r) => s + r.n, 0)
  const path = useMemo(() => { const s = statsOf(shown, hand); return s ? buildFlight(type, pitchLabel(type), s, shownN) : null }, [shown, hand, type, shownN])
  const endResult: ResultCode | null = res ?? ((rows ?? []).slice().sort((a, b) => b.n - a.n)[0]?.result as ResultCode | undefined) ?? null

  // The animation: plays once from release to the plate, holds, and replays whenever a new selection arrives or Replay is pressed.
  useEffect(() => {
    if (!path) return
    let raf = 0
    const dur = path.T * 1000 * slow, t0 = performance.now()
    const tick = (now: number) => { const x = Math.min(1, (now - t0) / dur); setP(x); if (x < 1) raf = requestAnimationFrame(tick) }
    setP(0); raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [path, slow, run])

  const landed = p >= 1 && path && endResult
  const plate = path ? proj({ x: path.plate.x, y: PLATE_Y, z: path.plate.z }) : null
  const small = total < MIN
  const handName = hand === 'R' ? 'right-handed' : 'left-handed'

  return (
    <div className="lf" style={{ ...tile, gridColumn: '1 / -1' }}>
      <style>{`.lf-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:18px;margin-top:10px}.lf-sl{display:grid;gap:2px;margin-bottom:10px}.lf-sl label{display:flex;justify-content:space-between;font-weight:800;font-size:13px}.lf-sl input{width:100%;accent-color:#FF5722}.lf-types{display:flex;flex-wrap:wrap;gap:6px}.lf-t{display:inline-flex;align-items:center;gap:7px;border:1px solid #e7e2d8;background:#fff;border-radius:999px;padding:4px 11px 4px 5px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;color:#1A1A1A}.lf-t.on{border-color:#FF5722;background:#fff1ea}@media (max-width:860px){.lf-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div style={kick}>League pitch finder</div>
      <p style={{ ...note, marginTop: 4 }}>Choose a pitch, how fast it is, how it moves, where it goes and how it ended. It plays from behind the plate, and below it is what has happened to {season} league pitches like it.</p>

      <div className="lf-grid">
        <div>
          <div style={dt}>Pitch</div>
          <div className="lf-types" style={{ margin: '6px 0 10px' }}>
            {TYPES.map(c => <button key={c} type="button" className={`lf-t${type === c ? ' on' : ''}`} onClick={() => setType(c)}><SpinBall code={c} size={22} />{pitchLabel(c)}</button>)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Pills items={[['R', 'Right-handed pitcher'], ['L', 'Left-handed pitcher']] as ['R' | 'L', string][]} value={hand} onChange={setHand} />
            <Pills items={[['any', 'Any batter'], ['R', 'Right-handed batter'], ['L', 'Left-handed batter']] as ['any' | 'R' | 'L', string][]} value={stand} onChange={setStand} />
          </div>

          <div style={{ marginTop: 14 }}>
            {speed == null || hb == null || ivb == null ? (
              <p style={note}>{state === 'unavailable' ? 'The finder is not available yet. It needs the league_pitch_finder function in the database.' : 'Finding the typical speed and break for this pitch…'}</p>
            ) : (
              <>
                <div className="lf-sl"><label>Speed <span>{(speed - SPEED_WIN).toFixed(1)}–{(speed + SPEED_WIN).toFixed(1)} mph</span></label><input type="range" min={60} max={105} step={0.5} value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Speed" /></div>
                <div className="lf-sl"><label>Arm-side break <span>{hb > 0 ? '+' : ''}{hb} in (±{MOVE_WIN})</span></label><input type="range" min={-25} max={25} step={1} value={hb} onChange={e => setHb(Number(e.target.value))} aria-label="Arm-side break in inches" /></div>
                <div className="lf-sl"><label>Induced rise <span>{ivb > 0 ? '+' : ''}{ivb} in (±{MOVE_WIN})</span></label><input type="range" min={-25} max={25} step={1} value={ivb} onChange={e => setIvb(Number(e.target.value))} aria-label="Induced rise in inches" /></div>
              </>
            )}
          </div>

          <div style={dt}>Where it goes · click a zone</div>
          <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', maxWidth: 260, display: 'block', margin: '6px 0 0' }} role="img" aria-label="Choose the zone the pitch goes to">
            <rect width={VW} height={VH} fill="#faf8f3" />
            {ZONES.map(z => {
              const r = cellRect(z), lab = labelAt(z), on = zone === z
              return (
                <g key={z} onClick={() => setZone(on ? null : z)} style={{ cursor: 'pointer' }}>
                  <rect x={px(r.x0)} y={pz(r.z1)} width={px(r.x1) - px(r.x0)} height={pz(r.z0) - pz(r.z1)} fill={on ? mix(NEUTRAL, ORANGE, 0.9) : '#fff'} stroke={on ? '#1A1A1A' : '#cfc9ba'} strokeWidth={on ? 3 : 1} />
                  <text x={lab.x} y={lab.y + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#8a8275" style={{ pointerEvents: 'none' }}>{Number(z) <= 9 ? z : ''}</text>
                </g>
              )
            })}
          </svg>
          <p style={note}>Catcher&apos;s view, Statcast&apos;s 13 zones; the four outer boxes are chase corners. {zone ? 'Click it again to clear.' : 'Leave it clear for every zone.'}</p>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={dt}>Result · how it ended</div>
          <div style={{ marginTop: 6 }}><Pills items={[['', 'Any result'], ...RESULTS.map(r => [r.code, r.label] as [string, string])] as [string, string][]} value={res ?? ''} onChange={v => setRes((v || null) as ResultCode | null)} /></div>

          <div style={{ position: 'relative', marginTop: 12, maxWidth: 380 }}>
            {path ? (
              <>
                <Scene paths={[path]} p={p} showPlate />
                {landed && plate && (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
                    <circle cx={plate.sx} cy={plate.sy} r={15} fill={RES_COLOR[endResult as ResultCode]} fillOpacity={0.25} stroke={RES_COLOR[endResult as ResultCode]} strokeWidth={2} />
                    {endResult !== 'B' && endResult !== 'C' && <path d={`M ${plate.sx - 34} ${plate.sy + 14} Q ${plate.sx} ${plate.sy - 30} ${plate.sx + 34} ${plate.sy + 14}`} fill="none" stroke="#1A1A1A" strokeWidth={3} strokeLinecap="round" strokeOpacity={0.55} />}
                    <text x={plate.sx} y={plate.sy - 22} textAnchor="middle" fontSize={12} fontWeight={800} fill="#1A1A1A">{RESULTS.find(r => r.code === endResult)?.label}</text>
                  </svg>
                )}
              </>
            ) : (
              <div style={{ ...note, padding: 20, background: C.soft, borderRadius: 10 }}>{state === 'loading' ? 'Loading…' : total === 0 ? 'No league pitches match this selection. Widen it by moving a slider or clearing the zone.' : 'These pitches have no flight data stored.'}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <SpeedToggle slow={slow} setSlow={setSlow} />
            <button type="button" onClick={() => setRun(r => r + 1)} style={{ marginTop: 8, background: 'none', border: 0, color: C.orange, fontWeight: 800, cursor: 'pointer', font: 'inherit', fontSize: 12 }}>Replay</button>
          </div>
          {path && <p style={{ ...note, marginTop: 6 }}>{shownN.toLocaleString('en-US')} {handName} {pitchLabel(type).toLowerCase()}s {res ? `that ended as ${RESULTS.find(r => r.code === res)?.label.toLowerCase()}` : ''}: average {path.velo?.toFixed(1)} mph, {path.hb > 0 ? '+' : ''}{path.hb.toFixed(1)} in arm-side, {path.ivb > 0 ? '+' : ''}{path.ivb.toFixed(1)} in rise.</p>}
        </div>
      </div>

      <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <div style={kick}>What has happened to pitches like this</div>
        {rows == null || state === 'loading' ? <p style={note}>Counting…</p> : total === 0 ? <p style={note}>No league pitches match.</p> : small ? <div style={{ marginTop: 8 }}><SmallSample n={total} /></div> : (
          <div style={{ display: 'grid', gap: 7, marginTop: 8, maxWidth: 640 }}>
            {RESULTS.map(r => { const n = (rows.find(x => x.result === r.code)?.n ?? 0); return (
              <button key={r.code} type="button" onClick={() => setRes(res === r.code ? null : r.code)} style={{ textAlign: 'left', background: res === r.code ? '#fff1ea' : 'none', border: 0, borderRadius: 8, padding: '3px 4px', cursor: 'pointer', font: 'inherit', color: C.ink, fontFamily: SANS }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: RES_COLOR[r.code], marginRight: 6 }} />{r.label}</span><span style={{ fontWeight: 600, color: C.mute }}>{pct(n, total).toFixed(0)}% · {n.toLocaleString('en-US')}</span></div>
                <div style={{ height: 8, background: C.soft, borderRadius: 4, marginTop: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct(n, total)}%`, background: RES_COLOR[r.code] }} /></div>
              </button>
            ) })}
          </div>
        )}
        <p style={note}>{total.toLocaleString('en-US')} pitches {small && total > 0 && <>{star} </>}within ±{SPEED_WIN} mph, ±{MOVE_WIN} in of arm-side break and ±{MOVE_WIN} in of rise of your selection, {season} season as stored. The path is drawn from those pitches&apos; own average release point, speed, break and plate crossing. It shows what has happened to pitches like these, not what will happen. Click a result to play a pitch that ended that way.</p>
      </div>
    </div>
  )
}
