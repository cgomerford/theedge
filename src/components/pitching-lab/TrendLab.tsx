'use client'

// src/components/pitching-lab/TrendLab.tsx
//
// Pitching Lab → Trends. Is he the same player as in April? A set of main trends (speed, spin, the pitch mix, whiffs, the strike zone,
// contact quality) and a builder: choose any measure, any pitches, either hitter side, game by game or month by month, one to five seasons,
// an optional rolling average, lines or bars, and save it under a name (kept in this browser). Everything is counted from the per-pitch
// log (src/lib/pitcher-pitch-log.ts); a rate point is drawn only when enough pitches stand behind it, and the count shows on hover.
// Lines are always straight between points. A rolling average pools the counts of the last few games (it is not a curve fit).
//
// The tab needs an account, so the builder is for signed-in and Pro viewers only. Saved trends live in localStorage (per browser), not in a database.

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { buildPaths } from './PitchFlight'
import { fetchLabLog, onlyHand, type LabRole } from '@/lib/lab-log'
import { Pills, kick, note, star, tile } from './LocationExplorer'

// ─── Measures ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'hit_into_play'])
const isIn = (z: string | null) => z != null && Number(z) >= 1 && Number(z) <= 9

type MKey = 'ev' | 'la' | 'batspeed' | 'swinglen' | 'velo' | 'spin' | 'ext' | 'relz' | 'relx' | 'arm' | 'ivb' | 'hb' | 'usage' | 'whiff' | 'csw' | 'zone' | 'chase' | 'swing' | 'hard' | 'xwoba' | 'pitches'
type Measure = { key: MKey; label: string; group: string; unit: string; digits: number; min: number; sum?: boolean; needsType?: boolean; per: (p: RawPitch, t: string | null) => [number, number]; hint: string; armSign?: boolean }
const MEASURES: Measure[] = [
  { key: 'velo', label: 'Velocity', group: 'Stuff', unit: ' mph', digits: 1, min: 8, per: p => (p.velo != null ? [p.velo, 1] : [0, 0]), hint: 'Average release speed' },
  { key: 'spin', label: 'Spin rate', group: 'Stuff', unit: ' rpm', digits: 0, min: 8, per: p => (p.spinRate != null ? [p.spinRate, 1] : [0, 0]), hint: 'Average spin rate' },
  { key: 'ivb', label: 'Rise (induced vertical break)', group: 'Stuff', unit: '"', digits: 1, min: 8, per: p => (p.pfx ? [p.pfx[1] * 12, 1] : [0, 0]), hint: 'Average inches of rise against a pitch with no spin' },
  { key: 'hb', label: 'Arm-side break', group: 'Stuff', unit: '"', digits: 1, min: 8, armSign: true, per: p => (p.pfx ? [p.pfx[0] * 12, 1] : [0, 0]), hint: 'Average inches of break toward the arm side' },
  { key: 'ext', label: 'Extension', group: 'Delivery', unit: ' ft', digits: 2, min: 8, per: p => (p.extension != null ? [p.extension, 1] : [0, 0]), hint: 'Average feet in front of the rubber at release' },
  { key: 'relz', label: 'Release height', group: 'Delivery', unit: ' ft', digits: 2, min: 8, per: p => (p.releasePosZ != null ? [p.releasePosZ, 1] : [0, 0]), hint: 'Average release height' },
  { key: 'relx', label: 'Release side', group: 'Delivery', unit: ' ft', digits: 2, min: 8, per: p => (p.releasePosX != null ? [p.releasePosX, 1] : [0, 0]), hint: 'Average release position across the rubber, batter’s view' },
  { key: 'arm', label: 'Arm angle', group: 'Delivery', unit: '°', digits: 1, min: 8, per: p => (p.armAngle != null ? [p.armAngle, 1] : [0, 0]), hint: 'Average arm angle' },
  { key: 'usage', label: 'Pitch mix (share of pitches)', group: 'Approach', unit: '%', digits: 1, min: 15, needsType: true, per: (p, t) => [p.pitchType === t ? 1 : 0, 1], hint: 'Share of the pitches thrown that were this pitch' },
  { key: 'zone', label: 'Zone rate', group: 'Approach', unit: '%', digits: 1, min: 8, per: p => (p.zone ? [isIn(p.zone) ? 1 : 0, 1] : [0, 0]), hint: 'Pitches in the strike zone' },
  { key: 'pitches', label: 'Pitches thrown', group: 'Approach', unit: '', digits: 0, min: 1, sum: true, per: () => [1, 1], hint: 'How many pitches' },
  { key: 'whiff', label: 'Whiff rate', group: 'Results', unit: '%', digits: 1, min: 6, per: p => (SWING.has(p.description ?? '') ? [WHIFF.has(p.description ?? '') ? 1 : 0, 1] : [0, 0]), hint: 'Swings and misses per swing' },
  { key: 'csw', label: 'Called + swinging strike rate', group: 'Results', unit: '%', digits: 1, min: 8, per: p => [p.description === 'called_strike' || WHIFF.has(p.description ?? '') ? 1 : 0, 1], hint: 'Called strikes plus swinging strikes per pitch' },
  { key: 'swing', label: 'Swing rate', group: 'Results', unit: '%', digits: 1, min: 8, per: p => [SWING.has(p.description ?? '') ? 1 : 0, 1], hint: 'Swings per pitch' },
  { key: 'chase', label: 'Chase rate', group: 'Results', unit: '%', digits: 1, min: 6, per: p => (p.zone && !isIn(p.zone) ? [SWING.has(p.description ?? '') ? 1 : 0, 1] : [0, 0]), hint: 'Swings per pitch outside the zone' },
  { key: 'hard', label: 'Hard-hit rate', group: 'Results', unit: '%', digits: 1, min: 5, per: p => (p.description === 'hit_into_play' && p.exitVelo != null ? [p.exitVelo >= 95 ? 1 : 0, 1] : [0, 0]), hint: 'Balls in play hit 95 mph or harder' },
  { key: 'xwoba', label: 'xwOBA against', group: 'Results', unit: '', digits: 3, min: 5, per: p => (p.wobaDen != null && p.wobaDen > 0 ? [p.description === 'hit_into_play' && p.xwoba != null ? p.xwoba : p.woba ?? 0, p.wobaDen] : [0, 0]), hint: 'Expected wOBA on balls in play, actual wOBA on walks and strikeouts' },
]
const BATTER_ONLY: Measure[] = [
  { key: 'ev', label: 'Exit speed', group: 'Contact', unit: ' mph', digits: 1, min: 5, per: p => (p.description === 'hit_into_play' && p.exitVelo != null ? [p.exitVelo, 1] : [0, 0]), hint: 'Average exit speed on balls in play' },
  { key: 'la', label: 'Launch angle', group: 'Contact', unit: '°', digits: 1, min: 5, per: p => (p.description === 'hit_into_play' && p.launchAngle != null ? [p.launchAngle, 1] : [0, 0]), hint: 'Average launch angle on balls in play' },
  { key: 'batspeed', label: 'Bat speed', group: 'Contact', unit: ' mph', digits: 1, min: 8, per: p => (p.batSpeed != null ? [p.batSpeed, 1] : [0, 0]), hint: 'Average bat speed on swings' },
  { key: 'swinglen', label: 'Swing length', group: 'Contact', unit: ' ft', digits: 2, min: 8, per: p => (p.swingLength != null ? [p.swingLength, 1] : [0, 0]), hint: 'Average swing length on swings' },
]
const PITCH_ONLY_GROUPS = new Set(['Delivery'])   // a hitter's page has no use for the pitcher's own delivery numbers
const measuresFor = (role: LabRole): Measure[] => (role === 'batter' ? [...BATTER_ONLY, ...MEASURES.filter(m => !PITCH_ONLY_GROUPS.has(m.group)).map(m => (['Stuff', 'Approach'].includes(m.group) ? { ...m, label: m.key === 'usage' ? 'Pitch mix faced (share of pitches)' : m.key === 'zone' ? 'Zone rate of pitches faced' : m.key === 'pitches' ? 'Pitches seen' : `${m.label} faced`, group: m.group === 'Stuff' ? 'Pitches faced' : 'Approach' } : m))] : MEASURES)
const MBY = Object.fromEntries([...MEASURES, ...BATTER_ONLY].map(m => [m.key, m])) as Record<MKey, Measure>
const RATE: MKey[] = ['usage', 'zone', 'whiff', 'csw', 'swing', 'chase', 'hard']

// ─── Config ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Cfg = { metric: MKey; pitches: string[]; split: boolean; side: 'any' | 'L' | 'R'; period: 'game' | 'month'; years: number; roll: number; bars: boolean }
const DEFAULT: Cfg = { metric: 'velo', pitches: [], split: true, side: 'any', period: 'game', years: 1, roll: 1, bars: false }
type Saved = { id: string; name: string; cfg: Cfg }
const STORE = 'x9:pitching-lab-trends'
const STORE_BATTER = 'x9:batting-lab-trends'

const MAIN: { name: string; blurb: string; cfg: Cfg }[] = [
  { name: 'Velocity by pitch', blurb: 'Is the speed holding up?', cfg: { ...DEFAULT, metric: 'velo', split: true } },
  { name: 'Pitch mix', blurb: 'How the pitch mix has moved.', cfg: { ...DEFAULT, metric: 'usage', roll: 3 } },
  { name: 'Whiff rate', blurb: 'Misses per swing, all pitches.', cfg: { ...DEFAULT, metric: 'whiff', roll: 3, split: false } },
  { name: 'Spin rate by pitch', blurb: 'Spin by pitch type.', cfg: { ...DEFAULT, metric: 'spin', split: true } },
  { name: 'Zone rate', blurb: 'How often he is in the zone.', cfg: { ...DEFAULT, metric: 'zone', roll: 3, split: false } },
  { name: 'Hard-hit rate', blurb: 'Balls in play hit 95 mph or more.', cfg: { ...DEFAULT, metric: 'hard', roll: 3, period: 'month', split: false } },
]

const MAIN_BATTER: { name: string; blurb: string; cfg: Cfg }[] = [
  { name: 'Exit speed', blurb: 'How hard he hits the ball.', cfg: { ...DEFAULT, metric: 'ev', split: false, roll: 3 } },
  { name: 'Hard-hit rate', blurb: 'Balls in play at 95 mph or more.', cfg: { ...DEFAULT, metric: 'hard', split: false, roll: 3, period: 'month' } },
  { name: 'xwOBA', blurb: 'Quality of results, by month.', cfg: { ...DEFAULT, metric: 'xwoba', split: false, period: 'month' } },
  { name: 'Whiff rate', blurb: 'Misses per swing.', cfg: { ...DEFAULT, metric: 'whiff', split: false, roll: 3 } },
  { name: 'Chase rate', blurb: 'Swings at pitches outside the zone.', cfg: { ...DEFAULT, metric: 'chase', split: false, roll: 3 } },
  { name: 'Pitch mix faced', blurb: 'What pitchers have thrown him.', cfg: { ...DEFAULT, metric: 'usage', roll: 3, period: 'month' } },
]

// ─── Maths ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Series = { key: string; name: string; color: string }
type Point = { label: string; key: string; [s: string]: number | string | null }

function compute(pitches: RawPitch[], cfg: Cfg, types: { t: string; name: string }[], hand: 'L' | 'R' | null) {
  const m = MBY[cfg.metric]
  const use = pitches.filter(p => cfg.side === 'any' || p.stand === cfg.side)
  const chosen = cfg.pitches.length ? cfg.pitches : m.needsType || cfg.split ? types.slice(0, 5).map(t => t.t) : []
  const series: Series[] = chosen.length ? chosen.map(t => ({ key: t, name: types.find(x => x.t === t)?.name ?? t, color: pitchColor(t) })) : [{ key: 'ALL', name: 'All pitches', color: C.orange }]
  const keyOf = (p: RawPitch) => (cfg.period === 'game' ? p.date : p.date.slice(0, 7))
  const keys = [...new Set(use.map(keyOf))].sort()
  // Per bucket and series: running totals of the numerator and denominator.
  const tot = new Map<string, { num: number; den: number }>()
  for (const p of use) {
    const k = keyOf(p)
    for (const s of series) {
      if (s.key !== 'ALL' && !m.needsType && p.pitchType !== s.key) continue
      const [n, d] = m.per(p, s.key === 'ALL' ? null : s.key)
      if (d === 0 && n === 0) continue
      const id = `${k}|${s.key}`
      const e = tot.get(id) ?? { num: 0, den: 0 }
      e.num += n; e.den += d
      tot.set(id, e)
    }
  }
  const sign = m.armSign && hand === 'R' ? -1 : 1   // arm-side break reads positive toward the arm side for either hand
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const multi = cfg.years > 1
  const label = (k: string) => (cfg.period === 'game' ? `${mon[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}${multi ? ` '${k.slice(2, 4)}` : ''}` : `${mon[Number(k.slice(5, 7)) - 1]}${multi ? ` '${k.slice(2, 4)}` : ''}`)
  const rows: Point[] = keys.map(k => ({ key: k, label: label(k) }))
  const counts: Record<string, Record<string, number>> = {}
  for (const s of series) {
    counts[s.key] = {}
    keys.forEach((k, i) => {
      // Rolling average: pool the counts of this bucket and the ones before it.
      let num = 0, den = 0
      for (let j = Math.max(0, i - cfg.roll + 1); j <= i; j++) { const e = tot.get(`${keys[j]}|${s.key}`); if (e) { num += e.num; den += e.den } }
      counts[s.key][k] = den
      const v = den >= m.min ? (m.sum ? num : (num / den) * sign) : null
      rows[i][s.key] = v == null ? null : RATE.includes(cfg.metric) ? v * 100 : v
    })
  }
  return { rows, series, counts, m }
}

const fmt = (m: Measure, v: number) => `${m.digits === 3 ? v.toFixed(3).replace(/^0\./, '.') : v.toFixed(m.digits)}${m.unit}`

// ─── Chart ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

function TrendChart({ log, cfg, height = 280, title }: { log: PitcherPitchLog; cfg: Cfg; height?: number; title?: string }) {
  const types = useMemo(() => {
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => ({ t, name: log.pitchNames[t] ?? t }))
  }, [log])
  const { rows, series, counts, m } = useMemo(() => compute(log.pitches, cfg, types, log.throws), [log, cfg, types])
  const has = rows.some(r => series.some(s => r[s.key] != null))
  const Chart = cfg.bars ? BarChart : LineChart
  return (
    <div>
      {title && <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{title}</div>}
      {!has ? <p style={{ ...note, margin: '12px 0' }}>Not enough pitches for this measure with these choices. Try more seasons, a month by month view, or fewer filters.</p> : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer>
            <Chart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.soft} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={{ fontSize: 10, fill: C.faint }} width={44} domain={m.sum || !RATE.includes(cfg.metric) ? ['auto', 'auto'] : [0, 'auto']} tickFormatter={(v: number) => (m.digits === 3 ? v.toFixed(3).replace(/^0\./, '.') : String(Math.round(v * 10) / 10))} />
              <Tooltip
                formatter={(v: unknown, k: unknown) => [typeof v === 'number' ? fmt(m, v) : '—', series.find(s => s.key === k)?.name ?? String(k)]}
                labelFormatter={(_, pl) => {
                  const r = pl?.[0]?.payload as Point | undefined
                  if (!r) return ''
                  const n = series.map(s => counts[s.key][r.key as string] ?? 0)
                  return `${r.key}${series.length === 1 ? ` · ${n[0]} ${m.key === 'xwoba' ? 'plate appearances' : m.key === 'whiff' ? 'swings' : 'pitches'}` : ''}${cfg.roll > 1 ? ` · rolling ${cfg.roll}` : ''}`
                }}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map(s => cfg.bars
                ? <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} isAnimationActive={false} />
                : <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />)}
            </Chart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export default function TrendLab({ id, role = 'pitcher' }: { id: number; role?: LabRole }) {
  const measures = measuresFor(role)
  const main = role === 'batter' ? MAIN_BATTER : MAIN
  const store = role === 'batter' ? STORE_BATTER : STORE
  const season = new Date().getFullYear()
  const [logs, setLogs] = useState<Record<number, PitcherPitchLog | null>>({})
  const [mode, setMode] = useState<'main' | 'build' | string>('main')   // 'main', 'build', or a saved trend id
  const [cfg, setCfg] = useState<Cfg>(DEFAULT)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState<Saved[]>([])
  const [maxYears, setMaxYears] = useState(1)

  useEffect(() => { try { const r = localStorage.getItem(store); if (r) setSaved(JSON.parse(r) as Saved[]) } catch { /* private window: saving is off */ } }, [])
  const persist = (list: Saved[]) => { setSaved(list); try { localStorage.setItem(store, JSON.stringify(list)) } catch { /* ignore */ } }

  const need = Math.max(maxYears, cfg.years)
  useEffect(() => {
    let off = false
    for (let y = season; y > season - need; y--) {
      if (logs[y] !== undefined) continue
      fetchLabLog(role, id, y).then(l => { if (!off) setLogs(x => ({ ...x, [y]: l })) })
    }
    return () => { off = true }
  }, [role, id, season, need]) // eslint-disable-line react-hooks/exhaustive-deps

  const merged = (years: number): PitcherPitchLog | null => {
    const got = Array.from({ length: years }, (_, i) => logs[season - i]).filter((x): x is PitcherPitchLog => !!x)
    if (got.length === 0) return null
    return { ...got[0], pitches: got.flatMap(g => g.pitches), pitchNames: Object.assign({}, ...got.map(g => g.pitchNames)) }
  }
  const loading = logs[season] === undefined
  const curLog = merged(mode === 'main' ? 1 : cfg.years)
  const flights = useMemo(() => { const l = merged(1); return l ? buildPaths(role === 'batter' ? onlyHand(l, l.throws) : l) : [] }, [logs, role]) // eslint-disable-line react-hooks/exhaustive-deps
  const allTypes = useMemo(() => { const l = merged(1); if (!l) return []; const by = new Map<string, number>(); for (const p of l.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1); return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => ({ t, name: l.pitchNames[t] ?? t })) }, [logs]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<Cfg>) => { setCfg(c => ({ ...c, ...patch })); if (patch.years) setMaxYears(y => Math.max(y, patch.years as number)) }
  const open = (c: Cfg, m: string) => { setCfg(c); setMode(m); setMaxYears(y => Math.max(y, c.years)) }
  const groups = [...new Set(measures.map(m => m.group))]
  const mOf = (k: MKey) => measures.find(x => x.key === k) ?? MBY[k]
  const m = mOf(cfg.metric)

  const side = (
    <nav className="tr-side" aria-label="Trends">
      <SpinBallStyles />
      <div style={{ ...kick, margin: '0 2px 2px' }}>Trends</div>
      <button type="button" className={`tr-btn${mode === 'main' ? ' on' : ''}`} onClick={() => setMode('main')}><span>Main trends<small>{main.length} charts</small></span></button>
      <button type="button" className={`tr-btn${mode === 'build' ? ' on' : ''}`} onClick={() => open(cfg, 'build')}><span>Build your own<small>any measure, any pitch</small></span></button>
      {saved.length > 0 && <div style={{ ...kick, margin: '8px 2px 2px' }}>My trends</div>}
      {saved.map(s => (
        <button key={s.id} type="button" className={`tr-btn${mode === s.id ? ' on' : ''}`} onClick={() => open(s.cfg, s.id)}><span>{s.name}<small>{mOf(s.cfg.metric).label}</small></span></button>
      ))}
      {allTypes.length > 0 && <div style={{ ...kick, margin: '8px 2px 2px' }}>Pitches</div>}
      {allTypes.map(t => { const f = flights.find(x => x.type === t.t); return <div key={t.t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.mute, padding: '0 4px' }}><SpinBall code={t.t} size={20} spin={{ rpm: f?.spin ?? null, ivb: f?.ivb ?? null, hb: f?.hb ?? null }} />{t.name}</div> })}
    </nav>
  )

  return (
    <div className="tr-grid">
      <style>{`.tr-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.tr-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.tr-btn{display:flex;align-items:center;width:100%;text-align:left;padding:8px 12px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A;font-family:inherit}.tr-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.tr-btn.on{border-color:#FF5722;background:#fff1ea}.tr-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}@media (max-width:860px){.tr-grid{grid-template-columns:minmax(0,1fr)}.tr-side{position:static;flex-direction:row;flex-wrap:wrap}.tr-btn{width:auto}.tr-tiles{grid-template-columns:minmax(0,1fr)}}`}</style>
      {side}

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        {loading ? <p style={{ fontSize: 14, color: C.mute }}>Loading every pitch…</p> : !curLog ? <p style={{ fontSize: 14, color: C.mute }}>No pitch data for this pitcher yet.</p> : mode === 'main' ? (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>Main trends · {season}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#5b5347' }}>Game by game, from the season&apos;s pitches. Open any chart in the builder to change the measure, pitches, seasons and more.</p>
            </div>
            <div className="tr-tiles">
              {main.map(t => (
                <div key={t.name} style={tile}>
                  <div style={kick}>{t.name}</div>
                  <p style={{ margin: '2px 0 6px', fontSize: 13, color: C.mute }}>{t.blurb}</p>
                  <TrendChart log={curLog} cfg={t.cfg} height={210} />
                  <button type="button" onClick={() => open(t.cfg, 'build')} style={{ marginTop: 6, fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Open in the builder →</button>
                </div>
              ))}
            </div>
            <p style={note}>A point is drawn only when there are enough pitches behind it ({MEASURES.filter(x => ['velo', 'whiff', 'zone', 'hard'].includes(x.key)).map(x => `${x.label.toLowerCase()} ${x.min}`).join(', ')}); hover for the count. Rolling charts pool the last three games.</p>
          </>
        ) : (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{mode === 'build' ? 'Build your own' : saved.find(s => s.id === mode)?.name ?? 'My trend'}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#5b5347' }}>{m.hint}. Changes draw straight away.</p>
            </div>
            <div style={{ ...tile, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: C.mute }}>Measure
                  <select value={cfg.metric} onChange={e => set({ metric: e.target.value as MKey })} style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, padding: '6px 10px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff' }}>
                    {groups.map(g => <optgroup key={g} label={g}>{measures.filter(x => x.group === g).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
                  </select>
                </label>
                <Pills items={[['game', 'Game by game'], ['month', 'Month by month']] as ['game' | 'month', string][]} value={cfg.period} onChange={v => set({ period: v })} />
                <Pills items={(role === 'batter' ? [['any', 'All pitchers'], ['L', 'Left-handed pitchers'], ['R', 'Right-handed pitchers']] : [['any', 'All hitters'], ['L', 'Left-handed'], ['R', 'Right-handed']]) as ['any' | 'L' | 'R', string][]} value={cfg.side} onChange={v => set({ side: v })} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center' }}>
                <Pills items={[['1', 'This season'], ['2', 'Last 2 seasons'], ['3', 'Last 3'], ['5', 'Last 5']] as [string, string][]} value={String(cfg.years)} onChange={v => set({ years: Number(v) })} />
                <Pills items={[['1', 'No rolling average'], ['3', 'Rolling 3'], ['5', 'Rolling 5']] as [string, string][]} value={String(cfg.roll)} onChange={v => set({ roll: Number(v) })} />
                <Pills items={[['line', 'Line'], ['bars', 'Bars']] as ['line' | 'bars', string][]} value={cfg.bars ? 'bars' : 'line'} onChange={v => set({ bars: v === 'bars' })} />
              </div>
              {true ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginRight: 4 }}>Pitches</span>
                  {!m.needsType && <button type="button" onClick={() => set({ pitches: [], split: false })} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${cfg.pitches.length === 0 && !cfg.split ? C.orange : C.line}`, background: cfg.pitches.length === 0 && !cfg.split ? '#fff1ea' : '#fff', color: cfg.pitches.length === 0 && !cfg.split ? C.orange : C.ink }}>All combined</button>}
                  <button type="button" onClick={() => set({ pitches: [], split: true })} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${cfg.pitches.length === 0 && (cfg.split || m.needsType) ? C.orange : C.line}`, background: cfg.pitches.length === 0 && (cfg.split || m.needsType) ? '#fff1ea' : '#fff', color: cfg.pitches.length === 0 && (cfg.split || m.needsType) ? C.orange : C.ink }}>Top five pitches</button>
                  {allTypes.map(t => { const on = cfg.pitches.includes(t.t); return (
                    <button key={t.t} type="button" onClick={() => set({ pitches: on ? cfg.pitches.filter(x => x !== t.t) : [...cfg.pitches, t.t] })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${on ? pitchColor(t.t) : C.line}`, background: on ? '#fff' : '#faf8f3', color: C.ink }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(t.t), opacity: on ? 1 : 0.4 }} />{t.name}
                    </button>
                  ) })}
                </div>
              ) : null}
            </div>

            <div style={tile}>
              <div style={kick}>{m.label}{cfg.pitches.length ? ` · ${cfg.pitches.map(t => allTypes.find(x => x.t === t)?.name ?? t).join(', ')}` : ''} · {cfg.years === 1 ? season : `${season - cfg.years + 1}–${season}`}</div>
              <TrendChart log={curLog} cfg={cfg} height={340} />
              <p style={note}>{cfg.period === 'game' ? 'One point per game' : 'One point per month'}{cfg.roll > 1 ? `, pooling the last ${cfg.roll}` : ''}. A point appears only with at least {m.min} {RATE.includes(cfg.metric) || m.key === 'pitches' ? 'chances' : 'pitches'} behind it; hover for the count. {star} Lines are straight between points.</p>
            </div>

            <div style={{ ...tile, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name this trend" aria-label="Name this trend" maxLength={40} style={{ fontFamily: SANS, fontSize: 14, padding: '8px 12px', border: `1px solid ${C.line}`, borderRadius: 10, minWidth: 220 }} />
              <button type="button" disabled={!name.trim()} onClick={() => { const id = `t${Date.now()}`; persist([...saved, { id, name: name.trim(), cfg }]); setName(''); setMode(id) }} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: '#fff', background: name.trim() ? C.orange : C.faint, border: 0, borderRadius: 10, padding: '9px 16px', cursor: name.trim() ? 'pointer' : 'default' }}>Save</button>
              {mode !== 'build' && mode !== 'main' && <button type="button" onClick={() => { persist(saved.filter(s => s.id !== mode)); setMode('build') }} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: C.mute, background: 'none', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer' }}>Delete this trend</button>}
              <span style={{ fontSize: 12, color: C.mute }}>Saved in this browser.</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
