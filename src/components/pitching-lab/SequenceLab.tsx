'use client'

// src/components/pitching-lab/SequenceLab.tsx
//
// Pitching Lab → Sequencing. How a pitcher has strung pitches together, from the season's per-pitch log. Pick what was just thrown
// (the left selector), how that pitch turned out (ball, called strike, swinging strike, foul), where it was, the count and the hitter's
// side, and the page shows what he threw NEXT in those spots: the pitch types, where they went, and what happened on them.
// Click a bar to move forward a pitch and the selection becomes a chain (up to three pitches), so "sweeper, then fastball, then ..." is
// a few clicks. Two shaded tables show how the previous result and the count change the next pitch.
//
// It describes what has happened after pitches like these. It does not say what will happen next.
//
// Order of pitches comes from game, at-bat number and pitch number on every pitch of the log (src/lib/pitcher-pitch-log.ts), not file order.

import { useEffect, useMemo, useState } from 'react'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { SmoothHeatmap } from './ArsenalExtras'
import { buildPaths } from './PitchFlight'
import { Pills, kick, note, star, tile } from './LocationExplorer'

type Cat = 'ball' | 'called' | 'swing' | 'foul' | 'play' | 'hbp'
const CATS: [Cat, string][] = [['ball', 'Ball'], ['called', 'Called strike'], ['swing', 'Swinging strike'], ['foul', 'Foul'], ['play', 'In play'], ['hbp', 'Hit by pitch']]
const CAT_LABEL = Object.fromEntries(CATS) as Record<Cat, string>
const CAT_COLOR: Record<Cat, string> = { ball: '#6CABDD', called: '#8a8275', swing: '#FF5722', foul: '#FDE047', play: '#1D9E75', hbp: '#D4533B' }
function cat(d: string | null): Cat | null {
  switch (d) {
    case 'ball': case 'blocked_ball': case 'intent_ball': case 'pitchout': case 'automatic_ball': return 'ball'
    case 'called_strike': case 'automatic_strike': return 'called'
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': case 'foul_tip': return 'swing'
    case 'foul': case 'foul_bunt': return 'foul'
    case 'hit_into_play': return 'play'
    case 'hit_by_pitch': return 'hbp'
    default: return null
  }
}
const PREV_RESULTS: [Cat, string][] = [['ball', 'Ball'], ['called', 'Called strike'], ['swing', 'Swinging strike'], ['foul', 'Foul']]
const COUNTS = ['0-0', '1-0', '0-1', '1-1', '2-0', '0-2', '2-1', '1-2', '3-0', '3-1', '2-2', '3-2']
const MAX_CHAIN = 3

type Where = 'any' | 'in' | 'out'
type Opts = { hist: string[]; res: Cat | 'any'; where: Where; count: string; side: 'any' | 'L' | 'R' }
type Hit = { ab: RawPitch[]; j: number }

const isIn = (z: string | null) => z != null && Number(z) >= 1 && Number(z) <= 9

function collect(abs: RawPitch[][], o: Opts): Hit[] {
  const out: Hit[] = []
  const h = o.hist.length
  for (const ab of abs) {
    for (let j = h; j < ab.length; j++) {
      const nx = ab[j]
      if (o.count !== 'any' && `${nx.balls}-${nx.strikes}` !== o.count) continue
      if (o.side !== 'any' && nx.stand !== o.side) continue
      let ok = true
      for (let q = 0; q < h; q++) if (ab[j - h + q].pitchType !== o.hist[q]) { ok = false; break }
      if (!ok) continue
      if (h > 0) {
        const prev = ab[j - 1]
        if (o.res !== 'any' && cat(prev.description) !== o.res) continue
        if (o.where !== 'any' && isIn(prev.zone) !== (o.where === 'in')) continue
      }
      out.push({ ab, j })
    }
  }
  return out
}

function tally(hits: Hit[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const { ab, j } of hits) m.set(ab[j].pitchType, (m.get(ab[j].pitchType) ?? 0) + 1)
  return m
}

const pc = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`

export default function SequenceLab({ pitcherId }: { pitcherId: number }) {
  const season = new Date().getFullYear()
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [hist, setHist] = useState<string[]>([])
  const [res, setRes] = useState<Cat | 'any'>('any')
  const [where, setWhere] = useState<Where>('any')
  const [count, setCount] = useState('any')
  const [side, setSide] = useState<'any' | 'L' | 'R'>('any')
  const [focus, setFocus] = useState('ALL')

  useEffect(() => {
    let off = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${season}`).then(r => r.json()).then(j => { if (!off) setLog(j.error ? 'error' : j) }).catch(() => { if (!off) setLog('error') })
    return () => { off = true }
  }, [pitcherId, season])

  const abs = useMemo(() => {
    if (!log || log === 'error') return []
    const by = new Map<string, RawPitch[]>()
    for (const p of log.pitches) {
      if (p.gamePk == null || p.atBatNumber == null || p.pitchNumber == null) continue
      const k = `${p.gamePk}-${p.atBatNumber}`
      if (!by.has(k)) by.set(k, [])
      by.get(k)!.push(p)
    }
    return [...by.values()].map(a => a.sort((x, y) => (x.pitchNumber as number) - (y.pitchNumber as number)))
  }, [log])
  const flights = useMemo(() => (log && log !== 'error' ? buildPaths(log) : []), [log])
  const types = useMemo(() => {
    if (!log || log === 'error') return []
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, name: log.pitchNames[t] ?? t }))
  }, [log])

  const opts: Opts = { hist, res, where, count, side }
  const hits = useMemo(() => collect(abs, opts), [abs, hist, res, where, count, side]) // eslint-disable-line react-hooks/exhaustive-deps
  const nextCounts = useMemo(() => tally(hits), [hits])
  const topTypes = useMemo(() => [...nextCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t), [nextCounts])

  if (log === 'error') return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Couldn&apos;t load this pitcher&apos;s pitches right now.</p>
  if (log === null) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Loading every pitch…</p>

  const nm = (t: string) => log.pitchNames[t] ?? t
  const total = hits.length
  const lastName = hist.length ? nm(hist[hist.length - 1]) : null
  const focused = focus === 'ALL' ? hits : hits.filter(h => h.ab[h.j].pitchType === focus)
  const nextPitches = focused.map(h => h.ab[h.j])

  // What happened on the next pitch.
  const outcome = new Map<Cat, number>()
  let ended = 0, ks = 0, bbs = 0, hitsEnded = 0
  for (const p of nextPitches) {
    const c = cat(p.description)
    if (c) outcome.set(c, (outcome.get(c) ?? 0) + 1)
    if (p.wobaDen != null && p.wobaDen > 0) {
      ended++
      const r = p.result ?? ''
      if (r.startsWith('strikeout')) ks++
      else if (r === 'walk' || r === 'intent_walk') bbs++
      else if (p.isHit) hitsEnded++
    }
  }
  const swings = (outcome.get('swing') ?? 0) + (outcome.get('foul') ?? 0) + (outcome.get('play') ?? 0)

  // Tables: how the previous result and the count change the next pitch. Each ignores its own filter.
  const cols = topTypes.slice(0, 6)
  const byResult = PREV_RESULTS.map(([c, label]) => { const hs = collect(abs, { ...opts, res: c }); return { c, label, n: hs.length, t: tally(hs) } })
  const byCount = COUNTS.map(ct => { const hs = collect(abs, { ...opts, count: ct }); return { ct, n: hs.length, t: tally(hs) } })
  const shade = (v: number) => `rgba(255,87,34,${(0.08 + Math.min(1, v) * 0.7).toFixed(2)})`

  const examples = [...hits].sort((a, b) => (a.ab[a.j].date < b.ab[b.j].date ? 1 : -1)).slice(0, 8)
  const small = total < MIN_SAMPLE.arsenalPitchesPerType

  return (
    <div className="sq-grid">
      <style>{`.sq-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.sq-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.sq-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A;font-family:inherit}.sq-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.sq-btn.on{border-color:#FF5722;background:#fff1ea}.sq-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.sq-span2{grid-column:span 2}.sq-span3{grid-column:1 / -1}.sq-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.sq-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.sq-tbl th:first-child,.sq-tbl td:first-child{text-align:left}.sq-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #fff}.sq-bar{display:grid;grid-template-columns:150px minmax(0,1fr) 92px;align-items:center;gap:10px;padding:5px 6px;border-radius:10px;cursor:pointer;border:1px solid transparent;background:none;width:100%;font-family:inherit;text-align:left}.sq-bar:hover{background:#fff1ea;border-color:#FF5722}@media (max-width:1180px){.sq-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.sq-grid{grid-template-columns:minmax(0,1fr)}.sq-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.sq-btn{width:auto;white-space:nowrap}.sq-tiles{grid-template-columns:minmax(0,1fr)}.sq-span2{grid-column:auto}.sq-bar{grid-template-columns:110px minmax(0,1fr) 70px}}`}</style>
      <SpinBallStyles />

      <nav className="sq-side" aria-label="The pitch just thrown">
        <div style={{ ...kick, margin: '0 2px 2px' }}>Pitch just thrown</div>
        <button type="button" className={`sq-btn${hist.length === 0 ? ' on' : ''}`} onClick={() => { setHist([]); setFocus('ALL'); setRes('any'); setWhere('any') }}>
          <span style={{ width: 14, height: 14, borderRadius: 999, background: '#1A1A1A', flexShrink: 0 }} />
          <span>Any pitch<small>{log.pitches.length} pitches</small></span>
        </button>
        {types.map(t => {
          const f = flights.find(x => x.type === t.t)
          return (
            <button key={t.t} type="button" className={`sq-btn${hist[0] === t.t ? ' on' : ''}`} onClick={() => { setHist([t.t]); setFocus('ALL'); if (count === '0-0') setCount('any') }}>
              <SpinBall code={t.t} size={30} spin={{ rpm: f?.spin ?? null, ivb: f?.ivb ?? null, hb: f?.hb ?? null }} />
              <span>{t.name}<small>{((t.n / log.pitches.length) * 100).toFixed(0)}% · {t.n} pitches</small></span>
            </button>
          )
        })}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{hist.length === 0 ? 'Any pitch' : 'Sequence'}</h2>
          {hist.map((t, i) => (
            <span key={`${t}${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: C.faint }}>→</span>}
              <button type="button" onClick={() => setHist(hist.slice(0, i))} title="Remove this pitch and the ones after it" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 14, fontWeight: 800, borderRadius: 999, padding: '4px 10px', border: `1px solid ${pitchColor(t)}`, background: '#fff', cursor: 'pointer' }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(t) }} />{nm(t)} <span style={{ color: C.faint }}>×</span>
              </button>
            </span>
          ))}
          <span style={{ color: C.faint }}>→</span>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{total} next pitches{small && total > 0 ? <> {star} small sample</> : ''}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
          {hist.length > 0 && <Pills items={[['any', `Any result of the ${lastName}`], ...PREV_RESULTS] as [Cat | 'any', string][]} value={res} onChange={setRes} />}
          {hist.length > 0 && <Pills items={[['any', 'Anywhere'], ['in', 'In the zone'], ['out', 'Out of the zone']] as [Where, string][]} value={where} onChange={setWhere} />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
          <Pills items={[['any', 'Any count'], ...COUNTS.filter(c => hist.length === 0 || c !== '0-0').map(c => [c, c] as [string, string])]} value={count} onChange={setCount} />
          <Pills items={[['any', 'All hitters'], ['L', 'Left-handed'], ['R', 'Right-handed']] as ['any' | 'L' | 'R', string][]} value={side} onChange={setSide} />
        </div>

        {total === 0 ? (
          <div style={{ fontSize: 14, color: C.mute }}>
            {(() => {
              const on = [res !== 'any' ? `result: ${CAT_LABEL[res]}` : null, where !== 'any' ? (where === 'in' ? 'in the zone' : 'out of the zone') : null, count !== 'any' ? `count ${count}` : null, side !== 'any' ? (side === 'L' ? 'left-handed hitters' : 'right-handed hitters') : null].filter(Boolean)
              return on.length > 0
                ? <>Nothing in the log matches {hist.length ? hist.map(nm).join(' → ') : 'this'} with {on.join(', ')}. </>
                : <>Nothing follows {hist.map(nm).join(' → ')} in the log. </>
            })()}
            <button type="button" onClick={() => { setRes('any'); setWhere('any'); setCount('any'); setSide('any') }} style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Clear the filters</button>
          </div>
        ) : (
          <div className="sq-tiles">
            <div className="sq-span2" style={tile}>
              <div style={kick}>{hist.length === 0 ? 'What he threw' : `What he threw next, after ${hist.map(nm).join(' → ')}`}</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {topTypes.map(t => {
                  const n = nextCounts.get(t) ?? 0, f = flights.find(x => x.type === t)
                  return (
                    <button key={t} type="button" className="sq-bar" disabled={hist.length >= MAX_CHAIN} onClick={() => { setHist([...hist, t]); setFocus('ALL'); if (count === '0-0') setCount('any') }} title={hist.length >= MAX_CHAIN ? 'Remove a pitch from the chain to go further' : `See what came after ${nm(t)}`} style={hist.length >= MAX_CHAIN ? { cursor: 'default' } : undefined}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}><SpinBall code={t} size={24} spin={{ rpm: f?.spin ?? null, ivb: f?.ivb ?? null, hb: f?.hb ?? null }} />{nm(t)}</span>
                      <span style={{ height: 16, background: C.soft, borderRadius: 8, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(n / total) * 100}%`, background: pitchColor(t), borderRadius: 8 }} /></span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, textAlign: 'right' }}><b>{pc(n / total)}</b> <span style={{ color: C.faint }}>({n})</span></span>
                    </button>
                  )
                })}
              </div>
              <p style={note}>Share of the pitches that followed. {hist.length < MAX_CHAIN ? 'Click a pitch to move forward one pitch and see what came after it.' : 'The chain is at three pitches; click one in the title to step back.'} This describes what has happened after pitches like these, not what will happen.</p>
            </div>

            <div style={tile}>
              <div style={kick}>What happened on it{focus !== 'ALL' ? ` · ${nm(focus)}` : ''}</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {CATS.filter(([c]) => (outcome.get(c) ?? 0) > 0).map(([c, label]) => {
                  const n = outcome.get(c) ?? 0
                  return (
                    <div key={c} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0,1fr) 64px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 800 }}>{label}</span>
                      <span style={{ height: 12, background: C.soft, borderRadius: 6, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(n / nextPitches.length) * 100}%`, background: CAT_COLOR[c] }} /></span>
                      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pc(n / nextPitches.length)} <span style={{ color: C.faint }}>({n})</span></span>
                    </div>
                  )
                })}
              </div>
              <dl style={{ margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                {[
                  ['Swing', nextPitches.length ? pc(swings / nextPitches.length) : '—', `${swings} of ${nextPitches.length}`],
                  ['Whiff', swings ? pc((outcome.get('swing') ?? 0) / swings) : '—', `${outcome.get('swing') ?? 0} of ${swings} swings`],
                  ['Plate appearances ended', String(ended), `${ks} strikeouts · ${bbs} walks · ${hitsEnded} hits`],
                ].map(([k, v, sub]) => <div key={k} style={k === 'Plate appearances ended' ? { gridColumn: '1 / -1' } : undefined}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0 }}><b style={{ fontSize: 17 }}>{v}</b> <span style={{ fontSize: 11, color: C.faint }}>{sub}</span></dd></div>)}
              </dl>
            </div>

            <div style={tile}>
              <div style={kick}>Where it went</div>
              <div style={{ margin: '8px 0 4px' }}>
                <Pills items={[['ALL', 'All next pitches'], ...topTypes.slice(0, 6).map(t => [t, nm(t)] as [string, string])]} value={focus} onChange={setFocus} />
              </div>
              <SmoothHeatmap pitches={nextPitches} title={focus === 'ALL' ? 'Next pitches' : nm(focus)} counts={false} />
            </div>

            <div className="sq-span2" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>How the last pitch&apos;s result changes the next one</div>
              {hist.length === 0 ? <p style={note}>Choose a pitch on the left to see this.</p> : (
                <table className="sq-tbl" style={{ marginTop: 6, minWidth: 520 }}>
                  <thead><tr><th>After a {lastName}…</th><th>Pitches</th>{cols.map(t => <th key={t}>{nm(t)}</th>)}</tr></thead>
                  <tbody>
                    {byResult.map(r => (
                      <tr key={r.c} style={{ cursor: 'pointer', outline: res === r.c ? `2px solid ${C.orange}` : undefined }} onClick={() => setRes(res === r.c ? 'any' : r.c)}>
                        <td style={{ fontWeight: 800 }}>{r.label}</td>
                        <td>{r.n}{r.n < MIN_SAMPLE.arsenalPitchesPerType && r.n > 0 && star}</td>
                        {cols.map(t => { const v = r.n ? (r.t.get(t) ?? 0) / r.n : 0; return <td key={t} title={`${r.t.get(t) ?? 0} of ${r.n}`} style={{ background: r.n ? shade(v) : undefined }}>{r.n ? pc(v) : '—'}</td> })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={note}>Each row is the share of next pitches of each type after that result. Click a row to filter the page to it.</p>
            </div>

            <div className="sq-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>By count{hist.length ? ` · after ${hist.map(nm).join(' → ')}` : ''}</div>
              <table className="sq-tbl" style={{ marginTop: 6, minWidth: 560 }}>
                <thead><tr><th>Count</th><th>Pitches</th>{cols.map(t => <th key={t}>{nm(t)}</th>)}</tr></thead>
                <tbody>
                  {byCount.map(r => (
                    <tr key={r.ct} style={{ cursor: 'pointer', outline: count === r.ct ? `2px solid ${C.orange}` : undefined }} onClick={() => setCount(count === r.ct ? 'any' : r.ct)}>
                      <td style={{ fontWeight: 800 }}>{r.ct}</td>
                      <td>{r.n}{r.n < MIN_SAMPLE.arsenalPitchesPerType && r.n > 0 && star}</td>
                      {cols.map(t => { const v = r.n ? (r.t.get(t) ?? 0) / r.n : 0; return <td key={t} title={`${r.t.get(t) ?? 0} of ${r.n}`} style={{ background: r.n ? shade(v) : undefined }}>{r.n ? pc(v) : '—'}</td> })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={note}>The count is the one before the next pitch. Darker is a larger share. {star} marks a count with a small sample. Click a row to filter the page to it.</p>
            </div>

            <div className="sq-span3" style={tile}>
              <div style={kick}>Recent at-bats that fit</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {examples.map((h, i) => {
                  const last = h.ab[h.ab.length - 1]
                  const ender = last.wobaDen != null && last.wobaDen > 0 ? (last.result ?? '').replace(/_/g, ' ') : null
                  const who = h.ab[h.j].batterId != null ? log.batterNames[h.ab[h.j].batterId as number] : null
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                      <span style={{ width: 150, color: C.mute }}>{h.ab[h.j].date}{who ? ` · ${who}` : ''}</span>
                      <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                        {h.ab.map((p, q) => {
                          const c = cat(p.description), nextOne = q === h.j
                          return (
                            <span key={q} title={`${nm(p.pitchType)} · ${c ? CAT_LABEL[c] : p.description ?? ''} · count ${p.balls}-${p.strikes}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, background: pitchColor(p.pitchType), color: '#fff', fontSize: 9, fontWeight: 800, outline: nextOne ? '3px solid #1A1A1A' : undefined, outlineOffset: 1, opacity: q > h.j ? 0.35 : 1 }}>
                              {c === 'swing' ? 'SS' : c === 'called' ? 'CS' : c === 'ball' ? 'B' : c === 'foul' ? 'F' : c === 'play' ? 'IP' : ''}
                            </span>
                          )
                        })}
                      </span>
                      <span style={{ color: C.faint }}>{ender ? `ended: ${ender}` : ''}</span>
                    </div>
                  )
                })}
              </div>
              <p style={note}>Each dot is a pitch in the at-bat, coloured by type and marked with how it turned out (B ball, CS called strike, SS swinging strike, F foul, IP in play). The ringed dot is the next pitch in your selection; dots after it are faded. Hover a dot for the details.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
