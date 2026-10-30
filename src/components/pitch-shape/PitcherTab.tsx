'use client'

// src/components/pitch-shape/PitcherTab.tsx
//
// The pitcher tab of the redesigned Pitch Shape Lab: choose a pitcher on the map and this opens with every pitch he throws and how each is doing against what the
// league gets from pitches shaped like it, then lets you dial a pitch (velocity, ride, run, arm angle) and see what league pitches with the changed shape have produced.
//
// This is a description, not a forecast: the change shown is what pitches with the dialled shape HAVE produced across the league, set against pitches shaped like
// his current one. It leaves out what the shape cannot show (his location, deception, sequencing, the hitters he faces), and says so. Pitches with too few league
// matches show no comparison at all.
//
// Access: the repertoire route only sends free pitch types (four-seam, sweeper) to a viewer who is not Pro; the A-versus-B change is Pro (as the sandbox's compare is).
// `isPro` is a REQUIRED prop. Bins come from /api/mlb/pitch-shape/bins, which refuses locked types server-side.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { C, Foot } from '@/components/team/ui'
import UpgradePrompt from '@/components/pro/UpgradePrompt'
import FollowIsland from '@/components/signup/FollowIsland'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import type { Repertoire, RepertoireRow } from '@/lib/pitch-shape/data'
import { fmtN, indexBins, lookup, typicalShape, PITCH_NAMES, type BinIndex, type Shape, type ShapeBin } from '@/lib/pitch-shape/model'
import { band, buildDist, changeBetween, goodness, leagueAverages, sliderRange, verdictWord, type Dist, type Metric } from '@/lib/pitch-shape/sandbox-math'
import { ABOUT_LEVEL_PTS, MIN_OWN_SWINGS, verdictOf } from './finder-math'
import { IMPACT_CONSTANTS, LARGE_EFFECT, translateChange } from '@/lib/pitch-shape/impact'
import type { Workload } from '@/lib/pitch-shape/workload'

const ORANGE_TEXT = '#B83A0E'
const R = 6
const SL: { k: keyof Shape; label: string; unit: string; d: number }[] = [
  { k: 'velo', label: 'Velocity', unit: 'mph', d: 1 }, { k: 'ivb', label: 'Ride', unit: 'in', d: 1 }, { k: 'hb', label: 'Run', unit: 'in', d: 1 }, { k: 'slot', label: 'Arm angle', unit: '°', d: 0 },
]
const pc = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
const w3 = (x: number | null) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))
const signed = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`

type Loaded = { index: BinIndex; dist: Dist; center: Shape; league: ReturnType<typeof leagueAverages> } | null
const binsCache = new Map<string, Loaded>()

async function loadType(type: string, hand: 'R' | 'L'): Promise<Loaded> {
  const key = `${type}|${hand}`
  if (binsCache.has(key)) return binsCache.get(key) ?? null
  try {
    const res = await fetch(`/api/mlb/pitch-shape/bins?type=${type}&hand=${hand}`)
    if (!res.ok) { binsCache.set(key, null); return null }
    const bins = ((await res.json()) as { bins?: ShapeBin[] }).bins ?? []
    const center = bins.length ? typicalShape(bins) : null
    const out: Loaded = center ? { index: indexBins(bins), dist: buildDist(bins), center, league: leagueAverages(bins) } : null
    binsCache.set(key, out)
    return out
  } catch (e) {
    console.error('[PitcherTab] bins fetch failed:', e instanceof Error ? e.message : e)
    return null
  }
}

export default function PitcherTab({ pitcherId, season, isPro, onClose }: { pitcherId: number; season: number; isPro: boolean; onClose: () => void }) {
  const [rep, setRep] = useState<Repertoire | null | undefined>(undefined)   // undefined = loading
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [B, setB] = useState<Shape | null>(null)
  const [workload, setWorkload] = useState<Workload | null>(null)

  useEffect(() => {
    setRep(undefined); setSel(null); setB(null)
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher?id=${pitcherId}&season=${season}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { repertoire: Repertoire | null; workload?: Workload | null }) => { if (live) { setRep(j.repertoire); setWorkload(j.workload ?? null); setSel(j.repertoire?.rows[0]?.pitchType ?? null) } })
      .catch(e => { console.error('[PitcherTab] repertoire fetch failed:', e instanceof Error ? e.message : e); if (live) setRep(null) })
    return () => { live = false }
  }, [pitcherId, season])

  useEffect(() => {
    if (!rep) return
    let live = true
    for (const r of rep.rows) void loadType(r.pitchType, rep.hand).then(l => { if (live) setLoaded(p => ({ ...p, [r.pitchType]: l })) })
    return () => { live = false }
  }, [rep])

  const row: RepertoireRow | null = rep?.rows.find(r => r.pitchType === sel) ?? null
  const L = sel ? loaded[sel] ?? null : null
  const A: Shape | null = row ? { velo: row.velo, ivb: row.ivb, hb: row.hb, slot: row.slot } : null
  useEffect(() => { setB(A) }, [sel, rep]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (rep?.rows ?? []).map(r => {
    const l = loaded[r.pitchType]
    const lk = l ? lookup(l.index, { velo: r.velo, ivb: r.ivb, hb: r.hb, slot: r.slot }) : null
    const own = r.nSwings >= MIN_OWN_SWINGS ? r.nWhiffs / r.nSwings : null
    return { r, lk, own, ...verdictOf(own, lk?.whiff.value ?? null) }
  }), [rep, loaded])

  if (rep === undefined) return <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Loading his pitches…</div>
  if (rep === null) return (
    <div>
      <button type="button" onClick={onClose} style={backBtn}>← Back to the league map</button>
      <p style={{ fontSize: 14, color: '#5b5347' }}>No pitch data for this pitcher in {season}, or it could not load. Try again later.</p>
    </div>
  )

  const LA = L && A ? lookup(L.index, A) : null
  const LB = L && B ? lookup(L.index, B) : null
  const canCompare = isPro
  const change = LA && LB ? changeBetween(LA, LB) : null
  const moved = A && B ? (['velo', 'ivb', 'hb', 'slot'] as (keyof Shape)[]).filter(k => Math.abs(A[k] - B[k]) > (k === 'slot' ? 0.9 : 0.09)) : []
  const wChange = change?.find(c => c.metric === 'whiff') ?? null
  const phrase = B && A ? moved.map(k => `${signed(B[k] - A[k], k === 'slot' ? 0 : 1)}${k === 'velo' ? ' mph' : k === 'slot' ? '°' : ' in'} of ${k === 'velo' ? 'velocity' : k === 'ivb' ? 'ride' : k === 'hb' ? 'run' : 'arm angle'}`).join(' and ') : ''
  const xwChange = change?.find(c => c.metric === 'xw') ?? null
  const impact = row && wChange ? translateChange({ whiffDelta: wChange.delta, xwobaDelta: xwChange?.delta ?? null, swings: row.nSwings, bbe: row.diag.nBbe, ip: workload?.ip ?? null, bf: workload?.bf ?? null }) : null
  const g = (k: Metric, v: number | null) => (v == null || !L ? null : goodness(L.dist, k, v))

  return (
    <div className="pt-root">
      <style>{'.pt-root .pt-grid{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:18px;align-items:start}@media(max-width:900px){.pt-root .pt-grid{grid-template-columns:1fr}}.pt-root .pt-rg{position:relative;height:34px;margin-top:4px}.pt-root .pt-rg input{position:absolute;left:0;right:0;top:0;width:100%;height:34px;margin:0;background:none;-webkit-appearance:none;appearance:none}.pt-root .pt-rg input::-webkit-slider-runnable-track{height:8px;background:transparent}.pt-root .pt-rg input::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#1A1A1A;border:3px solid #fff;box-shadow:0 0 0 1px #1A1A1A;margin-top:-8px}.pt-root .pt-out input::-webkit-slider-thumb{background:#FF5722;box-shadow:0 0 0 1px #FF5722}.pt-root .pt-rg input::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#1A1A1A;border:3px solid #fff}.pt-root .pt-out .pt-rg input::-moz-range-thumb{background:#FF5722}'}</style>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: `1px solid ${C.line}`, borderRadius: R, padding: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={headshotCutoutUrl(rep.pitcherId, 320)} alt="" width={84} height={84} style={{ width: 84, height: 84, flex: 'none', objectFit: 'contain', objectPosition: 'center bottom' }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="pv-k" style={{ color: ORANGE_TEXT }}>Pitcher · {season}</div>
          <Link href={`/mlb/players/${rep.pitcherId}`} style={{ fontWeight: 800, fontSize: 'clamp(24px,3.4vw,34px)', letterSpacing: '-.02em', color: C.ink, textDecoration: 'none' }}>{rep.name}</Link>
          <div style={{ fontSize: 13.5, color: '#5b5347' }}>{rep.teamAbbr} · {rep.hand === 'L' ? 'left' : 'right'}-handed · {rep.rows.length} pitch type{rep.rows.length === 1 ? '' : 's'}{rep.lockedTypes > 0 ? ` shown, ${rep.lockedTypes} more with Pro` : ''}</div>
        </div>
        <div style={{ color: C.ink }}><FollowIsland kind="player" refId={String(rep.pitcherId)} name={rep.name} /></div>
        <button type="button" onClick={onClose} style={backBtn}>← Back to the league map</button>
      </div>

      <h3 style={{ margin: '18px 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em' }}>All his pitches</h3>
      <p style={{ fontSize: 13.5, color: '#5b5347', margin: '0 0 8px', maxWidth: 780, lineHeight: 1.5 }}>For each pitch: how it moves, the misses it gets, and what the league gets from pitches shaped like it. Ahead means more misses than the shape usually gets, behind fewer. Choose a pitch to look closer and dial it in.</p>
      {rep.rows.length === 0 ? <p style={{ fontSize: 14, color: '#5b5347' }}>He throws no free pitch type in the data. {rep.lockedTypes > 0 ? 'Pro opens the rest.' : ''}</p> : (
        <div style={{ overflowX: 'auto', background: '#fff', border: `1px solid ${C.line}`, borderRadius: R }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute }}>
                {['Pitch', 'Thrown', 'Velo', 'Ride', 'Run', 'Whiffs / swing', 'His shape gets', 'Gap', 'Reading'].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '9px 10px', fontWeight: 800, borderBottom: `1px solid ${C.ink}`, whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, lk, own, gapPts, verdict }) => (
                <tr key={r.pitchType} onClick={() => setSel(r.pitchType)} style={{ cursor: 'pointer', background: r.pitchType === sel ? '#fff3ee' : undefined, borderBottom: `1px solid ${C.soft}` }}>
                  <td style={{ padding: '0 10px', fontWeight: 800 }}><button type="button" aria-pressed={r.pitchType === sel} onClick={() => setSel(r.pitchType)} style={{ minHeight: 44, background: 'none', border: 0, padding: 0, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: r.pitchType === sel ? ORANGE_TEXT : C.ink }}>{PITCH_NAMES[r.pitchType] ?? r.pitchType}</button></td>
                  <td style={cell}>{r.nPitches.toLocaleString()}</td><td style={cell}>{r.velo.toFixed(1)}</td><td style={cell}>{r.ivb.toFixed(1)}</td><td style={cell}>{r.hb.toFixed(1)}</td>
                  <td style={{ ...cell, fontWeight: 800 }}>{pc(own)}</td>
                  <td style={cell}>{lk ? pc(lk.whiff.value) : '…'}</td>
                  <td style={{ ...cell, fontWeight: 800 }}>{gapPts == null ? '—' : `${signed(gapPts)} pts`}</td>
                  <td style={cell}>{verdict == null ? <span style={{ color: C.mute, fontSize: 12 }}>{own == null ? `under ${MIN_OWN_SWINGS} swings` : '—'}</span> : <span style={{ fontSize: 10.5, letterSpacing: '.08em', fontWeight: 800, padding: '3px 7px', borderRadius: 4, background: verdict === 'ahead' ? '#FFE4D6' : verdict === 'behind' ? '#E3EAF2' : C.soft, color: verdict === 'ahead' ? ORANGE_TEXT : C.ink }}>{verdict === 'ahead' ? 'AHEAD' : verdict === 'behind' ? 'BEHIND' : 'LEVEL'}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rep.lockedTypes > 0 && !isPro && <div style={{ marginTop: 10 }}><UpgradePrompt source="pitch_shape" /></div>}

      {row && A && (
        <>
          <h3 style={{ margin: '24px 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em' }}>His {PITCH_NAMES[row.pitchType]?.toLowerCase()}: what pitches shaped like it have produced</h3>
          {!L || !LA ? <p style={{ fontSize: 13.5, color: C.mute }}>Loading the league comparison…</p> : LA.whiff.value == null ? (
            <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: R, padding: 14, color: '#5b5347', fontSize: 14 }}><b style={{ color: C.ink }}>Almost no one throws a pitch shaped like this.</b> Only {fmtN(LA.swings)} league swings are near it (needs 150), so there is nothing to compare his results with. We do not estimate.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {([['whiff', 'Whiffs per swing', pc, LA.whiff.value, row.nSwings >= MIN_OWN_SWINGS ? row.nWhiffs / row.nSwings : null], ['csw', 'Called + swinging strikes', pc, LA.csw.value, null], ['gb', 'Ground balls', pc, LA.gb.value, null], ['xw', 'Damage on contact (xwOBAcon)', w3, LA.xwobaCon.value, row.diag.xwobaCon]] as [Metric, string, (x: number | null) => string, number | null, number | null][]).map(([k, label, f, shape, his]) => {
                const gd = g(k, shape)
                return (
                  <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: R, padding: 12, background: C.cream }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0' }}><span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>{f(shape)}</span><span style={{ fontSize: 12, color: C.mute }}>shaped like his</span></div>
                    {gd != null && <div style={{ fontSize: 12.5, color: '#5b5347' }}>{verdictWord(gd)[0].toUpperCase() + verdictWord(gd).slice(1)} among the league’s {PITCH_NAMES[row.pitchType]?.toLowerCase()} shapes</div>}
                    <div style={{ fontSize: 13, marginTop: 6 }}>His own: <b>{f(his)}</b>{his != null && shape != null ? <span style={{ color: C.mute }}> ({k === 'xw' ? signed((his - shape) * 1000, 0) + ' pts of xwOBA' : signed((his - shape) * 100) + ' pts'})</span> : null}</div>
                  </div>
                )
              })}
            </div>
          )}

          <h3 style={{ margin: '24px 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em' }}>Dial in his {PITCH_NAMES[row.pitchType]?.toLowerCase()}</h3>
          <p style={{ fontSize: 13.5, color: '#5b5347', margin: '0 0 10px', maxWidth: 800, lineHeight: 1.5 }}>Change one thing and see what league pitches with that shape have produced, against pitches shaped like his now. It describes what has happened to other pitches. It leaves out his location, deception, sequencing and the hitters he faces, so it is not a forecast of what he would get.</p>
          {L && B && (
            <div className="pt-grid">
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: R, padding: 16 }}>
                <div className="pv-k">Dial it in</div>
                {SL.map(s => {
                  const [lo, hi] = sliderRange(s.k, L.center)
                  const b = band(L.index, B, s.k, L.center), out = !b || B[s.k] < b[0] - 1e-9 || B[s.k] > b[1] + 1e-9
                  const lo2 = Math.min(lo, A[s.k] - 1), hi2 = Math.max(hi, A[s.k] + 1)
                  return (
                    <div key={s.k} className={out ? 'pt-out' : ''} style={{ marginTop: 14 }}>
                      <label htmlFor={`pt-${s.k}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, letterSpacing: '.12em', fontWeight: 800, textTransform: 'uppercase', color: C.mute }}>{s.label}<span><span style={{ fontSize: 12, letterSpacing: 0, color: C.mute, fontWeight: 600 }}>now {A[s.k].toFixed(s.d)} · </span><b style={{ fontSize: 20, letterSpacing: 0, color: C.ink }}>{B[s.k].toFixed(s.d)} {s.unit}</b></span></label>
                      <div className="pt-rg">
                        <div style={{ position: 'absolute', top: 13, left: 0, right: 0, height: 8, background: C.soft, borderRadius: 4 }} />
                        {b && <div style={{ position: 'absolute', top: 13, height: 8, background: '#FFB48A', borderRadius: 4, left: `${((b[0] - lo2) / (hi2 - lo2)) * 100}%`, width: `${Math.max(1, ((b[1] - b[0]) / (hi2 - lo2)) * 100)}%` }} />}
                        <span style={{ position: 'absolute', top: 6, width: 2, height: 22, background: C.ink, opacity: 0.45, left: `${((A[s.k] - lo2) / (hi2 - lo2)) * 100}%` }} aria-hidden />
                        <input id={`pt-${s.k}`} type="range" min={lo2} max={hi2} step={s.k === 'slot' ? 1 : 0.1} value={B[s.k]} onChange={e => setB({ ...B, [s.k]: Number(e.target.value) })} />
                      </div>
                      <div style={{ fontSize: 12, color: C.mute }}>{b ? `Shaded: ${b[0].toFixed(s.d)}–${b[1].toFixed(s.d)} ${s.unit}` : 'No real pitches near here'}{out && b && <span style={{ color: ORANGE_TEXT, fontWeight: 700 }}> · outside where real pitches live</span>}</div>
                    </div>
                  )
                })}
                <button type="button" onClick={() => setB(A)} style={{ marginTop: 16, minHeight: 44, padding: '0 16px', border: `1.5px solid ${C.ink}`, background: '#fff', borderRadius: 4, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Back to his pitch</button>
                <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8 }}>The faint line on each slider is where his pitch is now.</div>
              </div>

              <div style={{ border: `1px solid ${C.line}`, borderRadius: R, padding: 16, background: '#fff' }}>
                {moved.length === 0 ? <p style={{ margin: 0, fontSize: 15, color: '#3a352c', lineHeight: 1.5 }}>Move a slider to see what changes. At his current shape, {PITCH_NAMES[row.pitchType]?.toLowerCase()}s like his have produced <b>{pc(LA?.whiff.value ?? null)}</b> whiffs per swing across the league.</p> : !LB || LB.whiff.value == null || !LA || LA.whiff.value == null ? (
                  <div><b style={{ fontSize: 20 }}>Almost no one throws this</b><p style={{ margin: '6px 0 0', fontSize: 14, color: '#5b5347', lineHeight: 1.5 }}>Only {fmtN(LB?.swings ?? 0)} league swings are near that shape (needs 150), so there is no comparison to show. We do not estimate. Try a smaller change, or stay inside the shaded part of each slider.</p></div>
                ) : (
                  <>
                    <div className="pv-k" style={{ color: ORANGE_TEXT }}>Adding {phrase}</div>
                    <h4 style={{ margin: '8px 0 12px', fontSize: 'clamp(20px,2.6vw,26px)', lineHeight: 1.25, fontWeight: 800, letterSpacing: '-.01em' }}>
                      League pitches with that shape have got <b style={{ color: ORANGE_TEXT }}>{pc(LB.whiff.value)}</b> whiffs per swing, against <b style={{ color: ORANGE_TEXT }}>{pc(LA.whiff.value)}</b> for pitches shaped like his now{wChange?.delta != null ? <> ({signed(wChange.delta * 100)} points)</> : null}.
                    </h4>
                    {canCompare ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                        <thead><tr style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute }}><th style={{ textAlign: 'left', fontWeight: 800 }} /><th style={{ textAlign: 'right', fontWeight: 800 }}>His shape now</th><th style={{ textAlign: 'right', fontWeight: 800 }}>Dialled shape</th><th style={{ textAlign: 'right', fontWeight: 800 }}>Change</th></tr></thead>
                        <tbody>{change?.map(c => (
                          <tr key={c.metric} style={{ borderTop: `1px solid ${C.soft}` }}>
                            <td style={{ padding: '7px 0' }}>{c.label}</td>
                            <td style={{ textAlign: 'right' }}>{c.metric === 'xw' ? w3(c.from) : pc(c.from)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{c.metric === 'xw' ? w3(c.to) : pc(c.to)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: c.delta == null ? C.mute : (c.metric === 'xw' ? c.delta < 0 : c.delta > 0) ? '#1D7A56' : '#B83A0E' }}>{c.delta == null ? '—' : c.metric === 'xw' ? `${signed(c.delta * 1000, 0)} pts` : `${signed(c.delta * 100)} pts`}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    ) : <div><p style={{ fontSize: 13.5, color: '#5b5347', margin: '0 0 8px' }}>Pro shows all four measures for the change, side by side, and what it is worth in strikeouts, FIP and runs.</p><UpgradePrompt source="pitch_shape" /></div>}
                    {canCompare && impact && (
                      <div style={{ marginTop: 14, background: '#FFF8F4', border: '1px solid #f3dccf', borderRadius: R, padding: '12px 14px' }}>
                        <div className="pv-k" style={{ color: ORANGE_TEXT }}>What that is worth, by the arithmetic</div>
                        {impact.totalPerNine != null ? (
                          <p style={{ margin: '6px 0 8px', fontSize: 16.5, lineHeight: 1.4, fontWeight: 800, letterSpacing: '-.01em' }}>
                            If his {PITCH_NAMES[row.pitchType]?.toLowerCase()} got what league pitches with that shape get, the change is worth about <span style={{ color: ORANGE_TEXT }}>{signed(impact.totalPerNine, 2)} runs per nine</span> over his current workload{workload ? ` (${workload.ip.toFixed(0)} innings)` : ''}. Lower is better for the pitcher.
                          </p>
                        ) : <p style={{ margin: '6px 0 8px', fontSize: 14, color: '#5b5347' }}>Not enough of his own results on this pitch, or no innings, to turn the change into runs. The league comparison above still holds.</p>}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                          <tbody>
                            {([
                              ['Extra whiffs on his swings', impact.extraWhiffs == null ? '—' : `${signed(impact.extraWhiffs)} on ${row.nSwings} swings`],
                              ['Extra strikeouts (0.53 per whiff)', impact.extraK == null ? '—' : `${signed(impact.extraK)}${impact.kPctPts != null ? ` · K% ${signed(impact.kPctPts)} pts` : ''}`],
                              ['FIP, strikeout part', impact.fipDelta == null ? '—' : signed(impact.fipDelta, 2)],
                              ['Contact quality, as runs per nine', impact.contactPerNine == null ? '—' : `${signed(impact.contactPerNine, 2)} (before defense and luck)`],
                              ['Together, runs per nine', impact.totalPerNine == null ? '—' : signed(impact.totalPerNine, 2)],
                            ] as [string, string][]).map(([k, v], i) => (
                              <tr key={k} style={{ borderTop: i ? `1px solid #f3dccf` : undefined }}><td style={{ padding: '6px 0' }}>{k}</td><td style={{ textAlign: 'right', fontWeight: i === 4 ? 800 : 700 }}>{v}</td></tr>
                            ))}
                          </tbody>
                        </table>
                        {impact.thin.length > 0 && <p style={{ fontSize: 12, color: C.mute, margin: '8px 0 0' }}>Left out: {impact.thin.join('; ')}.</p>}
                        {impact.totalPerNine != null && Math.abs(impact.totalPerNine) >= LARGE_EFFECT && <p style={{ fontSize: 12.5, color: ORANGE_TEXT, margin: '8px 0 0', fontWeight: 700 }}>A change this large moves the pitch a long way from where it is now. Treat it with extra care.</p>}
                        <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.5, margin: '8px 0 0' }}>
                          Arithmetic, not a forecast. It assumes his pitch would get what league pitches of that shape get, and leaves out his location, deception, sequencing and defense. Whiffs become strikeouts at {IMPACT_CONSTANTS.kPerWhiff} per swinging strike (2026, 429 pitchers); FIP takes 2 ÷ innings off for each strikeout (FanGraphs); contact quality becomes runs at a wOBA scale of {IMPACT_CONSTANTS.wobaScale}. {workload?.era != null ? `His ERA this season is ${workload.era.toFixed(2)}; it also moves with defense and sequencing, so no ERA claim is made. ` : ''}Constants as of {IMPACT_CONSTANTS.asOf}.
                        </p>
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: C.mute, margin: '10px 0 0', lineHeight: 1.5 }}>{fmtN(LB.swings)} league swings near the dialled shape, {fmtN(LA.swings)} near his current one{LB.reach === 2 ? '; the dialled shape is thin, widened to ±2 bins' : ''}. Green means a change that helps the pitcher on that measure; lower damage on contact is better. He currently gets {pc(row.nSwings >= MIN_OWN_SWINGS ? row.nWhiffs / row.nSwings : null)} from this pitch, so a move in the shape would also have to carry over his location and deception.</p>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
      <Foot>{season} regular season. “Shaped like his” means the same pitch type and hand within one bin on velocity, ride, run and arm angle (widened to two when thin), with the sample gates shown on the page. {ABOUT_LEVEL_PTS}-point rule for “level”. A description of what has happened, not a prediction.</Foot>
    </div>
  )
}

const cell: React.CSSProperties = { textAlign: 'right', padding: '0 10px', whiteSpace: 'nowrap' }
const backBtn: React.CSSProperties = { minHeight: 44, padding: '0 14px', borderRadius: 4, border: '1.5px solid #1A1A1A', background: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }
