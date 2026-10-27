'use client'

// src/components/scout/lab/AbsLab.tsx
//
// Scout Report → ABS, in the lab layout. A selector down the left (club pills, the club, the plate umpire, then the players who have challenged); the choice opens in tiles.
// The club has four views:
//   How they use it   challenges a game and how often they are overturned, against the league and by rank; who starts them; the last 15 games
//   How close         inches off the zone edge: the average, a band chart (how often each distance is overturned) and a map of every challenged pitch
//   When              by inning, count, outs, runners and score
//   Teams             the leaderboard of all clubs
// The plate umpire opens to his own line (every challenge in the games he has worked, league wide), where those pitches were, and each club's challenges in his games.
// A player opens to his own challenges: how many, how often overturned, how close, where, and the counts and innings.
// "Inches off the edge" is from the ball's centre to the edge of the zone (+ outside). The system calls a strike when the ball touches the zone, so up to about 1.5 in
// outside is still a strike. Approximate near the top and bottom. Everything is a count of what has happened; an umpire's line is not a prediction.

import { useMemo, useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { C, SANS } from '@/components/team/ui'
import { BANDS, bandOf, MIN_ABS_N, MIN_RANK_CHALLENGES, MIN_UMP_GAMES } from '@/lib/scout/abs-consts'
import type { AbsLab, AbsPoint, UmpLine } from '@/lib/scout/abs-lab'
import type { Bucket } from '@/lib/scout/abs-desk'
import type { Situations, Tally } from '@/lib/scout/situations'
import { BLUE, NEUTRAL, Pills, RED, kick, mix, note, star, tile } from '@/components/pitching-lab/LocationExplorer'
import LineChart, { CHART_BLUE, CHART_ORANGE } from '../charts/LineChart'
import Leaderboard from '../Leaderboard'

type ClubInfo = { id: number; abbr: string; name: string }
type View = 'use' | 'close' | 'when' | 'teams'
const VIEWS: [View, string][] = [['use', 'How they use it'], ['close', 'How close'], ['when', 'When'], ['teams', 'Teams']]
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const pc = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)
const fp = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0)}%`)
const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))
const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
const ord = (n: number) => { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const inchesText = (d: number | null) => (d == null ? '—' : d === 0 ? 'on the edge' : d > 0 ? `${d.toFixed(1)} in off` : `${Math.abs(d).toFixed(1)} in inside`)

function Bar({ label, value, text, max, color = C.orange, n }: { label: string; value: number | null; text: string; max: number; color?: string; n?: number }) {
  return (
    <div title={n != null ? `n=${n}` : undefined} style={{ opacity: n != null && n < MIN_ABS_N ? 0.45 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}><span>{label}</span><span style={{ fontWeight: 600, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{text}{n != null && n < MIN_ABS_N && star}</span></div>
      <div style={{ height: 11, background: C.soft, borderRadius: 6, overflow: 'hidden', marginTop: 3 }}><div style={{ height: '100%', width: `${value != null && max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} /></div>
    </div>
  )
}

function Big({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div><div style={dt}>{k}</div><div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{v}</div>{sub && <div style={{ fontSize: 12, color: C.mute }}>{sub}</div>}</div>
}

/** The zone and every challenged pitch in it: orange = overturned, grey ring = upheld. The dashed line is the zone grown by the ball's radius. */
function ZoneKey() {
  const dot = (fill: string, stroke: string) => <svg width="14" height="14" viewBox="0 0 14 14" style={{ verticalAlign: '-2px' }}><circle cx="7" cy="7" r="5" fill={fill} stroke={stroke} strokeWidth="1.6" /></svg>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', justifyContent: 'center', marginTop: 8, fontSize: 12, color: '#5b5347' }}>
      <span>{dot(C.orange, '#c4410f')} Orange dot = overturned (the pitch was ruled the other way)</span>
      <span>{dot('#fff', '#5b5347')} White dot = upheld (the umpire&apos;s call stood)</span>
      <span>Solid box = the zone · dashed box = the zone plus the ball&apos;s radius · catcher&apos;s view</span>
    </div>
  )
}

function ZoneMap({ pts }: { pts: AbsPoint[] }) {
  const W = 360, H = 400, X0 = -1.7, X1 = 1.7, Z0 = 0.6, Z1 = 4.4
  const sx = (x: number) => ((x - X0) / (X1 - X0)) * W, sz = (z: number) => H - ((z - Z0) / (Z1 - Z0)) * H
  const top = mean(pts.map(p => p.t)) ?? 3.4, bot = mean(pts.map(p => p.b)) ?? 1.6, hw = 8.5 / 12, r = 1.45 / 12
  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 420, display: 'block', margin: '8px auto 0' }} role="img" aria-label="Where the challenged pitches were">
      <rect x={sx(-hw - r)} y={sz(top + r)} width={sx(hw + r) - sx(-hw - r)} height={sz(bot - r) - sz(top + r)} fill="none" stroke="#a89e8c" strokeDasharray="4 4" />
      <rect x={sx(-hw)} y={sz(top)} width={sx(hw) - sx(-hw)} height={sz(bot) - sz(top)} fill="#fff" stroke={C.ink} strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sz(p.z)} r={5} fill={p.ov ? C.orange : '#fff'} stroke={p.ov ? '#c4410f' : '#5b5347'} strokeWidth={1.6}>
          <title>{`${p.ov ? 'Overturned' : 'Upheld'} · ${inchesText(p.d)} · ${p.side === 'b' ? 'batter' : 'catcher / pitcher'}${p.c ? ` · count ${p.c}` : ''} · inning ${p.inn}`}</title>
        </circle>
      ))}
    </svg>
    <ZoneKey />
    </>
  )
}

function Bands({ pts, league }: { pts: AbsPoint[]; league: AbsLab['league']['bands'] }) {
  const rows = BANDS.map((b, i) => { const xs = pts.filter(p => bandOf(p.d) === i); return { b, n: xs.length, ov: xs.filter(p => p.ov).length } })
  const max = Math.max(1, ...rows.map(r => r.n))
  return (
    <table className="ab-tbl" style={{ marginTop: 6 }}>
      <thead><tr><th></th><th>Challenges</th><th></th><th>Overturned</th><th>League</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.b.label}>
            <td style={{ fontWeight: 800 }}>{r.b.label}</td>
            <td>{r.n}{r.n > 0 && r.n < MIN_ABS_N && star}</td>
            <td style={{ width: '32%' }}><span style={{ display: 'block', height: 10, background: C.soft, borderRadius: 5, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(r.n / max) * 100}%`, background: C.orange }} /></span></td>
            <td>{r.n ? fp(pc(r.ov, r.n)) : '—'}</td>
            <td style={{ color: C.mute }}>{fp(pc(league[i].ov, league[i].n))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Tab({ rows }: { rows: { label: string; t: Tally; league?: Tally }[] }) {
  return (
    <table className="ab-tbl" style={{ marginTop: 6 }}>
      <thead><tr><th></th><th>Challenges</th><th>Overturned</th><th>League</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.label} style={{ opacity: r.t.n > 0 && r.t.n < 8 ? 0.5 : 1 }}><td style={{ fontWeight: 800 }}>{r.label}</td><td>{r.t.n}{r.t.n > 0 && r.t.n < 8 && star}</td><td>{r.t.n ? fp(pc(r.t.ok, r.t.n)) : '—'}</td><td style={{ color: C.mute }}>{r.league && r.league.n ? fp(pc(r.league.ok, r.league.n)) : '—'}</td></tr>)}</tbody>
    </table>
  )
}

function CountGrid({ club, league }: { club: Situations; league: Situations }) {
  return (
    <table className="ab-tbl" style={{ marginTop: 6 }}>
      <thead><tr><th>Balls ↓ Strikes →</th>{[0, 1, 2].map(s => <th key={s}>{s}</th>)}</tr></thead>
      <tbody>
        {[0, 1, 2, 3].map(b => (
          <tr key={b}><td style={{ fontWeight: 800 }}>{b}</td>{[0, 1, 2].map(s => {
            const t = club.byCount[`${b}-${s}`], lg = league.byCount[`${b}-${s}`]
            const ov = t && t.n ? (t.ok / t.n) * 100 : null, lgv = lg && lg.n ? (lg.ok / lg.n) * 100 : null
            const d = ov != null && lgv != null && t.n >= 8 ? Math.max(-1, Math.min(1, (ov - lgv) / 30)) : 0
            return <td key={s} title={t ? `${t.n} challenges, ${t.ok} overturned · league ${fp(lgv)}` : ''} style={{ background: t && t.n ? (d >= 0 ? mix(NEUTRAL, RED, d) : mix(NEUTRAL, BLUE, -d)) : undefined }}>{t && t.n ? <><b>{t.n}</b> <span style={{ color: C.mute, fontSize: 11 }}>{fp(ov)}</span></> : '—'}{t && t.n > 0 && t.n < 8 && star}</td>
          })}</tr>
        ))}
      </tbody>
      <caption style={{ captionSide: 'bottom', fontSize: 11, color: C.mute, textAlign: 'left', paddingTop: 4 }}>Each cell: challenges and the share overturned. Red = more overturned than the league in that count, blue = fewer. {star} marks fewer than 8.</caption>
    </table>
  )
}

export default function AbsLabView({ away, home, lab }: { away: ClubInfo; home: ClubInfo; lab: AbsLab }) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [pick, setPick] = useState('club')
  const [view, setView] = useState<View>('use')
  const [who, setWho] = useState<'all' | 'b' | 'f'>('all')
  const club = side === 'away' ? away : home
  const data = lab.clubs[side]
  const desk = data.desk
  const kind = pick === 'ump' ? 'ump' : pick.startsWith('p:') ? 'player' : 'club'
  const pid = kind === 'player' ? Number(pick.slice(2)) : 0
  const ump = lab.tonight.ump, uLine = lab.tonight.line
  const lg = lab.league

  const pts = data.points
  const shown = who === 'all' ? pts : pts.filter(p => p.side === who)
  const mine = kind === 'player' ? pts.filter(p => p.pid === pid) : []
  // Players are grouped from the located challenges so one man can be both: a catcher who also bats has challenges on both sides.
  const people = useMemo(() => {
    const m = new Map<number, { id: number; name: string; n: number; ov: number; b: number; f: number }>()
    for (const p of pts) {
      if (p.pid == null || !p.name) continue
      const x = m.get(p.pid) ?? { id: p.pid, name: p.name, n: 0, ov: 0, b: 0, f: 0 }
      x.n += 1; x.ov += p.ov; if (p.side === 'b') x.b += 1; else x.f += 1
      m.set(p.pid, x)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [pts])
  const player = kind === 'player' ? people.find(c => c.id === pid) : undefined
  const roleOf = (c: { b: number; f: number }) => (c.f >= c.b ? 'Catcher / pitcher' : 'Batter') + (c.b > 0 && c.f > 0 ? ` (+${c.f >= c.b ? c.b : c.f} as ${c.f >= c.b ? 'batter' : 'catcher / pitcher'})` : '')
  const rollC = useMemo(() => {
    const g = desk?.perGame ?? [], w = 10
    return { labels: g.slice(w - 1).map(x => shortDate(x.date)), values: g.map((_, i) => (i < w - 1 ? null : g.slice(i - w + 1, i + 1).reduce((a, x) => a + x.challenges, 0) / w)).slice(w - 1) }
  }, [desk])
  const lgRate = desk && desk.league.games > 0 ? desk.league.all.n / desk.league.games : 0
  const lgOv = desk ? pc(desk.league.all.ov, desk.league.all.n) : null
  const rate = (b: Bucket) => (b.games > 0 ? b.all.n / b.games : null)

  const underUmp = (ps: AbsPoint[]) => (ump ? ps.filter(p => p.ump === ump.id) : [])
  const clubUnder = underUmp(pts)

  return (
    <div className="ab-grid">
      <style>{`.ab-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start}.ab-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.ab-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.ab-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.ab-btn.on{border-color:#FF5722;background:#fff1ea}.ab-h{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a89e8c;margin:8px 2px 0}.ab-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.ab-span2{grid-column:span 2}.ab-span3{grid-column:1 / -1}.ab-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.ab-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.ab-tbl th:first-child,.ab-tbl td:first-child{text-align:left}.ab-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.ab-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.ab-grid{grid-template-columns:minmax(0,1fr)}.ab-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.ab-h{display:none}.ab-btn{width:auto;white-space:nowrap}.ab-tiles{grid-template-columns:minmax(0,1fr)}.ab-span2{grid-column:auto}}`}</style>

      <nav className="ab-side" aria-label="ABS subjects">
        <Pills items={[['away', away.abbr], ['home', home.abbr]] as ['away' | 'home', string][]} value={side} onChange={v => { setSide(v); if (kind === 'player') setPick('club') }} />
        <button type="button" className={`ab-btn${kind === 'club' ? ' on' : ''}`} onClick={() => setPick('club')}><TeamMark id={club.id} abbr={club.abbr} size={28} /><span style={{ minWidth: 0 }}>The club<small>Use, distance, when</small></span></button>
        <button type="button" className={`ab-btn${kind === 'ump' ? ' on' : ''}`} onClick={() => setPick('ump')}>
          <span style={{ width: 28, height: 28, borderRadius: 999, background: C.soft, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>HP</span>
          <span style={{ minWidth: 0 }}>{ump ? ump.name : 'Plate umpire'}<small>{ump ? 'Behind the plate tonight' : 'Not posted yet'}</small></span>
        </button>
        <div className="ab-h">Who challenges</div>
        {people.length === 0 && <p style={{ ...note, margin: '0 2px' }}>No challenges logged.</p>}
        {people.slice(0, 14).map(c => (
          <button key={c.id} type="button" className={`ab-btn${pick === `p:${c.id}` ? ' on' : ''}`} onClick={() => setPick(`p:${c.id}`)}>
            <Headshot id={c.id} name={c.name} size={32} />
            <span style={{ minWidth: 0 }}>{c.name}<small>{roleOf(c)} · {c.n} · {fp(pc(c.ov, c.n))}</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {kind === 'club' && <TeamMark id={club.id} abbr={club.abbr} size={44} />}
          {kind === 'player' && <Headshot id={pid} name={player?.name ?? ''} size={52} />}
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{kind === 'ump' ? (ump?.name ?? 'Plate umpire') : kind === 'player' ? (player?.name ?? 'Player') : club.name}</h2>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{kind === 'ump' ? 'Home plate umpire' : kind === 'player' ? `${club.abbr} · ${player ? roleOf(player).toLowerCase() : ''}` : 'ABS challenges'}</span>
        </div>

        {kind === 'club' && <Pills items={VIEWS} value={view} onChange={setView} />}
        {kind === 'club' && desk && desk.uncountedGames > 0 && <p style={{ ...note, margin: 0 }}>The challenge log runs through {shortDate(desk.coveredThrough)}; {desk.uncountedGames} newer game{desk.uncountedGames === 1 ? '' : 's'} not counted yet.</p>}
        {kind === 'club' && !desk && view !== 'teams' && <p style={{ fontSize: 14, color: C.mute }}>No ABS challenge log is available for {club.abbr} yet.</p>}

        {/* ── club: how they use it ── */}
        {kind === 'club' && desk && view === 'use' && (
          <div className="ab-tiles">
            <div style={tile}>
              <div style={kick}>Challenges a game</div>
              <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{f2(rate(desk.season))}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>League {f2(lgRate)} · {desk.rank.rate}{ord(desk.rank.rate)} most of {desk.rank.of}</p>
              <p style={note}>{desk.season.all.n} in {desk.season.games} games. Last {desk.recent.games}: {f2(rate(desk.recent))} a game ({desk.recent.all.n}).</p>
            </div>
            <div style={tile}>
              <div style={kick}>Overturned</div>
              <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fp(pc(desk.season.all.ov, desk.season.all.n))}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>League {fp(lgOv)}{desk.rank.overturn ? ` · ${desk.rank.overturn}${ord(desk.rank.overturn)} best of ${desk.rank.of}` : ''}</p>
              <p style={note}>{desk.season.all.ov} of {desk.season.all.n}.{desk.season.all.n < MIN_RANK_CHALLENGES ? <> {star} Under {MIN_RANK_CHALLENGES} challenges: not ranked.</> : ''} Last {desk.recent.games}: {fp(pc(desk.recent.all.ov, desk.recent.all.n))} ({desk.recent.all.n}).</p>
            </div>
            <div style={tile}>
              <div style={kick}>Who starts it</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {([['Season', desk.season], [`Last ${desk.recent.games}`, desk.recent], ['League', desk.league]] as [string, Bucket][]).map(([l, b]) => {
                  const tot = b.batter.n + b.catcher.n, bs = pc(b.batter.n, tot) ?? 0
                  return (
                    <div key={l} title={`n=${tot}`} style={{ opacity: tot < MIN_ABS_N ? 0.45 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span>{l}</span><span style={{ fontWeight: 600, color: C.mute }}>{Math.round(bs)}% batter · n={tot}</span></div>
                      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 3, gap: 2 }}><span style={{ width: `${bs}%`, background: C.orange }} /><span style={{ width: `${100 - bs}%`, background: '#6CABDD' }} /></div>
                    </div>
                  )
                })}
                <p style={{ ...note, margin: 0 }}>Orange = the batter challenged a called strike, blue = the catcher or pitcher challenged a called ball. Overturned: batters {fp(pc(desk.season.batter.ov, desk.season.batter.n))} ({desk.season.batter.n}), catchers {fp(pc(desk.season.catcher.ov, desk.season.catcher.n))} ({desk.season.catcher.n}).</p>
              </div>
            </div>
            <div className="ab-span2" style={tile}>
              <div style={kick}>Challenges a game · rolling 10 games</div>
              {rollC.values.length > 0 ? <LineChart labels={rollC.labels} series={[{ key: 'r', label: `${club.abbr} challenges / game`, color: CHART_BLUE, values: rollC.values }]} baseline={{ value: lgRate, label: 'League' }} format={v => v.toFixed(2)} height={170} ariaLabel={`${club.abbr} rolling challenges per game`} /> : <p style={note}>Fewer than 10 games logged.</p>}
            </div>
            <div style={tile}>
              <div style={kick}>What the numbers say</div>
              <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 800 }}>{desk.profile.label}</p>
              <ul style={{ margin: '6px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#3a352c', lineHeight: 1.45 }}>{desk.profile.lines.map(l => <li key={l}>{l}</li>)}</ul>
            </div>
            <div className="ab-span3" style={tile}>
              <div style={kick}>With tonight&apos;s plate umpire</div>
              {!ump ? <p style={note}>The plate umpire has not been posted yet.</p> : (
                <p style={{ margin: '8px 0 0', fontSize: 14, color: '#3a352c', lineHeight: 1.5 }}>
                  <b>{ump.name}</b> is behind the plate. {club.abbr} has {clubUnder.length} challenge{clubUnder.length === 1 ? '' : 's'} in games he has worked this season{clubUnder.length ? `, ${fp(pc(clubUnder.filter(p => p.ov).length, clubUnder.length))} overturned` : ''}. {uLine ? `In all games he has worked: ${f2(pc(uLine.challenges, uLine.games) != null ? uLine.challenges / uLine.games : null)} challenges a game, ${fp(pc(uLine.overturned, uLine.challenges))} overturned.` : ''}
                  {' '}<button type="button" onClick={() => setPick('ump')} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0 }}>His full page →</button>
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── club: how close ── */}
        {kind === 'club' && view === 'close' && (
          pts.length === 0 ? <p style={{ fontSize: 14, color: C.mute }}>No located challenges for {club.abbr} yet.</p> : (
            <div className="ab-tiles">
              <div style={tile}>
                <div style={kick}>The average challenge</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                  <Big k={`${club.abbr} · all challenges`} v={inchesText(mean(pts.map(p => p.d)) != null ? Math.round(mean(pts.map(p => p.d))! * 10) / 10 : null)} sub={`League ${inchesText(lg.avgD)} · ${pts.length} challenges`} />
                  <Big k="Overturned" v={inchesText(f(pts.filter(p => p.ov)))} sub={`League ${inchesText(lg.avgDOverturned)}`} />
                  <Big k="Upheld" v={inchesText(f(pts.filter(p => !p.ov)))} sub={`League ${inchesText(lg.avgDUpheld)}`} />
                </div>
                <p style={note}>Inches from the ball&apos;s centre to the zone edge. The system calls a strike when the ball touches the zone, so up to about 1.5 in off the edge is still a strike. A bigger number means the club challenges pitches that were farther out.</p>
              </div>
              <div className="ab-span2" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>How close, and how often it works</div>
                <Bands pts={pts} league={lg.bands} />
                <p style={note}>{star} marks fewer than {MIN_ABS_N} challenges. League column = the share overturned in that band across all clubs ({lg.n} challenges).</p>
              </div>
              <div className="ab-span3" style={tile}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={kick}>Where {club.abbr} challenges</div>
                  <Pills items={[['all', 'All'], ['b', 'Batters'], ['f', 'Catcher / pitcher']] as ['all' | 'b' | 'f', string][]} value={who} onChange={setWho} />
                  <span style={{ fontSize: 12, color: C.mute }}>{shown.length} challenges</span>
                </div>
                <ZoneMap pts={shown} />
              </div>
            </div>
          )
        )}

        {/* ── club: when ── */}
        {kind === 'club' && desk && view === 'when' && (
          <div className="ab-tiles">
            <div style={tile}>
              <div style={kick}>By inning</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {desk.innings.club.byInning.map((t, i) => {
                  const mx = Math.max(1, ...desk.innings.club.byInning.map(x => x.n))
                  return <Bar key={i} label={i === 8 ? '9th+' : `${i + 1}${ord(i + 1)}`} value={t.n} max={mx} n={t.n} text={`${t.n} · ${fp(pc(t.ok, t.n))} overturned`} />
                })}
              </div>
              <p style={note}>{pc(desk.season.late.n, desk.season.all.n) != null ? `${fp(pc(desk.season.late.n, desk.season.all.n))} of the club's challenges come in the 7th or later (league ${fp(pc(desk.league.late.n, desk.league.all.n))}).` : ''} Inning stands in for late-game spots; leverage is not published for challenges.</p>
            </div>
            {!desk.situations ? (
              <div className="ab-span2" style={tile}><div style={kick}>Counts, outs, runners, score</div><p style={note}>The count and situation columns are not loaded yet.</p></div>
            ) : (
              <>
                <div className="ab-span2" style={tile}>
                  <div style={kick}>By count before the pitch</div>
                  <CountGrid club={desk.situations.club} league={desk.situations.league} />
                </div>
                <div style={tile}>
                  <div style={kick}>By outs</div>
                  <Tab rows={desk.situations.club.byOuts.map((t, i) => ({ label: `${i} out${i === 1 ? '' : 's'}`, t, league: desk.situations!.league.byOuts[i] }))} />
                </div>
                <div style={tile}>
                  <div style={kick}>By runners at the start of the at-bat</div>
                  <Tab rows={[['empty', 'Bases empty'], ['on', 'Runner(s) on, none scoring'], ['risp', 'Runner in scoring position']].map(([k, l]) => ({ label: l, t: desk.situations!.club.byKind[k] ?? { n: 0, ok: 0 }, league: desk.situations!.league.byKind[k] }))} />
                </div>
                <div style={tile}>
                  <div style={kick}>By score</div>
                  <Tab rows={([['trail3', 'Trailing by 3+'], ['trail12', 'Trailing by 1–2'], ['tied', 'Tied'], ['lead12', 'Leading by 1–2'], ['lead3', 'Leading by 3+']] as const).map(([k, l]) => ({ label: l, t: desk.situations!.club.byMargin[k], league: desk.situations!.league.byMargin[k] }))} />
                </div>
              </>
            )}
            {desk.situations && <p className="ab-span3" style={{ ...note, margin: 0 }}>Count = the count before the challenged pitch. Score is from the challenging club&apos;s side. Covers {desk.situations.coverage.withSituation} of {desk.situations.coverage.total} logged challenges. {star} marks fewer than 8.</p>}
          </div>
        )}

        {/* ── club: teams ── */}
        {kind === 'club' && view === 'teams' && (
          <div style={tile}>
            <div style={kick}>Every club · this season</div>
            {desk ? <div style={{ marginTop: 8 }}><Leaderboard rows={desk.leaderboard} highlight={[away.id, home.id]} minRank={MIN_RANK_CHALLENGES} /></div> : <p style={note}>No leaderboard yet.</p>}
            <p style={note}>Click a column to sort; tonight&apos;s two clubs are highlighted. Rates for clubs under {MIN_RANK_CHALLENGES} challenges are faded. Games through {desk ? shortDate(desk.coveredThrough) : ''}.</p>
          </div>
        )}

        {/* ── the plate umpire ── */}
        {kind === 'ump' && (
          !ump || !uLine ? <div style={tile}><p style={note}>The plate umpire for this game has not been posted yet. It usually appears on the day of the game.</p></div> : (
            <div className="ab-tiles">
              <div style={tile}>
                <div style={kick}>His games · league wide</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginTop: 12 }}>
                  <Big k="Games" v={String(uLine.games)} />
                  <Big k="Challenges" v={String(uLine.challenges)} />
                  <Big k="A game" v={f2(uLine.games ? uLine.challenges / uLine.games : null)} sub={`League ${f2(lgGame(lab))}`} />
                  <Big k="Overturned" v={fp(pc(uLine.overturned, uLine.challenges))} sub={`League ${fp(pc(lg.ov, lg.n))}`} />
                </div>
                <p style={note}>{uLine.games < MIN_UMP_GAMES && <>{star} Under {MIN_UMP_GAMES} games behind the plate: a small sample. </>}Every challenge in the games he has worked, whichever club made it. It says what happened in his games, not that he caused it.</p>
              </div>
              <div style={tile}>
                <div style={kick}>How close, in his games</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                  <Big k="The average challenge" v={inchesText(uLine.avgD)} sub={`League ${inchesText(lg.avgD)}`} />
                  <Big k="Started by the batter" v={fp(uLine.batterShare)} sub={`League ${fp(pc(lab.league.n ? Object.values(lab.clubs).reduce((a, c) => a + c.points.filter(p => p.side === 'b').length, 0) : 0, Object.values(lab.clubs).reduce((a, c) => a + c.points.length, 0)))} (these two clubs)`} />
                </div>
              </div>
              <div style={tile}>
                <div style={kick}>Tonight&apos;s clubs in his games</div>
                <table className="ab-tbl" style={{ marginTop: 6 }}>
                  <thead><tr><th></th><th>Challenges</th><th>Overturned</th></tr></thead>
                  <tbody>{([away, home] as ClubInfo[]).map((c, i) => { const ps = (i === 0 ? lab.clubs.away : lab.clubs.home).points.filter(p => p.ump === ump.id); return <tr key={c.id}><td style={{ fontWeight: 800 }}>{c.abbr}</td><td>{ps.length}</td><td>{ps.length ? fp(pc(ps.filter(p => p.ov).length, ps.length)) : '—'}</td></tr> })}</tbody>
                </table>
                <p style={note}>Only the challenges these two clubs made in games he has worked this season.</p>
              </div>
              <div className="ab-span2" style={tile}>
                <div style={kick}>Where the challenged pitches were in his games</div>
                <ZoneMap pts={lab.tonight.points} />
              </div>
              <div style={{ ...tile, maxHeight: 520, overflowY: 'auto' }}>
                <div style={kick}>Every plate umpire</div>
                <table className="ab-tbl" style={{ marginTop: 6 }}>
                  <thead><tr><th>Umpire</th><th>G</th><th>A game</th><th>Overt.</th></tr></thead>
                  <tbody>{lab.umpires.map((u: UmpLine) => <tr key={u.id} style={u.id === ump.id ? { outline: `2px solid ${C.orange}`, background: '#fff1ea' } : undefined}><td style={{ fontWeight: 800 }}>{u.name}</td><td>{u.games}</td><td>{f2(u.challenges / u.games)}</td><td>{fp(pc(u.overturned, u.challenges))}</td></tr>)}</tbody>
                </table>
                <p style={note}>Umpires with {MIN_UMP_GAMES}+ games behind the plate this season, sorted by challenges a game.</p>
              </div>
            </div>
          )
        )}

        {/* ── a player ── */}
        {kind === 'player' && (
          mine.length === 0 ? <div style={tile}><p style={note}>No located challenges for {player?.name ?? 'this player'} yet.</p></div> : (
            <div className="ab-tiles">
              <div style={tile}>
                <div style={kick}>His challenges</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginTop: 12 }}>
                  <Big k="Challenges" v={String(mine.length)} />
                  <Big k="Overturned" v={fp(pc(mine.filter(p => p.ov).length, mine.length))} sub={`${mine.filter(p => p.ov).length} of ${mine.length}`} />
                  <Big k="Average" v={inchesText(f(mine) != null ? f(mine) : null)} sub={`League ${inchesText(lg.avgD)}`} />
                  <Big k="Overturned avg" v={inchesText(f(mine.filter(p => p.ov)))} />
                </div>
                <p style={note}>{mine.length < MIN_ABS_N && <>{star} Under {MIN_ABS_N} challenges: too few to read a rate. </>}{mine.some(p => p.side === 'f') ? 'As catcher or pitcher he challenges called balls for his club. ' : ''}{mine.some(p => p.side === 'b') ? 'As a batter he challenges called strikes against him.' : ''}</p>
              </div>
              <div className="ab-span2" style={tile}>
                <div style={kick}>Where he challenges</div>
                <ZoneMap pts={mine} />
              </div>
              <div style={tile}>
                <div style={kick}>By count</div>
                <Tab rows={Object.entries(mine.reduce<Record<string, Tally>>((acc, p) => { const k = p.c || 'unknown'; (acc[k] ??= { n: 0, ok: 0 }).n += 1; if (p.ov) acc[k].ok += 1; return acc }, {})).sort((a, b) => b[1].n - a[1].n).map(([c, t]) => ({ label: c === 'unknown' ? 'Count not logged' : c, t }))} />
              </div>
              <div style={tile}>
                <div style={kick}>By inning</div>
                <Tab rows={[...new Set(mine.map(p => Math.min(9, p.inn)))].sort((a, b) => a - b).map(i => { const ps = mine.filter(p => Math.min(9, p.inn) === i); return { label: i === 9 ? '9th+' : `${i}${ord(i)}`, t: { n: ps.length, ok: ps.filter(p => p.ov).length } } })} />
              </div>
              <div style={tile}>
                <div style={kick}>By pitch type</div>
                <Tab rows={[...new Set(mine.map(p => p.pt || '—'))].map(t => { const ps = mine.filter(p => (p.pt || '—') === t); return { label: t, t: { n: ps.length, ok: ps.filter(p => p.ov).length } } }).sort((a, b) => b.t.n - a.t.n)} />
              </div>
            </div>
          )
        )}

        <p style={{ ...note, margin: 0 }}>Source: MLB&apos;s game feed, one row per challenge, with the plate umpire from the MLB schedule. Rates are per game played, so games with no challenges count. This describes how each club has used its challenges; it is not a prediction.</p>
      </div>
    </div>
  )

  function f(ps: AbsPoint[]): number | null {
    const m = mean(ps.map(p => p.d))
    return m == null ? null : Math.round(m * 10) / 10
  }
}

/** League challenges per game across the umpires listed (a reference line for the umpire page). */
function lgGame(lab: AbsLab): number | null {
  const g = lab.umpires.reduce((a, u) => a + u.games, 0), n = lab.umpires.reduce((a, u) => a + u.challenges, 0)
  return g > 0 ? n / g : null
}
