'use client'

// src/components/pitching-lab/TrendLab.tsx
//
// Pitching Lab → Trends. Is he the same player as in April? A set of main trends (speed, spin, the pitch mix, whiffs, the strike zone,
// contact quality) and a builder: choose any measure, any pitches, either hitter side, game by game or month by month, one to five seasons,
// an optional rolling average, lines or bars, and save it under a name (kept in this browser). Everything is counted from the per-pitch
// log (src/lib/pitcher-pitch-log.ts); a rate point is drawn only when enough pitches stand behind it, and the count shows on hover.
// Lines are always straight between points. A rolling average pools the counts of the last few games (it is not a curve fit).
// Year on year puts each season on its own line over the same calendar (month, or game number) so seasons sit on top of each other. The dashed
// trend line is a straight least-squares fit through the plotted points of a line; it only describes the points drawn, it does not project past them.
//
// The tab needs an account, so the builder is for signed-in and Pro viewers only. Saved trends live in localStorage (per browser), not in a database.

import { useEffect, useMemo, useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

type MKey = 'avg' | 'obp' | 'slg' | 'ops' | 'iso' | 'babip' | 'hr' | 'bbr' | 'kr' | 'ev' | 'la' | 'batspeed' | 'swinglen' | 'velo' | 'spin' | 'ext' | 'relz' | 'relx' | 'arm' | 'ivb' | 'hb' | 'usage' | 'whiff' | 'csw' | 'zone' | 'chase' | 'swing' | 'hard' | 'xwoba' | 'pitches'
type Measure = { key: MKey; label: string; group: string; unit: string; digits: number; min: number; sum?: boolean; needsType?: boolean; per: (p: RawPitch, t: string | null) => [number, number]; hint: string; armSign?: boolean; per2?: (p: RawPitch, t: string | null) => [number, number]; sign2?: 1 | -1; min2?: number; of?: string }
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
// Batting numbers. A plate appearance is counted on the pitch that ended it (RawPitch.result then holds the real event name).
const HIT_EV: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const NOT_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_bunt', 'sac_fly', 'sac_bunt_double_play', 'sac_fly_double_play', 'catcher_interf', 'truncated_pa'])
const K_EV = new Set(['strikeout', 'strikeout_double_play'])
const PA_EV = new Set([...Object.keys(HIT_EV), ...NOT_AB, ...K_EV, 'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'fielders_choice', 'fielders_choice_out', 'field_error', 'triple_play', 'strikeout_double_play'])
const ev = (p: RawPitch) => (p.result != null && (p.result !== p.description || p.result === 'hit_by_pitch') && PA_EV.has(p.result) ? p.result : null)
const isAB = (p: RawPitch) => { const e = ev(p); return e != null && !NOT_AB.has(e) }
const isPA = (p: RawPitch) => { const e = ev(p); return e != null && e !== 'truncated_pa' && e !== 'sac_bunt' && e !== 'sac_bunt_double_play' && e !== 'catcher_interf' }
const abPair = (f: (e: string) => number) => (p: RawPitch): [number, number] => (isAB(p) ? [f(ev(p) as string), 1] : [0, 0])
const paPair = (f: (e: string) => number) => (p: RawPitch): [number, number] => (isPA(p) ? [f(ev(p) as string), 1] : [0, 0])
const onBase = (e: string) => (e in HIT_EV || e === 'walk' || e === 'intent_walk' || e === 'hit_by_pitch' ? 1 : 0)
const walks = (e: string) => (e === 'walk' || e === 'intent_walk' ? 1 : 0)
const BAT: { key: MKey; label: string; labelP: string; unit: string; digits: number; min: number; per: Measure['per']; per2?: Measure['per2']; sign2?: 1 | -1; min2?: number; sum?: boolean; hint: string; hintP: string }[] = [
  { key: 'avg', label: 'Batting average', labelP: 'Batting average against', unit: '', digits: 3, min: 10, per: abPair(e => (e in HIT_EV ? 1 : 0)), hint: 'Hits per at-bat (counted on the pitch that ended it)', hintP: 'Hits allowed per at-bat' },
  { key: 'obp', label: 'On-base percentage', labelP: 'On-base percentage against', unit: '', digits: 3, min: 20, per: paPair(onBase), hint: 'Hits, walks and hit-by-pitch per plate appearance', hintP: 'Hits, walks and hit-by-pitch allowed per plate appearance' },
  { key: 'slg', label: 'Slugging percentage', labelP: 'Slugging against', unit: '', digits: 3, min: 10, per: abPair(e => HIT_EV[e] ?? 0), hint: 'Total bases per at-bat', hintP: 'Total bases allowed per at-bat' },
  { key: 'ops', label: 'OPS', labelP: 'OPS against', unit: '', digits: 3, min: 20, min2: 10, per: paPair(onBase), per2: abPair(e => HIT_EV[e] ?? 0), sign2: 1, hint: 'On-base plus slugging', hintP: 'On-base plus slugging allowed' },
  { key: 'iso', label: 'Isolated power (ISO)', labelP: 'Isolated power against', unit: '', digits: 3, min: 10, per: abPair(e => HIT_EV[e] ?? 0), per2: abPair(e => (e in HIT_EV ? 1 : 0)), sign2: -1, hint: 'Slugging minus batting average', hintP: 'Slugging minus batting average, against' },
  { key: 'babip', label: 'BABIP', labelP: 'BABIP against', unit: '', digits: 3, min: 15, per: p => { const e = ev(p); return e != null && !NOT_AB.has(e) && !K_EV.has(e) && e !== 'home_run' ? [e in HIT_EV ? 1 : 0, 1] : [0, 0] }, hint: 'Hits per ball in play, home runs left out', hintP: 'Hits allowed per ball in play, home runs left out' },
  { key: 'hr', label: 'Home runs', labelP: 'Home runs allowed', unit: '', digits: 0, min: 1, sum: true, per: paPair(e => (e === 'home_run' ? 1 : 0)), hint: 'Home runs in the period', hintP: 'Home runs allowed in the period' },
  { key: 'bbr', label: 'Walk %', labelP: 'Walk % (walks issued)', unit: '%', digits: 1, min: 15, per: paPair(walks), hint: 'Walks per plate appearance', hintP: 'Walks per batter faced' },
  { key: 'kr', label: 'Strikeout %', labelP: 'Strikeout % (strikeouts per batter)', unit: '%', digits: 1, min: 15, per: paPair(e => (K_EV.has(e) ? 1 : 0)), hint: 'Strikeouts per plate appearance', hintP: 'Strikeouts per batter faced' },
]
const battingFor = (role: LabRole): Measure[] => BAT.map(b => ({ key: b.key, label: role === 'batter' ? b.label : b.labelP, group: role === 'batter' ? 'Batting numbers' : 'Results against', unit: b.unit, digits: b.digits, min: b.min, sum: b.sum, per: b.per, per2: b.per2, sign2: b.sign2, min2: b.min2, hint: (role === 'batter' ? b.hint : b.hintP) + ' (on the pitches chosen below)', of: b.sum ? 'plate appearances' : b.key === 'avg' || b.key === 'slg' || b.key === 'iso' ? 'at-bats' : 'plate appearances' }))

const BATTER_ONLY: Measure[] = [
  { key: 'ev', label: 'Exit speed', group: 'Contact', unit: ' mph', digits: 1, min: 5, per: p => (p.description === 'hit_into_play' && p.exitVelo != null ? [p.exitVelo, 1] : [0, 0]), hint: 'Average exit speed on balls in play' },
  { key: 'la', label: 'Launch angle', group: 'Contact', unit: '°', digits: 1, min: 5, per: p => (p.description === 'hit_into_play' && p.launchAngle != null ? [p.launchAngle, 1] : [0, 0]), hint: 'Average launch angle on balls in play' },
  { key: 'batspeed', label: 'Bat speed', group: 'Contact', unit: ' mph', digits: 1, min: 8, per: p => (p.batSpeed != null ? [p.batSpeed, 1] : [0, 0]), hint: 'Average bat speed on swings' },
  { key: 'swinglen', label: 'Swing length', group: 'Contact', unit: ' ft', digits: 2, min: 8, per: p => (p.swingLength != null ? [p.swingLength, 1] : [0, 0]), hint: 'Average swing length on swings' },
]
const PITCH_ONLY_GROUPS = new Set(['Delivery'])   // a hitter's page has no use for the pitcher's own delivery numbers
const measuresFor = (role: LabRole): Measure[] => [...battingFor(role), ...measuresForBase(role)]
const measuresForBase = (role: LabRole): Measure[] => (role === 'batter' ? [...BATTER_ONLY, ...MEASURES.filter(m => !PITCH_ONLY_GROUPS.has(m.group)).map(m => (['Stuff', 'Approach'].includes(m.group) ? { ...m, label: m.key === 'usage' ? 'Pitch mix faced (share of pitches)' : m.key === 'zone' ? 'Zone rate of pitches faced' : m.key === 'pitches' ? 'Pitches seen' : `${m.label} faced`, group: m.group === 'Stuff' ? 'Pitches faced' : 'Approach' } : m))] : MEASURES)
const MBY = Object.fromEntries([...battingFor('batter'), ...MEASURES, ...BATTER_ONLY].map(m => [m.key, m])) as Record<MKey, Measure>
const RATE: MKey[] = ['usage', 'zone', 'whiff', 'csw', 'swing', 'chase', 'hard', 'bbr', 'kr']

// ─── Config ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

type ChartKind = 'line' | 'step' | 'area' | 'bars' | 'dots'
const CHARTS: [ChartKind, string][] = [['line', 'Line'], ['step', 'Step'], ['area', 'Area'], ['bars', 'Bars'], ['dots', 'Dots']]
const kindOf = (c: Cfg): ChartKind => c.chart ?? (c.bars ? 'bars' : 'line')   // trends saved before chart types only have `bars`
type Cfg = { metric: MKey; pitches: string[]; split: boolean; side: 'any' | 'L' | 'R'; period: 'game' | 'month' | 'year'; years: number; roll: number; bars: boolean; chart?: ChartKind; extra?: MKey[]; trend: boolean; view: 'time' | 'yoy'; layout: 'layer' | 'split' }
const DEFAULT: Cfg = { metric: 'velo', pitches: [], split: true, side: 'any', period: 'game', years: 1, roll: 1, bars: false, trend: true, view: 'time', layout: 'layer' }
const YOY_COLORS = [C.orange, '#2F6DB5', '#1D9E75', '#8a8275', '#B06FD8']   // newest season first
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
  { name: 'Batting average', blurb: 'Hits per at-bat, by month.', cfg: { ...DEFAULT, metric: 'avg', split: false, period: 'month' } },
  { name: 'OPS', blurb: 'On-base plus slugging, by month.', cfg: { ...DEFAULT, metric: 'ops', split: false, period: 'month' } },
  { name: 'Exit speed', blurb: 'How hard he hits the ball.', cfg: { ...DEFAULT, metric: 'ev', split: false, roll: 3 } },
  { name: 'Hard-hit rate', blurb: 'Balls in play at 95 mph or more.', cfg: { ...DEFAULT, metric: 'hard', split: false, roll: 3, period: 'month' } },
  { name: 'xwOBA', blurb: 'Quality of results, by month.', cfg: { ...DEFAULT, metric: 'xwoba', split: false, period: 'month' } },
  { name: 'Whiff rate', blurb: 'Misses per swing.', cfg: { ...DEFAULT, metric: 'whiff', split: false, roll: 3 } },
  { name: 'Chase rate', blurb: 'Swings at pitches outside the zone.', cfg: { ...DEFAULT, metric: 'chase', split: false, roll: 3 } },
  { name: 'Pitch mix faced', blurb: 'What pitchers have thrown him.', cfg: { ...DEFAULT, metric: 'usage', roll: 3, period: 'month' } },
]

// ─── Maths ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Series = { key: string; name: string; color: string; m?: Measure }
const MULTI_COLORS = [C.orange, '#2F6DB5', '#1D9E75', '#B06FD8']
type Point = { label: string; key: string; [s: string]: number | string | null }

function compute(pitches: RawPitch[], cfg: Cfg, types: { t: string; name: string }[], hand: 'L' | 'R' | null) {
  const m = MBY[cfg.metric]
  const yoy = cfg.view === 'yoy'
  const use = pitches.filter(p => cfg.side === 'any' || p.stand === cfg.side)
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  let series: Series[]
  let keyOf: (p: RawPitch) => string
  let skip: (p: RawPitch, s: Series) => boolean
  let tOf: (s: Series) => string | null
  if (yoy) {
    // One line per season over a shared calendar: the month, or the nth game of that season.
    const years = [...new Set(use.map(p => p.date.slice(0, 4)))].sort()
    series = years.map((y, i) => ({ key: y, name: y, color: YOY_COLORS[(years.length - 1 - i) % YOY_COLORS.length] }))
    const ord = new Map<string, string>()
    if (cfg.period === 'game') for (const y of years) [...new Set(use.filter(p => p.date.startsWith(y)).map(p => p.date))].sort().forEach((d, i) => ord.set(d, String(i + 1).padStart(3, '0')))
    keyOf = p => (cfg.period === 'game' ? ord.get(p.date) ?? '000' : p.date.slice(5, 7))
    const pset = new Set(cfg.pitches)
    const usedType = cfg.pitches[0] ?? types[0]?.t ?? null
    skip = (p, s) => p.date.slice(0, 4) !== s.key || (!m.needsType && pset.size > 0 && !pset.has(p.pitchType))
    tOf = () => (m.needsType ? usedType : null)
  } else {
    const chosen = cfg.pitches.length ? cfg.pitches : m.needsType || cfg.split ? types.slice(0, 5).map(t => t.t) : []
    series = chosen.length ? chosen.map(t => ({ key: t, name: types.find(x => x.t === t)?.name ?? t, color: pitchColor(t) })) : [{ key: 'ALL', name: 'All pitches', color: C.orange }]
    keyOf = p => (cfg.period === 'game' ? p.date : cfg.period === 'year' ? p.date.slice(0, 4) : p.date.slice(0, 7))
    skip = (p, s) => s.key !== 'ALL' && !m.needsType && p.pitchType !== s.key
    tOf = s => (s.key === 'ALL' ? null : s.key)
  }
  const keys = [...new Set(use.map(keyOf))].sort()
  // Per bucket and series: running totals of the numerator and denominator.
  const tot = new Map<string, { num: number; den: number; n2: number; d2: number }>()
  for (const p of use) {
    const k = keyOf(p)
    for (const s of series) {
      if (skip(p, s)) continue
      const [n, d] = m.per(p, tOf(s))
      const [n2, d2] = m.per2 ? m.per2(p, tOf(s)) : [0, 0]
      if (d === 0 && n === 0 && d2 === 0) continue
      const id = `${k}|${s.key}`
      const e = tot.get(id) ?? { num: 0, den: 0, n2: 0, d2: 0 }
      e.num += n; e.den += d; e.n2 += n2; e.d2 += d2
      tot.set(id, e)
    }
  }
  const sign = m.armSign && hand === 'R' ? -1 : 1   // arm-side break reads positive toward the arm side for either hand
  const multi = cfg.years > 1
  const label = (k: string) => (yoy ? (cfg.period === 'game' ? `Game ${Number(k)}` : mon[Number(k) - 1]) : cfg.period === 'year' ? k : cfg.period === 'game' ? `${mon[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}${multi ? ` '${k.slice(2, 4)}` : ''}` : `${mon[Number(k.slice(5, 7)) - 1]}${multi ? ` '${k.slice(2, 4)}` : ''}`)
  const rows: Point[] = keys.map(k => ({ key: k, label: label(k) }))
  const counts: Record<string, Record<string, number>> = {}
  for (const s of series) {
    counts[s.key] = {}
    keys.forEach((k, i) => {
      // Rolling average: pool the counts of this bucket and the ones before it.
      let num = 0, den = 0, n2 = 0, d2 = 0
      for (let j = Math.max(0, i - cfg.roll + 1); j <= i; j++) { const e = tot.get(`${keys[j]}|${s.key}`); if (e) { num += e.num; den += e.den; n2 += e.n2; d2 += e.d2 } }
      counts[s.key][k] = den
      const ok = den >= m.min && (!m.per2 || d2 >= (m.min2 ?? m.min))
      const v = !ok ? null : m.sum ? num : (num / den) * sign + (m.per2 ? (m.sign2 ?? 1) * (n2 / d2) : 0)
      rows[i][s.key] = v == null ? null : RATE.includes(cfg.metric) ? v * 100 : v
    })
  }
  // Trend line: a least-squares straight line through the plotted points of each series (three or more), drawn from its first to its last point.
  const trends: Record<string, { from: number; to: number; n: number }> = {}
  if (cfg.trend) {
    for (const s of series) {
      const pts: [number, number][] = []
      rows.forEach((r, i) => { const v = r[s.key]; if (typeof v === 'number') pts.push([i, v]) })
      if (pts.length < 3) continue
      const n = pts.length
      const mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n
      const sxx = pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0)
      if (sxx === 0) continue
      const b = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / sxx
      const a0 = my - b * mx
      const first = pts[0][0], last = pts[n - 1][0]
      rows.forEach((r, i) => { if (i >= first && i <= last) r[`${s.key}~t`] = a0 + b * i })
      trends[s.key] = { from: a0 + b * first, to: a0 + b * last, n }
    }
  }
  return { rows, series, counts, m, trends }
}

// Several stats on one chart: each stat is computed on its own (all pitches, or the one pitch chosen) and lined up on the same calendar. Each gets its own axis scale
// so the shapes can be compared; the hover shows the real numbers.
function computeMulti(pitches: RawPitch[], cfg: Cfg, types: { t: string; name: string }[], hand: 'L' | 'R' | null, ms: MKey[]) {
  const parts = ms.map(k => {
    const mm = MBY[k]
    const pit = cfg.pitches.length ? cfg.pitches.slice(0, 1) : mm.needsType ? types.slice(0, 1).map(t => t.t) : []
    const r = compute(pitches, { ...cfg, metric: k, pitches: pit, split: false, view: 'time', extra: [] }, types, hand)
    return { k, mm, r, s0: r.series[0].key }
  })
  const keys = [...new Set(parts.flatMap(p => p.r.rows.map(r => r.key as string)))].sort()
  const rows: Point[] = keys.map(k => ({ key: k, label: (parts.find(p => p.r.rows.some(r => r.key === k))?.r.rows.find(r => r.key === k)?.label as string) ?? k }))
  const series: Series[] = parts.map((p, i) => ({ key: p.k, name: p.mm.label, color: MULTI_COLORS[i % MULTI_COLORS.length], m: p.mm }))
  const counts: Record<string, Record<string, number>> = {}
  const trends: Record<string, { from: number; to: number; n: number }> = {}
  for (const p of parts) {
    counts[p.k] = p.r.counts[p.s0] ?? {}
    if (p.r.trends[p.s0]) trends[p.k] = p.r.trends[p.s0]
    const byKey = new Map(p.r.rows.map(r => [r.key as string, r]))
    rows.forEach(row => { const r = byKey.get(row.key as string); row[p.k] = r ? (r[p.s0] ?? null) : null; if (r && r[`${p.s0}~t`] != null) row[`${p.k}~t`] = r[`${p.s0}~t`] })
  }
  return { rows, series, counts, m: parts[0].mm, trends }
}

const fmt = (m: Measure, v: number) => `${m.digits === 3 ? v.toFixed(3).replace(/^0\./, '.') : v.toFixed(m.digits)}${m.unit}`

// ─── Chart ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

// Year on year, side by side: one chart per season, all on the same scale so the heights can be compared.
function TrendChart(props: { log: PitcherPitchLog; cfg: Cfg; height?: number; title?: string; readout?: boolean }) {
  const { log, cfg } = props
  const split = cfg.view === 'yoy' && cfg.layout === 'split'
  const info = useMemo(() => {
    if (!split) return null
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    const types = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => ({ t, name: log.pitchNames[t] ?? t }))
    const { rows, series } = compute(log.pitches, { ...cfg, trend: false }, types, log.throws)
    const vals = rows.flatMap(r => series.map(s => r[s.key])).filter((v): v is number => typeof v === 'number')
    const years = series.map(s => s.key).sort().reverse()
    return { years, domain: vals.length ? ([Math.min(...vals), Math.max(...vals)] as [number, number]) : undefined }
  }, [log, cfg, split])
  if (!split || !info) return <TrendChartOne {...props} />
  const hasMany = info.years.length > 1
  if (!hasMany) return <TrendChartOne {...props} cfg={{ ...cfg, view: 'time', years: 1 }} />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
      {info.years.map(y => (
        <TrendChartOne key={y} {...props} height={props.height ?? 280} title={y} domain={info.domain} cfg={{ ...cfg, view: 'time', years: 1, layout: 'layer' }} log={{ ...log, pitches: log.pitches.filter(p => p.date.startsWith(y)) }} />
      ))}
    </div>
  )
}

function TrendChartOne({ log, cfg, height = 280, title, readout = false, domain }: { log: PitcherPitchLog; cfg: Cfg; height?: number; title?: string; readout?: boolean; domain?: [number, number] }) {
  const types = useMemo(() => {
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => ({ t, name: log.pitchNames[t] ?? t }))
  }, [log])
  const ms = useMemo(() => [cfg.metric, ...(cfg.extra ?? []).filter(k => k !== cfg.metric)], [cfg.metric, cfg.extra])
  const multi = ms.length > 1 && cfg.view !== 'yoy'
  const { rows, series, counts, m, trends } = useMemo(() => (multi ? computeMulti(log.pitches, cfg, types, log.throws, ms) : compute(log.pitches, cfg, types, log.throws)), [log, cfg, types, multi, ms])
  const mOfS = (k: unknown) => series.find(s => s.key === k || s.name === k)?.m ?? m
  const has = rows.some(r => series.some(s => r[s.key] != null))
  const kind = kindOf(cfg)
  return (
    <div>
      {title && <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{title}</div>}
      {!has ? <p style={{ ...note, margin: '12px 0' }}>Not enough pitches for this measure with these choices. Try more seasons, a month by month view, or fewer filters.</p> : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.soft} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} interval="preserveStartEnd" minTickGap={18} />
              {multi && series.map((s, i) => <YAxis key={s.key} yAxisId={s.key} orientation={i === 1 ? 'right' : 'left'} hide={i > 1} tick={{ fontSize: 10, fill: s.color }} width={44} domain={['auto', 'auto']} tickFormatter={(v: number) => ((s.m ?? m).digits === 3 ? v.toFixed(3).replace(/^0\./, '.') : String(Math.round(v * 10) / 10))} />)}
              {!multi && <YAxis tick={{ fontSize: 10, fill: C.faint }} width={44} domain={domain ?? (m.sum || !RATE.includes(cfg.metric) ? ['auto', 'auto'] : [0, 'auto'])} tickFormatter={(v: number) => (m.digits === 3 ? v.toFixed(3).replace(/^0\./, '.') : String(Math.round(v * 10) / 10))} />}
              <Tooltip
                formatter={(v: unknown, k: unknown) => [typeof v === 'number' ? fmt(mOfS(k), v) : '—', series.find(s => s.key === k)?.name ?? String(k)]}
                labelFormatter={(_, pl) => {
                  const r = pl?.[0]?.payload as Point | undefined
                  if (!r) return ''
                  if (cfg.view === 'yoy') return `${r.label}${cfg.roll > 1 ? ` · rolling ${cfg.roll}` : ''}`
                  const n = series.map(s => counts[s.key][r.key as string] ?? 0)
                  return `${r.key}${series.length === 1 && !multi ? ` · ${n[0]} ${m.of ?? (m.key === 'xwoba' ? 'plate appearances' : m.key === 'whiff' ? 'swings' : 'pitches')}` : ''}${cfg.roll > 1 ? ` · rolling ${cfg.roll}` : ''}`
                }}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map(s => kind === 'bars'
                ? <Bar key={s.key} {...(multi ? { yAxisId: s.key } : {})} dataKey={s.key} name={s.name} fill={s.color} isAnimationActive={false} />
                : kind === 'area'
                  ? <Area key={s.key} {...(multi ? { yAxisId: s.key } : {})} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} fill={s.color} fillOpacity={series.length > 1 ? 0.12 : 0.2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
                  : kind === 'dots'
                    ? <Line key={s.key} {...(multi ? { yAxisId: s.key } : {})} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={0} dot={{ r: 4, fill: s.color, stroke: s.color }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />
                    : <Line key={s.key} {...(multi ? { yAxisId: s.key } : {})} type={kind === 'step' ? 'stepAfter' : 'linear'} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />)}
              {series.filter(s => trends[s.key]).map(s => (
                <Line key={`${s.key}~t`} {...(multi ? { yAxisId: s.key } : {})} type="linear" dataKey={`${s.key}~t`} name={`${s.name} trend line`} stroke={kind === 'bars' ? C.ink : s.color} strokeWidth={1.75} strokeDasharray="6 4" dot={false} activeDot={false} legendType="none" tooltipType="none" connectNulls isAnimationActive={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {readout && has && cfg.trend && series.some(s => trends[s.key]) && (
        <p style={{ ...note, margin: '8px 0 0' }}>
          Dashed trend line: {series.filter(s => trends[s.key]).map(s => `${series.length > 1 ? `${s.name} ` : ''}${fmt(s.m ?? m, trends[s.key].from)} to ${fmt(s.m ?? m, trends[s.key].to)} across ${trends[s.key].n} points`).join(' · ')}. It is a straight line fitted to the points drawn and describes them only.
        </p>
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
  const [mainView, setMainView] = useState<'time' | 'yoy'>('time')   // main trends: this season, or the last three seasons on top of each other
  const [mainTrend, setMainTrend] = useState(true)
  const [mainChart, setMainChart] = useState<ChartKind>('line')
  const [mainLayout, setMainLayout] = useState<'layer' | 'split'>('layer')

  useEffect(() => { try { const r = localStorage.getItem(store); if (r) setSaved(JSON.parse(r) as Saved[]) } catch { /* private window: saving is off */ } }, [])
  const persist = (list: Saved[]) => { setSaved(list); try { localStorage.setItem(store, JSON.stringify(list)) } catch { /* ignore */ } }

  const need = Math.max(maxYears, cfg.years, mode === 'main' && mainView === 'yoy' ? 3 : 1)
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
  const curLog = merged(mode === 'main' ? (mainView === 'yoy' ? 3 : 1) : cfg.years)
  const flights = useMemo(() => { const l = merged(1); return l ? buildPaths(role === 'batter' ? onlyHand(l, l.throws) : l) : [] }, [logs, role]) // eslint-disable-line react-hooks/exhaustive-deps
  const allTypes = useMemo(() => { const l = merged(1); if (!l) return []; const by = new Map<string, number>(); for (const p of l.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1); return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => ({ t, name: l.pitchNames[t] ?? t })) }, [logs]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<Cfg>) => { setCfg(c => ({ ...c, ...patch })); if (patch.years) setMaxYears(y => Math.max(y, patch.years as number)) }
  const open = (c: Cfg, m: string) => { const f = { ...DEFAULT, ...c }; setCfg(f); setMode(m); setMaxYears(y => Math.max(y, f.years)) }   // saved trends from before trend lines and year on year fall back to the defaults
  const groups = [...new Set(measures.map(m => m.group))]
  const mOf = (k: MKey) => measures.find(x => x.key === k) ?? MBY[k]
  const m = mOf(cfg.metric)
  const yoy = cfg.view === 'yoy'
  // A hitter's page gets a chart for every measure, month by month; the featured charts above keep their own settings.
  const featuredKeys = new Set(main.map(t => t.cfg.metric))
  const everyMeasure = role === 'batter' ? measures.filter(x => !featuredKeys.has(x.key)).map(x => ({ name: x.label, group: x.group, blurb: x.hint, cfg: { ...DEFAULT, metric: x.key, split: false, period: 'month' as const } as Cfg })) : []
  const totalCharts = main.length + everyMeasure.length
  const tileCfg = (c: Cfg): Cfg => ({ ...c, trend: mainTrend, layout: mainLayout, chart: mainChart, ...(mainView === 'yoy' ? { view: 'yoy' as const, years: 3, period: 'month' as const, roll: 1, split: false } : {}) })
  const tileGroup = (t: { name: string; blurb: string; cfg: Cfg }) => {
    const c = tileCfg(t.cfg)
    return (
      <div key={t.name} style={tile}>
        <div style={kick}>{t.name}</div>
        <p style={{ margin: '2px 0 6px', fontSize: 13, color: C.mute }}>{mainView === 'yoy' ? t.blurb.replace(/, by month\.$/, ', year by year.') : t.blurb}</p>
        <TrendChart log={curLog as PitcherPitchLog} cfg={c} height={210} />
        <button type="button" onClick={() => open(c, 'build')} style={{ marginTop: 6, fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Open in the builder →</button>
      </div>
    )
  }

  const side = (
    <nav className="tr-side" aria-label="Trends">
      <SpinBallStyles />
      <div style={{ ...kick, margin: '0 2px 2px' }}>Trends</div>
      <button type="button" className={`tr-btn${mode === 'main' ? ' on' : ''}`} onClick={() => setMode('main')}><span>Main trends<small>{totalCharts} charts</small></span></button>
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
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>Main trends · {mainView === 'yoy' ? `${season - 2}–${season}` : season}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#5b5347' }}>{mainView === 'yoy' ? 'Each season is its own line over the same months.' : 'From the season&apos;s pitches.'} Open any chart in the builder to change the measure, pitches, seasons and more.</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center' }}>
              <Pills items={[['time', `This season`], ['yoy', 'Year on year']] as ['time' | 'yoy', string][]} value={mainView} onChange={setMainView} />
              <Pills items={[['on', 'Trend lines on'], ['off', 'Trend lines off']] as ['on' | 'off', string][]} value={mainTrend ? 'on' : 'off'} onChange={v => setMainTrend(v === 'on')} />
              <Pills items={CHARTS} value={mainChart} onChange={setMainChart} />
              {mainView === 'yoy' && <Pills items={[['layer', 'Seasons layered'], ['split', 'Seasons side by side']] as ['layer' | 'split', string][]} value={mainLayout} onChange={setMainLayout} />}
              {mainView === 'yoy' && <span style={{ fontSize: 12, color: C.mute }}>Year by year: the last three seasons, one line each.</span>}
            </div>
            {everyMeasure.length > 0 && <div style={{ ...kick, marginTop: 4 }}>Featured</div>}
            <div className="tr-tiles">{main.map(tileGroup)}</div>
            {[...new Set(everyMeasure.map(x => x.group))].map(g => (
              <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={kick}>{g}</div>
                <div className="tr-tiles">{everyMeasure.filter(x => x.group === g).map(tileGroup)}</div>
              </div>
            ))}
            <p style={note}>A point is drawn only when there are enough pitches behind it ({MEASURES.filter(x => ['velo', 'whiff', 'zone', 'hard'].includes(x.key)).map(x => `${x.label.toLowerCase()} ${x.min}`).join(', ')}); hover for the count. Rolling charts pool the last three games. Dashed lines are straight fitted trend lines through the points drawn.</p>
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
                  <select value={cfg.metric} onChange={e => { const k = e.target.value as MKey; set({ ...(BAT.some(b => b.key === k) ? { metric: k, pitches: [], split: false } : { metric: k }), extra: (cfg.extra ?? []).filter(x => x !== k) }) }} style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, padding: '6px 10px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff' }}>
                    {groups.map(g => <optgroup key={g} label={g}>{measures.filter(x => x.group === g).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
                  </select>
                </label>
                <Pills items={[['time', 'Over time'], ['yoy', 'Year on year']] as ['time' | 'yoy', string][]} value={cfg.view} onChange={v => set(v === 'yoy' ? { view: v, extra: [], years: Math.max(cfg.years, 2), period: cfg.period === 'year' ? 'month' : cfg.period } : { view: v })} />
                <Pills items={(yoy ? [['game', 'Year by year, by game'], ['month', 'Year by year, by month']] : [['game', 'Game by game'], ['month', 'Month by month'], ['year', 'Season by season']]) as ['game' | 'month' | 'year', string][]} value={yoy && cfg.period === 'year' ? 'month' : cfg.period} onChange={v => set({ period: v })} />
                {!yoy && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: C.mute }}>Overlay stats
                      <select value="" disabled={(cfg.extra ?? []).length >= 3} onChange={e => { const k = e.target.value as MKey; if (k) set({ extra: [...(cfg.extra ?? []), k], split: false, pitches: cfg.pitches.slice(0, 1) }) }} style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, padding: '6px 10px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff' }}>
                        <option value="">{(cfg.extra ?? []).length >= 3 ? 'Three chosen' : 'Choose a stat…'}</option>
                        {groups.map(g => <optgroup key={g} label={g}>{measures.filter(x => x.group === g && x.key !== cfg.metric && !(cfg.extra ?? []).includes(x.key)).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
                      </select>
                    </label>
                    {(cfg.extra ?? []).map((k, i) => (
                      <button key={k} type="button" onClick={() => set({ extra: (cfg.extra ?? []).filter(x => x !== k) })} aria-label={`Remove ${mOf(k).label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${MULTI_COLORS[(i + 1) % MULTI_COLORS.length]}`, background: '#fff', color: C.ink }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: MULTI_COLORS[(i + 1) % MULTI_COLORS.length] }} />{mOf(k).label} ×
                      </button>
                    ))}
                  </span>
                )}
                {yoy && <Pills items={[['layer', 'Seasons layered'], ['split', 'Seasons side by side']] as ['layer' | 'split', string][]} value={cfg.layout} onChange={v => set({ layout: v })} />}
                <Pills items={(role === 'batter' ? [['any', 'All pitchers'], ['L', 'Left-handed pitchers'], ['R', 'Right-handed pitchers']] : [['any', 'All hitters'], ['L', 'Left-handed'], ['R', 'Right-handed']]) as ['any' | 'L' | 'R', string][]} value={cfg.side} onChange={v => set({ side: v })} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center' }}>
                <Pills items={(yoy ? [['2', 'Last 2 seasons'], ['3', 'Last 3'], ['5', 'Last 5']] : [['1', 'This season'], ['2', 'Last 2 seasons'], ['3', 'Last 3'], ['5', 'Last 5']]) as [string, string][]} value={String(cfg.years)} onChange={v => set({ years: Number(v) })} />
                <Pills items={[['1', 'No rolling average'], ['3', 'Rolling 3'], ['5', 'Rolling 5']] as [string, string][]} value={String(cfg.roll)} onChange={v => set({ roll: Number(v) })} />
                <Pills items={CHARTS} value={kindOf(cfg)} onChange={v => set({ chart: v, bars: v === 'bars' })} />
                <Pills items={[['on', 'Trend line on'], ['off', 'Trend line off']] as ['on' | 'off', string][]} value={cfg.trend ? 'on' : 'off'} onChange={v => set({ trend: v === 'on' })} />
              </div>
              {true ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginRight: 4 }}>Pitches</span>
                  {!m.needsType && <button type="button" onClick={() => set({ pitches: [], split: false })} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${cfg.pitches.length === 0 && !cfg.split ? C.orange : C.line}`, background: cfg.pitches.length === 0 && !cfg.split ? '#fff1ea' : '#fff', color: cfg.pitches.length === 0 && !cfg.split ? C.orange : C.ink }}>All combined</button>}
                  {!yoy && !(cfg.extra ?? []).length && <button type="button" onClick={() => set({ pitches: [], split: true })} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${cfg.pitches.length === 0 && (cfg.split || m.needsType) ? C.orange : C.line}`, background: cfg.pitches.length === 0 && (cfg.split || m.needsType) ? '#fff1ea' : '#fff', color: cfg.pitches.length === 0 && (cfg.split || m.needsType) ? C.orange : C.ink }}>Top five pitches</button>}
                  {allTypes.map(t => { const on = cfg.pitches.includes(t.t); return (
                    <button key={t.t} type="button" onClick={() => set({ pitches: on ? cfg.pitches.filter(x => x !== t.t) : [...cfg.pitches, t.t] })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${on ? pitchColor(t.t) : C.line}`, background: on ? '#fff' : '#faf8f3', color: C.ink }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(t.t), opacity: on ? 1 : 0.4 }} />{t.name}
                    </button>
                  ) })}
                </div>
              ) : null}
            </div>

            <div style={tile}>
              <div style={kick}>{m.label}{(cfg.extra ?? []).map(k => ` + ${mOf(k).label}`).join('')}{cfg.pitches.length ? ` · ${cfg.pitches.map(t => allTypes.find(x => x.t === t)?.name ?? t).join(', ')}` : ''} · {cfg.years === 1 ? season : `${season - cfg.years + 1}–${season}`}</div>
              <TrendChart log={curLog} cfg={cfg} height={340} readout />
              <p style={note}>{(cfg.extra ?? []).length ? 'Each stat has its own scale, so the shapes can be compared; hover for the real numbers. All pitches are counted unless one is chosen. ' : ''}{yoy ? `One line per season. ${cfg.pitches.length ? 'Only the pitches chosen are counted.' : m.needsType ? 'Compares the most-thrown pitch unless you choose one.' : 'All pitches are counted; choose pitches to narrow it.'} ` : ''}{cfg.period === 'game' ? (yoy ? 'One point per game number' : 'One point per game') : cfg.period === 'year' ? 'One point per season' : 'One point per month'}{cfg.roll > 1 ? `, pooling the last ${cfg.roll}` : ''}. A point appears only with at least {m.min2 ? `${m.min} plate appearances and ${m.min2} at-bats` : `${m.min} ${m.of ?? (RATE.includes(cfg.metric) || m.key === 'pitches' ? 'chances' : 'pitches')}`} behind it; hover for the count. {star} Lines are straight between points.</p>
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
