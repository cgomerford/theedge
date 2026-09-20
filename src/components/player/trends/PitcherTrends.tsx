'use client'

// src/components/player/trends/PitcherTrends.tsx
//
// Pro "Statcast trends" for a pitcher: trajectory vs self, one point per
// outing. Windows are counted in OUTINGS and pool the underlying pitches /
// balls in play (so a 3-outing whiff% is total whiffs ÷ total swings, never an
// average of rates). Not a Lab — no batter matchups, no location maps.
//
//   stuff        velocity by pitch (a dot per outing + rolling line) · whiff% by pitch
//   contact      hard-hit % and barrel % against · zone % and chase % induced
//   mix          pitch usage share over time (stacked)
//   results      ERA · FIP (official box lines) and xwOBA against
//   dial         "concern" read: recent velo, whiff on his put-away pitch, hard-hit spike
//
// Extension and spin are intentionally absent: they are not in the precomputed
// pitch table and the live pull that has them is not stable enough to trend.

import { useMemo, useState } from 'react'
import { Card, Foot, Tile, C, MONO, SANS } from '@/components/team/ui'
import { P, TREND, pitcherDial, trailing, typeTotals, type PitcherTrendsData } from '@/lib/player-trends/rolling'
import { BASE, PITCH_COLOR, PITCH_NAME, Segmented, StackedShare, TrendLines, Verdict, fmt2, fmt3, fmtPct, fmtPct1 } from './parts'

const WINDOWS = [{ v: 2, label: '2 starts' }, { v: 3, label: '3 starts' }, { v: 5, label: '5 starts' }, { v: 8, label: '8 starts' }]

export default function PitcherTrends({ data, color }: { data: PitcherTrendsData; color: string }) {
  const [win, setWin] = useState(3)
  const games = data.games

  const totals = useMemo(() => typeTotals(games), [games])
  const ranked = useMemo(() => Object.entries(totals).filter(([t]) => t !== 'UN').sort((a, b) => b[1].n - a[1].n).map(([t]) => t), [totals])
  const veloTypes = ranked.slice(0, 3), whiffTypes = ranked.filter(t => totals[t].sw >= 40).slice(0, 4)
  const dial = useMemo(() => pitcherDial(games), [games])

  const chart = useMemo(() => {
    const idx = games.map((g, i) => ({ i: i + 1, d: g.d } as Record<string, number | string | null>))
    // velocity: a dot per outing (game average) + rolling line (pitch-weighted over the window)
    for (const t of veloTypes) {
      games.forEach((g, i) => { idx[i][`v_${t}`] = g.types[t]?.velo ?? null })
      trailing(games, win, s => { const o = typeTotals(s)[t]; return o && o.veloN >= 15 ? o.veloW / o.veloN : null }).forEach((v, i) => { idx[i][`r_${t}`] = v })
    }
    for (const t of whiffTypes) {
      trailing(games, win, s => { const o = typeTotals(s)[t]; return o && o.sw >= 10 ? (o.wh / o.sw) * 100 : null }).forEach((v, i) => { idx[i][`w_${t}`] = v })
    }
    const put = (key: string, f: (s: typeof games) => number | null) => trailing(games, win, f).forEach((v, i) => { idx[i][key] = v })
    put('hh', P.hardHit); put('brl', P.barrel); put('zone', P.zone); put('chase', P.chase); put('xw', P.xwobaAgainst)
    put('era', P.era); put('fip', s => P.fip(s, data.cFIP))
    // usage share, smoothed over the same window of outings
    const shareTypes = [...ranked.slice(0, 6)]
    games.forEach((_, i) => {
      const slice = games.slice(Math.max(0, i - Math.max(win, 1) + 1), i + 1)
      const tt = typeTotals(slice), tot = Object.values(tt).reduce((a, x) => a + x.n, 0)
      shareTypes.forEach(t => { idx[i][`u_${t}`] = tot >= 30 ? ((tt[t]?.n ?? 0) / tot) * 100 : null })
      const other = tot >= 30 ? 100 - shareTypes.reduce((a, t) => a + (idx[i][`u_${t}`] as number), 0) : null
      idx[i]['u_other'] = other != null ? Math.max(0, other) : null
    })
    return idx
  }, [games, win, veloTypes, whiffTypes, ranked, data.cFIP])

  const seasonBase = useMemo(() => ({ hh: P.hardHit(games), brl: P.barrel(games), zone: P.zone(games), chase: P.chase(games), xw: P.xwobaAgainst(games), era: P.era(games), fip: P.fip(games, data.cFIP) }), [games, data.cFIP])
  const usageKeys = useMemo(() => [...ranked.slice(0, 6).map(t => ({ key: `u_${t}`, label: PITCH_NAME[t] ?? t, color: PITCH_COLOR[t] ?? '#888' })), { key: 'u_other', label: 'Other', color: '#e2ddd0' }], [ranked])
  const usageRows = useMemo(() => chart.filter(r => r['u_other'] != null), [chart])

  const empty = (msg: string) => <p style={{ fontFamily: SANS, fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '40px 0', margin: 0 }}>{msg}</p>
  if (games.length < 3) return <Card><p style={{ fontFamily: SANS, fontSize: 13, color: C.faint, margin: 0 }}>Trends need at least 3 outings this season; {games.length} so far.</p></Card>
  const pitchGames = games.filter(g => g.n > 0).length

  const veloLines = veloTypes.flatMap(t => [
    { key: `v_${t}`, label: `${PITCH_NAME[t] ?? t} (outing avg)`, color: PITCH_COLOR[t] ?? '#888', dots: true },
    { key: `r_${t}`, label: `${PITCH_NAME[t] ?? t} (rolling)`, color: PITCH_COLOR[t] ?? '#888', width: 2.4 },
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', alignItems: 'center' }}>
        <Segmented label="Window" options={WINDOWS} value={win} onChange={setWin} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>Each point pools his last {win} outings (whiffs ÷ swings, hard-hit balls ÷ balls in play — not an average of rates). {games.length} outings, {pitchGames} with pitch-level data.</span>
      </div>

      {/* dial */}
      <Card title="Concern dial" note={`last ${TREND.P_RECENT_GAMES} outings vs season`}>
        {dial.kind === 'nodata' ? empty(dial.reason) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <Verdict text={dial.label} tone={dial.label === 'Steady' ? 'up' : dial.label === 'Watch' ? 'flat' : 'down'} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#5b5347' }}>{dial.flags} flagged · {dial.evaluated} of 3 checks had enough sample</span>
            </div>
            <div className="pl-tiles">
              {dial.checks.map(c => (
                <Tile key={c.key} label={c.label}
                  value={c.state === 'na' ? 'n/a' : c.key === 'velo' ? `${(c.recent as number).toFixed(1)} mph` : `${(c.recent as number).toFixed(0)}%`}
                  sub={c.state === 'na' ? c.note : `season ${c.season != null ? (c.key === 'velo' ? `${c.season.toFixed(1)} mph` : `${c.season.toFixed(0)}%`) : '—'} · ${c.state === 'flag' ? 'flagged' : 'fine'}`}
                  tone={c.state === 'flag' ? 'bad' : c.state === 'ok' ? 'good' : null} />
              ))}
            </div>
            <Foot>Dial rules (proposals, tuned in one place): velocity flags when the primary fastball averages {TREND.P_VELO_DROP}+ mph under its season mark over the last {TREND.P_VELO_GAMES} outings; put-away flags when his best whiff pitch (thrown {TREND.P_MIN_USAGE}%+, {TREND.P_SEASON_WHIFF}%+ whiff) drops to half its rate over {TREND.P_RECENT_GAMES} outings; hard-hit flags on a {TREND.P_HH_SPIKE}-point spike. 0 flags = Steady, 1 = Watch, 2+ = Concerning. Checks without enough sample are skipped, not guessed. Same idea as the Pro postgame pitcher check, over more than one night.</Foot>
          </>
        )}
      </Card>

      {/* stuff */}
      <div className="pl-grid-2">
        <Card title="Velocity by pitch" note="dot = each outing · line = rolling">
          {veloTypes.length === 0 ? empty('No tracked velocity yet.') : <TrendLines data={chart} fmt={v => `${v.toFixed(0)}`} height={210} lines={veloLines} domain={['auto', 'auto']} />}
        </Card>
        <Card title="Whiff % by pitch" note="rolling · 40+ swings on the season">
          {whiffTypes.length === 0 ? empty('No pitch has enough swings yet.') : (
            <TrendLines data={chart} fmt={fmtPct} height={210} lines={whiffTypes.map(t => ({ key: `w_${t}`, label: PITCH_NAME[t] ?? t, color: PITCH_COLOR[t] ?? '#888' }))} />
          )}
        </Card>
      </div>

      {/* contact */}
      <div className="pl-grid-2">
        <Card title="Hard-hit % and barrel % against" note="rolling">
          <TrendLines data={chart} fmt={fmtPct} height={190} lines={[{ key: 'hh', label: 'Hard-hit % (95+ mph)', color }, { key: 'brl', label: 'Barrel %', color: '#D4533B' }]}
            baselines={[{ y: seasonBase.hh, color, label: 'Season hard-hit' }, { y: seasonBase.brl, color: '#D4533B', label: 'Season barrel' }]} />
        </Card>
        <Card title="Zone % and chase % induced" note="rolling">
          <TrendLines data={chart} fmt={fmtPct} height={190} lines={[{ key: 'zone', label: 'Zone %', color }, { key: 'chase', label: 'Chase % induced', color: '#1D9E75' }]}
            baselines={[{ y: seasonBase.zone, color, label: 'Season zone' }, { y: seasonBase.chase, color: '#1D9E75', label: 'Season chase' }]} />
        </Card>
      </div>
      <Foot>Hard-hit and barrel need 8+ tracked balls in a window; zone % needs 30+ pitches; chase induced = swings at pitches outside the zone ÷ pitches outside the zone (20+).</Foot>

      {/* mix */}
      <Card title="Pitch usage over time" note="share of pitches · smoothed over the window">
        {usageRows.length < 3 ? empty('Not enough pitch-level data yet.') : <StackedShare data={usageRows} keys={usageKeys} height={210} />}
      </Card>

      {/* results */}
      <div className="pl-grid-2">
        <Card title="ERA and FIP" note="official box lines · rolling">
          <TrendLines data={chart} fmt={fmt2} height={200} lines={[{ key: 'era', label: 'ERA', color }, { key: 'fip', label: 'FIP', color: '#7F77DD' }]}
            baselines={[{ y: seasonBase.era, color, label: 'Season ERA' }, { y: seasonBase.fip, color: '#7F77DD', label: 'Season FIP' }]} />
        </Card>
        <Card title="xwOBA against" note="quality of contact allowed + walks and strikeouts">
          <TrendLines data={chart} fmt={fmt3} height={200} lines={[{ key: 'xw', label: 'xwOBA against', color: '#D4533B' }]} baselines={[{ y: seasonBase.xw, color: BASE, label: 'Season' }]} />
        </Card>
      </div>
      <Foot>ERA and FIP pool the last {win} outings&apos; box-score innings, earned runs, strikeouts, walks, hit batters and homers (FIP constant {data.cFIP.toFixed(2)}, from this season&apos;s league totals). xwOBA against stands in for xERA: it is the input to it, not Savant&apos;s own xERA number, which we don&apos;t recompute.</Foot>

      <Foot>
        Source: Statcast pitch and batted-ball events (loaded nightly, from March 27) and MLB box scores. Velocity is release speed; whiff counts swinging strikes and foul tips. Extension and spin are not shown — they are not in the stored pitch table. These describe how he has changed against his own baseline — they are not a forecast.
      </Foot>
    </div>
  )
}
