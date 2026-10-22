'use client'

// src/components/swing-lab/SwingLeague.tsx
//
// Body of /mlb/swing-decisions. Three numbered sections — The question (league baseline + leaderboard) · What a swing is
// worth (the league map behind every hitter's Decisions tab) · Method. Public: no Pro data on this page. A hitter's name
// links to his Decisions tab (Pro-gated by the batting-lab layout). Descriptions only; every hitter shown has at least
// GATE.season decision pitches in the window.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { C, Card, Empty, Foot, Section } from '@/components/team/ui'
import {
  COL_LABELS, COUNT_GROUPS, FAMILIES, GATE, ROW_LABELS, inZone, leagueOverall, leagueWorth,
  type CountGroup, type Family, type LeaderRow, type LeagueCell, type SwingLeaders,
} from '@/lib/swing-decisions/model'

type Win = 'season' | 'l30'
type SortKey = 'decision_runs_per100' | 'selection' | 'aggression' | 'n_pitches'
const PAGE = 25
const CAP = 10 // runs per 100 pitches at which the map colour saturates

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const sgn = (v: number | null, d = 1) => { if (v == null) return '—'; const t = Math.abs(v).toFixed(d); return (Number(t) === 0 ? '' : v > 0 ? '+' : '−') + t }
const fmt = (n: number) => n.toLocaleString('en-US')
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

/** Green = a swing is worth more than a take here; orange = a take is worth more. */
function tone(v: number) {
  const a = clamp(Math.abs(v) / CAP, 0, 1), base = v >= 0 ? [29, 158, 117] : [255, 87, 34]
  const mix = base.map(ch => Math.round(255 + (ch - 255) * (0.12 + 0.88 * a)))
  return { bg: `rgb(${mix.join(',')})`, fg: a > 0.55 ? '#fff' : C.ink }
}
const RAMP = `linear-gradient(90deg,${[-CAP, -CAP / 2, 0, CAP / 2, CAP].map(v => tone(v).bg).join(',')})`

export default function SwingLeague({ leaders, league }: { leaders: SwingLeaders; league: LeagueCell[] }) {
  const [win, setWin] = useState<Win>('season')
  const [sort, setSort] = useState<SortKey>('decision_runs_per100')
  const [desc, setDesc] = useState(true)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [count, setCount] = useState<CountGroup>('even')
  const [family, setFamily] = useState<Family>('fastball')

  const L = useMemo(() => leagueOverall(league), [league])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = leaders[win].filter(r => !needle || r.name.toLowerCase().includes(needle) || (r.team ?? '').toLowerCase() === needle)
    return list.sort((a, b) => {
      const x = a[sort], y = b[sort]
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return desc ? y - x : x - y
    })
  }, [leaders, win, sort, desc, q])
  const worth = useMemo(() => leagueWorth(league, count, family), [league, count, family])

  const head = (key: SortKey, label: string, title: string) => (
    <th className="r" title={title}>
      <button type="button" className={`sd-th${sort === key ? ' on' : ''}`} onClick={() => { if (sort === key) setDesc(d => !d); else { setSort(key); setDesc(true) } setShown(PAGE) }}>
        {label}{sort === key ? (desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
  const tile = (k: string, v: string, s: string) => (
    <div key={k} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.15, marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 12, color: C.mute }}>{s}</div>
    </div>
  )

  return (
    <div>
      <style>{CSS}</style>

      <Section id="question" num="01" title="The question" sub="Who takes the pitches that lose runs to swing at, and who swings at the ones that gain runs?">
        <div className="sd-tiles">
          {tile('League Selection', pct(L.selection), 'share of swing-losing pitches taken')}
          {tile('League Aggression', pct(L.aggression), 'share of hittable pitches swung at')}
          {tile('In-zone swing rate', pct(L.zoneSwing), 'league, rulebook zone')}
          {tile('Out-of-zone swing rate', pct(L.outSwing), 'league, outside the zone')}
        </div>

        <Card title="The leaderboard" style={{ marginTop: 16 }}>
          <div className="sd-bar">
            <div className="sd-seg" role="group">
              <button type="button" aria-pressed={win === 'season'} className={win === 'season' ? 'on' : ''} onClick={() => { setWin('season'); setShown(PAGE) }}>2026 season</button>
              <button type="button" aria-pressed={win === 'l30'} className={win === 'l30' ? 'on' : ''} onClick={() => { setWin('l30'); setShown(PAGE) }}>Last 30 days</button>
            </div>
            <input className="sd-q" type="search" placeholder="Find a hitter or team (PHI)" value={q} onChange={e => { setQ(e.target.value); setShown(PAGE) }} aria-label="Find a hitter or team" />
            <span className="sd-n">{fmt(rows.length)} hitters with {GATE.season}+ pitches</span>
          </div>
          {rows.length === 0 ? <Empty>No hitter matches.</Empty> : (
            <div className="sd-wrap">
              <table className="sd-tbl">
                <thead><tr>
                  <th>#</th><th>Hitter</th>
                  {head('n_pitches', 'Pitches', 'Decision pitches seen in the window')}
                  {head('selection', 'Selection', 'Share of swing-losing pitches he took')}
                  {head('aggression', 'Aggression', 'Share of hittable pitches he swung at')}
                  {head('decision_runs_per100', 'Decision runs /100', 'His choices against the league’s average choice, runs per 100 pitches')}
                </tr></thead>
                <tbody>
                  <tr className="sd-lg"><td /><td><b>League average</b></td><td className="r" /><td className="r">{pct(L.selection)}</td><td className="r">{pct(L.aggression)}</td><td className="r">0.0</td></tr>
                  {rows.slice(0, shown).map((r: LeaderRow, i) => (
                    <tr key={r.batter_id}>
                      <td className="m">{i + 1}</td>
                      <td><Link href={`/mlb/lab/batting-lab/${r.batter_id}/decisions`} className="sd-nm">{r.name}</Link> <span className="m">{r.team ?? ''}</span></td>
                      <td className="r">{fmt(r.n_pitches)}</td>
                      <td className="r">{pct(r.selection)}</td>
                      <td className="r">{pct(r.aggression)}</td>
                      <td className="r"><b style={{ color: r.decision_runs_per100 == null ? C.mute : r.decision_runs_per100 >= 0 ? C.good : C.bad }}>{sgn(r.decision_runs_per100, 2)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > shown && <button type="button" className="sd-more" onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</button>}
          <Foot>Source: Baseball Savant via pybaseball. Selection = the share of swing-losing pitches a hitter took; Aggression = the share of hittable pitches he swung at; decision runs = his choices against the league’s average choice in the same count, spot, pitch family and pitcher hand, per 100 pitches. Hitters need {GATE.season} decision pitches in the window. “Last 30 days” ends on the last game day in the data. Click a name for his full decision grid (Pro).</Foot>
        </Card>
      </Section>

      <Section id="map" num="02" title="What a swing is worth" sub="The league baseline behind every hitter’s grid: in each spot, what a swing has produced compared with a take.">
        <Card title="The league map">
          <div className="sd-bar">
            <div className="sd-seg" role="group">{COUNT_GROUPS.map(g => <button key={g.key} type="button" aria-pressed={count === g.key} className={count === g.key ? 'on' : ''} onClick={() => setCount(g.key)}>{g.label}</button>)}</div>
            <div className="sd-seg" role="group">{FAMILIES.map(f => <button key={f.key} type="button" aria-pressed={family === f.key} className={family === f.key ? 'on' : ''} onClick={() => setFamily(f.key)}>{f.label}</button>)}</div>
            <span className="sd-n">{COUNT_GROUPS.find(g => g.key === count)!.defn}</span>
          </div>
          <p className="sd-cap">Batter’s view: inside on the left, away on the right. Green: a swing has been worth more than a take. Orange: a take has been worth more. Each cell shows runs per 100 pitches, with the league swing rate under it.</p>
          <div className="sd-gridwrap">
            <div className="sd-rowlbls">{ROW_LABELS.map(l => <span key={l}>{l}</span>)}</div>
            <div className="sd-zg">
              {worth.map(x => {
                const t = tone(x.gap ?? 0), none = x.gap == null
                return (
                  <div key={`${x.r}-${x.c}`} className={`sd-cell${inZone(x.r, x.c) ? ' inz' : ''}${none ? ' none' : ''}`} style={none ? undefined : { background: t.bg, color: t.fg }}
                    aria-label={none ? `${ROW_LABELS[x.r]}, ${COL_LABELS[x.c]}: no data` : `${ROW_LABELS[x.r]}, ${COL_LABELS[x.c]}: a swing is worth ${sgn(x.gap)} runs per 100 pitches over a take; the league swings ${pct(x.swingRate)}`}>
                    <b>{none ? '—' : sgn(x.gap)}</b>{!none && <small>swing {pct(x.swingRate)}</small>}
                  </div>
                )
              })}
            </div>
            <div className="sd-collbls">{COL_LABELS.map(l => <span key={l}>{l}</span>)}</div>
          </div>
          <div className="sd-legend">
            <span>Take pays</span><span className="sd-ramp" style={{ background: RAMP }} /><span>Swing pays</span><span>(±{CAP} runs per 100 pitches, capped)</span><span><i className="sd-sw" />Rulebook zone</span>
          </div>
          <Foot>Source: Baseball Savant via pybaseball (delta_run_exp). Each cell: the league’s mean run result of swings minus its mean run result of takes in that spot, pooled over pitcher hands. 5×5 grid around each batter’s own zone, drawn inside-to-away whichever side he bats.</Foot>
        </Card>
      </Section>

      <Section id="method" num="03" title="Method">
        <Card title="How it’s built">
          <p className="sd-cap" style={{ marginBottom: 0 }}>
            For every count group, pitch family, pitcher hand and spot, the league’s pitches give an average run result for a swing and for a take. A pitch is “hittable” when the league’s swing beats its take in that spot. <b>Selection</b> is the share of the other pitches a hitter took; <b>Aggression</b> is the share of hittable pitches he swung at. His own contact results are not in either. Inspired by Baseball Prospectus’s SEAGER framework; not a replica. Each number is a description of what happened, with its sample, not a forecast.
          </p>
        </Card>
      </Section>
    </div>
  )
}

const CSS = `
.sd-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sd-bar{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.sd-seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.sd-seg button{border:1px solid ${C.line};background:#fff;border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;color:${C.ink}}
.sd-seg button.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.sd-seg button:focus-visible,.sd-th:focus-visible,.sd-more:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}
.sd-q{border:1px solid ${C.line};border-radius:999px;padding:7px 14px;font-size:13px;font-family:inherit;min-width:220px;background:#fff;color:${C.ink}}
.sd-n{font-size:12px;color:${C.mute}}
.sd-cap{color:#5b5347;font-size:13px;margin:0 0 12px}
.sd-wrap{overflow-x:auto;border:1px solid ${C.line};border-radius:10px}
.sd-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.sd-tbl th{background:${C.soft};text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${C.mute};padding:8px 12px;font-weight:700;white-space:nowrap}
.sd-tbl td{padding:8px 12px;border-top:1px solid ${C.line};white-space:nowrap;font-variant-numeric:tabular-nums}
.sd-tbl .r{text-align:right}
.sd-tbl .m{color:${C.mute};font-size:12px}
.sd-tbl .sd-lg td{background:#fffdf3}
.sd-th{all:unset;cursor:pointer;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit}
.sd-th.on{color:${C.ink}}
.sd-nm{color:${C.ink};font-weight:700;text-decoration:none}
.sd-nm:hover{color:${C.orange}}
.sd-more{margin-top:12px;border:1px solid ${C.line};background:#fff;border-radius:999px;padding:7px 18px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.sd-gridwrap{display:grid;grid-template-columns:auto 1fr;gap:6px;max-width:640px}
.sd-rowlbls{display:grid;grid-template-rows:repeat(5,1fr);gap:4px}
.sd-rowlbls span,.sd-collbls span{font-size:10px;letter-spacing:.08em;font-weight:600;color:${C.faint};text-transform:uppercase;display:flex;align-items:center}
.sd-rowlbls span{justify-content:flex-end;padding-right:4px;max-width:54px;text-align:right;line-height:1.1}
.sd-collbls{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;grid-column:2}
.sd-collbls span{justify-content:center;text-align:center;line-height:1.1}
.sd-zg{display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);gap:4px}
.sd-cell{aspect-ratio:1/1;border:1px solid transparent;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:2px;min-width:0}
.sd-cell b{font-size:clamp(13px,2.1vw,20px);font-weight:800;line-height:1}
.sd-cell small{font-size:clamp(9px,1.2vw,11px);font-weight:600;opacity:.8}
.sd-cell.inz{border:2px solid ${C.ink}}
.sd-cell.none{background:repeating-linear-gradient(135deg,#f7f4ec 0 6px,#e7e2d8 6px 7px);color:${C.faint}}
.sd-legend{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:${C.mute}}
.sd-ramp{display:inline-flex;height:10px;width:170px;border-radius:5px;border:1px solid ${C.line}}
.sd-sw{display:inline-block;width:16px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:4px;border:2px solid ${C.ink};background:#fff}
@media(max-width:900px){.sd-tiles{grid-template-columns:1fr 1fr}.sd-q{min-width:0;flex:1}}
`
