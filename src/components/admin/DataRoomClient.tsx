'use client'

// src/components/admin/DataRoomClient.tsx
//
// Pure presentation for one game's Data Room. Self-contained — brings its
// own <style> block (same pattern as the rest of /admin: plain CSS, no
// Tailwind utility classes, avoids the known Turbopack responsive-class
// issue). All numbers arrive pre-computed; this file does no fetching.

import { useState } from 'react'
import type { GamePregameInfo, TeamPregameStats, PlayerWatchItem, RollingSeries } from '@/lib/pregame-stats'
import type { Take } from '@/lib/pregame-takes'

type Side = { stats: TeamPregameStats; watchlist: PlayerWatchItem[]; takes: Take[] }
type Props = { info: GamePregameInfo; home: Side; away: Side }

export default function DataRoomClient({ info, home, away }: Props) {
  const [sideKey, setSideKey] = useState<'home' | 'away'>('home')
  const active = sideKey === 'home' ? home : away
  const abbr = sideKey === 'home' ? info.homeAbbr : info.awayAbbr
  const oppAbbr = sideKey === 'home' ? info.awayAbbr : info.homeAbbr
  const oppPitcher = sideKey === 'home' ? info.probableAwayPitcher : info.probableHomePitcher

  return (
    <div className="droom">
      <style>{css}</style>

      <div className="droom-bar">
        <span className="droom-lbl">Team</span>
        <div className="droom-sel">
          {(['home', 'away'] as const).map((s) => (
            <button
              key={s}
              className={`droom-pick${sideKey === s ? ' on' : ''}`}
              onClick={() => setSideKey(s)}
            >
              {s === 'home' ? info.homeAbbr : info.awayAbbr}
            </button>
          ))}
        </div>
        <div className="droom-meta">
          {abbr} vs {oppAbbr}
          {oppPitcher && <> &middot; vs <b>{oppPitcher.hand}HP {oppPitcher.name}</b></>}
        </div>
      </div>

      <div className="droom-sub">
        <div className="droom-subhead">
          <span className="glyph">§</span> The interesting takes
          <em>— what to flag before the game</em>
        </div>
        {active.takes.length === 0 ? (
          <div className="empty">Nothing crosses a threshold tonight — a quiet game by the numbers. That&rsquo;s worth saying too.</div>
        ) : (
          <div className="droom-takes">
            {active.takes.map((t, i) => (
              <div key={i} className={`take ${t.cls}`}>
                <span className="take-tag">{t.tag}</span>
                <div className="take-head">{t.head}</div>
                <div className="take-detail" dangerouslySetInnerHTML={{ __html: t.detail }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="droom-sub">
        <div className="droom-subhead">
          <span className="glyph">§</span> Rolling form
          <em>— last 15 games, computed live from MLB game logs</em>
        </div>
        <div className="chartgrid">
          <SeriesChart title="Team OPS" sub="rolling · season baseline dashed" series={active.stats.ops} fmt={(v) => v.toFixed(3)} color="#FF5722" />
          <SeriesChart title="Team ERA" sub="rolling · lower is better" series={active.stats.era} fmt={(v) => v.toFixed(2)} color="#2C6E8F" invertGood />
          <Watchlist items={active.watchlist} />
          <Errors errorsPerGame={active.stats.errorsPerGame} />
        </div>
        <div className="droom-source">SOURCE &rarr; MLB Stats API game logs (free, no auth) &middot; rolling windows computed server-side on render &middot; no new table required</div>
      </div>

      <div className="droom-foot">
        <div className="droom-foottxt">
          These takes are the raw material for <b>The Read</b>. Feed the flagged ones into the narrative prompt — the AI turns them into the game story + fantasy angle.
        </div>
        <button className="btn btn-ghost">Edit takes</button>
        <button className="btn btn-primary">Feed &rarr; generate Read</button>
      </div>
    </div>
  )
}

// ---------- chart pieces ----------

function SeriesChart({
  title, sub, series, fmt, color, invertGood,
}: { title: string; sub: string; series: RollingSeries | null; fmt: (v: number) => string; color: string; invertGood?: boolean }) {
  if (!series) {
    return (
      <div className="chart">
        <div className="chart-title">{title}</div>
        <div className="empty">Not enough games logged yet this season to roll a trend.</div>
      </div>
    )
  }
  const good = invertGood ? series.deltaVsSeason <= -0.05 : series.deltaVsSeason >= 0.01
  const bad = invertGood ? series.deltaVsSeason >= 0.05 : series.deltaVsSeason <= -0.01
  const deltaCls = good ? 'up' : bad ? 'down' : 'flat'

  return (
    <div className="chart">
      <div className="chart-hdr">
        <div>
          <div className="chart-title">{title}</div>
          <div className="chart-sub">{sub}</div>
        </div>
        <div className="chart-now">
          <div className="v">{fmt(series.current)}</div>
          <div className={`d ${deltaCls}`}>
            {series.deltaVsSeason >= 0 ? '+' : ''}
            {invertGood ? series.deltaVsSeason.toFixed(2) : Math.round(series.deltaVsSeason * 1000)} vs season
          </div>
        </div>
      </div>
      <LineSvg points={series.points} baseline={series.seasonBaseline} color={color} fmt={fmt} />
    </div>
  )
}

function LineSvg({ points, baseline, color, fmt }: { points: number[]; baseline: number; color: string; fmt: (v: number) => string }) {
  const w = 440, h = 118, pad = { l: 6, r: 6, t: 10, b: 16 }
  const min = Math.min(...points, baseline)
  const max = Math.max(...points, baseline)
  const range = max - min || 1
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
  const x = (i: number) => pad.l + (i / (points.length - 1 || 1)) * iw
  const y = (v: number) => pad.t + (1 - (v - min) / range) * ih
  const linePts = points.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const areaPts = `${x(0)},${pad.t + ih} ${linePts} ${x(points.length - 1)},${pad.t + ih}`
  const baseY = y(baseline)
  const lastX = x(points.length - 1), lastY = y(points[points.length - 1])
  const gid = `g${color.replace('#', '')}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <line x1={pad.l} y1={baseY} x2={w - pad.r} y2={baseY} stroke="#6b6b66" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
      <text x={w - pad.r} y={baseY - 3} textAnchor="end" fontSize={8} fill="#6b6b66" fontFamily="JetBrains Mono, monospace">season {fmt(baseline)}</text>
      <polyline points={linePts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={3.5} fill={color} />
    </svg>
  )
}

function Errors({ errorsPerGame }: { errorsPerGame: number[] | null }) {
  if (!errorsPerGame?.length) {
    return (
      <div className="chart">
        <div className="chart-title">Team Errors</div>
        <div className="empty">No fielding log available yet.</div>
      </div>
    )
  }
  const total = errorsPerGame.reduce((a, b) => a + b, 0)
  const w = 440, h = 118, pad = { l: 6, r: 6, t: 10, b: 16 }
  const max = Math.max(...errorsPerGame, 1)
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
  const bw = iw / errorsPerGame.length

  return (
    <div className="chart">
      <div className="chart-hdr">
        <div>
          <div className="chart-title">Team Errors</div>
          <div className="chart-sub">per game · last {errorsPerGame.length}</div>
        </div>
        <div className="chart-now">
          <div className="v">{total}</div>
          <div className="d flat">total</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%' }}>
        {errorsPerGame.map((v, i) => {
          const bh = (v / max) * ih
          const bx = pad.l + i * bw + bw * 0.18
          const by = v === 0 ? pad.t + ih - 2 : pad.t + ih - bh
          const fill = v >= 2 ? '#C0392B' : v === 1 ? '#FF5722' : '#F0EBE0'
          return <rect key={i} x={bx} y={by} width={bw * 0.64} height={v === 0 ? 2 : bh} fill={fill} />
        })}
        <text x={pad.l} y={h - 3} fontSize={8} fill="#6b6b66" fontFamily="JetBrains Mono, monospace">{errorsPerGame.length} ago</text>
        <text x={w - pad.r} y={h - 3} textAnchor="end" fontSize={8} fill="#6b6b66" fontFamily="JetBrains Mono, monospace">tonight</text>
      </svg>
    </div>
  )
}

function Watchlist({ items }: { items: PlayerWatchItem[] }) {
  if (!items.length) {
    return (
      <div className="chart">
        <div className="chart-title">Player Watchlist</div>
        <div className="empty">Lineup not confirmed yet — watchlist fills in once it lands.</div>
      </div>
    )
  }
  return (
    <div className="chart">
      <div className="chart-title">Player Watchlist</div>
      <div className="chart-sub" style={{ marginBottom: 8 }}>rolling vs season</div>
      {items.map((p) => (
        <div key={p.id} className="pl">
          <div className="pl-name">{p.name}<small>{p.position}</small></div>
          <div className="pl-spark"><Sparkline values={p.rollingSpark} up={p.deltaVsSeason >= 0} /></div>
          <div className="pl-val">
            <div className="v">{p.current.toFixed(p.kind === 'pitcher' ? 2 : 3)}</div>
            <div className={`d ${p.deltaVsSeason >= 0 ? 'up' : 'down'}`}>
              {p.deltaVsSeason >= 0 ? '+' : ''}{p.kind === 'pitcher' ? p.deltaVsSeason.toFixed(2) : Math.round(p.deltaVsSeason * 1000)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (!values.length) return null
  const w = 120, h = 24
  const min = Math.min(...values), max = Math.max(...values)
  const r = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1 || 1)) * w},${h - ((v - min) / r) * h * 0.85 - 2}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', height: 24, width: '100%' }}>
      <polyline points={pts} fill="none" stroke={up ? '#FF5722' : '#2C6E8F'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------- scoped styles ----------
const css = `
.droom{border:2px solid #1A1A1A;background:#fff}
.droom-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #1A1A1A1a;flex-wrap:wrap;background:#FAF8F3}
.droom-lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#6b6b66}
.droom-sel{display:flex;border:1px solid #1A1A1A1a}
.droom-pick{font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.5px;background:none;border:none;border-right:1px solid #1A1A1A1a;color:#6b6b66;padding:5px 13px;cursor:pointer}
.droom-pick:last-child{border-right:none}
.droom-pick.on{background:#1A1A1A;color:#FAF8F3}
.droom-meta{margin-left:auto;font-size:11px;color:#1A1A1A}
.droom-meta b{color:#FF5722}
.droom-sub{padding:16px;border-bottom:1px solid #1A1A1A1a}
.droom-sub:last-of-type{border-bottom:none}
.droom-subhead{display:flex;align-items:baseline;gap:8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6b6b66;margin-bottom:12px}
.droom-subhead .glyph{color:#FF5722;text-transform:none}
.droom-subhead em{font-family:Fraunces,Georgia,serif;font-style:italic;font-size:12.5px;color:#1A1A1A;text-transform:none;letter-spacing:0}
.droom-takes{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.take{border:1px solid #1A1A1A1a;background:#fff;border-left:3px solid #1A1A1A1a;padding:11px 13px}
.take.hot{border-left-color:#FF5722}
.take.cold{border-left-color:#2C6E8F}
.take.warn{border-left-color:#C0392B}
.take.good{border-left-color:#15803D}
.take.match{border-left-color:#FDE047}
.take-tag{display:block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
.take.hot .take-tag{color:#FF5722}
.take.cold .take-tag{color:#2C6E8F}
.take.warn .take-tag{color:#C0392B}
.take.good .take-tag{color:#15803D}
.take.match .take-tag{color:#B7950B}
.take-head{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:14.5px;line-height:1.25;margin-bottom:4px}
.take-detail{font-size:10.5px;color:#6b6b66;line-height:1.55}
.take-detail b{color:#1A1A1A}
.chartgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.chart{border:1px solid #1A1A1A1a;background:#fff;padding:13px}
.chart-hdr{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
.chart-title{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:14.5px}
.chart-sub{font-size:9px;color:#6b6b66;letter-spacing:.5px}
.chart-now{text-align:right}
.chart-now .v{font-family:'Bebas Neue',sans-serif;font-size:25px;line-height:.9}
.chart-now .d{font-size:9px;letter-spacing:.5px}
.up{color:#FF5722} .down{color:#2C6E8F} .flat{color:#6b6b66}
.pl{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed #1A1A1A1a}
.pl:last-child{border-bottom:none}
.pl-name{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:13px;flex:0 0 110px}
.pl-name small{display:block;font-size:8px;color:#6b6b66;letter-spacing:.5px}
.pl-spark{flex:1}
.pl-val{text-align:right;flex:0 0 70px}
.pl-val .v{font-size:13px;font-weight:700}
.pl-val .d{font-size:8px;letter-spacing:.5px}
.droom-source{font-size:9px;color:#6b6b66;letter-spacing:.3px;margin-top:10px}
.droom-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 16px;background:#F0EBE0}
.droom-foottxt{flex:1;min-width:220px;font-family:Fraunces,Georgia,serif;font-style:italic;font-size:13.5px;line-height:1.5}
.droom-foottxt b{font-style:normal;color:#FF5722}
.btn{font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:9px 16px;border:none;cursor:pointer}
.btn-primary{background:#FF5722;color:#fff}
.btn-ghost{background:none;border:1px solid #1A1A1A;color:#1A1A1A}
@media(max-width:560px){
  .droom-meta{width:100%;margin-left:0}
  .chartgrid{grid-template-columns:1fr}
}
`