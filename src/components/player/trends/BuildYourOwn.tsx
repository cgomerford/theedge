'use client'

// src/components/player/trends/BuildYourOwn.tsx
//
// "Build your own" for the player Statcast trends tab. Pick one measure, optionally one or more pitch types, a window and lines or bars.
// It reads the same compact rows the rest of the tab already has (no new fetch), so every point is a window over his own plate
// appearances (overall hitter measures) or games (pitch-specific measures and every pitcher measure). A point is drawn only when the
// window holds enough of the thing being counted (the rolling.ts minimums); a season line is dashed behind it. Describes what has
// happened; it is not a forecast.

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Foot, C, MONO } from '@/components/team/ui'
import { H, HP, P, PT, filterPa, hitTypesRanked, trailing, typeTotals, type BatterTrendsData, type HitGame, type HitterFilter, type PaRow, type PitGame, type PitcherTrendsData } from '@/lib/player-trends/rolling'
import { AXIS, GRID, PITCH_COLOR, PITCH_NAME, Segmented, TrendLines, fmt1, fmt2, fmt3, fmtPct1 } from './parts'

type Row = Record<string, number | string | null>
type Fmt = (v: number) => string
const int: Fmt = v => String(Math.round(v))

/** One measure. `items` is the slice the window covers; `t` is the pitch type, or null for all pitches. */
type Metric<I> = { key: string; label: string; group: string; fmt: Fmt; byPitch: boolean; f: (items: I[], t: string | null) => number | null; hint: string }

const HIT_PA: Metric<PaRow>[] = [
  { key: 'ba', label: 'Batting average', group: 'Batting numbers', fmt: fmt3, byPitch: false, f: s => H.ba(s), hint: 'Hits per at-bat (10+ at-bats in the window)' },
  { key: 'obp', label: 'On-base percentage', group: 'Batting numbers', fmt: fmt3, byPitch: false, f: s => H.obp(s), hint: 'Hits, walks and hit-by-pitch per plate appearance (20+)' },
  { key: 'slg', label: 'Slugging percentage', group: 'Batting numbers', fmt: fmt3, byPitch: false, f: s => H.slg(s), hint: 'Total bases per at-bat (10+ at-bats)' },
  { key: 'ops', label: 'OPS', group: 'Batting numbers', fmt: fmt3, byPitch: false, f: s => H.ops(s), hint: 'On-base plus slugging' },
  { key: 'iso', label: 'Isolated power (ISO)', group: 'Batting numbers', fmt: fmt3, byPitch: false, f: s => H.iso(s), hint: 'Slugging minus batting average' },
  { key: 'babip', label: 'BABIP', group: 'Batting numbers', fmt: fmt3, byPitch: false, f: s => H.babip(s), hint: 'Hits per ball in play, home runs left out (20+ balls in play)' },
  { key: 'hr', label: 'Home runs', group: 'Batting numbers', fmt: int, byPitch: false, f: s => H.hr(s), hint: 'Home runs in the window' },
  { key: 'bb', label: 'Walk %', group: 'Plate discipline', fmt: fmtPct1, byPitch: false, f: s => H.bb(s), hint: 'Walks per plate appearance' },
  { key: 'k', label: 'Strikeout %', group: 'Plate discipline', fmt: fmtPct1, byPitch: false, f: s => H.k(s), hint: 'Strikeouts per plate appearance' },
  { key: 'whiff', label: 'Whiff %', group: 'Plate discipline', fmt: fmtPct1, byPitch: false, f: s => H.whiff(s), hint: 'Misses per swing (15+ swings)' },
  { key: 'chase', label: 'Chase %', group: 'Plate discipline', fmt: fmtPct1, byPitch: false, f: s => H.chase(s), hint: 'Swings at pitches outside the zone (15+)' },
  { key: 'xwoba', label: 'xwOBA', group: 'Contact quality', fmt: fmt3, byPitch: false, f: s => H.xwoba(s), hint: 'Expected wOBA from contact quality, walks and strikeouts' },
  { key: 'hh', label: 'Hard-hit %', group: 'Contact quality', fmt: fmtPct1, byPitch: false, f: s => H.hardHit(s), hint: 'Balls in play at 95+ mph (5+ tracked)' },
  { key: 'brl', label: 'Barrel %', group: 'Contact quality', fmt: fmtPct1, byPitch: false, f: s => H.barrel(s), hint: 'Barrels per ball in play (5+ tracked)' },
  { key: 'ev', label: 'Average exit velocity', group: 'Contact quality', fmt: fmt1, byPitch: false, f: s => H.avgEv(s), hint: 'Average exit speed on tracked balls in play, mph' },
]

const HIT_PITCH: Metric<HitGame>[] = [
  { key: 'h_usage', label: 'Share of pitches seen', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => (t ? HP.usage(g, t) : null), hint: 'How much of what pitchers threw him was this pitch (30+ pitches in the window)' },
  { key: 'h_whiff', label: 'Whiff % against the pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => HP.whiff(g, t), hint: 'Misses per swing at this pitch (15+ swings)' },
  { key: 'h_chase', label: 'Chase % at the pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => HP.chase(g, t), hint: 'Swings at this pitch outside the zone (15+)' },
  { key: 'h_csw', label: 'Called + swinging strike %', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => HP.csw(g, t), hint: 'Called strikes plus swinging strikes per pitch (30+ pitches)' },
  { key: 'h_hh', label: 'Hard-hit % on the pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => HP.hardHit(g, t), hint: 'Balls in play at 95+ mph off this pitch (5+ tracked)' },
  { key: 'h_brl', label: 'Barrel % on the pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => HP.barrel(g, t), hint: 'Barrels per ball in play off this pitch (5+)' },
  { key: 'h_ev', label: 'Exit velocity on the pitch', group: 'Pitch-specific', fmt: fmt1, byPitch: true, f: (g, t) => HP.ev(g, t), hint: 'Average exit speed off this pitch, mph (5+ tracked)' },
  { key: 'h_xwoba', label: 'xwOBA on the pitch', group: 'Pitch-specific', fmt: fmt3, byPitch: true, f: (g, t) => HP.xwoba(g, t), hint: 'Plate appearances that ended on this pitch (10+)' },
  { key: 'h_ba', label: 'Batting average on the pitch', group: 'Pitch-specific', fmt: fmt3, byPitch: true, f: (g, t) => HP.ba(g, t), hint: 'At-bats that ended on this pitch (10+)' },
  { key: 'h_slg', label: 'Slugging on the pitch', group: 'Pitch-specific', fmt: fmt3, byPitch: true, f: (g, t) => HP.slg(g, t), hint: 'Total bases per at-bat that ended on this pitch (10+)' },
]

const PITCHER: Metric<PitGame>[] = [
  { key: 'era', label: 'ERA', group: 'Results', fmt: fmt2, byPitch: false, f: g => P.era(g), hint: 'Official box lines pooled over the window (5+ innings)' },
  { key: 'xwoba', label: 'xwOBA against', group: 'Results', fmt: fmt3, byPitch: false, f: g => P.xwobaAgainst(g), hint: 'Quality of contact allowed plus walks and strikeouts (15+ plate appearances)' },
  { key: 'hh', label: 'Hard-hit % against', group: 'Contact against', fmt: fmtPct1, byPitch: false, f: g => P.hardHit(g), hint: '95+ mph balls in play (8+ tracked)' },
  { key: 'brl', label: 'Barrel % against', group: 'Contact against', fmt: fmtPct1, byPitch: false, f: g => P.barrel(g), hint: 'Barrels per ball in play (8+)' },
  { key: 'zone', label: 'Zone %', group: 'Command', fmt: fmtPct1, byPitch: false, f: g => P.zone(g), hint: 'Pitches in the zone (30+)' },
  { key: 'chase', label: 'Chase % induced', group: 'Command', fmt: fmtPct1, byPitch: false, f: g => P.chase(g), hint: 'Swings at pitches outside the zone (20+)' },
  { key: 'pvelo', label: 'Velocity by pitch', group: 'Pitch-specific', fmt: fmt1, byPitch: true, f: (g, t) => (t ? PT.velo(g, t) : null), hint: 'Average release speed, mph (15+ tracked)' },
  { key: 'pusage', label: 'Usage by pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => (t ? PT.usage(g, t) : null), hint: 'Share of his pitches (30+ in the window)' },
  { key: 'pwhiff', label: 'Whiff % by pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => (t ? PT.whiff(g, t) : null), hint: 'Misses per swing (10+ swings)' },
  { key: 'pzone', label: 'Zone % by pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => (t ? PT.zone(g, t) : null), hint: 'Pitches in the zone (30+)' },
  { key: 'pchase', label: 'Chase % induced by pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => (t ? PT.chase(g, t) : null), hint: 'Swings at this pitch outside the zone (15+)' },
  { key: 'phh', label: 'Hard-hit % against, by pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => (t ? PT.hardHit(g, t) : null), hint: 'Balls in play off this pitch at 95+ mph (5+ tracked)' },
  { key: 'pbrl', label: 'Barrel % against, by pitch', group: 'Pitch-specific', fmt: fmtPct1, byPitch: true, f: (g, t) => (t ? PT.barrel(g, t) : null), hint: 'Barrels per ball in play off this pitch (5+)' },
  { key: 'pxw', label: 'xwOBA against, by pitch', group: 'Pitch-specific', fmt: fmt3, byPitch: true, f: (g, t) => (t ? PT.xwoba(g, t) : null), hint: 'Plate appearances that ended on this pitch (10+)' },
]

const FILTERS: { v: HitterFilter; label: string }[] = [{ v: 'all', label: 'All' }, { v: 'L', label: 'vs LHP' }, { v: 'R', label: 'vs RHP' }, { v: 'day', label: 'Day' }, { v: 'night', label: 'Night' }]
const chipStyle = (on: boolean, color: string): React.CSSProperties => ({ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? color : C.line}`, background: on ? color : '#fff', color: on ? '#fff' : '#5b5347' })
const selStyle: React.CSSProperties = { fontFamily: MONO, fontSize: 12, padding: '7px 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', color: C.ink, maxWidth: '100%' }

const NO_HIT: HitGame[] = [], NO_PIT: PitGame[] = []
type Series = { key: string; label: string; color: string; t: string | null }

/** Window rows: one per item, each series a trailing window ending there. */
function windowRows<I extends { d: string }>(items: I[], win: number, series: Series[], m: Metric<I>): Row[] {
  const rows: Row[] = items.map((x, i) => ({ i: i + 1, d: x.d }))
  for (const s of series) trailing(items, win, sl => m.f(sl, s.t)).forEach((v, i) => { rows[i][s.key] = v })
  return rows
}

export default function BuildYourOwn(p: { subject: 'batter'; data: BatterTrendsData; color: string } | { subject: 'pitcher'; data: PitcherTrendsData; color: string }) {
  const hitter = p.subject === 'batter'
  const [metricKey, setMetricKey] = useState(hitter ? 'ba' : 'pwhiff')
  const [picked, setPicked] = useState<string[]>([])
  const [win, setWin] = useState<number | null>(null)
  const [split, setSplit] = useState<HitterFilter>('all')
  const [bars, setBars] = useState(false)

  const hitGames = hitter ? (p.data as BatterTrendsData).games : NO_HIT
  const pitGames = !hitter ? (p.data as PitcherTrendsData).games : NO_PIT
  const metrics: Metric<never>[] = (hitter ? [...HIT_PA, ...HIT_PITCH] : PITCHER) as unknown as Metric<never>[]
  const metric = metrics.find(m => m.key === metricKey) ?? metrics[0]
  const isPaMetric = hitter && !metric.byPitch                       // hitter measures over plate appearances
  const unit = isPaMetric ? 'PA' : hitter ? 'game' : 'start'
  const windows = isPaMetric ? [10, 15, 25, 50, 100] : hitter ? [5, 10, 20, 30] : [1, 2, 3, 5, 8]
  const w = win != null && windows.includes(win) ? win : isPaMetric ? 25 : hitter ? 10 : 3

  const types = useMemo(() => (hitter ? hitTypesRanked(hitGames) : Object.entries(typeTotals(pitGames)).filter(([t, v]) => t !== 'UN' && v.n >= 30).sort((a, b) => b[1].n - a[1].n).map(([t]) => t)).slice(0, 8), [hitter, hitGames, pitGames])
  const chosen = picked.filter(t => types.includes(t))
  const useTypes = metric.byPitch ? (chosen.length ? chosen : types.slice(0, 3)) : []
  const allowAll = hitter && metric.byPitch && metric.key !== 'usage'      // "all pitches" has no meaning for a share of pitches
  const series: Series[] = metric.byPitch
    ? [...(allowAll && picked.includes('ALL') ? [{ key: 's_ALL', label: 'All pitches', color: p.color, t: null }] : []), ...useTypes.map(t => ({ key: `s_${t}`, label: PITCH_NAME[t] ?? t, color: PITCH_COLOR[t] ?? '#888', t }))]
    : [{ key: 's_all', label: metric.label, color: p.color, t: null }]

  const { rows, season, items } = useMemo(() => {
    if (isPaMetric) {
      const pa = filterPa((p.data as BatterTrendsData).pa, split) as PaRow[]
      const m = metric as unknown as Metric<PaRow>
      return { rows: windowRows(pa, w, series, m), season: series.map(s => m.f(pa, s.t)), items: pa.length }
    }
    if (hitter) {
      const m = metric as unknown as Metric<HitGame>
      return { rows: windowRows(hitGames, w, series, m), season: series.map(s => m.f(hitGames, s.t)), items: hitGames.length }
    }
    const m = metric as unknown as Metric<PitGame>
    return { rows: windowRows(pitGames, w, series, m), season: series.map(s => m.f(pitGames, s.t)), items: pitGames.length }
    // series is derived from metric + picks, so it is covered by those
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.data, metricKey, picked, w, split, hitter, isPaMetric])

  const filled = rows.some(r => series.some(s => typeof r[s.key] === 'number'))
  const groups = [...new Set(metrics.map(m => m.group))]
  const toggle = (t: string) => setPicked(cur => (cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t].slice(-6)))
  const shown = metric.byPitch ? series.length : 1

  return (
    <Card title="Build your own" note={hitter ? 'any batting number, any pitch' : 'any measure, any pitch'}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint }}>
          Measure
          <select value={metric.key} onChange={e => { setMetricKey(e.target.value); setWin(null) }} style={selStyle} aria-label="Measure">
            {groups.map(g => <optgroup key={g} label={g}>{metrics.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}
          </select>
        </label>
        <Segmented label={`Window (${unit}s)`} options={windows.map(v => ({ v, label: String(v) }))} value={w} onChange={setWin} />
        {isPaMetric && <Segmented label="Split" options={FILTERS} value={split} onChange={setSplit} />}
        <Segmented label="Style" options={[{ v: 'line', label: 'Lines' }, { v: 'bars', label: 'Bars' }]} value={bars ? 'bars' : 'line'} onChange={v => setBars(v === 'bars')} />
      </div>
      {metric.byPitch && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }} role="group" aria-label="Pitch types">
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint }}>Pitches</span>
          {allowAll && <button type="button" aria-pressed={picked.includes('ALL')} onClick={() => setPicked(cur => (cur.includes('ALL') ? cur.filter(x => x !== 'ALL') : [...cur, 'ALL']))} style={chipStyle(picked.includes('ALL'), p.color)}>All pitches</button>}
          {types.map(t => <button key={t} type="button" aria-pressed={useTypes.includes(t)} onClick={() => toggle(t)} style={chipStyle(useTypes.includes(t), PITCH_COLOR[t] ?? '#888')}>{PITCH_NAME[t] ?? t}</button>)}
          {chosen.length === 0 && !picked.includes('ALL') && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>Showing his three most-used. Tap pitches to choose (up to 6).</span>}
        </div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginBottom: 8 }}>{metric.hint}. Each point covers his last {w} {unit}{w === 1 ? '' : 's'}; {items} {unit}s on the season.</div>
      {!filled ? (
        <p style={{ fontFamily: 'inherit', fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '40px 0', margin: 0 }}>Not enough in this window to draw it. Try a longer window, a different pitch, or another split.</p>
      ) : bars ? (
        <div>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="i" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} minTickGap={26} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={v => metric.fmt(Number(v))} />
                <Tooltip formatter={(v: unknown, n: unknown) => [typeof v === 'number' ? metric.fmt(v) : '—', String(n)]} labelFormatter={(l, pl) => { const d = (pl?.[0]?.payload as Row | undefined)?.d; return `#${String(l)}${d ? ` · ${String(d)}` : ''}` }} />
                {series.map(s => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} fillOpacity={0.85} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Seasons series={series} season={season} fmt={metric.fmt} />
        </div>
      ) : (
        <TrendLines data={rows} fmt={metric.fmt} height={230} lines={series.map(s => ({ key: s.key, label: s.label, color: s.color }))} baselines={shown <= 3 ? series.map((s, i) => ({ y: season[i], color: s.color, label: `Season ${s.label}` })) : []} />
      )}
      <Foot>A point is drawn only when the window holds enough of the thing being counted (the minimum is in the measure&apos;s description); a gap means not enough, never a guess. Pitch-specific results count a plate appearance on the pitch that ended it.{isPaMetric ? ' Plate-appearance windows follow the split chosen here.' : ''}</Foot>
    </Card>
  )
}

function Seasons({ series, season, fmt }: { series: Series[]; season: (number | null)[]; fmt: Fmt }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontFamily: MONO, fontSize: 10, color: '#5b5347' }}>
      {series.map((s, i) => <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 8, background: s.color, borderRadius: 2 }} />{s.label}{season[i] != null ? ` · season ${fmt(season[i] as number)}` : ''}</span>)}
    </div>
  )
}

