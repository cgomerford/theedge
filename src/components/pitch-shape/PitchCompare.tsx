'use client'

// src/components/pitch-shape/PitchCompare.tsx
//
// "How does this compare vs other [sinkers]": him and three pitchers whose version of the pitch is most alike
// (closest teammate first, then the league), each pitch animated side by side, then what the results say:
// who gets more swings, whose calls were borderline, and which pitch tends to set the pitch up.
// Descriptions of what already happened, with the sample behind every number. Gold marks the standout in a row.
// `isPro` is a REQUIRED prop: the lab route is Pro-gated on the server and this holds no gating of its own.

import { useEffect, useMemo, useRef, useState } from 'react'
import { C, Empty, Foot } from '@/components/team/ui'
import { PITCH_NAMES } from '@/lib/pitch-shape/model'
import { MIN_COMPARE_PITCHES, MIN_SETUP, MIN_TAKEN, giftPct, missPct, swingPct, whiffPct, type ComparePitcher, type SetupRow } from '@/lib/pitch-shape/compare'
import { GOLD } from './monthStats'
import { PV_CSS } from './pvCss'
import { createPitchViewScene, type SceneApi } from './pitchViewScene'

const last = (name: string) => name.split(' ').slice(-1)[0]

function MiniPitch({ p, hand, register }: { p: ComparePitcher; hand: 'L' | 'R'; register: (id: number, api: SceneApi | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!canvasRef.current || !labelsRef.current || !p.flight) return
    let api: SceneApi | null = null
    try {
      api = createPitchViewScene({ canvas: canvasRef.current, labels: labelsRef.current, months: [p.flight], hand, monthLabel: () => last(p.name), goldIndex: null, onCamName: () => {}, onNote: () => {} })
    } catch (e) {
      console.error('[PitchCompare] 3D scene failed to load:', e instanceof Error ? e.message : e)
      setFailed(true)
      return
    }
    api.setTab('move')
    api.setCam('Plate end', true)
    api.setSel(0)
    api.setPlaying(true)
    register(p.pitcherId, api)
    return () => { register(p.pitcherId, null); api?.dispose() }
  }, [p, hand, register])
  if (!p.flight) return <div className="pc-stage"><div className="pc-empty">No monthly flight data for this pitcher yet.</div></div>
  return (
    <div className="pc-stage">
      {failed
        ? <div className="pc-empty">The 3D model can’t run in this browser.</div>
        : <canvas ref={canvasRef} role="img" aria-label={`${p.name}, path with and without spin`} style={{ width: '100%', height: '100%', display: 'block' }} />}
      <div ref={labelsRef} />
    </div>
  )
}

/** index of the standout (highest, or lowest when `lower`) among defined values; null when fewer than two have one */
function lead(vals: (number | null)[], lower = false): number | null {
  const ok = vals.map((v, i) => [v, i] as [number | null, number]).filter((x): x is [number, number] => x[0] != null)
  if (ok.length < 2) return null
  const best = ok.reduce((a, b) => ((lower ? b[0] < a[0] : b[0] > a[0]) ? b : a))
  return ok.some(x => x !== best && x[0] === best[0]) ? null : best[1]
}

const prevName = (k: string) => (k === 'FIRST' ? 'First pitch of the at-bat' : k === 'OTH' ? 'Another pitch' : PITCH_NAMES[k] ?? k)

function setupSummary(rows: SetupRow[] | null, nPitches: number) {
  if (!rows || rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.n, 0) || nPitches
  const ranked = [...rows].sort((a, b) => b.n - a.n)
  const withRate = rows.filter(r => r.n >= MIN_SETUP && r.swings >= 10).map(r => ({ ...r, rate: (r.whiffs / r.swings) * 100 }))
  const bestRate = withRate.length >= 2 ? withRate.reduce((a, b) => (b.rate > a.rate ? b : a)) : null
  return { total, ranked, bestRate }
}

export default function PitchCompare({ field, pitchName, hand, season, isPro }: { field: ComparePitcher[]; pitchName: string; hand: 'L' | 'R'; season: number; isPro: boolean }) {
  const lc = pitchName.toLowerCase()
  const subject = field[0]
  const swaps = field.slice(1)
  const [chosen, setChosen] = useState<number[]>(() => swaps.slice(0, 3).map(p => p.pitcherId))
  const apis = useRef(new Map<number, SceneApi>())
  const register = useMemo(() => (id: number, api: SceneApi | null) => { if (api) apis.current.set(id, api); else apis.current.delete(id) }, [])
  const four = useMemo(() => [subject, ...chosen.map(id => swaps.find(p => p.pitcherId === id)).filter((p): p is ComparePitcher => !!p)], [subject, chosen, swaps])

  if (!isPro) return null
  if (!subject || field.length < 2) return <Empty>Not enough {lc}s with a full season to compare this one with yet.</Empty>

  const replay = () => apis.current.forEach(a => a.setSel(0))
  const swap = (slot: number, id: number) => setChosen(cs => cs.map((c, i) => (i === slot ? id : c)))
  const sw = four.map(swingPct), wh = four.map(whiffPct), gi = four.map(giftPct), mi = four.map(missPct)
  const L = { sw: lead(sw), wh: lead(wh), gi: lead(gi), mi: lead(mi, true) }
  const gold = (k: keyof typeof L, i: number) => (L[k] === i ? ' pc-gold' : '')
  const star = (k: keyof typeof L, i: number) => (L[k] === i ? '★ ' : '')
  const f1 = (v: number | null) => (v == null ? '—' : v.toFixed(1))
  const callouts: [string, number | null, (number | null)[]][] = [
    ['Most swings', L.sw, sw], ['Most whiffs per swing', L.wh, wh], ['Most gifted strikes', L.gi, gi], ['Fewest missed strikes', L.mi, mi],
  ]

  return (
    <div>
      <style>{PV_CSS}</style>
      <style>{PC_CSS}</style>
      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">Compared with</span>
        <span style={{ fontSize: 12, color: '#5b5347' }}>His {lc} and the three {lc}s closest to it in speed, vertical break, horizontal break and arm angle ({season}). Closest teammate first, then the league.</span>
        <button type="button" className="pv-pill" onClick={replay} style={{ marginLeft: 'auto' }}>Replay together</button>
      </div>

      <div className="pc-grid">
        {four.map((p, i) => (
          <div key={p.pitcherId} className="pc-card">
            <div className="pc-head">
              <div>
                <div className="pc-name">{p.name}</div>
                <div className="pc-sub">{p.teamAbbr}{p.isSelf ? ' · his' : p.isTeammate ? ' · teammate' : ' · league'}{!p.isSelf ? ` · shape gap ${p.distance.toFixed(1)}` : ''}</div>
              </div>
            </div>
            <MiniPitch p={p} hand={hand} register={register} />
            <div className="pc-nums">
              <span><b>{p.velo.toFixed(1)}</b> mph</span><span><b>{p.ivb.toFixed(1)}</b> IVB</span><span><b>{p.hb.toFixed(1)}</b> HB</span><span><b>{Math.round(p.slot)}°</b> arm</span>
            </div>
            {i > 0 && (
              <select className="pc-select" value={p.pitcherId} onChange={e => swap(i - 1, Number(e.target.value))} aria-label={`Swap pitcher ${i}`}>
                <option value={p.pitcherId}>{p.name}</option>
                {swaps.filter(o => !chosen.includes(o.pitcherId)).map(o => <option key={o.pitcherId} value={o.pitcherId}>{o.name} · {o.teamAbbr}{o.isTeammate ? ' (teammate)' : ''}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="pc-calls">
        {callouts.map(([k, i, vals]) => (
          <div key={k} className={i != null ? 'pc-call on' : 'pc-call'}>
            <div className="pv-k" style={{ color: i != null ? GOLD.ink : C.mute }}>{i != null ? '★ ' : ''}{k}</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.ink }}>{i != null ? last(four[i].name) : '—'}</div>
            <div style={{ fontSize: 12, color: '#5b5347' }}>{i != null ? `${(vals[i] as number).toFixed(1)}%` : 'No clear leader on enough sample'}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <div className="pv-k" style={{ marginBottom: 6 }}>Results · {season} · <span style={{ color: GOLD.ink }}>★ gold = standout in the row</span></div>
        <table className="pv-tbl">
          <thead><tr><th>Measure</th>{four.map(p => <th key={p.pitcherId}>{last(p.name)}</th>)}</tr></thead>
          <tbody>
            <tr><td>Pitches</td>{four.map(p => <td key={p.pitcherId}>{p.nPitches.toLocaleString()}</td>)}</tr>
            <tr><td>Swing rate <span className="pc-hint">swings ÷ pitches</span></td>{four.map((p, i) => <td key={p.pitcherId} className={gold('sw', i).trim()}>{star('sw', i)}{f1(sw[i])}%</td>)}</tr>
            <tr><td>Whiffs per swing <span className="pc-hint">100+ swings</span></td>{four.map((p, i) => <td key={p.pitcherId} className={gold('wh', i).trim()}>{star('wh', i)}{f1(wh[i])}{wh[i] != null ? '%' : ''}</td>)}</tr>
            <tr><td>Gifted strikes <span className="pc-hint">called strike off the zone, % of taken pitches</span></td>{four.map((p, i) => <td key={p.pitcherId} className={gold('gi', i).trim()}>{star('gi', i)}{f1(gi[i])}{gi[i] != null ? '%' : ''}{gi[i] != null && p.nGift != null ? <span className="pc-n"> ({p.nGift})</span> : null}</td>)}</tr>
            <tr><td>Missed strikes <span className="pc-hint">ball in the zone, % of taken pitches · fewer is better</span></td>{four.map((p, i) => <td key={p.pitcherId} className={gold('mi', i).trim()}>{star('mi', i)}{f1(mi[i])}{mi[i] != null ? '%' : ''}{mi[i] != null && p.nMiss != null ? <span className="pc-n"> ({p.nMiss})</span> : null}</td>)}</tr>
            <tr><td>Taken pitches <span className="pc-hint">umpire had to call it</span></td>{four.map(p => <td key={p.pitcherId}>{p.nTaken ?? '—'}</td>)}</tr>
            <tr><td>ABS challenges <span className="pc-hint">overturned</span></td>{four.map(p => <td key={p.pitcherId}>{p.absN === 0 ? '0' : `${p.absN} (${p.absOverturned})`}</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="pv-k" style={{ margin: '20px 0 6px' }}>What sets it up</div>
      <p className="pv-note" style={{ marginTop: 0 }}>The pitch before it in the same at-bat, and how the {lc} did after each. A big gap in speed or a different shape on the pitch before can change what the hitter is expecting.</p>
      <div className="pc-grid">
        {four.map(p => {
          const su = setupSummary(p.setup, p.nPitches)
          return (
            <div key={p.pitcherId} className="pc-card" style={{ padding: 12 }}>
              <div className="pc-name">{p.name}</div>
              {!su ? <div className="pc-sub" style={{ marginTop: 6 }}>Not built for this pitcher yet.</div> : (
                <>
                  {su.ranked.slice(0, 4).map(r => {
                    const share = (r.n / su.total) * 100
                    const rate = r.n >= MIN_SETUP && r.swings >= 10 ? (r.whiffs / r.swings) * 100 : null
                    return (
                      <div key={r.prev} style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                          <span>{prevName(r.prev)}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{share.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 6, background: C.soft, borderRadius: 3 }}><div style={{ width: `${Math.min(100, share)}%`, height: 6, background: C.orange, borderRadius: 3 }} /></div>
                        <div style={{ fontSize: 10.5, color: C.mute, marginTop: 2 }}>
                          n={r.n}{rate != null ? ` · whiff ${rate.toFixed(0)}% per swing` : ' · too few swings for a whiff rate'}{r.dv != null ? ` · prev pitch ${r.dv >= 0 ? '+' : '−'}${Math.abs(r.dv).toFixed(1)} mph vs this one` : ''}
                        </div>
                      </div>
                    )
                  })}
                  {su.bestRate && <div className="pc-best">★ Most whiffs after {prevName(su.bestRate.prev).toLowerCase()} ({su.bestRate.rate.toFixed(0)}%, {su.bestRate.swings} swings)</div>}
                </>
              )}
            </div>
          )
        })}
      </div>

      <Foot>
        Season {season}, regular season. Closest = smallest combined gap in speed (per 1.5 mph), vertical break (2 in), horizontal break (2 in) and arm angle (5°); the {lc} needs {MIN_COMPARE_PITCHES}+ pitches. Swing rate = swings ÷ all pitches. Whiff rate shown from 100 swings.
        Gifted strike = a called strike on a pitch Statcast places outside the rulebook zone; missed strike = a ball on a pitch inside it (rates are of taken pitches, shown from {MIN_TAKEN} taken). ABS = challenges on this pitch type, with the number overturned in brackets. Setup bars show the share of each previous pitch; a whiff rate needs {MIN_SETUP}+ pitches and 10+ swings after it.
        The animation draws each pitcher’s season-average path against the same pitch with no spin; it is not a single pitch. Descriptions of what already happened.
      </Foot>
    </div>
  )
}

const PC_CSS = `
.pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:10px}
.pc-card{background:#fff;border:1px solid #e7e2d8;border-radius:14px;padding:10px;min-width:0}
.pc-name{font-weight:800;font-size:15px;color:#1A1A1A;line-height:1.15}
.pc-sub{font-size:10px;letter-spacing:.1em;font-weight:800;text-transform:uppercase;color:#8a8275;margin-top:2px}
.pc-stage{position:relative;aspect-ratio:4/3;margin:8px 0;border-radius:10px;overflow:hidden;border:1px solid #e7e2d8;background:#FAF8F3}
.pc-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:12px;font-size:12px;color:#8a8275}
.pc-nums{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:#8a8275;font-variant-numeric:tabular-nums}
.pc-nums b{color:#1A1A1A;font-size:13px}
.pc-select{margin-top:8px;width:100%;font:600 12px var(--font-outfit),system-ui,sans-serif;border:1px solid #e7e2d8;border-radius:8px;padding:6px 8px;background:#fff;color:#1A1A1A}
.pc-calls{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:12px}
.pc-call{border:1px dashed #e7e2d8;border-radius:12px;padding:10px 12px;background:#fff}
.pc-call.on{background:#FFF4CC;border:1px solid #EBC24A}
.pc-hint{display:block;font-size:10px;font-weight:600;color:#a89e8c;letter-spacing:0;text-transform:none}
.pc-n{font-size:10.5px;color:#a89e8c;font-weight:500}
.pv-tbl td.pc-gold{background:#FFF4CC;color:#7A5800;font-weight:800}
.pc-best{margin-top:10px;font-size:11.5px;font-weight:800;color:#7A5800;background:#FFF4CC;border-radius:8px;padding:5px 8px}
`
