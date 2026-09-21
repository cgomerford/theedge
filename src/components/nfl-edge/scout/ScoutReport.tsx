// src/components/nfl-edge/scout/ScoutReport.tsx
//
// NFL Scout Report: the operating brief. Cuts overlap with the Preview and adds the working detail.
//   Signup (free):  availability, form trends, snap intelligence, situational football, special teams, coach card (teaser)
//   Pro:            passing deep (NGS), run game, FTN pressure & motion, rest / home-road / day-night, matchup clashes,
//                   fantasy context, the full coach card
// `isPro` is a REQUIRED prop, never defaulted; Pro children are only built when it is true, and `pro` (the Pro data)
// is only fetched by the route for Pro viewers. Every chart states its sample (n) and empty states beat fake heat.
// Fantasy boards are CONTEXT ONLY: never start/sit language.

import Link from 'next/link'
import type { NflGame } from '@/lib/nfl-edge/games'
import { kickoffLabel, weekLabel } from '@/lib/nfl-edge/games'
import type { NflTeam } from '@/lib/nfl-edge/teams'
import type { FtnRates, Rates } from '@/lib/nfl-edge/form'
import type { GameSplit, NgsPassing, NgsReceiver, NgsRusher, SnapRow, UnitStatus } from '@/lib/nfl-edge/scout'
import ProPanel from '@/components/profile/ProPanel'
import { C, Card, Chip, CompareBar, DISCLAIMER, DISPLAY, Empty, Foot, fmtEpa, fmtPct, GameHero, InjuryDot, MONO, NflStyles, SANS, Section, TabStrip } from '../ui'
import { GroupedBars, TrendLines, type BarGroup } from './ScoutCharts'

export type TeamView = {
  team: NflTeam
  blended: Rates
  season: { r: Rates; games: number } | null
  l3: { r: Rates; games: number } | null
  l5: { r: Rates; games: number } | null
  usesPrior: boolean
  avail: { units: UnitStatus[]; total: number; reported: boolean }
  splits: GameSplit[]
  snaps: { offense: SnapRow[]; defense: SnapRow[]; games: number }
  kicking: { name: string; made: number; att: number; long: number; xpMade: number; xpAtt: number; games: number } | null
}

export type ProScoutData = {
  ngs: { passing: NgsPassing | null; receivers: NgsReceiver[]; rushers: NgsRusher[] }[]   // [away, home]
  ftnO: FtnRates[]; ftnD: FtnRates[]                                                          // [away, home], blended season
  clash: { label: string; away: { v: string; rank: number | null }; home: { v: string; rank: number | null }; note: string }[]
  venue: { label: string; away: string; home: string; awayN: number; homeN: number }[]
  usage: { team: string; name: string; pos: string; tgtShare: number | null; snap: number | null }[]
}

const NAV: [string, string][] = [['avail', 'Availability'], ['form', 'Form'], ['snaps', 'Snaps'], ['situ', 'Situational'], ['st', 'ST & officials'], ['coach', 'Coach card'], ['pro', 'Pro desk']]

function Lvl({ l }: { l: UnitStatus['level'] }) {
  const c = l === 'thin' ? '#D4533B' : l === 'watch' ? '#E8C22E' : '#1D9E75'
  return <span style={{ width: 10, height: 10, borderRadius: 999, background: c, display: 'inline-block' }} />
}

export default function ScoutReport({
  game, away, home, awayView, homeView, watch, isPro, pro,
}: {
  game: NflGame; away: NflTeam; home: NflTeam; awayView: TeamView; homeView: TeamView
  watch: string[]
  /** REQUIRED, never defaulted */
  isPro: boolean
  pro: ProScoutData | null
}) {
  const views = [awayView, homeView]
  const both = [away, home]
  const teamsC = both.map(t => ({ id: t.id, color: t.color }))

  // 3.2 hot-or-noise: is the last-3 EPA/play meaningfully different from the season, given the plays behind it?
  const hotNoise = (v: TeamView) => {
    const s = v.season?.r.offEpa, l = v.l3?.r.offEpa, n = v.l3?.r.plays ?? 0
    if (s == null || l == null || !v.l3 || v.l3.games < 3) return { text: 'Fewer than three games played, so no trend read yet.', tone: 'plain' as const, n }
    const d = l - s
    if (Math.abs(d) >= 0.08 && n >= 120) return { text: `${d > 0 ? 'Trending up' : 'Trending down'}: last 3 at ${fmtEpa(l)} vs season ${fmtEpa(s)} on ${Math.round(n)} plays.`, tone: d > 0 ? ('good' as const) : ('bad' as const), n }
    return { text: `Within normal noise: last 3 at ${fmtEpa(l)} vs season ${fmtEpa(s)} on ${Math.round(n)} plays.`, tone: 'plain' as const, n }
  }

  const line = (pick: (s: GameSplit) => number | null) =>
    views.map((v, i) => ({ name: both[i].id, color: both[i].color, points: v.splits.map(s => ({ week: s.week, v: pick(s) })) })).filter(s => s.points.length)

  const down = (o: boolean): BarGroup[] =>
    (['1st', '2nd', '3rd'] as const).map((l, i) => ({ label: `${l} down`, ...Object.fromEntries(views.map((v, k) => [both[k].id, [o ? v.blended.d1EpaO : v.blended.d1EpaD, o ? v.blended.d2EpaO : v.blended.d2EpaD, o ? v.blended.d3EpaO : v.blended.d3EpaD][i]])) }))

  const formRow = (label: string, pick: (r: Rates) => number | null, fmt: (v: number | null) => string) => (
    <tr key={label}>
      <td style={{ padding: '6px 4px', color: '#5b5347', fontSize: 12 }}>{label}</td>
      {views.flatMap(v => [v.l3?.r, v.l5?.r, v.season?.r].map((r, i) => <td key={v.team.id + i} style={{ padding: '6px 4px', textAlign: 'right', fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{r ? fmt(pick(r)) : '—'}</td>))}
    </tr>
  )

  return (
    <div className="tp-root" style={{ background: C.cream, fontFamily: SANS }}>
      <NflStyles />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 14 }}><Link href="/nfl" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: C.orange, textDecoration: 'none' }}>← NFL slate</Link></div>
        <GameHero game={game} home={home} away={away} kicker={`Scout Report · ${weekLabel(game)} · ${kickoffLabel(game.kickoff)}`} />
        <TabStrip game={game} active="scout" />
        <nav className="tp-nav" aria-label="Scout sections" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(250,248,243,.95)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${C.line}`, margin: '16px -24px 0', padding: '10px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {NAV.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}
        </nav>

        {/* 3.1 availability */}
        <Section id="avail" num="01" title="Availability desk" sub="Everyone on this week's report, grouped by unit. An arrow shows who is next up at the position when a starter is Out or Doubtful.">
          <div className="tp-grid-2">
            {views.map(v => (
              <Card key={v.team.id} title={v.team.nick} note={v.avail.reported ? `${v.avail.total} on the report` : 'report not published yet'}>
                {v.avail.reported ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {v.avail.units.map(u => (
                      <div key={u.unit} style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 8, alignItems: 'start', padding: '6px 0', borderTop: `1px solid ${C.soft}` }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}><Lvl l={u.level} />{u.unit}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {u.rows.length ? u.rows.map(r => (
                            <span key={r.playerId} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <InjuryDot status={r.status} practice={r.practice} /> <b>{r.name}</b>
                              <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{r.pos ?? ''}{r.isStarter ? ' · starter' : ''} · {r.status ?? (r.practice ?? '').replace(' in Practice', '')}{r.injury ? ` · ${r.injury}` : ''}</span>
                              {r.riser && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.orange }}>↑ {r.riser}</span>}
                            </span>
                          )) : <span style={{ fontSize: 12, color: C.faint }}>No one listed</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <Empty>The injury report has not been published for this week yet (usually Wednesday).</Empty>}
              </Card>
            ))}
          </div>
          <Foot>Green = no starter Out or Doubtful · yellow = one starter out or a starter Questionable · red = two or more starters out. Only the latest status per player is stored, so day-by-day practice progression is not shown. Source: nflverse injuries.</Foot>
        </Section>

        {/* 3.2 form */}
        <Section id="form" num="02" title="Form vs skill trends" sub="Expected points added per play, game by game, with last-3 / last-5 / season windows and the number of plays behind each.">
          <div className="tp-grid-2">
            <Card title="Offense" note="EPA per play by game"><TrendLines series={line(s => s.r.offEpa)} /></Card>
            <Card title="Defense" note="EPA allowed per play by game (lower is better)"><TrendLines series={line(s => s.r.defEpa)} /></Card>
          </div>
          <div style={{ marginTop: 16 }} className="tp-grid-2">
            {views.map(v => {
              const hn = hotNoise(v)
              return (
                <Card key={v.team.id} title={`${v.team.nick} · hot or noise?`}>
                  <Chip tone={hn.tone}>{hn.text}</Chip>
                </Card>
              )
            })}
          </div>
          <Card style={{ marginTop: 16 }} title="Windows" note="Last 3 · last 5 · season, per club">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, textTransform: 'uppercase' }}>
                    <th />{views.map(v => <th key={v.team.id} colSpan={3} style={{ padding: '4px', textAlign: 'center', borderBottom: `2px solid ${v.team.color}` }}>{v.team.id}</th>)}
                  </tr>
                  <tr style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}><th />{views.flatMap(v => ['L3', 'L5', 'Season'].map(w => <th key={v.team.id + w} style={{ padding: '4px', textAlign: 'right', fontWeight: 400 }}>{w}</th>))}</tr>
                </thead>
                <tbody>
                  {formRow('Offense EPA / play', r => r.offEpa, fmtEpa)}
                  {formRow('Defense EPA allowed', r => r.defEpa, fmtEpa)}
                  {formRow('Success rate (off)', r => r.successO, v => fmtPct(v, 0))}
                  {formRow('Explosive rate (off)', r => r.explosiveO, v => fmtPct(v, 1))}
                  {formRow('Stuff rate (rush off)', r => r.stuffO, v => fmtPct(v, 0))}
                  {formRow('Plays (n)', r => r.plays, v => (v == null ? '—' : String(Math.round(v))))}
                </tbody>
              </table>
            </div>
            <Foot>Success = a play that gains its expected share of yards to go. Explosive = passes of 20+ and runs of 10+. Stuff = a carry at or behind the line. {views.some(v => !v.season) ? 'Clubs with no 2026 game yet show — until they play.' : ''}</Foot>
          </Card>
        </Section>

        {/* 3.3 snaps */}
        <Section id="snaps" num="03" title="Personnel &amp; snap intelligence" sub="Who is on the field. Snap share over the last three games vs the season, with the change.">
          <div className="tp-grid-2">
            {views.map(v => (
              <Card key={v.team.id} title={`${v.team.nick} · offense`} note={`${v.snaps.games} game${v.snaps.games === 1 ? '' : 's'}`}>
                {v.snaps.offense.length ? v.snaps.offense.map(p => (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px,150px) minmax(0,1fr) 92px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name} <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{p.pos}</span></span>
                    <div style={{ position: 'relative', height: 8, background: C.soft, borderRadius: 4 }}>
                      <div style={{ width: `${Math.min(100, (p.l3 ?? 0) * 100)}%`, height: '100%', background: v.team.color, borderRadius: 4 }} />
                      {p.season != null && <div title={`Season ${Math.round(p.season * 100)}%`} style={{ position: 'absolute', left: `${Math.min(100, p.season * 100)}%`, top: -2, bottom: -2, width: 2, background: C.ink }} />}
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 10, textAlign: 'right' }}>{p.l3 != null ? `${Math.round(p.l3 * 100)}%` : '—'}{p.delta != null && Math.abs(p.delta) >= 0.03 ? <b style={{ color: p.delta > 0 ? C.good : C.bad }}> {p.delta > 0 ? '▲' : '▼'}{Math.round(Math.abs(p.delta) * 100)}</b> : ''}</span>
                  </div>
                )) : <Empty>No snap data yet.</Empty>}
                <Foot>Bar = last 3 games · tick = season · arrow = change vs season (points). WR / RB / TE only.</Foot>
              </Card>
            ))}
          </div>
          <div className="tp-grid-2" style={{ marginTop: 16 }}>
            {views.map(v => (
              <Card key={v.team.id} title={`${v.team.nick} · defense`} note="snap share">
                {v.snaps.defense.length ? v.snaps.defense.map(p => (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px,150px) minmax(0,1fr) 60px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name} <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{p.pos}</span></span>
                    <div style={{ height: 8, background: C.soft, borderRadius: 4 }}><div style={{ width: `${Math.min(100, (p.season ?? 0) * 100)}%`, height: '100%', background: v.team.color, borderRadius: 4 }} /></div>
                    <span style={{ fontFamily: MONO, fontSize: 10, textAlign: 'right' }}>{p.season != null ? `${Math.round(p.season * 100)}%` : '—'}</span>
                  </div>
                )) : <Empty>No snap data yet.</Empty>}
              </Card>
            ))}
          </div>
          <Foot>Nickel and dime usage and personnel groupings need nflverse participation data, which is not published for 2026 yet, so they are not shown. Source: Pro Football Reference snap counts via nflverse.</Foot>
        </Section>

        {/* 3.7 situational */}
        <Section id="situ" num="04" title="Situational football" sub="How each side performs by down and in the red zone.">
          <div className="tp-grid-2">
            <Card title="Offense EPA by down"><GroupedBars groups={down(true)} teams={teamsC} /></Card>
            <Card title="Defense EPA allowed by down" note="lower is better"><GroupedBars groups={down(false)} teams={teamsC} /></Card>
          </div>
          <Card style={{ marginTop: 16 }} title="Red zone">
            {[...views].map(v => (
              <div key={v.team.id} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13 }}>
                <b>{v.team.id}</b>
                <span>Offense TD rate <b>{fmtPct(v.blended.rzTdO, 0)}</b> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>({v.blended.rzTripsO} trips)</span></span>
                <span>Defense allows <b>{fmtPct(v.blended.rzTdD, 0)}</b> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>({v.blended.rzTripsD} trips)</span></span>
              </div>
            ))}
            <Foot>{views.some(v => v.usesPrior) ? 'Early season: last season is blended in at a fading weight. ' : ''}Two-minute and short-yardage detail is in the Pro desk below.</Foot>
          </Card>
        </Section>

        {/* 3.9 / 3.10 */}
        <Section id="st" num="05" title="Special teams &amp; officials">
          <div className="tp-grid-3">
            {views.map(v => (
              <Card key={v.team.id} title={`${v.team.nick} · kicking`}>
                {v.kicking ? (
                  <>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>{v.kicking.name}</div>
                    <div style={{ fontSize: 13, marginTop: 6 }}>FG <b>{v.kicking.made}/{v.kicking.att}</b>{v.kicking.long ? ` · long ${v.kicking.long}` : ''} · XP <b>{v.kicking.xpMade}/{v.kicking.xpAtt}</b></div>
                    <Foot>n = {v.kicking.att} field-goal attempts in {v.kicking.games} game{v.kicking.games === 1 ? '' : 's'}. Small samples swing wildly.</Foot>
                  </>
                ) : <Empty>No kicking attempts yet this season.</Empty>}
              </Card>
            ))}
            <Card title="Officials">
              {game.referee ? <div style={{ fontSize: 14 }}>Referee: <b>{game.referee}</b></div> : <Empty>The crew is announced closer to kickoff.</Empty>}
              <Foot>Referee only, as listed in the schedule. Nothing is inferred about how a crew calls a game.</Foot>
            </Card>
          </div>
        </Section>

        {/* 3.13 coach card */}
        <Section id="coach" num="06" title="Coach card" sub="What to watch, written from the numbers above.">
          <Card>
            {watch.length ? (
              <>
                <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                  {watch.slice(0, 3).map((w, i) => (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, fontSize: 14, lineHeight: 1.5 }}>
                      <span style={{ background: C.orange, color: '#fff', borderRadius: 999, width: 24, height: 24, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 11 }}>{i + 1}</span>{w}
                    </li>
                  ))}
                </ol>
                {watch.length > 3 && (
                  <div style={{ marginTop: 14 }}>
                    <ProPanel isPro={isPro} title="The full watch list" blurb={`${watch.length - 3} more things to watch.`} features={['Injury and rest watch-fors', 'Protection and red-zone matchups', 'Each one tied to the number behind it']}>
                      {isPro ? (
                        <ol start={4} style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                          {watch.slice(3).map((w, i) => (
                            <li key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, fontSize: 14, lineHeight: 1.5 }}>
                              <span style={{ background: C.orange, color: '#fff', borderRadius: 999, width: 24, height: 24, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 11 }}>{i + 4}</span>{w}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </ProPanel>
                  </div>
                )}
              </>
            ) : <Empty>The watch list is written once both clubs have played games (this season or last).</Empty>}
          </Card>
        </Section>

        {/* PRO desk */}
        <Section id="pro" num="07" title="Pro desk" sub="Charting, Next Gen Stats, splits and matchup clashes.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProPanel isPro={isPro} title="Passing game deep" blurb="Time to throw, separation, cushion and where the yards come from." features={['Next Gen Stats: time to throw, aggressiveness, CPOE', 'Receiver separation, cushion and YAC over expected', 'Target and air-yards share']}>
              {isPro && pro ? (
                <div className="tp-grid-2">
                  {pro.ngs.map((n, i) => (
                    <Card key={both[i].id} title={both[i].nick}>
                      {n.passing ? <div style={{ fontSize: 13, marginBottom: 10 }}><b>{n.passing.name}</b> · time to throw <b>{n.passing.ttt?.toFixed(2) ?? '—'}s</b> · aggressiveness <b>{n.passing.aggressiveness?.toFixed(1) ?? '—'}%</b> · CPOE <b>{n.passing.cpoe != null ? `${n.passing.cpoe >= 0 ? '+' : ''}${n.passing.cpoe.toFixed(1)}` : '—'}</b> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>({n.passing.games} G)</span></div> : <Empty>No Next Gen passing sample.</Empty>}
                      {n.receivers.map(r => (
                        <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px', gap: 6, fontSize: 12, padding: '5px 0', borderTop: `1px solid ${C.soft}` }}>
                          <span>{r.name} <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{r.targets} tgt</span></span>
                          <span title="Average separation (yards)">sep {r.separation?.toFixed(1) ?? '—'}</span><span title="Average cushion (yards)">cush {r.cushion?.toFixed(1) ?? '—'}</span><span title="YAC above expectation">YAC {r.yacAboveExp != null ? `${r.yacAboveExp >= 0 ? '+' : ''}${r.yacAboveExp.toFixed(1)}` : '—'}</span>
                        </div>
                      ))}
                      <Foot>Source: NFL Next Gen Stats via nflverse. Averages of weekly rows; n shown in games.</Foot>
                    </Card>
                  ))}
                </div>
              ) : null}
            </ProPanel>

            <ProPanel isPro={isPro} title="Run game &amp; box counts" blurb="Rush efficiency, stuffs, early-down run rate and how many defenders sit in the box." features={['Rush EPA and stuff rate', 'Early-down run rate', 'Light vs stacked box (FTN)', 'Rush yards over expected (Next Gen Stats)']}>
              {isPro && pro ? (
                <div className="tp-grid-2">
                  {views.map((v, i) => (
                    <Card key={v.team.id} title={v.team.nick}>
                      <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                        <div>Rush EPA / carry <b>{fmtEpa(v.blended.rushEpaO)}</b> · stuffed on <b>{fmtPct(v.blended.stuffO, 0)}</b> of carries</div>
                        <div>Early-down run rate <b>{fmtPct(v.blended.earlyRunRate, 0)}</b></div>
                        <div>Box faced (FTN, {pro.ftnO[i].boxN} carries): light <b>{fmtPct(pro.ftnO[i].boxLight, 0)}</b> · stacked (8+) <b>{fmtPct(pro.ftnO[i].boxStack, 0)}</b> · EPA vs stacked <b>{fmtEpa(pro.ftnO[i].boxStackEpa)}</b></div>
                        {pro.ngs[i].rushers.map(r => <div key={r.name} style={{ fontSize: 12.5 }}>{r.name}: rush yards over expected <b>{r.ryoe != null ? `${r.ryoe >= 0 ? '+' : ''}${r.ryoe.toFixed(2)}` : '—'}</b> per carry <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>({r.att} att)</span></div>)}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : null}
            </ProPanel>

            <ProPanel isPro={isPro} title="Pressure, motion &amp; play-action (FTN)" blurb="How often each side blitzes, uses motion and play-action, and what those plays are worth." features={['Blitz rate faced and sent', 'Motion, play-action and RPO rates', 'EPA with vs without motion, play-action and blitz']}>
              {isPro && pro ? (
                <div style={{ display: 'grid', gap: 16 }}>
                  <Card title="Rates" note="share of plays / dropbacks">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {([['Motion rate', (f: FtnRates) => f.motionRate], ['Play-action rate', (f: FtnRates) => f.paRate], ['RPO rate', (f: FtnRates) => f.rpoRate]] as [string, (f: FtnRates) => number | null][]).map(([l, p]) => (
                        <CompareBar key={l} label={l} away={p(pro.ftnO[0])} home={p(pro.ftnO[1])} awayDisplay={fmtPct(p(pro.ftnO[0]), 0)} homeDisplay={fmtPct(p(pro.ftnO[1]), 0)} awayColor={away.color} homeColor={home.color} />
                      ))}
                      <CompareBar label="Blitz faced" away={pro.ftnO[0].blitzFaced} home={pro.ftnO[1].blitzFaced} awayDisplay={fmtPct(pro.ftnO[0].blitzFaced, 0)} homeDisplay={fmtPct(pro.ftnO[1].blitzFaced, 0)} awayColor={away.color} homeColor={home.color} />
                      <CompareBar label="Blitz sent" away={pro.ftnD[0].blitzGen} home={pro.ftnD[1].blitzGen} awayDisplay={fmtPct(pro.ftnD[0].blitzGen, 0)} homeDisplay={fmtPct(pro.ftnD[1].blitzGen, 0)} awayColor={away.color} homeColor={home.color} />
                    </div>
                  </Card>
                  <Card title="EPA with vs without" note="paired, per play">
                    <GroupedBars teams={teamsC} groups={[
                      { label: 'Motion', [away.id]: pro.ftnO[0].motionEpa, [home.id]: pro.ftnO[1].motionEpa },
                      { label: 'No motion', [away.id]: pro.ftnO[0].noMotionEpa, [home.id]: pro.ftnO[1].noMotionEpa },
                      { label: 'Play-action', [away.id]: pro.ftnO[0].paEpa, [home.id]: pro.ftnO[1].paEpa },
                      { label: 'No play-action', [away.id]: pro.ftnO[0].noPaEpa, [home.id]: pro.ftnO[1].noPaEpa },
                      { label: 'Blitzed', [away.id]: pro.ftnO[0].blitzEpa, [home.id]: pro.ftnO[1].blitzEpa },
                      { label: 'Not blitzed', [away.id]: pro.ftnO[0].noBlitzEpa, [home.id]: pro.ftnO[1].noBlitzEpa },
                    ]} />
                    <Foot>{pro.ftnO[0].plays + pro.ftnO[1].plays} charted plays across both clubs. Split samples can be thin, so read single bars with care. FTN Data via nflverse.</Foot>
                  </Card>
                </div>
              ) : null}
            </ProPanel>

            <ProPanel isPro={isPro} title="Rest, home/road, day/night &amp; roof" blurb="Where and when each club has done its best work." features={['Rest advantage board', 'Home vs road EPA', 'Day vs night', 'Dome vs outdoors']}>
              {isPro && pro ? (
                <Card>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 8, fontFamily: MONO, fontSize: 9.5, color: C.faint, textTransform: 'uppercase', paddingBottom: 6 }}><span /><span>{away.id}</span><span>{home.id}</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 8, padding: '6px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13 }}><span style={{ color: '#5b5347' }}>Rest entering game</span><span><b>{game.awayRest ?? '—'}</b> days</span><span><b>{game.homeRest ?? '—'}</b> days</span></div>
                  {pro.venue.map(r => (
                    <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 8, padding: '6px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13 }}>
                      <span style={{ color: '#5b5347' }}>{r.label}</span><span>{r.away} <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>n={r.awayN}</span></span><span>{r.home} <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>n={r.homeN}</span></span>
                    </div>
                  ))}
                  <Foot>Offense EPA per play in each kind of game, this season. Empty cells mean the club has not played that kind of game yet. Travel distance is not shown (no venue-distance data).</Foot>
                </Card>
              ) : null}
            </ProPanel>

            <ProPanel isPro={isPro} title="Matchup clashes" blurb="Each club's strength set against the other's weakness, by league rank." features={['Pass offense vs pass defense', 'Run offense vs run defense', 'Protection vs pass rush']}>
              {isPro && pro ? (
                <div className="tp-grid-3">
                  {pro.clash.map(c => (
                    <Card key={c.label} title={c.label}>
                      {[['A', away, c.away], ['H', home, c.home]].map(([k, t, x]) => (
                        <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}><b style={{ color: (t as NflTeam).color }}>{(t as NflTeam).id}</b><span>{(x as { v: string }).v} <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{(x as { rank: number | null }).rank ? `${(x as { rank: number }).rank}/32` : ''}</span></span></div>
                      ))}
                      <Foot>{c.note}</Foot>
                    </Card>
                  ))}
                </div>
              ) : null}
            </ProPanel>

            <ProPanel isPro={isPro} title="Fantasy context" blurb="Who is on the field and who is getting the ball. Context only." features={['Snap share by skill player', 'Target share', 'Week-over-week usage']}>
              {isPro && pro ? (
                <>
                  <div className="tp-grid-2">
                    {both.map(t => (
                      <Card key={t.id} title={t.nick}>
                        {pro.usage.filter(u => u.team === t.id).length ? pro.usage.filter(u => u.team === t.id).map(u => (
                          <div key={u.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,140px) minmax(0,1fr) 90px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12 }}>{u.name} <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{u.pos}</span></span>
                            <div style={{ height: 8, background: C.soft, borderRadius: 4 }}><div style={{ width: `${Math.min(100, (u.snap ?? 0) * 100)}%`, height: '100%', background: t.color, borderRadius: 4 }} /></div>
                            <span style={{ fontFamily: MONO, fontSize: 10, textAlign: 'right' }}>{u.snap != null ? `${Math.round(u.snap * 100)}% snaps` : '—'}{u.tgtShare != null ? ` · ${Math.round(u.tgtShare * 100)}% tgt` : ''}</span>
                          </div>
                        )) : <Empty>No usage sample yet.</Empty>}
                      </Card>
                    ))}
                  </div>
                  <Foot>Expected-vs-actual opportunity needs a data feed we do not carry yet, so it is not shown. This board describes usage; it makes no recommendations.</Foot>
                </>
              ) : null}
            </ProPanel>
          </div>
        </Section>

        <p style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, textAlign: 'center', marginTop: 40, lineHeight: 1.6, maxWidth: 820, marginInline: 'auto' }}>
          {DISCLAIMER} Sources: nflverse play-by-play, injuries, depth charts and snap counts; FTN Data via nflverse; NFL Next Gen Stats; Pro Football Reference. Ranks are among 32 clubs.
        </p>
      </div>
    </div>
  )
}
