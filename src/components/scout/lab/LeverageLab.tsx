'use client'

// src/components/scout/lab/LeverageLab.tsx
//
// Scout Report → Leverage, in the lab layout. A selector down the left (club pills, then the club picture, the lineup hitters and the relievers); the choice
// opens in tiles. The club has four views:
//   Late & close      OPS by situation next to the season, opponents' OPS against, one-run and extra-inning records
//   Late innings      runs scored and allowed from the 7th on (season and against tonight's opponent), who pitches there
//   Late tendencies   how much of the club's ABS challenging and stealing comes late, and in late-and-close games, save conversion
//   Lineup & pen      every hitter and every arm across the situations in one grid
// A hitter or an arm opens straight to his own situational lines (and, for an arm, his marks and his late-inning log).
// Situations: late & close (7th+, tied, ahead by one or the tying run on deck), runners in scoring position, RISP with two outs, 7th inning or later.
// The score and leverage when a reliever enters are not published, so saves, holds and blown saves stand in for the close, late spots.
// Everything is a count of what has happened. Nothing here is a prediction.

import Link from 'next/link'
import { useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { Leverage } from '@/lib/scout/leverage'
import type { LateArm, LateInnings, Scoring as ScoringLine } from '@/lib/scout/late-innings'
import type { PlayerSits, SitCode, SitLine } from '@/lib/scout/leverage-players'
import { BLUE, NEUTRAL, Pills, RED, kick, mix, note, star, tile } from '@/components/pitching-lab/LocationExplorer'

export type ClubLeverage = {
  club: { id: number; abbr: string; name: string }
  oppAbbr: string
  lv: Leverage | null
  late: LateInnings | null
  hitters: { id: number; name: string; order: number; pos: string }[]
  lineupSource: string
  hitSits: Record<number, PlayerSits>
  penSits: Record<number, PlayerSits>
}

type View = 'close' | 'late' | 'tend' | 'grid'
const VIEWS: [View, string][] = [['close', 'Late & close'], ['late', 'Late innings'], ['tend', 'Late tendencies'], ['grid', 'Lineup & pen']]
const SITS: [SitCode, string, string][] = [
  ['lc', 'Late & close', '7th inning or later, tied, ahead by one or the tying run on deck'],
  ['risp', 'Runners in scoring position', 'Runner on second or third'],
  ['risp2', 'RISP, two outs', 'Runner on second or third with two outs'],
  ['ig07', '7th inning or later', 'Any score'],
]
const SRC: Record<string, string> = { confirmed: 'confirmed lineup', projected_from_previous_game: 'taken from the last game', unavailable: 'not available' }
const RELATION: Record<string, string> = {
  division: 'Division rivals meet about 13 times a year, the biggest head-to-head sample there is.',
  league: 'Same league, different division: about 6 to 7 meetings a year, a modest sample.',
  interleague: 'Opposite league: usually 3 to 4 meetings a year, so the head-to-head is thin.',
}
const LATE = ['7th', '8th', '9th', 'Extras']
const ops = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0)}%`)
const ipOf = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`
const last = (n: string) => n.split(' ').slice(-1)[0]
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const thin = (l: { pa: number }) => l.pa < MIN_SAMPLE.splitPA

/** Colour of a cell: red where OPS is above the player's season (the hitter does damage), blue where it is below. Thin samples stay neutral. */
function heat(l: SitLine, season: SitLine): string | undefined {
  if (thin(l) || l.ops == null || season.ops == null) return undefined
  const d = Math.max(-1, Math.min(1, (l.ops - season.ops) / 0.25))
  return d >= 0 ? mix(NEUTRAL, RED, d) : mix(NEUTRAL, BLUE, -d)
}

/** OPS by situation as bars, the season as the first, grey bar; the arrow is the gap to the season. */
type Line = { pa: number; ops: number | null; hr?: number; k?: number; bb?: number }
function SitBars({ season, rows, caption }: { season: Line; rows: [string, string, Line][]; caption: string }) {
  const all: [string, string, Line][] = [['season', 'Season', season], ...rows]
  const max = Math.max(0.5, ...all.map(r => r[2].ops ?? 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
      {all.map(([k, label, l]) => {
        const d = l.ops != null && season.ops != null && k !== 'season' ? l.ops - season.ops : null
        return (
          <div key={k} title={`${l.pa} ${caption}${l.hr != null ? ` · ${l.hr} HR · ${l.k} K · ${l.bb} BB` : ''}`} style={{ opacity: l.pa === 0 ? 0.4 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}>
              <span>{label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: C.mute }}>
                {ops(l.ops)} OPS{d != null && <span style={{ color: d >= 0 ? '#D4533B' : '#4a8fc4', fontWeight: 800 }}> {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(3).replace(/^0\./, '.')}</span>} · {l.pa} {caption}{k !== 'season' && l.pa > 0 && thin(l) && star}
              </span>
            </div>
            <div style={{ height: 11, background: C.soft, borderRadius: 6, overflow: 'hidden', marginTop: 3 }}>
              <div style={{ height: '100%', width: `${l.ops != null ? (l.ops / max) * 100 : 0}%`, background: k === 'season' ? '#a89e8c' : d != null && d < 0 ? '#6CABDD' : C.orange }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
const sitRows = (s: PlayerSits): [string, string, SitLine][] => SITS.map(([c, l]) => [c, l, s[c]])

function RunsByInning({ title, s, max, empty }: { title: string; s: ScoringLine; max: number; empty: string }) {
  const per = (n: number) => (s.games > 0 ? n / s.games : 0)
  return (
    <div style={tile}>
      <div style={kick}>{title}</div>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: '#5b5347' }}>{s.games} game{s.games === 1 ? '' : 's'}{s.games > 0 ? ` · ${s.w}–${s.l}` : ''}</p>
      {s.games === 0 ? <p style={note}>{empty}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
          {LATE.map((l, i) => (
            <div key={l} title={`${s.scored[i]} runs scored, ${s.allowed[i]} allowed in ${s.games} games`} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 62px', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 800 }}>{l}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ height: 8, background: C.soft, borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.max(1, (per(s.scored[i]) / max) * 100)}%`, background: C.orange }} /></span>
                <span style={{ height: 8, background: C.soft, borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.max(1, (per(s.allowed[i]) / max) * 100)}%`, background: '#6CABDD' }} /></span>
              </span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.mute }}>{s.scored[i]} – {s.allowed[i]}</span>
            </div>
          ))}
          <p style={{ ...note, marginTop: 2 }}>Orange = runs scored per game, blue = runs allowed per game; the label is scored – allowed in total.</p>
        </div>
      )}
    </div>
  )
}

function InningCells({ a }: { a: LateArm }) {
  return <>{a.inn.map((n, i) => {
    const f = a.apps > 0 ? n / a.apps : 0
    return <td key={i}><span title={`${n} of ${a.apps} appearances included the ${LATE[i].toLowerCase()}`} style={{ display: 'inline-block', minWidth: 26, borderRadius: 5, padding: '2px 0', fontWeight: 800, background: n > 0 ? mix([253, 246, 236], [255, 138, 92], f) : C.soft, color: f > 0.6 ? '#fff' : C.ink }}>{n || ''}</span></td>
  })}</>
}

function Share({ label, club, league, n, abbr }: { label: string; club: number | null; league: number | null; n: number; abbr: string }) {
  return (
    <div title={`${n} in all`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}>
        <span>{label}</span><span style={{ fontWeight: 600, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{abbr} {pct(club)} · league {pct(league)} · n={n}{n < MIN_SAMPLE.teamGames && star}</span>
      </div>
      <div style={{ position: 'relative', height: 11, background: C.soft, borderRadius: 6, overflow: 'hidden', marginTop: 3 }}>
        <div style={{ height: '100%', width: `${club ?? 0}%`, background: C.orange }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: C.ink, left: `${league ?? 0}%` }} />
      </div>
    </div>
  )
}

export default function LeverageLab({ clubs }: { clubs: { away: ClubLeverage; home: ClubLeverage } }) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [pick, setPick] = useState<string>('club')
  const [view, setView] = useState<View>('close')
  const k = clubs[side]
  const lv = k.lv, li = k.late
  const arms = lv?.arms ?? []
  const kind = pick.startsWith('h:') ? 'hitter' : pick.startsWith('p:') ? 'arm' : 'club'
  const pid = kind === 'club' ? 0 : Number(pick.slice(2))
  const hitter = kind === 'hitter' ? k.hitters.find(h => h.id === pid) : undefined
  const armRow = kind === 'arm' ? arms.find(a => a.arm.id === pid) : undefined
  const abbr = k.club.abbr
  const rec = (x: { w: number; l: number } | null | undefined) => (x ? `${x.w}–${x.l}` : '—')
  const scoreMax = li ? Math.max(0.05, ...[li.season, li.vsOpp].flatMap(s => (s.games > 0 ? [...s.scored, ...s.allowed].map(n => n / s.games) : [0]))) : 1
  const conv = lv && lv.saves.sv + lv.saves.bs > 0 ? (lv.saves.sv / (lv.saves.sv + lv.saves.bs)) * 100 : null

  return (
    <div className="lv-grid">
      <style>{`.lv-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start}.lv-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.lv-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.lv-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.lv-btn.on{border-color:#FF5722;background:#fff1ea}.lv-h{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a89e8c;margin:8px 2px 0}.lv-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.lv-span2{grid-column:span 2}.lv-span3{grid-column:1 / -1}.lv-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.lv-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.lv-tbl th:first-child,.lv-tbl td:first-child{text-align:left}.lv-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.lv-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.lv-grid{grid-template-columns:minmax(0,1fr)}.lv-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.lv-h{display:none}.lv-btn{width:auto;white-space:nowrap}.lv-tiles{grid-template-columns:minmax(0,1fr)}.lv-span2{grid-column:auto}}`}</style>

      <nav className="lv-side" aria-label="Leverage subjects">
        <Pills items={[['away', clubs.away.club.abbr], ['home', clubs.home.club.abbr]] as ['away' | 'home', string][]} value={side} onChange={v => { setSide(v); setPick('club') }} />
        <button type="button" className={`lv-btn${kind === 'club' ? ' on' : ''}`} onClick={() => setPick('club')}>
          <TeamMark id={k.club.id} abbr={abbr} size={28} /><span style={{ minWidth: 0 }}>The club<small>Late and close, late innings</small></span>
        </button>
        <div className="lv-h">Lineup</div>
        {k.hitters.length === 0 && <p style={{ ...note, margin: '0 2px' }}>No lineup is available yet.</p>}
        {k.hitters.map(h => {
          const s = k.hitSits[h.id]
          return (
            <button key={h.id} type="button" className={`lv-btn${pick === `h:${h.id}` ? ' on' : ''}`} onClick={() => setPick(`h:${h.id}`)}>
              <Headshot id={h.id} name={h.name} size={32} />
              <span style={{ minWidth: 0 }}>{h.order}. {h.name}<small>{h.pos}{s ? ` · late & close ${ops(s.lc.ops)} (${s.lc.pa} PA)` : ''}</small></span>
            </button>
          )
        })}
        <div className="lv-h">Bullpen</div>
        {arms.length === 0 && <p style={{ ...note, margin: '0 2px' }}>No bullpen log yet.</p>}
        {arms.map(({ arm, u }) => (
          <button key={arm.id} type="button" className={`lv-btn${pick === `p:${arm.id}` ? ' on' : ''}`} onClick={() => setPick(`p:${arm.id}`)}>
            <Headshot id={arm.id} name={arm.name} size={32} />
            <span style={{ minWidth: 0 }}>{arm.name}<small>{arm.role} · {u.save} SV · {u.hold} HLD · {u.bs} BS</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {kind === 'club' && <TeamMark id={k.club.id} abbr={abbr} size={44} />}
          {hitter && <Headshot id={hitter.id} name={hitter.name} size={52} />}
          {armRow && <Headshot id={armRow.arm.id} name={armRow.arm.name} size={52} />}
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{hitter?.name ?? armRow?.arm.name ?? k.club.name}</h2>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{hitter ? `${abbr} · batting ${hitter.order}${hitter.pos ? ` · ${hitter.pos}` : ''}` : armRow ? `${abbr} · ${armRow.arm.role}` : `Late and close, against ${k.oppAbbr}`}</span>
          {(hitter || armRow) && <Link href={hitter ? `/mlb/lab/batting-lab/${hitter.id}` : `/mlb/lab/pitching-lab/${armRow!.arm.id}/arsenal`} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: C.orange, textDecoration: 'none' }}>{hitter ? 'Batting Lab' : 'Pitching Lab'} →</Link>}
        </div>

        {kind === 'club' && <Pills items={VIEWS} value={view} onChange={setView} />}

        {kind === 'club' && !lv && view !== 'late' && <p style={{ fontSize: 14, color: C.mute }}>Leverage data is unavailable for {abbr} right now.</p>}

        {/* ── club: late & close ── */}
        {kind === 'club' && lv && view === 'close' && (
          <div className="lv-tiles">
            <div style={tile}>
              <div style={kick}>Records</div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                {[['One-run games', rec(lv.records.oneRun)], ['Extra innings', rec(lv.records.extra)]].map(([a, b]) => <div key={a}><dt style={dt}>{a}</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{b}</dd></div>)}
              </dl>
              <p style={note}>Regular-season record in those games.</p>
            </div>
            <div className="lv-span2" style={tile}>
              <div style={kick}>{abbr} offense · OPS by situation</div>
              <SitBars season={lv.offense.season} rows={[['lc', SITS[0][1], lv.offense.lc], ['risp', SITS[1][1], lv.offense.risp], ['risp2', SITS[2][1], lv.offense.risp2], ['ig07', SITS[3][1], lv.offense.late]]} caption="PA" />
              <p style={note}>{star} marks fewer than {MIN_SAMPLE.splitPA} plate appearances. The arrow is the gap to the club&apos;s own season OPS: red when it is higher, blue when lower.</p>
            </div>
            <div className="lv-span3" style={tile}>
              <div style={kick}>Opponents against {abbr} pitching · OPS against</div>
              <SitBars season={lv.pitching.season} rows={[['lc', SITS[0][1], lv.pitching.lc], ['ig07', SITS[3][1], lv.pitching.late]]} caption="PA" />
              <p style={note}>Red means opponents hit better than their season line against this staff, blue means worse. Only late and close and the 7th on are published for the pitching side.</p>
            </div>
          </div>
        )}

        {/* ── club: late innings ── */}
        {kind === 'club' && view === 'late' && (
          !li ? <p style={{ fontSize: 14, color: C.mute }}>Late-inning data is unavailable for {abbr} right now.</p> : (
            <div className="lv-tiles">
              <RunsByInning title={`${abbr} runs by inning · all season`} s={li.season} max={scoreMax} empty="No games yet." />
              <RunsByInning title={`${abbr} runs by inning · vs ${k.oppAbbr}`} s={li.vsOpp} max={scoreMax} empty="The clubs have not met this season yet." />
              <div style={tile}>
                <div style={kick}>The head to head</div>
                <p style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 800 }}>{li.vsOpp.games}<span style={{ fontSize: 15, color: C.mute, fontWeight: 600 }}> meeting{li.vsOpp.games === 1 ? '' : 's'}</span></p>
                <p style={{ margin: 0, fontSize: 13, color: '#5b5347', lineHeight: 1.5 }}>{RELATION[li.relation]}</p>
                {li.vsOpp.games < 5 && <p style={note}>{star} Under 5 meetings: colour, not a trend.</p>}
              </div>
              <div className="lv-span3" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>Who pitches from the 7th on · {abbr} bullpen, all season</div>
                {!li.arms ? <p style={note}>The late-inning reliever log is not loaded yet.</p> : (
                  <>
                    <table className="lv-tbl" style={{ marginTop: 6, minWidth: 520 }}>
                      <thead><tr><th>Arm</th>{LATE.map(l => <th key={l}>{l.replace('Extras', 'Ext')}</th>)}<th>Apps</th><th title="Came in with his club ahead by 1 to 3 runs">Lead</th><th>Tied</th><th>Behind</th><th>IP</th><th title="Runs while on the mound per 9 innings, 7th on">R/9</th></tr></thead>
                      <tbody>
                        {li.arms.map(a => (
                          <tr key={a.id}>
                            <td style={{ fontWeight: 800 }}>{last(a.name)}</td><InningCells a={a} />
                            <td>{a.apps}</td><td>{a.lead}</td><td>{a.tied}</td><td>{a.behind}</td><td style={{ color: C.mute }}>{ipOf(a.outs)}</td>
                            <td>{a.outs > 0 ? ((a.runs * 27) / a.outs).toFixed(1) : '—'}{a.outs < 30 && a.outs > 0 && star}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={note}>Cells = appearances that included that inning. Lead, tied and behind = his club&apos;s margin when he first faced a batter from the 7th on. R/9 counts runs while he was on the mound, inherited runners included. {star} marks under 10 late innings.{li.loggedThrough ? ` Through ${li.loggedThrough.slice(5).replace('-', '/')}.` : ''}</p>
                  </>
                )}
              </div>
              <div className="lv-span3" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>{abbr} relievers against {k.oppAbbr} · 7th on</div>
                {!li.armsVsOpp ? <p style={note}>Not loaded yet.</p> : li.armsVsOpp.length === 0 ? <p style={note}>No {abbr} reliever has faced {k.oppAbbr} from the 7th on this season.</p> : (
                  <table className="lv-tbl" style={{ marginTop: 6, minWidth: 460 }}>
                    <thead><tr><th>Arm</th><th>G</th><th>IP</th><th>H</th><th>BB</th><th>K</th><th>R</th></tr></thead>
                    <tbody>{li.armsVsOpp.map(a => <tr key={a.id}><td style={{ fontWeight: 800 }}>{last(a.name)}</td><td>{a.apps}</td><td>{ipOf(a.outs)}{a.outs < 6 && star}</td><td>{a.hits}</td><td>{a.bb}</td><td>{a.k}</td><td>{a.runs}</td></tr>)}</tbody>
                  </table>
                )}
                <p style={note}>Only innings from the 7th on, in this season&apos;s games against {k.oppAbbr}. {star} marks under 2 innings.</p>
              </div>
            </div>
          )
        )}

        {/* ── club: tendencies ── */}
        {kind === 'club' && lv && view === 'tend' && (
          <div className="lv-tiles">
            <div className="lv-span2" style={tile}>
              <div style={kick}>How much of the club&apos;s activity comes in the 7th or later</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <Share label="ABS challenges" club={lv.aggression.absLateShare.club} league={lv.aggression.absLateShare.league} n={lv.aggression.absLateShare.n} abbr={abbr} />
                {lv.aggression.sbLate ? <Share label="Steal attempts" club={lv.aggression.sbLate.club} league={lv.aggression.sbLate.league} n={lv.aggression.sbLate.n} abbr={abbr} /> : <p style={note}>Steal timing is not loaded yet.</p>}
              </div>
              <p style={note}>Bar = the club, black tick = the league.</p>
            </div>
            <div style={tile}>
              <div style={kick}>Late and close · within one run</div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                <div><dt style={dt}>ABS challenges</dt><dd style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{lv.aggression.absLateClose ? lv.aggression.absLateClose.n : '—'}</dd><dd style={{ margin: 0, fontSize: 12, color: C.mute }}>{lv.aggression.absLateClose && lv.aggression.absLateClose.n > 0 ? `${pct((lv.aggression.absLateClose.ov / lv.aggression.absLateClose.n) * 100)} overturned` : ''}</dd></div>
                <div><dt style={dt}>Steal attempts</dt><dd style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{lv.aggression.sbLateClose ? lv.aggression.sbLateClose.n : '—'}</dd><dd style={{ margin: 0, fontSize: 12, color: C.mute }}>{lv.aggression.sbLateClose && lv.aggression.sbLateClose.n > 0 ? `${pct((lv.aggression.sbLateClose.ok / lv.aggression.sbLateClose.n) * 100)} safe` : ''}</dd></div>
              </dl>
              <p style={note}>Counts under {MIN_SAMPLE.teamGames} are too few to read a rate.</p>
            </div>
            <div className="lv-span3" style={tile}>
              <div style={kick}>Saves, holds and blown saves · today&apos;s {abbr} bullpen</div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                {[['Saves', lv.saves.sv], ['Holds', lv.saves.hold], ['Blown saves', lv.saves.bs], ['Save conversion', conv != null ? pct(conv) : '—']].map(([a, b]) => <div key={String(a)}><dt style={dt}>{a}</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{b}</dd></div>)}
              </dl>
              <p style={note}>The score and leverage when a reliever enters are not published, so saves, holds and blown saves stand in for entering with the tying or go-ahead run in play. Counts are for the arms on today&apos;s list.</p>
            </div>
          </div>
        )}

        {/* ── club: grid ── */}
        {kind === 'club' && view === 'grid' && (
          <div className="lv-tiles">
            <div className="lv-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>{abbr} lineup · OPS by situation</div>
              <p style={{ ...note, marginTop: 4 }}>Lineup: {SRC[k.lineupSource] ?? k.lineupSource}. Red = above his own season OPS, blue = below; unshaded cells have under {MIN_SAMPLE.splitPA} PA.</p>
              {k.hitters.length === 0 ? <p style={note}>No lineup is available yet.</p> : (
                <table className="lv-tbl" style={{ marginTop: 8, minWidth: 560 }}>
                  <thead><tr><th>Hitter</th><th>Season</th>{SITS.map(([c, l]) => <th key={c}>{l}</th>)}</tr></thead>
                  <tbody>
                    {k.hitters.map(h => {
                      const s = k.hitSits[h.id]
                      return (
                        <tr key={h.id}>
                          <td style={{ fontWeight: 800, cursor: 'pointer' }} onClick={() => setPick(`h:${h.id}`)}>{h.order}. {h.name}</td>
                          {s ? <><td>{ops(s.season.ops)}</td>{SITS.map(([c]) => <td key={c} title={`${s[c].pa} PA`} style={{ background: heat(s[c], s.season) }}>{s[c].pa ? ops(s[c].ops) : '—'}{s[c].pa > 0 && thin(s[c]) && star}</td>)}</> : <td colSpan={5} style={{ color: C.faint }}>No lines available</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="lv-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>{abbr} bullpen · OPS against by situation</div>
              <p style={{ ...note, marginTop: 4 }}>Red = hitters do better against him than his season line, blue = worse.</p>
              {arms.length === 0 ? <p style={note}>No bullpen log yet.</p> : (
                <table className="lv-tbl" style={{ marginTop: 8, minWidth: 640 }}>
                  <thead><tr><th>Arm</th><th>Season</th>{SITS.map(([c, l]) => <th key={c}>{l}</th>)}<th>SV</th><th>HLD</th><th>BS</th></tr></thead>
                  <tbody>
                    {arms.map(({ arm, u }) => {
                      const s = k.penSits[arm.id]
                      return (
                        <tr key={arm.id}>
                          <td style={{ fontWeight: 800, cursor: 'pointer' }} onClick={() => setPick(`p:${arm.id}`)}>{last(arm.name)}</td>
                          {s ? <><td>{ops(s.season.ops)}</td>{SITS.map(([c]) => <td key={c} title={`${s[c].pa} batters faced`} style={{ background: heat(s[c], s.season) }}>{s[c].pa ? ops(s[c].ops) : '—'}{s[c].pa > 0 && thin(s[c]) && star}</td>)}</> : <td colSpan={5} style={{ color: C.faint }}>No lines available</td>}
                          <td>{u.save}</td><td>{u.hold}</td><td>{u.bs}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <p style={note}>{star} marks fewer than {MIN_SAMPLE.splitPA} batters faced. Season splits, regular season only. These are past results; they say nothing about tonight.</p>
            </div>
          </div>
        )}

        {/* ── a hitter ── */}
        {hitter && (
          <div className="lv-tiles">
            {k.hitSits[hitter.id] ? (
              <>
                <div className="lv-span2" style={tile}>
                  <div style={kick}>OPS by situation</div>
                  <SitBars season={k.hitSits[hitter.id].season} rows={sitRows(k.hitSits[hitter.id])} caption="PA" />
                  <p style={note}>{star} marks fewer than {MIN_SAMPLE.splitPA} plate appearances. The arrow is the gap to his own season OPS: red when higher, blue when lower.</p>
                </div>
                <div style={tile}>
                  <div style={kick}>What happened</div>
                  <table className="lv-tbl" style={{ marginTop: 6 }}>
                    <thead><tr><th></th><th>AVG</th><th>HR</th><th>K</th><th>BB</th></tr></thead>
                    <tbody>
                      {SITS.map(([c, l]) => { const x = k.hitSits[hitter.id][c]; return <tr key={c}><td style={{ fontWeight: 800 }}>{l.replace('Runners in scoring position', 'RISP').replace('7th inning or later', '7th+')}</td><td>{ops(x.avg)}</td><td>{x.hr}</td><td>{x.k}</td><td>{x.bb}</td></tr> })}
                    </tbody>
                  </table>
                  <p style={note}>Late and close = {SITS[0][2]}.</p>
                </div>
              </>
            ) : <div className="lv-span3" style={tile}><p style={note}>No situational lines are available for {hitter.name} right now.</p></div>}
          </div>
        )}

        {/* ── an arm ── */}
        {armRow && (() => {
          const s = k.penSits[armRow.arm.id], u = armRow.u
          const la = li?.arms?.find(a => a.id === armRow.arm.id), lo = li?.armsVsOpp?.find(a => a.id === armRow.arm.id)
          return (
            <div className="lv-tiles">
              <div className="lv-span2" style={tile}>
                <div style={kick}>OPS against by situation</div>
                {s ? <SitBars season={s.season} rows={sitRows(s)} caption="BF" /> : <p style={note}>No situational lines are available right now.</p>}
                <p style={note}>{star} marks fewer than {MIN_SAMPLE.splitPA} batters faced. Red = hitters do better against him than his season line, blue = worse.</p>
              </div>
              <div style={tile}>
                <div style={kick}>Save, hold and finish marks</div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {([['Saves', u.save], ['Holds', u.hold], ['Blown saves', u.bs], ['Games finished', u.gf]] as [string, number][]).map(([a, b]) => <div key={a}><dt style={dt}>{a}</dt><dd style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{b}</dd></div>)}
                </dl>
                <p style={note}>Stand in for entering with the tying or go-ahead run in play.</p>
              </div>
              <div style={tile}>
                <div style={kick}>Runners he inherits</div>
                <p style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{u.inhR ? `${u.inhRS} of ${u.inhR}` : '—'}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#5b5347' }}>{u.inhR ? `${pct((u.inhRS / u.inhR) * 100)} of the runners on base when he came in scored.` : 'He has not inherited a runner this season.'}</p>
                {u.inhR > 0 && u.inhR < MIN_SAMPLE.h2hPA && <p style={note}>{star} Under {MIN_SAMPLE.h2hPA} inherited runners: a small sample.</p>}
              </div>
              <div className="lv-span2" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>His late innings · from the 7th on</div>
                {!la ? <p style={note}>{li?.arms ? `Fewer than 3 late appearances for ${armRow.arm.name} this season.` : 'The late-inning reliever log is not loaded yet.'}</p> : (
                  <table className="lv-tbl" style={{ marginTop: 6, minWidth: 440 }}>
                    <thead><tr>{LATE.map(l => <th key={l}>{l}</th>)}<th>Apps</th><th>Lead</th><th>Tied</th><th>Behind</th><th>IP</th><th>R/9</th></tr></thead>
                    <tbody><tr><InningCells a={la} /><td>{la.apps}</td><td>{la.lead}</td><td>{la.tied}</td><td>{la.behind}</td><td>{ipOf(la.outs)}</td><td>{la.outs > 0 ? ((la.runs * 27) / la.outs).toFixed(1) : '—'}{la.outs < 30 && la.outs > 0 && star}</td></tr></tbody>
                  </table>
                )}
                <p style={note}>Lead, tied and behind = his club&apos;s margin when he first faced a batter from the 7th on. {star} marks under 10 late innings.</p>
              </div>
              <div style={tile}>
                <div style={kick}>Against {k.oppAbbr} · 7th on</div>
                {lo ? (
                  <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    {([['G', lo.apps], ['IP', ipOf(lo.outs)], ['H', lo.hits], ['BB', lo.bb], ['K', lo.k], ['R', lo.runs]] as [string, string | number][]).map(([a, b]) => <div key={a}><dt style={dt}>{a}</dt><dd style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{b}</dd></div>)}
                  </dl>
                ) : <p style={note}>He has not pitched against {k.oppAbbr} from the 7th on this season.</p>}
              </div>
            </div>
          )
        })()}

        <p style={{ ...note, margin: 0 }}>Situational splits are regular season to date from the MLB Stats API; saves, holds and inherited runners come from each reliever&apos;s game log; challenge and steal timing from the game-by-game feed. Every figure shows its sample. This describes what has happened; it is not a prediction.</p>
      </div>
    </div>
  )
}
