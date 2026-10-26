'use client'

// src/components/pitch-shape/ShapeSandbox.tsx
//
// /mlb/tools/shape-sandbox (mockups/pitch-shape-lab.html, right page). Dial in a pitch shape and see
// what pitches like it have done — "Pitches shaped like this have produced X% whiffs per swing
// (n = …)", a description of what happened, not a forecast.
//
// Free: four-seam + sweeper, live readout and map. Pro: every other pitch type, outcome profile,
// slot context and A-vs-B compare. `isPro` is a REQUIRED prop. League bins arrive per pitch type /
// hand through `loadBins` (an API route in the app, an in-memory generator in the dev preview), so a
// locked pitch type's rows are never requested, let alone shipped.

import { useEffect, useMemo, useRef, useState } from 'react'
import { C, SANS, Card, Foot } from '@/components/team/ui'
import {
  FREE_SANDBOX_TYPES, GATE, PITCH_NAMES, fmtN, indexBins, leagueAverages, lookup, pct, slotStrip, typicalShape, woba,
  type Hand, type LeagueAverages, type PitcherHit, type Shape, type ShapeBin, type ShapeLookup,
} from '@/lib/pitch-shape/model'
import MovementMap from './MovementMap'
import { EmptyBox, LockedCard, MapLegend, OutcomeBars, SHAPE_CSS, SlotStrip, StatusBadge } from './parts'

export type SearchPitchers = (q: string) => Promise<PitcherHit[]>
export type LoadBins = (pitchType: string, hand: Hand) => Promise<ShapeBin[] | null>

const SLIDERS: { k: keyof Shape; label: string; unit: string; digits: number }[] = [
  { k: 'velo', label: 'Velocity', unit: ' mph', digits: 1 },
  { k: 'ivb', label: 'Induced vert. break', unit: ' in', digits: 1 },
  { k: 'hb', label: 'Horizontal break (arm-side +)', unit: ' in', digits: 1 },
  { k: 'slot', label: 'Arm angle', unit: '°', digits: 0 },
]
const sliderRange = (k: keyof Shape, c: Shape): [number, number] =>
  k === 'velo' ? [c.velo - 8, c.velo + 8] : k === 'slot' ? [10, 90] : [c[k] - 18, c[k] + 18]

const lblStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.1em', fontWeight: 700, textTransform: 'uppercase', color: C.mute, marginTop: 14 }

function Readout({ who, compare, hand, pitchType, L, league }: { who: 'A' | 'B'; compare: boolean; hand: Hand; pitchType: string; L: ShapeLookup; league: LeagueAverages }) {
  const lc = (PITCH_NAMES[pitchType] ?? pitchType).toLowerCase()
  const mini = (n: string, v: number | null, f: (x: number | null) => string, avg: number | null) => (
    <div key={n}><div style={{ fontSize: 10, letterSpacing: '.1em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{n}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{f(v)}</div><div style={{ fontSize: 11, color: C.mute }}>league {f(avg)}</div></div>
  )
  return (
    <div style={{ border: `1px solid ${C.line}`, borderTop: `4px solid ${who === 'A' ? C.orange : C.ink}`, borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>
        <span>{compare ? `Shape ${who}` : 'This shape'}</span><StatusBadge reach={L.reach} />
      </div>
      {L.whiff.value == null
        ? <div style={{ margin: '8px 0' }}><EmptyBox title="Not enough pitches like this">Only {fmtN(L.swings)} swings in the ±2-bin neighborhood (needs {GATE.swings}). We don’t estimate — try a shape closer to the middle of the map.</EmptyBox></div>
        : <div style={{ fontSize: 14, color: '#5b5347', margin: '6px 0 8px' }}>{hand === 'L' ? 'Left' : 'Right'}-handed {lc}s shaped like this have produced <b style={{ color: C.ink }}>{pct(L.whiff.value)} whiffs per swing</b> (n = {fmtN(L.swings)} swings).</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {mini('Whiff%', L.whiff.value, pct, league.whiff)}{mini('CSW%', L.csw.value, pct, league.csw)}{mini('GB%', L.gb.value, pct, league.gb)}{mini('xwOBAcon', L.xwobaCon.value, woba, league.xwobaCon)}
      </div>
      <Foot>{fmtN(L.swings)} swings · {fmtN(L.pitches)} pitches · {fmtN(L.bbe)} batted balls in the neighborhood</Foot>
    </div>
  )
}

export default function ShapeSandbox({ isPro, lookLeft = false, pitchTypes, loadBins, searchPitchers }: {
  isPro: boolean
  lookLeft?: boolean
  /** pitch types the league table has rows for (FF first); the UI only offers these */
  pitchTypes: string[]
  loadBins: LoadBins
  searchPitchers: SearchPitchers
}) {
  const isFree = (t: string) => (FREE_SANDBOX_TYPES as readonly string[]).includes(t)
  const locked = (t: string) => !isPro && !lookLeft && !isFree(t)

  const [type, setType] = useState(pitchTypes[0] ?? 'FF')
  const [hand, setHand] = useState<Hand>('R')
  const [loaded, setLoaded] = useState<{ key: string; bins: ShapeBin[] | null } | null>(null)
  const [A, setA] = useState<Shape | null>(null)
  const [B, setB] = useState<Shape | null>(null)
  const [who, setWho] = useState<'A' | 'B'>('A')
  const [cmp, setCmp] = useState(false)
  // A pitcher the user chose: his shape is applied once the bins for his pitch type + hand arrive
  // (otherwise the load would reset the sliders to the league's typical shape).
  const pending = useRef<Shape | null>(null)
  const [from, setFrom] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PitcherHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      setSearching(true)
      searchPitchers(term).then(r => { if (!cancelled) { setHits(r); setSearching(false) } })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, searchPitchers])

  const choose = (h: PitcherHit, pitchType: string, shape: Shape) => {
    pending.current = shape
    setFrom(`${h.name} · ${PITCH_NAMES[pitchType] ?? pitchType}`)
    setCmp(false); setWho('A')
    if (pitchType === type && h.hand === hand) { setA(shape); pending.current = null } else { setType(pitchType); setHand(h.hand) }
    setQ(''); setHits(null)
  }

  // Fetch league bins for the chosen type + hand (never for a locked type). Loading / failed are
  // derived from whether the last response matches the current choice, not set inside the effect.
  const key = `${type}|${hand}`
  useEffect(() => {
    if (!isPro && !lookLeft && !(FREE_SANDBOX_TYPES as readonly string[]).includes(type)) return
    let cancelled = false
    loadBins(type, hand).then(rows => {
      if (cancelled) return
      const ok = rows && rows.length > 0 ? rows : null
      setLoaded({ key, bins: ok })
      const t = ok ? typicalShape(ok) : null
      const start = pending.current ?? t
      pending.current = null
      if (start) { setA(start); setB({ ...start, ivb: start.ivb + 2, hb: start.hb + 3 }) }
    }).catch(() => { if (!cancelled) setLoaded({ key, bins: null }) })
    return () => { cancelled = true }
  }, [type, hand, key, isPro, loadBins])
  const bins = loaded?.key === key ? loaded.bins : null
  const state: 'loading' | 'ready' | 'failed' = loaded?.key !== key ? 'loading' : bins ? 'ready' : 'failed'

  const index = useMemo(() => (bins ? indexBins(bins) : null), [bins])
  const league = useMemo(() => (bins ? leagueAverages(bins) : null), [bins])
  const center = useMemo(() => (bins ? typicalShape(bins) : null), [bins])

  const cur = who === 'A' ? A : B
  const setCur = (s: Shape) => (who === 'A' ? setA(s) : setB(s))
  const LA = index && A ? lookup(index, A) : null
  const LB = index && B && cmp ? lookup(index, B) : null
  const markers = [
    ...(A ? [{ hb: A.hb, ivb: A.ivb, color: C.orange, label: cmp ? 'A' : '' }] : []),
    ...(cmp && B ? [{ hb: B.hb, ivb: B.ivb, color: C.ink, label: 'B' }] : []),
  ]
  const lc = (PITCH_NAMES[type] ?? type).toLowerCase()

  return (
    <div className="ps-sbx">
      <style>{SHAPE_CSS}</style>

      <Card title="Build a pitch" style={{ alignSelf: 'start' }}>
        <div style={lblStyle}>Pitch type</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {pitchTypes.map(t => (
            <button key={t} type="button" className={`ps-chip${t === type ? ' on' : ''}`} style={{ fontFamily: SANS, padding: '5px 11px', opacity: locked(t) ? 0.75 : 1 }} onClick={() => { setType(t); if (!isPro && !isFree(t)) { setCmp(false) } }}>
              {PITCH_NAMES[t] ?? t}{locked(t) && <span style={{ marginLeft: 6, background: C.yellow, color: C.ink, fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', padding: '1px 5px', borderRadius: 4 }}>PRO</span>}
            </button>
          ))}
        </div>

        <div style={lblStyle}>Throws</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {(['R', 'L'] as Hand[]).map(h => <button key={h} type="button" className={`ps-chip${h === hand ? ' on' : ''}`} style={{ fontFamily: SANS, padding: '5px 11px' }} onClick={() => setHand(h)}>{h === 'R' ? 'Right' : 'Left'}</button>)}
        </div>

        <label htmlFor="ps-pitcher" style={lblStyle}>Use a real pitcher</label>
        <input id="ps-pitcher" className="ps-select" type="search" autoComplete="off" placeholder="Search a pitcher…" value={q} onChange={e => setQ(e.target.value)} style={{ marginTop: 6 }} />
        {q.trim().length >= 2 && (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, marginTop: 6, background: '#fff', maxHeight: 280, overflowY: 'auto' }}>
            {searching && !hits && <div style={{ padding: 10, fontSize: 12, color: C.mute }}>Searching…</div>}
            {hits && hits.length === 0 && <div style={{ padding: 10, fontSize: 12, color: C.mute }}>No pitcher found{!isPro ? ' (free covers four-seam and sweeper)' : ''}.</div>}
            {hits?.map(h => (
              <div key={h.id} style={{ padding: '8px 10px', borderTop: `1px solid ${C.soft}` }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{h.name} <span style={{ color: C.mute, fontWeight: 500 }}>· {h.team} · {h.hand}HP · {h.season}</span></div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                  {h.pitches.map(p => (
                    <button key={p.pitchType} type="button" className="ps-chip" style={{ fontFamily: SANS, padding: '3px 9px', fontSize: 12 }} onClick={() => choose(h, p.pitchType, p.shape)}>
                      {PITCH_NAMES[p.pitchType] ?? p.pitchType}<small style={{ opacity: 0.7, marginLeft: 4, fontWeight: 500 }}>{p.shape.velo.toFixed(1)}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {from && <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Showing <b style={{ color: C.ink }}>{from}</b> (his average shape this season). Move a slider to change it.</div>}

        {cur && center && SLIDERS.map(s => {
          const [lo, hi] = sliderRange(s.k, center)
          return (
            <div key={s.k}>
              <label htmlFor={`ps-${s.k}`} style={lblStyle}>{s.label}<b style={{ color: C.ink, fontSize: 14, letterSpacing: 0 }}>{cur[s.k].toFixed(s.digits)}{s.unit}</b></label>
              <input id={`ps-${s.k}`} className="ps-range" type="range" min={lo} max={hi} step={s.k === 'slot' ? 1 : 0.1} value={cur[s.k]} onChange={e => setCur({ ...cur, [s.k]: Number(e.target.value) })} />
            </div>
          )
        })}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, marginTop: 16, opacity: isPro ? 1 : 0.6 }}>
          <input type="checkbox" checked={cmp} disabled={!isPro} onChange={e => { setCmp(e.target.checked); setWho('A') }} />
          Compare two shapes (A vs B){!isPro && <span style={{ background: C.yellow, color: C.ink, fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', padding: '1px 5px', borderRadius: 4 }}>PRO</span>}
        </label>
        {cmp && (
          <>
            <Foot>Sliders edit shape <b>{who}</b>. Choose the other chip to move the second shape.</Foot>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {(['A', 'B'] as const).map(w => <button key={w} type="button" className={`ps-chip${w === who ? ' on' : ''}`} style={{ fontFamily: SANS, padding: '5px 11px' }} onClick={() => setWho(w)}>Edit {w}</button>)}
            </div>
          </>
        )}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {locked(type) ? (
          <LockedCard
            title={`${PITCH_NAMES[type] ?? type} shapes`}
            note="Free covers four-seam fastballs and sweepers. Pro opens every pitch type."
            features={['Sinker, slider, changeup, curveball and cutter neighborhoods', 'Compare two shapes side by side', 'Slot context and the full outcome profile']}
          />
        ) : state === 'loading' ? (
          <Card><p style={{ margin: 0, textAlign: 'center', color: C.faint, fontSize: 13, padding: '24px 0' }}>Loading league shapes…</p></Card>
        ) : state === 'failed' || !bins || !index || !league || !LA || !A ? (
          <Card><EmptyBox title="No league sample for this pitch yet">The shape table has no rows for {lc}s thrown {hand === 'R' ? 'right' : 'left'}-handed. We don’t estimate — choose another pitch type or hand.</EmptyBox></Card>
        ) : (
          <>
            <Card title="Live readout">
              <div style={{ display: 'grid', gridTemplateColumns: cmp ? '1fr 1fr' : '1fr', gap: 12 }}>
                <Readout who="A" compare={cmp} hand={hand} pitchType={type} L={LA} league={league} />
                {LB && <Readout who="B" compare hand={hand} pitchType={type} L={LB} league={league} />}
              </div>
            </Card>
            <div className="ps-grid2">
              <Card title="Where it sits">
                <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 12px' }}>League outcome space for this pitch type. Your shape is the crosshair.</p>
                <MovementMap bins={bins} markers={markers} ariaLabel="Sandbox movement map" />
                <MapLegend withPitcher={false} />
              </Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                {isPro ? (
                  <>
                    <Card title="Outcome profile">
                      <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 12px' }}>Neighborhood vs the league average for this pitch type.</p>
                      {LB ? (
                        <div className="ps-grid2e">
                          <div><b style={{ fontSize: 11, color: C.orange }}>A</b><OutcomeBars look={LA} league={league} /></div>
                          <div><b style={{ fontSize: 11 }}>B</b><OutcomeBars look={LB} league={league} /></div>
                        </div>
                      ) : <OutcomeBars look={LA} league={league} />}
                    </Card>
                    <Card title="Same shape, other arm slots">
                      <p style={{ color: '#5b5347', fontSize: 13, margin: '0 0 12px' }}>Whiff% for this velocity / IVB / HB at each arm-angle band.</p>
                      <SlotStrip reads={slotStrip(index, A)} />
                    </Card>
                  </>
                ) : (
                  <LockedCard title="Outcome profile and slot context" features={['Whiff%, CSW%, GB% and xwOBA on contact for the neighborhood', 'The same shape at every arm-angle band', 'Compare two shapes side by side']} />
                )}
              </div>
            </div>
          </>
        )}
        <Foot>Neighborhood = ±1 bin in velocity, IVB and HB (widened to ±2 when thin), same pitch type, hand and arm-slot band. Gates: {GATE.swings} swings for whiff%, {GATE.pitches} pitches for CSW%, {GATE.bbe} batted balls for xwOBA on contact. League sample per the shape table.</Foot>
      </div>
    </div>
  )
}
