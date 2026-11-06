'use client'

// src/components/player/trends/HitterTrends.tsx
//
// Pro "Statcast trends" for a hitter: trajectory vs self. Every chart is a
// trailing window over his own plate appearances (or balls in play), with his
// season baseline as a dashed line. Window size and the vs-LHP / vs-RHP /
// day / night toggles recompute in the browser from the compact rows the
// server sent — this is a trend view, not a matchup Lab.
//
//   contact quality  xwOBA · Hard-Hit% · Barrel%
//   process          Chase% + Whiff%   ·   BB% + K%
//   shape            Pull / Center / Oppo mix over time  ·  exit-velocity distribution, this season vs last
//   dial             "turning a corner" read (same rules as the Pro postgame hitter check) + its inputs

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Foot, Tile, C, MONO, SANS } from '@/components/team/ui'
import { H, HARD, TREND, filterPa, hitTypeLine, hitTypesRanked, hitterDial, sprayZone, trailing, type BatterTrendsData, type BbePoint, type HitterFilter } from '@/lib/player-trends/rolling'
import { AXIS, GRID, BASE, PITCH_COLOR, PITCH_NAME, Segmented, StackedShare, TrendLines, Verdict, fmt1, fmt3, fmtPct, fmtPct1 } from './parts'
import BuildYourOwn from './BuildYourOwn'

const WINDOWS = [{ v: 10, label: '10 PA' }, { v: 15, label: '15 PA' }, { v: 25, label: '25 PA' }, { v: 50, label: '50 PA' }, { v: 100, label: '100 PA' }]
const FILTERS: { v: HitterFilter; label: string }[] = [{ v: 'all', label: 'All' }, { v: 'L', label: 'vs LHP' }, { v: 'R', label: 'vs RHP' }, { v: 'day', label: 'Day' }, { v: 'night', label: 'Night' }]
const BIN = 5, LO = 50, HI = 115

function evHist(pts: BbePoint[] | null): { bins: number[]; n: number; avg: number | null; hh: number | null } | null {
  const ev = (pts ?? []).flatMap(p => (p.s != null ? [p.s] : []))
  if (ev.length < 20) return null
  const bins = Array.from({ length: (HI - LO) / BIN }, () => 0)
  for (const v of ev) bins[Math.min(bins.length - 1, Math.max(0, Math.floor((v - LO) / BIN)))]++
  return { bins: bins.map(b => (b / ev.length) * 100), n: ev.length, avg: ev.reduce((a, b) => a + b, 0) / ev.length, hh: (ev.filter(v => v >= HARD).length / ev.length) * 100 }
}

export default function HitterTrends({ data, color }: { data: BatterTrendsData; color: string }) {
  const [win, setWin] = useState(15)
  const [filter, setFilter] = useState<HitterFilter>('all')
  const [spWin, setSpWin] = useState(20)

  const rows = useMemo(() => filterPa(data.pa, filter), [data.pa, filter])
  const chart = useMemo(() => {
    const t = (f: Parameters<typeof trailing<(typeof rows)[number]>>[2]) => trailing(rows, win, f)
    const xw = t(H.xwoba), hh = t(H.hardHit), br = t(H.barrel), ch = t(H.chase), wh = t(H.whiff), bb = t(H.bb), k = t(H.k)
    const ba = t(H.ba), ob = t(H.obp), sl = t(H.slg), op = t(H.ops), is = t(H.iso)
    return rows.map((r, i) => ({ i: i + 1, d: r.d, xw: xw[i], hh: hh[i], br: br[i], ch: ch[i], wh: wh[i], bb: bb[i], k: k[i], ba: ba[i], ob: ob[i], sl: sl[i], op: op[i], is: is[i] }))
  }, [rows, win])
  const season = useMemo(() => ({ xw: H.xwoba(rows), hh: H.hardHit(rows), br: H.barrel(rows), ch: H.chase(rows), wh: H.whiff(rows), bb: H.bb(rows), k: H.k(rows), ba: H.ba(rows), ob: H.obp(rows), sl: H.slg(rows), op: H.ops(rows), is: H.iso(rows), babip: H.babip(rows), hr: H.hr(rows) }), [rows])
  const pitchTypes = useMemo(() => hitTypesRanked(data.games), [data.games])
  const typeLines = useMemo(() => pitchTypes.map(t => hitTypeLine(data.games, t)), [pitchTypes, data.games])
  const dial = useMemo(() => hitterDial(data.pa), [data.pa])

  // spray mix: trailing window over balls in play (same toggles: hand from Statcast p_throws, session via the PA rows)
  const spray = useMemo(() => {
    if (!data.bbe) return null
    const dn = new Map(data.pa.map(r => [r.pk, r.dn]))
    const pts = data.bbe.filter(p => sprayZone(p) && (filter === 'all' || filter === 'L' || filter === 'R' ? (filter === 'all' || p.h === filter) : dn.get(p.pk) === filter))
    if (pts.length < spWin + 5) return { n: pts.length, rows: [] as Record<string, number | string | null>[] }
    const out: Record<string, number | string | null>[] = []
    for (let i = spWin - 1; i < pts.length; i++) {
      const w = pts.slice(i - spWin + 1, i + 1), z = { pull: 0, center: 0, oppo: 0 }
      for (const p of w) z[sprayZone(p) as 'pull' | 'center' | 'oppo']++
      out.push({ i: i + 1, d: pts[i].d, pull: (z.pull / spWin) * 100, center: (z.center / spWin) * 100, oppo: (z.oppo / spWin) * 100 })
    }
    return { n: pts.length, rows: out }
  }, [data.bbe, data.pa, filter, spWin])

  const cur = useMemo(() => evHist(data.bbe), [data.bbe]), prev = useMemo(() => evHist(data.bbePrev), [data.bbePrev])
  const evData = useMemo(() => (cur ? cur.bins.map((v, i) => ({ mph: `${LO + i * BIN}${i === cur.bins.length - 1 ? '+' : ''}`, cur: v, prev: prev ? prev.bins[i] : null })) : []), [cur, prev])

  const enough = data.pa.length >= 30
  const empty = (msg: string) => <p style={{ fontFamily: SANS, fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '40px 0', margin: 0 }}>{msg}</p>
  const filterNote = filter === 'all' ? '' : ` (${FILTERS.find(f => f.v === filter)?.label})`
  const noSample = rows.length < win + 5

  if (!enough) return <Card><p style={{ fontFamily: SANS, fontSize: 13, color: C.faint, margin: 0 }}>Trends need at least 30 plate appearances this season; {data.pa.length} so far.</p></Card>

  const mini = (title: string, note: string, keyName: 'xw' | 'hh' | 'br', fmt: (v: number) => string, base: number | null) => (
    <Card title={title} note={note}>
      {noSample ? empty('Not enough plate appearances in this filter yet.') : (
        <TrendLines data={chart} fmt={fmt} height={170} lines={[{ key: keyName, label: title, color }]} baselines={[{ y: base, color: BASE, label: 'Season' }]} />
      )}
    </Card>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', alignItems: 'center' }}>
        <Segmented label="Window" options={WINDOWS} value={win} onChange={setWin} />
        <Segmented label="Split" options={FILTERS} value={filter} onChange={setFilter} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>Each point averages his last {win} plate appearances{filterNote}. Small windows are noisy by design — that is the trend, not a bug.</span>
      </div>

      {/* dial */}
      <Card title="Corner dial" note={`last ${TREND.RECENT} PA vs the ${TREND.BASE} before · all splits`}>
        {dial.kind === 'nodata' ? empty(dial.reason) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <Verdict text={dial.verdict} tone={dial.tone} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#5b5347' }}>{dial.up} factors up · {dial.down} down · {dial.counted} judged</span>
            </div>
            <div className="pl-tiles">
              <Tile label="xwOBA − BA gap" value={dial.gap ? `${dial.gap.diff >= 0 ? '+' : ''}${dial.gap.diff.toFixed(3).replace(/^(-?)0/, '$1')}` : '—'}
                sub={dial.gap ? (dial.gap.kind === 'behind' ? 'results behind his contact quality' : dial.gap.kind === 'ahead' ? 'results ahead of his contact quality' : 'results match contact quality') : 'not enough at-bats'}
                tone={dial.gap ? (dial.gap.kind === 'behind' ? 'good' : dial.gap.kind === 'ahead' ? 'bad' : null) : null} />
              <Tile label="Hard-hit vs season" value={dial.hhDelta != null ? `${dial.hhDelta >= 0 ? '+' : ''}${dial.hhDelta.toFixed(1)} pts` : '—'} sub={`last ${dial.recentPa} PA vs his season`} tone={dial.hhDelta == null ? null : dial.hhDelta >= 0 ? 'good' : 'bad'} />
            </div>
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 460 }}>
                <thead><tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Factor</th><th style={{ fontWeight: 400 }}>Last {TREND.RECENT}</th><th style={{ fontWeight: 400 }}>Prior {TREND.BASE}</th><th style={{ fontWeight: 400 }}>Season</th><th style={{ fontWeight: 400 }}>Read</th>
                </tr></thead>
                <tbody>
                  {dial.factors.map(f => {
                    const show = (v: number | null) => (v == null ? '—' : f.key === 'xw' ? fmt3(v) : f.key === 'ev' ? v.toFixed(1) : v.toFixed(1))
                    return (
                      <tr key={f.key} title={f.why} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                        <td style={{ textAlign: 'left', padding: '6px 0', fontFamily: SANS, fontWeight: 600 }}>{f.label}</td>
                        <td>{show(f.recent)}{f.unit}</td><td>{show(f.base)}{f.unit}</td><td>{show(f.season)}{f.unit}</td>
                        <td style={{ fontWeight: 700, color: f.state === 'up' ? C.good : f.state === 'down' ? C.bad : C.faint }}>{f.state === 'up' ? '▲ up' : f.state === 'down' ? '▼ down' : f.state === 'flat' ? '– flat' : 'n/a'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Foot>Same rules as the Pro postgame hitter check: 2+ more factors up than down = turning a corner (or staying hot if his prior stretch was already {TREND.HOT.toFixed(3).replace(/^0/, '')}+ xwOBA above his season); 2+ more down = dropping off (cooling if he was hot). Factors without enough tracked balls, swings or chases are skipped, not guessed. xwOBA − BA is a rough gap (different scales), used only as a luck flag at ±{TREND.LUCK.toFixed(2).replace(/^0/, '')}. Hover a factor for its threshold.</Foot>
          </>
        )}
      </Card>

      {/* batting numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Tile label="AVG / OBP / SLG" value={season.ba != null && season.ob != null && season.sl != null ? `${fmt3(season.ba)} / ${fmt3(season.ob)} / ${fmt3(season.sl)}` : '—'} sub={`${rows.length} plate appearances${filterNote}`} />
        <Tile label="OPS" value={season.op != null ? fmt3(season.op) : '—'} sub={season.is != null ? `ISO ${fmt3(season.is)}` : 'not enough at-bats'} />
        <Tile label="Home runs" value={season.hr != null ? String(season.hr) : '—'} sub={season.babip != null ? `BABIP ${fmt3(season.babip)}` : 'BABIP needs 20 balls in play'} />
      </div>
      <div className="pl-grid-2">
        <Card title="AVG, OBP and SLG" note="batting line · rolling">
          {noSample ? empty('Not enough plate appearances in this filter yet.') : (
            <TrendLines data={chart} fmt={fmt3} height={200}
              lines={[{ key: 'ba', label: 'AVG', color }, { key: 'ob', label: 'OBP', color: '#1D9E75' }, { key: 'sl', label: 'SLG', color: '#7F77DD' }]}
              baselines={[{ y: season.ba, color, label: 'Season AVG' }, { y: season.ob, color: '#1D9E75', label: 'Season OBP' }, { y: season.sl, color: '#7F77DD', label: 'Season SLG' }]} />
          )}
        </Card>
        <Card title="OPS and isolated power" note="rolling · ISO = SLG − AVG">
          {noSample ? empty('Not enough plate appearances in this filter yet.') : (
            <TrendLines data={chart} fmt={fmt3} height={200}
              lines={[{ key: 'op', label: 'OPS', color }, { key: 'is', label: 'ISO', color: '#D4533B' }]}
              baselines={[{ y: season.op, color, label: 'Season OPS' }, { y: season.is, color: '#D4533B', label: 'Season ISO' }]} />
          )}
        </Card>
      </div>
      <Foot>Counted from his plate appearances: AVG = hits per at-bat, OBP = hits, walks and hit-by-pitch per plate appearance (sacrifice bunts left out), SLG = total bases per at-bat. A window needs 10+ at-bats (20+ plate appearances for OBP) or the line has a gap, so use the 25 and 50 PA windows for these.</Foot>

      {/* contact quality */}
      <div className="pl-grid-3">
        {mini('xwOBA', 'rolling', 'xw', fmt3, season.xw)}
        {mini('Hard-hit %', '95+ mph · rolling', 'hh', fmtPct, season.hh)}
        {mini('Barrel %', 'rolling', 'br', fmtPct1, season.br)}
      </div>
      <Foot>xwOBA = Statcast&apos;s estimate from exit speed and launch angle on contact, plus walks (.69) and hit-by-pitch (.72) at standard weights and strikeouts at 0; intentional walks, sacrifice bunts and untracked contact are left out. Hard-hit and barrel rates need 5+ tracked balls in a window or the line has a gap.</Foot>

      {/* process */}
      <div className="pl-grid-2">
        <Card title="Chase % and whiff %" note="process · lower is better">
          {noSample ? empty('Not enough plate appearances in this filter yet.') : (
            <TrendLines data={chart} fmt={fmtPct} height={190}
              lines={[{ key: 'ch', label: 'Chase %', color }, { key: 'wh', label: 'Whiff %', color: '#D4533B' }]}
              baselines={[{ y: season.ch, color, label: 'Season chase' }, { y: season.wh, color: '#D4533B', label: 'Season whiff' }]} />
          )}
        </Card>
        <Card title="Walk % and strikeout %" note="rolling">
          {noSample ? empty('Not enough plate appearances in this filter yet.') : (
            <TrendLines data={chart} fmt={fmtPct} height={190}
              lines={[{ key: 'bb', label: 'BB %', color: '#1D9E75' }, { key: 'k', label: 'K %', color: '#B23A2E' }]}
              baselines={[{ y: season.bb, color: '#1D9E75', label: 'Season BB' }, { y: season.k, color: '#B23A2E', label: 'Season K' }]} />
          )}
        </Card>
      </div>
      <Foot>Chase = swings at pitches outside the zone ÷ pitches outside the zone. Whiff = swings and misses ÷ swings (foul tips count as misses). Windows need 15+ swings / out-of-zone pitches to plot.</Foot>

      {/* shape */}
      <div className="pl-grid-2">
        <Card title="Pull / center / oppo over time" note={data.bbe ? `${spray?.n ?? 0} balls in play` : undefined}>
          {!spray || spray.rows.length === 0 ? empty(data.bbe ? 'Not enough balls in play in this split to draw a trend.' : 'Spray data is unavailable right now.') : (
            <>
              <div style={{ marginBottom: 8 }}><Segmented label="Window" options={[{ v: 15, label: '15 BIP' }, { v: 20, label: '20 BIP' }, { v: 30, label: '30 BIP' }]} value={spWin} onChange={setSpWin} /></div>
              <StackedShare data={spray.rows} keys={[{ key: 'pull', label: 'Pull', color }, { key: 'center', label: 'Center', color: '#cfc8b8' }, { key: 'oppo', label: 'Oppo', color: '#F0997B' }]} />
              <Foot>Thirds of the field by Statcast hit coordinates (25 units either side of the plate line). A shift from pull to oppo (or back) over time is a change in approach, not luck.</Foot>
            </>
          )}
        </Card>
        <Card title="Exit velocity distribution" note={`${data.season} vs ${data.prevSeason}`}>
          {!cur ? empty('Not enough tracked batted balls this season to draw a distribution.') : (
            <>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barGap={-14}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="mph" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} interval={1} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={34} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: unknown, n: unknown) => [typeof v === 'number' ? `${v.toFixed(1)}%` : '—', n === 'cur' ? String(data.season) : String(data.prevSeason)]} labelFormatter={l => `${l} mph`} />
                    {prev && <Bar dataKey="prev" fill="#cfc8b8" fillOpacity={0.9} isAnimationActive={false} />}
                    <Bar dataKey="cur" fill={color} fillOpacity={0.7} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontFamily: MONO, fontSize: 10, color: '#5b5347', marginTop: 4 }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: color, opacity: 0.7, marginRight: 5 }} />{data.season}: avg {cur.avg != null ? fmt1(cur.avg) : '—'} mph · hard-hit {cur.hh != null ? fmtPct(cur.hh) : '—'} · {cur.n} BBE</span>
                {prev ? <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#cfc8b8', marginRight: 5 }} />{data.prevSeason}: avg {prev.avg != null ? fmt1(prev.avg) : '—'} mph · hard-hit {prev.hh != null ? fmtPct(prev.hh) : '—'} · {prev.n} BBE</span> : <span style={{ color: C.faint }}>{data.prevSeason} not available</span>}
              </div>
              <Foot>Share of batted balls in each 5-mph exit-speed bucket (the last bucket is 110+). This chart shows the whole season and ignores the split toggles.</Foot>
            </>
          )}
        </Card>
      </div>

      {/* pitch-specific */}
      <Card title="By pitch type" note="what he has done against each pitch · this season">
        {typeLines.length === 0 ? empty('No pitch type has enough pitches yet.') : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 560 }}>
              <thead><tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
                {['Pitch', 'Seen', 'Whiff %', 'Chase %', 'Hard-hit %', 'xwOBA', 'AVG', 'SLG'].map((h, i) => <th key={h} style={{ fontWeight: 400, padding: '4px 6px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {typeLines.map(l => (
                  <tr key={l.t} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                    <td style={{ textAlign: 'left', padding: '6px', fontFamily: SANS, fontWeight: 700 }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: PITCH_COLOR[l.t] ?? '#888', marginRight: 7 }} />{PITCH_NAME[l.t] ?? l.t}</td>
                    <td style={{ padding: '6px' }}>{l.share != null ? fmtPct1(l.share) : '—'} <span style={{ color: C.faint }}>({l.n})</span></td>
                    <td>{l.whiff != null ? fmtPct1(l.whiff) : '—'}</td><td>{l.chase != null ? fmtPct1(l.chase) : '—'}</td><td>{l.hardHit != null ? fmtPct1(l.hardHit) : '—'}</td>
                    <td>{l.xwoba != null ? fmt3(l.xwoba) : '—'}</td><td>{l.ba != null ? fmt3(l.ba) : '—'}</td><td style={{ padding: '6px' }}>{l.slg != null ? fmt3(l.slg) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Foot>Whiff = misses per swing at the pitch (15+ swings), chase = swings at it outside the zone (15+), hard-hit = 95+ mph per ball in play off it (5+ tracked). xwOBA, AVG and SLG count plate appearances and at-bats that ended on that pitch (10+). A dash means too few to show, not zero. Open Build your own below to see any of these over time.</Foot>
      </Card>

      <BuildYourOwn subject="batter" data={data} color={color} />

      <Foot>
 Day/night is known for {data.dayNightKnown} of {data.pa.length} plate appearances (games for his current club); pitcher hand for {data.handKnown}. Trends describe how he has changed against his own baseline — they are not a forecast.
      </Foot>
    </div>
  )
}
