'use client'

// src/components/contact-lab/TtoSection.tsx
//
// Contact Lab § 03 "Three True Outcomes" (and the Batting Lab Outcomes tab): how much of his game ends without the defence touching it,
// and in what mix. Stat row against MLB · ternary plot of the K / BB / HR mix (dot size = TTO share of PA) · rolling 100-PA lines ·
// "where the rest lies" bar · leaderboard (min 300 PA) with a steadiness badge from the spread of his rolling TTO%.
// Custom SVG for the ternary; Recharts has no ternary. Counts in the table, rates shown with their PA. Descriptions only.
// Sign-up gate only (the page checks it). Props are plain data.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { C, Card, Empty, Foot } from '@/components/team/ui'
import {
  ROLL_STEP, ROLL_WINDOW, STEADY_LABEL, TTO_MIN_PA, steadinessCuts, steadinessOf, ternaryShares, tto, ttoRate, type TtoRow,
} from '@/lib/nerve-centre/model'

const pct = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const fmt = (n: number) => n.toLocaleString('en-US')
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const PAGE = 10

export default function TtoSection({ profile, leaders, season }: { profile: TtoRow | null; leaders: { rows: TtoRow[]; league: TtoRow | null } | null; season: number }) {
  const [shown, setShown] = useState(PAGE)
  const rows = leaders?.rows ?? []
  const cuts = useMemo(() => steadinessCuts(rows), [rows])
  const board = useMemo(() => [...rows].sort((a, b) => (ttoRate(b) ?? 0) - (ttoRate(a) ?? 0)), [rows])
  if (!profile || !leaders) return <Empty>Three-true-outcome data isn’t built yet. It refreshes weekly from Baseball Savant.</Empty>

  const lg = leaders.league
  const mine = profile
  const stat = (label: string, v: number | null, l: number | null, d: string) => (
    <div key={label} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.15, marginTop: 2 }}>{pct(v)}</div>
      <div style={{ fontSize: 12, color: C.mute }}>{d} · MLB {pct(l)} · n = {fmt(mine.pa)} PA</div>
    </div>
  )
  const rate = (r: TtoRow | null, k: 'k' | 'bb' | 'hr') => (r && r.pa ? r[k] / r.pa : null)
  const inBoard = board.some(r => r.batter_id === mine.batter_id)
  const cutRows = board.slice(0, shown)
  const table = inBoard && !cutRows.some(r => r.batter_id === mine.batter_id) ? [...cutRows, board.find(r => r.batter_id === mine.batter_id) as TtoRow] : cutRows

  return (
    <div>
      <style>{CSS}</style>
      <div className="tt-stats">
        {stat('TTO%', ttoRate(mine), lg ? ttoRate(lg) : null, 'of PAs end in K, BB or HR')}
        {stat('K%', rate(mine, 'k'), rate(lg, 'k'), 'strikeouts')}
        {stat('BB%', rate(mine, 'bb'), rate(lg, 'bb'), 'walks')}
        {stat('HR%', rate(mine, 'hr'), rate(lg, 'hr'), 'home runs')}
      </div>

      <div className="tt-g2">
        <Card title="The mix">
          <p className="tt-cap">K, BB and HR as a share of his three-true-outcome PAs. Each dot is a hitter with {TTO_MIN_PA}+ PA; closer to a corner means more of that outcome. Dot size = the share of all his PAs that end in one of the three.</p>
          <Ternary me={mine} others={rows} />
          <Foot>Source: Baseball Savant via pybaseball (events). Position = K, BB, HR counts as shares of K + BB + HR ({fmt(tto(mine))} for him). Hitters with {TTO_MIN_PA}+ PA in {season}; the yellow dot is the hitter shown.</Foot>
        </Card>
        <Card title="Consistency">
          <p className="tt-cap">Rolling 100 PAs through the season: how steady each outcome has been. Flat lines = a settled profile; swings = streaks.</p>
          <Rolling me={mine} />
          <div className="tt-legend"><span><i style={{ background: C.ink }} />K%</span><span><i style={{ background: C.good }} />BB%</span><span><i style={{ background: C.orange }} />HR%</span></div>
          <div className="tt-eyebrow" style={{ marginTop: 16 }}>Where the rest lies</div>
          <Rest me={mine} />
          <Foot>Rolling window = his last {ROLL_WINDOW} PAs, sampled every {ROLL_STEP} PA from PA {ROLL_WINDOW}. The in-play split uses the batted-ball type of the plate appearance’s last pitch; home runs are in the TTO slice.</Foot>
        </Card>
      </div>

      <Card title="Leaderboard" style={{ marginTop: 16 }}>
        <p className="tt-cap">Highest three-true-outcome share, {season}. Hitters with {TTO_MIN_PA}+ PA.</p>
        <div className="tt-tw"><table className="tt-tbl">
          <thead><tr><th>#</th><th>Hitter</th><th className="r">PA</th><th className="r">K%</th><th className="r">BB%</th><th className="r">HR%</th><th className="r">TTO%</th><th>Steadiness</th></tr></thead>
          <tbody>{table.map(r => {
            const st = steadinessOf(r.rolling_tto_sd, cuts), me = r.batter_id === mine.batter_id
            return (
              <tr key={r.batter_id} style={me ? { background: '#fffdf3' } : undefined}>
                <td className="m">{board.indexOf(r) + 1}</td>
                <td><Link href={`/mlb/lab/contact?hitter=${r.batter_id}#tto`} className="tt-nm">{r.name}</Link> <span className="m">{r.team ?? ''}</span></td>
                <td className="r">{fmt(r.pa)}</td><td className="r">{pct(rate(r, 'k'))}</td><td className="r">{pct(rate(r, 'bb'))}</td><td className="r">{pct(rate(r, 'hr'))}</td>
                <td className="r"><b>{pct(ttoRate(r))}</b></td>
                <td>{st ? <span className={`tt-badge ${st}`}><i />{STEADY_LABEL[st]}{r.rolling_tto_sd != null ? <small> varies {(r.rolling_tto_sd * 100).toFixed(1)} pts</small> : null}</span> : null}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
        {board.length > shown && <button type="button" className="tt-more" onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, board.length - shown)} more</button>}
        {!inBoard && <p className="tt-cap" style={{ margin: '10px 0 0' }}>{mine.name ?? 'This hitter'} has {fmt(mine.pa)} PA in {season}, under the {TTO_MIN_PA} needed for the leaderboard.</p>}
        <Foot>Source: Baseball Savant via pybaseball (events). Minimum {TTO_MIN_PA} PA. Steadiness = the variation (standard deviation) of his rolling {ROLL_WINDOW}-PA TTO%: the lowest third of these hitters is Steady, the highest third Streaky, so a badge always means “among these hitters”. {board.length} hitters shown.</Foot>
      </Card>
    </div>
  )
}

function Ternary({ me, others }: { me: TtoRow; others: TtoRow[] }) {
  const W = 440, H = 400, A: [number, number] = [220, 28], B: [number, number] = [34, 356], Cc: [number, number] = [406, 356]
  const pt = (s: [number, number, number]): [number, number] => [s[0] * A[0] + s[1] * B[0] + s[2] * Cc[0], s[0] * A[1] + s[1] * B[1] + s[2] * Cc[1]]
  const myS = ternaryShares(me)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 520 }} role="img" aria-label="Ternary plot of strikeout, walk and home run mix">
      <polygon points={`${A} ${B} ${Cc}`} fill={C.soft} stroke={C.line} strokeWidth={1.5} />
      {[0.25, 0.5, 0.75].map(f => {
        const p1: [number, number] = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f], p2: [number, number] = [A[0] + (Cc[0] - A[0]) * f, A[1] + (Cc[1] - A[1]) * f]
        return <g key={f}><line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={C.line} strokeDasharray="3 3" /><text x={p2[0] + 6} y={p2[1] + 3} fontSize={10} fill={C.mute}>{Math.round((1 - f) * 100)}% K</text></g>
      })}
      {others.filter(r => r.batter_id !== me.batter_id).map(r => {
        const s = ternaryShares(r); if (!s) return null
        const p = pt(s), share = ttoRate(r) ?? 0
        return <circle key={r.batter_id} cx={p[0]} cy={p[1]} r={clamp(2 + (share * 100 - 20) / 6, 2, 7)} fill="#B9B0A0" opacity={0.7}><title>{`${r.name}: K ${pct(r.k / r.pa)}, BB ${pct(r.bb / r.pa)}, HR ${pct(r.hr / r.pa)} (n = ${fmt(r.pa)} PA)`}</title></circle>
      })}
      {myS && (() => { const p = pt(myS), share = ttoRate(me) ?? 0; return (
        <g><circle cx={p[0]} cy={p[1]} r={clamp(2 + (share * 100 - 20) / 6, 5, 11)} fill={C.yellow} stroke={C.ink} strokeWidth={2}><title>{`${me.name}: K ${pct(me.k / me.pa)}, BB ${pct(me.bb / me.pa)}, HR ${pct(me.hr / me.pa)} (n = ${fmt(me.pa)} PA)`}</title></circle>
          <text x={p[0] + 13} y={p[1] + 4} fontSize={11} fontWeight={700} fill={C.ink}>{me.name}</text></g>) })()}
      <text x={A[0]} y={A[1] - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.ink}>Strikeouts</text>
      <text x={B[0]} y={B[1] + 20} textAnchor="start" fontSize={11} fontWeight={700} fill={C.ink}>Walks</text>
      <text x={Cc[0]} y={Cc[1] + 20} textAnchor="end" fontSize={11} fontWeight={700} fill={C.ink}>Home runs</text>
    </svg>
  )
}

function Rolling({ me }: { me: TtoRow }) {
  const k = me.rolling_k_n, bb = me.rolling_bb_n, hr = me.rolling_hr_n
  if (!k || !bb || !hr || k.length < 2) return <Empty>A rolling line needs at least {ROLL_WINDOW + ROLL_STEP} PA (he has {fmt(me.pa)}).</Empty>
  const N = k.length, W = 440, H = 260, pl = 36, pr = 10, pt = 12, pb = 28
  const all = [...k, ...bb, ...hr], hi = Math.max(10, Math.ceil((Math.max(...all) + 3) / 10) * 10)
  const X = (i: number) => pl + (i / (N - 1)) * (W - pl - pr), Y = (v: number) => pt + ((hi - v) / hi) * (H - pt - pb)
  const line = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
  const ticks: number[] = []
  for (let v = 0; v <= hi; v += 10) ticks.push(v)
  const labelIdx = [0, Math.floor((N - 1) / 2), N - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Rolling ${ROLL_WINDOW}-PA strikeout, walk and home run rates: K ${k[0]}% to ${k[N - 1]}%, BB ${bb[0]}% to ${bb[N - 1]}%, HR ${hr[0]}% to ${hr[N - 1]}%`}>
      {ticks.map(v => <g key={v}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={C.line} /><text x={pl - 6} y={Y(v) + 3} textAnchor="end" fontSize={10} fill={C.mute}>{v}%</text></g>)}
      <path d={line(k)} fill="none" stroke={C.ink} strokeWidth={2.2} /><path d={line(bb)} fill="none" stroke={C.good} strokeWidth={2.2} /><path d={line(hr)} fill="none" stroke={C.orange} strokeWidth={2.2} />
      {labelIdx.map((i, j) => <text key={i} x={X(i)} y={H - 8} textAnchor={j === 0 ? 'start' : j === labelIdx.length - 1 ? 'end' : 'middle'} fontSize={10} fill={C.mute}>PA {ROLL_WINDOW + i * ROLL_STEP}</text>)}
    </svg>
  )
}

function Rest({ me }: { me: TtoRow }) {
  if (!me.pa) return null
  const t = tto(me), inPlay = (me.gb ?? 0) + (me.ld ?? 0) + (me.fb ?? 0) + (me.pu ?? 0), other = me.pa - t - inPlay
  const seg = (n: number, label: string, bg: string, fg = C.ink) => (n > 0 ? <span style={{ width: `${(n / me.pa) * 100}%`, background: bg, color: fg }} title={`${label}: ${n} of ${me.pa} PA`}>{(n / me.pa) * 100 >= 6 ? label : ''}</span> : null)
  const share = (n: number | null) => ((n ?? 0) / me.pa) * 100
  return (
    <div>
      <div className="tt-bar">{seg(t, `TTO ${Math.round(share(t))}%`, C.ink, '#fff')}{seg(me.gb ?? 0, 'GB', '#CFC5B3')}{seg(me.ld ?? 0, 'LD', '#F2C14E')}{seg(me.fb ?? 0, 'FB', '#FF9A73')}{seg(me.pu ?? 0, 'PU', '#E4DDD0')}{seg(other, '', '#f1eee6')}</div>
      <p style={{ fontSize: 13.5, margin: '8px 0 0', color: C.mute }}>
        {(100 - share(t)).toFixed(1)}% of his PAs did not end in a K, BB or HR: {share(me.gb).toFixed(1)}% on the ground, {share(me.ld).toFixed(1)}% line drives, {share(me.fb).toFixed(1)}% fly balls, {share(me.pu).toFixed(1)}% popups{other > 0 ? `, and ${((other / me.pa) * 100).toFixed(1)}% other (hit by pitch and the like)` : ''} (n = {fmt(me.pa)} PA).
      </p>
    </div>
  )
}

const CSS = `
.tt-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.tt-g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.tt-cap{color:#5b5347;font-size:13px;margin:0 0 12px}
.tt-eyebrow{font-size:10px;letter-spacing:.14em;font-weight:700;color:${C.orange};text-transform:uppercase}
.tt-legend{display:flex;gap:14px;font-size:12px;color:${C.mute};margin-top:4px}.tt-legend i{display:inline-block;width:12px;height:3px;margin-right:5px;vertical-align:3px}
.tt-bar{display:flex;height:26px;border-radius:8px;overflow:hidden;border:1px solid ${C.line};margin-top:8px}
.tt-bar span{display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;min-width:0;overflow:hidden;white-space:nowrap}
.tt-tw{overflow-x:auto;border:1px solid ${C.line};border-radius:10px}
.tt-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.tt-tbl th{background:${C.soft};text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${C.mute};padding:8px 12px;font-weight:700;white-space:nowrap}
.tt-tbl td{padding:8px 12px;border-top:1px solid ${C.line};white-space:nowrap;font-variant-numeric:tabular-nums}
.tt-tbl .r{text-align:right}.tt-tbl .m{color:${C.mute};font-size:12px}
.tt-nm{color:${C.ink};font-weight:700;text-decoration:none}.tt-nm:hover{color:${C.orange}}
.tt-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;border:1px solid ${C.line};background:#fff}
.tt-badge i{width:8px;height:8px;border-radius:50%;display:inline-block}.tt-badge small{font-weight:500;color:${C.mute}}
.tt-badge.steady i{background:${C.good}}.tt-badge.some i{background:#E0A800}.tt-badge.streaky i{background:${C.bad}}
.tt-more{margin-top:12px;border:1px solid ${C.line};background:#fff;border-radius:999px;padding:7px 18px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.tt-more:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}
@media(max-width:900px){.tt-stats{grid-template-columns:1fr 1fr}.tt-g2{grid-template-columns:minmax(0,1fr)}}
`
