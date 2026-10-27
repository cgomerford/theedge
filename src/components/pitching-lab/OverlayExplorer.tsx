'use client'

// src/components/pitching-lab/OverlayExplorer.tsx
//
// Pitching Lab → Hot Zone Overlay. Set one pitcher against one hitter and see where the pitcher throws, count by count, next to where
// that hitter has the least to show for it. Two ideas carry it:
//
//   1. The hitter's numbers are taken only against pitches that LOOK like this pitcher's. For each pitch type we measure the pitcher's
//      spread of speed, spin, rise and arm-side break (mean and standard deviation, this season), then keep the hitter's pitches of the
//      same type, from pitchers who throw with the same hand, whose speed, spin, rise and arm-side break all sit within a chosen number of
//      standard deviations of the pitcher's average. Tighter or wider is a switch, and so is how many seasons are read (default two, up to five) for the pitcher and the hitter alike.
//   2. Everything is a count of real pitches. Nothing is projected: it says where he has thrown and where the hitter has struggled
//      against pitches like these, and where the two meet. Small samples carry a red star, the count is always shown.
//
// Data: the pitcher's per-pitch log (/api/mlb/pitch-log) and the hitter's (/api/mlb/batter-pitch-log, this season and last). Zone maths:
// src/lib/zone-stats.ts. The hitter is chosen by search, or from the next game's lineup when one is scheduled.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Headshot } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import type { LabRole } from '@/lib/lab-log'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { BatterPitchLog, RawBatterPitch } from '@/lib/batter-pitch-log'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { ALL_ZONES, IN_ZONE, OUT_ZONE, aggregate, metric, smallFor, type Agg, type MetricKey, type ZonePitch } from '@/lib/zone-stats'
import { SmoothHeatmap } from './ArsenalExtras'
import { buildPaths } from './PitchFlight'
import { BLUE, IX, IZ, NEUTRAL, Pills, RED, SC, VH, VW, cellRect, kick, labelAt, mix, note, px, pz, star, tile, zoneName } from './LocationExplorer'

type Person = { id: number; fullName: string; primaryPosition?: string }
type CountKey = 'all' | 'first' | 'ahead' | 'even' | 'behind' | 'two'
const COUNTS: [CountKey, string, (p: { balls: number | null; strikes: number | null }) => boolean][] = [
  ['all', 'Any count', () => true],
  ['first', '0-0', p => p.balls === 0 && p.strikes === 0],
  ['ahead', 'Pitcher ahead', p => p.balls != null && p.strikes != null && p.strikes > p.balls],
  ['even', 'Even', p => p.balls != null && p.strikes != null && p.balls === p.strikes],
  ['behind', 'Pitcher behind', p => p.balls != null && p.strikes != null && p.balls > p.strikes],
  ['two', 'Two strikes', p => p.strikes === 2],
]
type Measure = 'whiff' | 'xwoba' | 'slg' | 'ba'
const MEASURES: [Measure, string][] = [['whiff', 'Whiff'], ['xwoba', 'xwOBA'], ['slg', 'SLG'], ['ba', 'BA']]
const MIN_CHANCES: Record<Measure, number> = { whiff: 6, xwoba: 5, slg: 5, ba: 5 }
const SPREAD: Record<Measure, number> = { whiff: 0.15, xwoba: 0.15, slg: 0.25, ba: 0.1 }
const TIGHT: [string, string][] = [['1', 'Close (±1 SD)'], ['1.5', 'Standard (±1½ SD)'], ['2', 'Wide (±2 SD)']]
const FLOOR = { v: 1.5, s: 150, i: 2.5, a: 2.5 }   // a standard deviation never counts as narrower than this: speed mph, spin rpm, break inches (one pitcher's own game-to-game spread is tighter than hitters can tell apart)

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
function spread(a: number[], floor: number): [number, number] | null {
  const m = mean(a)
  if (m == null || a.length < 5) return null
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length
  return [m, Math.max(Math.sqrt(v), floor)]
}

type Profile = { type: string; n: number; v: [number, number] | null; s: [number, number] | null; i: [number, number] | null; a: [number, number] | null }

/** The pitcher's spread of speed, spin, rise and arm-side break for one pitch type. */
function profileOf(type: string, ps: RawPitch[], throws: 'L' | 'R'): Profile {
  const mine = ps.filter(p => p.pitchType === type)
  const sign = throws === 'L' ? 1 : -1
  return {
    type, n: mine.length,
    v: spread(mine.flatMap(p => (p.velo != null ? [p.velo] : [])), FLOOR.v),
    s: spread(mine.flatMap(p => (p.spinRate != null ? [p.spinRate] : [])), FLOOR.s),
    i: spread(mine.flatMap(p => (p.pfx ? [p.pfx[1] * 12] : [])), FLOOR.i),
    a: spread(mine.flatMap(p => (p.pfx ? [sign * p.pfx[0] * 12] : [])), FLOOR.a),
  }
}

/** True when the hitter's pitch sits within k standard deviations of the profile on speed, spin, rise and arm-side break. */
function looksLike(b: RawBatterPitch, pr: Profile, k: number): boolean {
  if (!pr.v || !pr.s || !pr.i || !pr.a) return false
  if (b.releaseSpeed == null || b.spinRate == null || b.pfxX == null || b.pfxZ == null) return false
  const sign = b.pitcherThrows === 'L' ? 1 : -1
  return Math.abs(b.releaseSpeed - pr.v[0]) <= k * pr.v[1]
    && Math.abs(b.spinRate - pr.s[0]) <= k * pr.s[1]
    && Math.abs(b.pfxZ * 12 - pr.i[0]) <= k * pr.i[1]
    && Math.abs(sign * b.pfxX * 12 - pr.a[0]) <= k * pr.a[1]
}

const toZP = (b: RawBatterPitch): ZonePitch => ({ zone: b.zone, description: b.description, result: b.result, isHit: b.isHit, exitVelo: b.launchSpeed, woba: b.woba, xwoba: b.xwoba, wobaDen: b.wobaDen })

const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
const val = (a: Agg, m: Measure) => metric(a, m, 0)
const chancesOf = (a: Agg, m: Measure) => val(a, m).chances
/** Hitter value that is low when the hitter struggles: whiff is flipped so every measure reads "lower is worse for the hitter". */
const poor = (a: Agg, m: Measure): number | null => { const v = val(a, m).v; return v == null ? null : m === 'whiff' ? -v : v }

function weakest(byZone: Record<string, Agg>, m: Measure, n: number): string[] {
  return ALL_ZONES
    .filter(z => chancesOf(byZone[z], m) >= MIN_CHANCES[m] && poor(byZone[z], m) != null)
    .sort((a, b) => (poor(byZone[a], m) as number) - (poor(byZone[b], m) as number))
    .slice(0, n) as string[]
}
function topShare(byZone: Record<string, Agg>, n: number): [string, number][] {
  const tot = ALL_ZONES.reduce((s, z) => s + byZone[z].n, 0)
  return tot === 0 ? [] : ALL_ZONES.map(z => [z, byZone[z].n / tot] as [string, number]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, n)
}

export default function OverlayExplorer({ id, role = 'pitcher', fixedName = '', lineup, lineupLabel }: { id: number; role?: LabRole; fixedName?: string; lineup?: { id: number; name: string; order: number }[]; lineupLabel?: string }) {
  const season = new Date().getFullYear()
  const [logState, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  // Pitcher lab: the pitcher is fixed and a hitter is chosen. Batting lab: the hitter is fixed and a pitcher is chosen.
  const [pitcher, setPitcher] = useState<Person | null>(null)
  const pid = role === 'pitcher' ? id : pitcher?.id ?? null
  const pitcherId = pid ?? 0
  const [bNames, setBNames] = useState<Record<number, string>>({})
  const log: PitcherPitchLog = logState && logState !== 'error' ? logState : { pitcherId: 0, season, pitches: [], pitchNames: {}, batterNames: {}, batterActive: {}, throws: null }
  const [pitch, setPitch] = useState('ALL')
  const [count, setCount] = useState<CountKey>('all')
  const [measure, setMeasure] = useState<Measure>('whiff')
  const [tight, setTight] = useState('1.5')
  const [years, setYears] = useState(2)
  const [matchOn, setMatchOn] = useState<'match' | 'type'>('match')
  const [batter, setBatter] = useState<Person | null>(role === 'batter' ? { id, fullName: fixedName } : null)
  const [bLog, setBLog] = useState<RawBatterPitch[] | null | 'error' | 'locked'>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [next, setNext] = useState<{ nextStart: { opponentName: string; date: string; isHome: boolean } | null; lineup: { id: number; name: string; order: number }[]; lineupSource: string } | null>(null)
  const gen = useRef(0)

  // How many seasons to read, for the pitcher and the hitter alike. Wider means more pitches to match against and a steadier picture.
  const seasonList = useMemo(() => Array.from({ length: years }, (_, i) => season - i), [years, season])

  useEffect(() => {
    if (pid == null) return
    let off = false
    Promise.all(seasonList.map(y => fetch(`/api/mlb/pitch-log?playerId=${pid}&season=${y}`).then(r => r.json()).then(j => (j.error ? null : (j as PitcherPitchLog))).catch(() => null))).then(all => {
      if (off) return
      const got = all.filter((x): x is PitcherPitchLog => !!x)
      if (got.length === 0) { setLog('error'); return }
      setLog({ ...got[0], pitches: got.flatMap(g => g.pitches), pitchNames: Object.assign({}, ...got.map(g => g.pitchNames)), batterNames: Object.assign({}, ...got.map(g => g.batterNames)) })
    })
    return () => { off = true }
  }, [pid, seasonList])

  useEffect(() => {
    if (role !== 'pitcher') return
    let off = false
    fetch(`/api/mlb/next-start?playerId=${pitcherId}`).then(r => r.json()).then(j => { if (!off && !j.error) setNext(j) }).catch(() => {})
    return () => { off = true }
  }, [role, pitcherId])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const my = ++gen.current
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => { if (my === gen.current) setResults((d.people ?? []).slice(0, 6)) }).catch(() => { if (my === gen.current) setResults([]) })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!batter) return
    let off = false
    const one = (y: number) => fetch(`/api/mlb/batter-pitch-log?batterId=${batter.id}&season=${y}`).then(async r => (r.status === 401 || r.status === 402 || r.status === 403 ? 'locked' as const : r.ok ? ((await r.json()) as BatterPitchLog) : null)).catch(() => null)
    Promise.all(seasonList.map(one)).then(all => {
      if (off) return
      if (all.some(a => a === 'locked')) { setBLog('locked'); return }
      const logs = all.filter((x): x is BatterPitchLog => !!x && x !== 'locked')
      setBNames(Object.assign({}, ...logs.map(l => l.pitcherNames)))
      setBLog(logs.length ? logs.flatMap(l => l.pitches) : 'error')
    })
    return () => { off = true }
  }, [batter, seasonList])

  const throws = logState && logState !== 'error' ? log.throws : null
  const types = useMemo(() => {
    if (!logState || logState === 'error') return []
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, name: log.pitchNames[t] ?? t }))
  }, [log])
  const flights = useMemo(() => (logState && logState !== 'error' ? buildPaths(log) : []), [log])
  const profiles = useMemo(() => (logState && logState !== 'error' && throws ? types.map(t => profileOf(t.t, log.pitches, throws)) : []), [log, types, throws])

  const bList = bLog && bLog !== 'error' && bLog !== 'locked' ? bLog : null
  // His side of the plate against this pitcher's hand (a switch hitter bats the other way).
  const stand = useMemo<'L' | 'R' | null>(() => {
    if (!bList || !throws) return null
    let l = 0, r = 0
    for (const p of bList) if (p.pitcherThrows === throws) { if (p.stand === 'L') l++; else if (p.stand === 'R') r++ }
    return l === 0 && r === 0 ? null : l >= r ? 'L' : 'R'
  }, [bList, throws])

  const k = Number(tight)
  const countFn = COUNTS.find(c => c[0] === count)![2]
  // The hitter's pitches against this hand, split by pitch type, and the part of each that matches the pitcher's spread.
  const sameType = useMemo(() => {
    const m = new Map<string, RawBatterPitch[]>()
    if (!bList || !throws) return m
    for (const b of bList) if (b.pitcherThrows === throws) { if (!m.has(b.pitchType)) m.set(b.pitchType, []); m.get(b.pitchType)!.push(b) }
    return m
  }, [bList, throws])
  const matched = useMemo(() => {
    const m = new Map<string, RawBatterPitch[]>()
    for (const pr of profiles) m.set(pr.type, (sameType.get(pr.type) ?? []).filter(b => looksLike(b, pr, k)))
    return m
  }, [profiles, sameType, k])

  const chosen = (t: string) => (matchOn === 'match' ? matched.get(t) : sameType.get(t)) ?? []
  const B = useMemo(() => (pitch === 'ALL' ? profiles.flatMap(p => chosen(p.type)) : chosen(pitch)).filter(countFn), [profiles, pitch, matched, sameType, matchOn, countFn]) // eslint-disable-line react-hooks/exhaustive-deps
  const P = useMemo(() => (!logState || logState === 'error' ? [] : log.pitches.filter(p => (pitch === 'ALL' || p.pitchType === pitch) && (stand == null || p.stand === stand) && countFn(p))), [log, pitch, stand, countFn])
  const aggB = useMemo(() => aggregate(B.map(toZP)), [B])
  const aggP = useMemo(() => aggregate(P), [P])

  if (logState === 'error') return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Couldn&apos;t load these pitches right now.</p>
  if (logState === null && pid != null) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Loading every pitch…</p>

  const name = pitch === 'ALL' ? 'All pitches' : log.pitchNames[pitch] ?? pitch
  const zonedP = ALL_ZONES.reduce((s, z) => s + aggP.byZone[z].n, 0)
  const share = (z: string) => (zonedP > 0 ? aggP.byZone[z].n / zonedP : 0)
  const overall = poor(aggB.all, measure)
  const weak4 = weakest(aggB.byZone, measure, 4)
  const inWeak = weak4.reduce((s, z) => s + share(z), 0)
  const allP = log.pitches.filter(p => (pitch === 'ALL' || p.pitchType === pitch))
  const allAgg = aggregate(allP)
  const allZoned = ALL_ZONES.reduce((s, z) => s + allAgg.byZone[z].n, 0)
  const baseInWeak = allZoned > 0 ? weak4.reduce((s, z) => s + allAgg.byZone[z].n, 0) / allZoned : 0
  const mDef = MEASURES.find(m => m[0] === measure)![1]

  function cellFill(z: string): string {
    const a = aggB.byZone[z]
    if (!batter || chancesOf(a, measure) < MIN_CHANCES[measure] || overall == null) return '#faf8f3'
    const v = poor(a, measure) as number
    const d = Math.max(-1, Math.min(1, (v - overall) / SPREAD[measure]))   // positive = the hitter does better here than overall
    return d >= 0 ? mix(NEUTRAL, RED, d) : mix(NEUTRAL, BLUE, -d)
  }

  const bName = batter?.fullName ?? ''
  const typeRows = types.map(t => {
    const pr = profiles.find(p => p.type === t.t)!
    const all = sameType.get(t.t) ?? [], m = matched.get(t.t) ?? []
    const use = matchOn === 'match' ? m : all
    return { t, pr, all: all.length, m: m.length, agg: aggregate(use.map(toZP)).all }
  })

  return (
    <div className="ov-grid">
      <style>{`.ov-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.ov-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.ov-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A;font-family:inherit}.ov-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.ov-btn.on{border-color:#FF5722;background:#fff1ea}.ov-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.ov-span2{grid-column:span 2}.ov-span3{grid-column:1 / -1}.ov-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.ov-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:right;padding:6px 8px;border-bottom:1px solid #e7e2d8}.ov-tbl th:first-child,.ov-tbl td:first-child{text-align:left}.ov-tbl td{text-align:right;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.ov-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.ov-grid{grid-template-columns:minmax(0,1fr)}.ov-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.ov-btn{width:auto;white-space:nowrap}.ov-tiles{grid-template-columns:minmax(0,1fr)}.ov-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="ov-side" aria-label="Pitch types">
        <button type="button" className={`ov-btn${pitch === 'ALL' ? ' on' : ''}`} onClick={() => setPitch('ALL')}>
          <span style={{ width: 14, height: 14, borderRadius: 999, background: '#1A1A1A', flexShrink: 0 }} />
          <span>All pitches<small>{log.pitches.length} pitches</small></span>
        </button>
        {types.map(t => {
          const f = flights.find(x => x.type === t.t)
          return (
            <button key={t.t} type="button" className={`ov-btn${pitch === t.t ? ' on' : ''}`} onClick={() => setPitch(t.t)}>
              <SpinBall code={t.t} size={30} spin={{ rpm: f?.spin ?? null, ivb: f?.ivb ?? null, hb: f?.hb ?? null }} />
              <span>{t.name}<small>{((t.n / log.pitches.length) * 100).toFixed(0)}% · {t.n} pitches</small></span>
            </button>
          )
        })}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ ...tile, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={kick}>{role === 'batter' ? `Choose a pitcher to set against ${fixedName || 'the hitter'}` : `Choose a hitter to set against ${name === 'All pitches' ? 'the pitcher' : name}`}</div>
          {(role === 'pitcher' ? batter : pitcher) ? (() => {
            const who = (role === 'pitcher' ? batter : pitcher)!
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Headshot id={who.id} name={who.fullName} size={48} />
                <div>
                  <b style={{ fontSize: 22, fontWeight: 800 }}>{who.fullName}</b>
                  <div style={{ fontSize: 13, color: C.mute }}>
                    {role === 'batter' && throws ? `Throws ${throws === 'L' ? 'left' : 'right'} · ` : ''}{stand ? `${role === 'batter' ? fixedName.split(' ').slice(-1)[0] + ' bats' : 'Bats'} ${stand === 'L' ? 'left' : 'right'} against ${throws === 'L' ? 'left' : 'right'}-handers` : bLog === null ? 'Loading the pitches…' : ''}{bList ? ` · ${bList.length} pitches seen, ${years === 1 ? season : `${season - years + 1}–${season}`}` : ''}
                  </div>
                </div>
                <button type="button" onClick={() => { if (role === 'pitcher') setBatter(null); else { setPitcher(null); setLog(null) } if (role === 'pitcher') setBLog(null); setQuery('') }} style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer' }}>{role === 'batter' ? 'Change pitcher' : 'Change hitter'}</button>
              </div>
            )
          })() : (
            <>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={role === 'batter' ? 'Search a pitcher' : 'Search a hitter'} aria-label={role === 'batter' ? 'Search a pitcher' : 'Search a hitter'} style={{ fontFamily: SANS, fontSize: 15, padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, maxWidth: 360 }} />
              {query.trim().length >= 3 && results.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {results.map(r => <button key={r.id} type="button" onClick={() => { if (role === 'pitcher') { setBatter(r); setBLog(null) } else { setPitcher(r); setLog(null) } setResults([]) }} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}>{r.fullName}</button>)}
                </div>
              )}
              {role === 'batter' ? (() => {
                const by = new Map<number, number>()
                for (const b of bList ?? []) if (b.pitcherId != null && (b.wobaDen ?? 0) > 0) by.set(b.pitcherId, (by.get(b.pitcherId) ?? 0) + 1)
                const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
                return top.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginBottom: 6 }}>Pitchers he has faced most</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {top.map(([pid2, n]) => <button key={pid2} type="button" onClick={() => { setPitcher({ id: pid2, fullName: bNames[pid2] ?? `#${pid2}` }); setLog(null) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px 4px 6px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}><Headshot id={pid2} name={bNames[pid2] ?? ''} size={24} />{bNames[pid2] ?? `#${pid2}`} <span style={{ fontWeight: 600, color: C.faint }}>{n} PA</span></button>)}
                    </div>
                  </div>
                ) : <div style={{ fontSize: 13, color: C.mute }}>{bLog === null ? 'Loading his pitchers…' : 'Search any pitcher.'}</div>
              })() : (
              <div style={{ fontSize: 13, color: C.mute }}>
                {lineup && lineup.length > 0 ? (
                  <>
                    <div style={{ marginBottom: 6 }}>{lineupLabel ?? 'Lineup'}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {lineup.map(b => <button key={b.id} type="button" onClick={() => { setBatter({ id: b.id, fullName: b.name }); setBLog(null) }} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}>{b.order}. {b.name}</button>)}
                    </div>
                  </>
                ) : next?.nextStart && next.lineup.length > 0 ? (
                  <>
                    <div style={{ marginBottom: 6 }}>Next game: {next.nextStart.isHome ? 'vs' : 'at'} {next.nextStart.opponentName}, {next.nextStart.date} ({next.lineupSource} lineup)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {next.lineup.map(b => <button key={b.id} type="button" onClick={() => { setBatter({ id: b.id, fullName: b.name }); setBLog(null) }} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}>{b.order}. {b.name}</button>)}
                    </div>
                  </>
                ) : next ? 'No next game with a lineup is scheduled yet, so search any hitter.' : ''}
              </div>
              )}
            </>
          )}
        </div>

        {role === 'batter' && !pitcher ? null : (<>
        {bLog === 'locked' && <p style={{ fontSize: 14, color: C.mute }}>This hitter&apos;s pitches need a deep look or Pro.</p>}
        {bLog === 'error' && <p style={{ fontSize: 14, color: C.mute }}>Couldn&apos;t load this hitter&apos;s pitches right now.</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
          <Pills items={COUNTS.map(c => [c[0], c[1]] as [CountKey, string])} value={count} onChange={setCount} />
          {batter && <Pills items={MEASURES} value={measure} onChange={setMeasure} />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
          <Pills items={[['1', 'This season'], ['2', 'Last 2 seasons'], ['3', 'Last 3'], ['5', 'Last 5']] as [string, string][]} value={String(years)} onChange={v => setYears(Number(v))} />
          {batter && <Pills items={[['match', 'Pitches like these'], ['type', 'Every pitch of that type']] as ['match' | 'type', string][]} value={matchOn} onChange={setMatchOn} />}
          {batter && matchOn === 'match' && <Pills items={TIGHT.map(([v, l]) => [v, l] as [string, string])} value={tight} onChange={setTight} />}
        </div>

        <div className="ov-tiles">
          <div className="ov-span2" style={tile}>
            <div style={kick}>{name} · {batter ? `where it is thrown to ${bName}, and where ${bName.split(' ').slice(-1)[0]} struggles` : 'where it is thrown'} · batter&apos;s view</div>
            <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="Pitcher locations over the hitter's weak zones" style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block', margin: '8px auto 0' }}>
              {[...OUT_ZONE, ...IN_ZONE].map(z => {
                const r = cellRect(z), L = labelAt(z), a = aggB.byZone[z], inner = Number(z) <= 9
                const isWeak = weak4.includes(z), s = share(z)
                const bv = val(a, measure)
                const small = smallFor(measure === 'whiff' ? 'whiff' : measure, bv.chances, MIN_SAMPLE.zoneCellPitches)
                return (
                  <g key={z} role="img" aria-label={`${zoneName(z)}: ${(s * 100).toFixed(0)}% of pitches here${batter ? `, hitter ${mDef} ${bv.text}` : ''}`}>
                    <rect x={px(r.x0)} y={pz(r.z1)} width={(r.x1 - r.x0) * SC} height={(r.z1 - r.z0) * SC} fill={cellFill(z)} stroke={isWeak ? C.orange : '#fff'} strokeWidth={isWeak ? 4 : 2} />
                    <text x={L.x} y={L.y - (inner ? 4 : 2)} textAnchor="middle" fontSize={inner ? 21 : 18} fontWeight="800" fill={C.ink} fontFamily={SANS}>{(s * 100).toFixed(0)}%</text>
                    {batter && <text x={L.x} y={L.y + (inner ? 12 : 11)} textAnchor="middle" fontSize="11" fill="#3a352c" fontFamily={SANS}>{bv.chances < MIN_CHANCES[measure] ? 'too few' : `${mDef} ${bv.text}${small ? '*' : ''}`}</text>}
                    <text x={L.x} y={L.y + (inner ? 25 : 24)} textAnchor="middle" fontSize="10" fill="#5b5347" fontFamily={SANS}>{batter ? `${bv.chances} ${measure === 'whiff' ? 'swings' : measure === 'xwoba' ? 'PA' : 'AB'}` : `n = ${aggP.byZone[z].n}`}</text>
                  </g>
                )
              })}
              <rect x={px(IX[0])} y={pz(IZ[0])} width={(IX[3] - IX[0]) * SC} height={(IZ[0] - IZ[3]) * SC} fill="none" stroke="#1A1A1A" strokeWidth="2" pointerEvents="none" />
            </svg>
            <p style={note}>
              The big number is the share of the pitcher's pitches in that zone{stand ? ` to ${stand === 'L' ? 'left' : 'right'}-handed hitters` : ''}{count !== 'all' ? ', in this count' : ''}. {batter ? <>The small line is {bName}&apos;s {mDef} against pitches {matchOn === 'match' ? 'like his' : 'of that type'}. Blue is where the hitter does worse than his own average, red where he does better, and an orange outline marks the hitter's four weakest zones. {star} is a small sample.</> : 'Choose a hitter above to set him against it.'}
            </p>
          </div>

          <div style={tile}>
            <div style={kick}>Where the two meet</div>
            {!batter ? <p style={{ ...note, marginTop: 10 }}>Choose a hitter to see it.</p> : bList === null ? <p style={{ ...note, marginTop: 10 }}>Loading…</p> : weak4.length === 0 ? (
              <p style={{ ...note, marginTop: 10 }}>Not enough pitches like these in this count to rank zones. Try Wide, or Any count.</p>
            ) : (
              <>
                <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.5, color: '#3a352c' }}>
                  {bName}&apos;s four weakest {mDef} zones are {weak4.map(zoneName).join(', ')}. In this view the pitcher puts <b>{(inWeak * 100).toFixed(0)}%</b> of pitches there{stand ? `, against ${(baseInWeak * 100).toFixed(0)}% across all hitters` : ''}.
                </p>
                <table className="ov-tbl" style={{ marginTop: 8 }}>
                  <thead><tr><th>Zone</th><th>Hitter {mDef}</th><th>Thrown</th></tr></thead>
                  <tbody>
                    {weak4.map(z => { const bv = val(aggB.byZone[z], measure); return <tr key={z}><td style={{ fontWeight: 800 }}>{zoneName(z)}</td><td>{bv.text}{smallFor(measure, bv.chances, 15) && star} <span style={{ color: C.faint }}>({bv.chances})</span></td><td>{(share(z) * 100).toFixed(0)}%</td></tr> })}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="ov-span2" style={{ ...tile, overflowX: 'auto' }}>
            <div style={kick}>{batter ? `How ${bName.split(' ').slice(-1)[0]} handles each of the pitcher's pitches` : 'The range of each pitch'}</div>
            <table className="ov-tbl" style={{ marginTop: 6, minWidth: 640 }}>
              <thead><tr><th>Pitch</th><th>Speed</th><th>Spin</th><th>Rise</th><th>Arm-side</th>{batter && <><th>Matches</th><th>Whiff</th><th>xwOBA</th><th>Hard-hit</th></>}</tr></thead>
              <tbody>
                {typeRows.map(({ t, pr, all, m, agg }) => (
                  <tr key={t.t} style={{ background: pitch === t.t ? '#fff1ea' : undefined, cursor: 'pointer' }} onClick={() => setPitch(pitch === t.t ? 'ALL' : t.t)}>
                    <td style={{ fontWeight: 800 }}>{t.name}</td>
                    <td>{pr.v ? `${pr.v[0].toFixed(1)} ± ${pr.v[1].toFixed(1)}` : '—'}</td>
                    <td>{pr.s ? `${Math.round(pr.s[0])} ± ${Math.round(pr.s[1])}` : '—'}</td>
                    <td>{pr.i ? `${pr.i[0].toFixed(1)} ± ${pr.i[1].toFixed(1)}` : '—'}</td>
                    <td>{pr.a ? `${pr.a[0].toFixed(1)} ± ${pr.a[1].toFixed(1)}` : '—'}</td>
                    {batter && <>
                      <td title={`${m} of ${all} pitches of this type from ${throws === 'L' ? 'left' : 'right'}-handers match`}>{matchOn === 'match' ? `${m} of ${all}` : all}</td>
                      <td>{val(agg, 'whiff').text}{smallFor('whiff', agg.swings, 15) && agg.swings > 0 && star}</td>
                      <td>{val(agg, 'xwoba').text}{smallFor('xwoba', agg.den, 15) && agg.den > 0 && star}</td>
                      <td>{metric(agg, 'hard', 0).text}{smallFor('hard', agg.bbe, 15) && agg.bbe > 0 && star}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={note}>Each pitch shows the average and one standard deviation, over the seasons chosen above, of speed (mph), spin (rpm), rise and arm-side break (inches). {batter ? `A pitch the hitter faced counts as a match when it is the same type, from a pitcher who throws with the same hand, and all four numbers fall within ${tight} standard deviation${tight === '1' ? '' : 's'} of these (a standard deviation is never counted as less than 1.5 mph, 150 rpm, or 2.5 inches). The result columns use ${matchOn === 'match' ? 'those matches' : 'every pitch of the type'}.` : ''}</p>
          </div>

          <SmoothHeatmap pitches={P} title={`${name} · ${stand ? (stand === 'L' ? 'to lefties' : 'to righties') : 'all hitters'}`} counts={false} />

          {batter && bList && (
            <>
              <SmoothHeatmap pitches={B.filter(b => b.description === 'swinging_strike' || b.description === 'swinging_strike_blocked')} title={`${bName.split(' ').slice(-1)[0]} swings and misses`} counts={false} />
              <SmoothHeatmap pitches={B.filter(b => b.description === 'hit_into_play' && (b.launchSpeed ?? 0) >= 95)} title={`${bName.split(' ').slice(-1)[0]} hits it hard`} counts={false} />
            </>
          )}

          {batter && bList && (
            <div className="ov-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>By count · where it is thrown, where {bName.split(' ').slice(-1)[0]} struggles</div>
              <table className="ov-tbl" style={{ marginTop: 6, minWidth: 640 }}>
                <thead><tr><th>Count</th><th>Pitches</th><th>Thrown most to</th><th>Hitter&apos;s weakest {mDef} zones</th><th>Both</th></tr></thead>
                <tbody>
                  {COUNTS.filter(c => c[0] !== 'all').map(([ck, label, fn]) => {
                    const pAgg = aggregate((log.pitches).filter(p => (pitch === 'ALL' || p.pitchType === pitch) && (stand == null || p.stand === stand) && fn(p)))
                    const bAgg = aggregate((pitch === 'ALL' ? profiles.flatMap(p => chosen(p.type)) : chosen(pitch)).filter(fn).map(toZP))
                    const goes = topShare(pAgg.byZone, 3), low = weakest(bAgg.byZone, measure, 3)
                    const both = goes.map(g => g[0]).filter(z => low.includes(z))
                    return (
                      <tr key={ck}>
                        <td style={{ fontWeight: 800 }}>{label}</td>
                        <td>{pAgg.all.n}</td>
                        <td>{goes.length ? goes.map(([z, s]) => `${zoneName(z).replace(' (middle)', '')} ${(s * 100).toFixed(0)}%`).join(' · ') : '—'}</td>
                        <td>{low.length ? low.map(z => `${zoneName(z).replace(' (middle)', '')} ${val(bAgg.byZone[z], measure).text}`).join(' · ') : <span style={{ color: C.faint }}>not enough pitches</span>}</td>
                        <td style={{ fontWeight: 800, color: both.length ? C.orange : C.faint }}>{both.length ? both.map(z => zoneName(z).replace(' (middle)', '')).join(', ') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p style={note}>Zones are ranked only where the hitter has at least {MIN_CHANCES[measure]} {measure === 'whiff' ? 'swings' : measure === 'xwoba' ? 'plate appearances' : 'at-bats'} against pitches like these. &ldquo;Both&rdquo; lists a zone that is among the three he throws to most and among the hitter&apos;s three weakest. It describes what has happened, not what will.</p>
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  )
}
