'use client'

// src/components/sequencing-lab/AtBatStack.tsx
//
// The at-bat you have stacked in the League pitch finder: the pitches in order, play them back one after another, and the real at-bats that match the stack (same pitch types
// in that order, inside the speed and break windows, plus any zone and result you chose). It asks /api/sequencing/match, which matches in memory on the stored at-bat index.
// "Starts the at-bat" means the stack is the first pitches; "Anywhere" means they are thrown back to back at some point. A match under MIN at-bats shows "Small sample".
// Counts of what has happened, never a forecast.

import { useEffect, useMemo, useState } from 'react'
import SpinBall from '@/components/home/SpinBall'
import SmallSample from '@/components/data/SmallSample'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { RESULTS, type ResultCode } from '@/lib/sequencing-lab/sequence'
import type { MatchSpec, PitchSpec, AbSample } from '@/lib/sequencing-lab/ab-index'
import type { PitchPath } from '@/components/pitching-lab/PitchFlight'
import { SpeedToggle } from '@/components/pitching-lab/PitchFlight'
import { Pills, kick, note, star } from '@/components/pitching-lab/LocationExplorer'
import FlightResult, { RES_COLOR } from './FlightResult'

const MIN = MIN_SAMPLE.zoneCellPitches
export type StackItem = { spec: PitchSpec; path: PitchPath | null; result: ResultCode | null }
type Match = { total: number; outcomes: Record<string, number>; next: Record<string, number>; samples: AbSample[]; names: Record<number, string> }

const OUTCOME_LABEL: Record<string, string> = { K: 'Strikeout', BB: 'Walk', HBP: 'Hit by pitch', '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run', OUT: 'Out in play', OTHER: 'Other', unknown: 'Not recorded' }
const OUTCOME_ORDER = ['K', 'BB', 'HBP', '1B', '2B', '3B', 'HR', 'OUT', 'OTHER']
const OUTCOME_COLOR: Record<string, string> = { K: '#0072B2', BB: '#9DB4D6', HBP: '#b8b0a0', '1B': '#e69f00', '2B': '#d55e00', '3B': '#c0392b', HR: '#8e1b1b', OUT: '#8a8275', OTHER: '#cfc9ba' }
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const small = (s: string) => ({ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' as const, display: s ? 'block' : undefined })

export default function AtBatStack({ stack, hand, stand, onRemove, onClear }: { stack: StackItem[]; hand: 'R' | 'L'; stand: 'R' | 'L' | null; onRemove: (i: number) => void; onClear: () => void }) {
  const [mode, setMode] = useState<'start' | 'any'>('start')
  const [m, setM] = useState<Match | 'loading' | 'unavailable' | null>(null)
  const [slow, setSlow] = useState(6)
  const [play, setPlay] = useState<{ i: number; p: number } | null>(null)
  const [run, setRun] = useState(0)

  const specKey = useMemo(() => JSON.stringify({ hand, stand, mode, pitches: stack.map(s => s.spec) }), [hand, stand, mode, stack])
  useEffect(() => {
    if (stack.length === 0) { setM(null); return }
    const ac = new AbortController()
    setM('loading')
    const t = setTimeout(() => {
      fetch(`/api/sequencing/match?spec=${encodeURIComponent(specKey)}`, { signal: ac.signal })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: Match) => setM(j))
        .catch(e => { if (e?.name !== 'AbortError') setM('unavailable') })
    }, 300)
    return () => { clearTimeout(t); ac.abort() }
  }, [specKey, stack.length])

  // Play the stack back one pitch after another: each flies at its own speed, holds on its result, then the next begins.
  useEffect(() => {
    if (run === 0) return
    const withPath = stack.map(s => s.path).map((p, i) => ({ p, i })).filter((x): x is { p: PitchPath; i: number } => x.p != null)
    if (withPath.length === 0) return
    let raf = 0, idx = 0
    const HOLD = 900
    let t0 = performance.now()
    const tick = (now: number) => {
      const cur = withPath[idx]
      const dur = cur.p.T * 1000 * slow
      const t = now - t0
      if (t < dur + HOLD) { setPlay({ i: cur.i, p: Math.min(1, t / dur) }); raf = requestAnimationFrame(tick) }
      else if (idx + 1 < withPath.length) { idx += 1; t0 = now; raf = requestAnimationFrame(tick) }
      else setPlay(null)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, slow, stack])

  if (stack.length === 0) return null
  const shown = play ? stack[play.i] : null
  const total = typeof m === 'object' && m ? m.total : 0
  const names = typeof m === 'object' && m ? m.names : {}

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14, fontFamily: SANS }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={kick}>Your at-bat · {stack.length} pitch{stack.length === 1 ? '' : 'es'} stacked</div>
        <button type="button" onClick={onClear} style={{ marginLeft: 'auto', background: 'none', border: 0, color: C.orange, fontWeight: 800, cursor: 'pointer', font: 'inherit', fontSize: 13 }}>Clear the at-bat</button>
      </div>

      <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {stack.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: play?.i === i ? '#fff1ea' : C.soft, border: `1px solid ${play?.i === i ? C.orange : 'transparent'}`, borderRadius: 12, padding: '6px 10px', fontSize: 13, fontWeight: 800 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.ink, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>{i + 1}</span>
            <SpinBall code={s.spec.t} size={20} />
            <span>{pitchLabel(s.spec.t)} <span style={{ fontWeight: 600, color: C.mute }}>{s.spec.speed.toFixed(1)} mph{s.spec.zone ? ` · zone ${s.spec.zone}` : ''}{s.result ? ` · ${RESULTS.find(r => r.code === s.result)?.label.toLowerCase()}` : ''}</span></span>
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove pitch ${i + 1}`} style={{ border: 0, background: 'none', cursor: 'pointer', color: C.faint, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </li>
        ))}
      </ol>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 10 }}>
        <button type="button" onClick={() => setRun(r => r + 1)} style={{ border: 0, borderRadius: 999, background: C.orange, color: '#fff', fontWeight: 800, padding: '8px 16px', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>Play the at-bat</button>
        <SpeedToggle slow={slow} setSlow={setSlow} />
        <Pills items={[['start', 'Starts the at-bat'], ['any', 'Anywhere in the at-bat']] as ['start' | 'any', string][]} value={mode} onChange={setMode} />
      </div>
      {shown?.path && <div style={{ maxWidth: 340, marginTop: 10 }}><FlightResult path={shown.path} p={play!.p} result={shown.result} /><p style={note}>Pitch {play!.i + 1} of {stack.length}</p></div>}

      <div style={{ ...kick, marginTop: 16 }}>Real at-bats that match</div>
      {m === 'loading' || m === null ? <p style={note}>Searching {new Date().getFullYear()} at-bats…</p>
        : m === 'unavailable' ? <p style={note}>The at-bat search is not available yet. It needs the at-bat index to be built.</p>
        : m.total === 0 ? <p style={note}>No {new Date().getFullYear()} at-bats match this stack. Remove a pitch, widen a zone or result, or switch to Anywhere in the at-bat.</p>
        : m.total < MIN ? <div style={{ marginTop: 6 }}><SmallSample n={m.total} /></div>
        : (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{m.total.toLocaleString('en-US')} at-bats</div>
            <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', gap: 1, margin: '8px 0 4px', maxWidth: 640 }} aria-hidden>{OUTCOME_ORDER.filter(k => m.outcomes[k]).map(k => <span key={k} style={{ width: `${pct(m.outcomes[k], total)}%`, background: OUTCOME_COLOR[k] }} />)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: 12.5, color: '#5b5347' }}>{OUTCOME_ORDER.filter(k => m.outcomes[k]).map(k => <span key={k}><span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: OUTCOME_COLOR[k], marginRight: 5 }} />{OUTCOME_LABEL[k]} <b>{pct(m.outcomes[k], total).toFixed(0)}%</b> · {m.outcomes[k]}</span>)}</div>

            <div style={{ ...small('x'), marginTop: 14 }}>What came next</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {Object.entries(m.next).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.soft, borderRadius: 999, padding: '3px 10px 3px 5px', fontSize: 12.5, fontWeight: 800 }}>
                  {t === 'end' ? <span style={{ paddingLeft: 6 }}>The at-bat ended</span> : <><SpinBall code={t} size={18} />{pitchLabel(t)}</>}
                  <span style={{ fontWeight: 600, color: C.mute }}>{pct(n, total).toFixed(0)}% · {n}</span>
                </span>
              ))}
            </div>

            <div style={{ ...small('x'), marginTop: 14 }}>The most recent {m.samples.length}</div>
            <div className="scroll" style={{ overflowX: 'auto', marginTop: 6 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                <tbody>
                  {m.samples.map(s => (
                    <tr key={`${s.gamePk}-${s.batterId}-${s.date}-${s.pitches.length}`} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td style={{ padding: '6px 10px 6px 0', color: C.mute, whiteSpace: 'nowrap' }}>{s.date}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{names[s.pitcherId] ?? 'Pitcher'} <span style={{ color: C.faint, fontWeight: 600 }}>to</span> {names[s.batterId] ?? 'batter'}</td>
                      <td style={{ padding: '6px 10px' }}><span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>{s.pitches.map((p, i) => <span key={i} title={`${pitchLabel(p.t)}${p.speed ? ` ${p.speed.toFixed(1)} mph` : ''}${p.res ? ` · ${RESULTS.find(r => r.code === p.res)?.label}` : ''}`} style={{ width: 12, height: 12, borderRadius: '50%', background: pitchColor(p.t), outline: p.res ? `2px solid ${RES_COLOR[p.res]}` : undefined, outlineOffset: 1 }} />)}</span></td>
                      <td style={{ padding: '6px 0 6px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{OUTCOME_LABEL[s.outcome] ?? s.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={note}>Each dot is a pitch in the order thrown (colour = pitch type, ring = how it ended). {total < 30 && <>{star} </>}Matches use the same pitch types in this order, within ±1.5 mph and ±3 in of break and rise of each stacked pitch, against a {hand === 'R' ? 'right' : 'left'}-handed pitcher{stand ? ` and a ${stand === 'R' ? 'right' : 'left'}-handed batter` : ''}, {new Date().getFullYear()} season as stored. These are what has happened, not what will happen.</p>
          </div>
        )}
    </div>
  )
}
