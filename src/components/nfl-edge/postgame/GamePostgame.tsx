// src/components/nfl-edge/postgame/GamePostgame.tsx
//
// NFL Postgame. FREE = what happened; PRO = trajectory (tonight vs the season). Mirrors the MLB postgame split.
// `isPro` is a REQUIRED prop and is never defaulted; the Pro block is only built when it is true and its data
// (`pro`) is only fetched by the route for Pro viewers.
//
// Excluded on purpose (per spec): rebuilding the Scout brief, the Edge gauge, betting lines, PFF grades.

import Link from 'next/link'
import type { NflGame } from '@/lib/nfl-edge/games'
import { dateLabel, weekLabel } from '@/lib/nfl-edge/games'
import type { NflTeam } from '@/lib/nfl-edge/teams'
import type { Performer, PostgamePayload, ProPostgame, QbNight, ScoreRow, SnapLeader } from '@/lib/nfl-edge/postgame'
import ProPanel from '@/components/profile/ProPanel'
import {
  C, MONO, SANS, DISPLAY, Card, Chip, CompareBar, DISCLAIMER, Empty, Foot, GameHero, NflStyles, Section, Spark, TabStrip, TeamLogo, fmtEpa, fmtPct,
} from '../ui'
import { WinProbChart } from './PostgameClient'

const NAV: [string, string][] = [['swing', 'How it swung'], ['performers', 'Performers'], ['box', 'Box score'], ['qb', 'QB night'], ['snaps', 'Snaps'], ['drives', 'Scoring'], ['turnovers', 'TO & penalties'], ['scorecard', 'Scorecard'], ['pro', 'Pro'], ['next', 'Next up']]

function Delta({ tonight, season, fmt, higherBetter = true }: { tonight: number | null; season: number | null; fmt: (v: number | null) => string; higherBetter?: boolean }) {
  const d = tonight != null && season != null ? tonight - season : null
  const good = d == null ? null : higherBetter ? d > 0 : d < 0
  return (
    <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
      <b>{fmt(tonight)}</b> <span style={{ color: C.faint, fontSize: 11 }}>vs {fmt(season)}</span>
      {d != null && Math.abs(d) > 1e-9 && <span style={{ color: good ? C.good : C.bad, fontSize: 11, marginLeft: 6 }}>{good ? '▲' : '▼'}</span>}
    </span>
  )
}

export default function GamePostgame({
  game, home, away, teams, payload, performers, snaps, qbs, scorecard, nextGames, isPro, pro,
}: {
  game: NflGame; home: NflTeam; away: NflTeam; teams: Map<string, NflTeam>
  payload: PostgamePayload | null
  performers: Performer[]; snaps: SnapLeader[]; qbs: QbNight[]; scorecard: ScoreRow[]
  nextGames: Record<string, NflGame | null>
  /** REQUIRED, never defaulted */
  isPro: boolean
  pro: ProPostgame | null
}) {
  const hs = game.homeScore ?? 0, as_ = game.awayScore ?? 0
  const winner = hs === as_ ? null : hs > as_ ? home : away
  const box = payload?.team_box
  const swings = (payload?.inflections ?? []).map((s, i) => ({ t: s.t, wp: s.home_wp_after, n: i + 1, label: s.desc }))
  const tn = (id: string) => teams.get(id)

  return (
    <div className="tp-root" style={{ background: C.cream, fontFamily: SANS }}>
      <NflStyles />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 14 }}><Link href="/nfl" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: C.orange, textDecoration: 'none' }}>← NFL slate</Link></div>

        {/* final scoreboard */}
        <GameHero game={game} home={home} away={away} kicker={`Postgame · ${weekLabel(game)} · ${dateLabel(game.gameday)}${game.overtime ? ' · Final/OT' : ' · Final'}`}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, marginTop: 20, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(54px, 9vw, 96px)', lineHeight: 1, color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.4)', opacity: winner && winner.id !== away.id ? .7 : 1 }}>{as_}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.2em', background: 'rgba(26,26,26,.78)', color: '#FAF8F3', padding: '6px 12px', borderRadius: 999 }}>FINAL{game.overtime ? ' / OT' : ''}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(54px, 9vw, 96px)', lineHeight: 1, color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.4)', opacity: winner && winner.id !== home.id ? .7 : 1 }}>{hs}</div>
          </div>
          {payload?.linescore?.length ? (
            <table style={{ margin: '16px auto 0', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, color: '#fff', background: 'rgba(26,26,26,.55)', borderRadius: 10, overflow: 'hidden' }}>
              <thead><tr><th style={{ padding: '5px 12px' }} />{payload.linescore.map(l => <th key={l.q} style={{ padding: '5px 10px', fontWeight: 400, opacity: .8 }}>{l.q}</th>)}<th style={{ padding: '5px 12px' }}>T</th></tr></thead>
              <tbody>
                {[[away, 'away', as_], [home, 'home', hs]].map(([t, k, tot]) => (
                  <tr key={(t as NflTeam).id}><td style={{ padding: '5px 12px', fontWeight: 700 }}>{(t as NflTeam).id}</td>{payload.linescore.map(l => <td key={l.q} style={{ padding: '5px 10px', textAlign: 'center' }}>{l[k as 'home' | 'away']}</td>)}<td style={{ padding: '5px 12px', fontWeight: 700, textAlign: 'center' }}>{tot as number}</td></tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </GameHero>
        <TabStrip game={game} active="postgame" />
        <nav className="tp-nav" aria-label="Postgame sections" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(250,248,243,.95)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${C.line}`, margin: '16px -24px 0', padding: '10px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {NAV.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}
        </nav>

        {!payload && (
          <div style={{ marginTop: 20 }}><Card><Empty>The play-by-play breakdown (win-probability line, scoring drives, team box score) is still being prepared for this game. Everything else below is already available.</Empty></Card></div>
        )}

        <Section id="swing" num="01" title="How it swung" sub="Home win probability through the game. Numbered dots are the five biggest swings, in game order.">
          <Card>
            {payload ? (
              <>
                <WinProbChart points={payload.wp_series.map(([t, wp]) => ({ t, wp }))} swings={swings} home={home.id} away={away.id} homeColor={home.color} awayColor={away.color} />
                <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {payload.inflections.map((s, i) => (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '24px 74px minmax(0,1fr)', gap: 10, alignItems: 'start', fontSize: 13 }}>
                      <span style={{ background: C.orange, color: '#fff', borderRadius: 999, width: 22, height: 22, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 10 }}>{i + 1}</span>
                      <span><Chip tone={s.kind === 'TD' ? 'good' : s.kind === 'Turnover' ? 'bad' : 'plain'}>{s.kind}</Chip></span>
                      <span><span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{s.q > 4 ? 'OT' : `Q${s.q}`} {s.clock} · {s.team} · win probability moved {Math.round(Math.abs(s.home_wp_after - s.home_wp_before) * 100)} pts toward {s.home_wp_before <= s.home_wp_after ? home.id : away.id}</span><br />{s.desc}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : <Empty>Not available yet.</Empty>}
            <Foot>Win probability is nflfastR&apos;s play-by-play model, shown only to describe how this game unfolded.</Foot>
          </Card>
        </Section>

        <Section id="performers" num="02" title="Top performers" sub="The leading passer, rusher, receiver, defender and kicker for each club.">
          {performers.length ? (
            <div className="tp-grid-2">
              {[away, home].map(t => (
                <Card key={t.id} title={`${t.nick}`}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {performers.filter(p => p.team === t.id).map(p => (
                      <div key={p.id + p.kind} style={{ display: 'flex', gap: 10, alignItems: 'center', borderLeft: `4px solid ${t.color}`, paddingLeft: 10 }}>
                        {p.headshot
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.headshot} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: 999, objectFit: 'cover', background: C.soft }} />
                          : <span style={{ width: 38, height: 38, borderRadius: 999, background: C.soft }} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 15 }}>{p.name} <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint, fontWeight: 400 }}>{p.label} · {p.pos}</span></div>
                          <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: '#5b5347' }}>{p.line}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          ) : <Card><Empty>Player stat lines for this game have not been loaded yet.</Empty></Card>}
        </Section>

        <Section id="box" num="03" title="Team stats" sub="Side by side. The brighter bar is the club that did better on that line.">
          <Card>
            {box && box[home.id] && box[away.id] ? (() => {
              const a = box[away.id], h = box[home.id]
              const r = (x: number, y: number) => (y > 0 ? x / y : null)
              const pen = payload!.penalties.by_team
              const rows: { l: string; a: number | null; h: number | null; ad: string; hd: string; hb?: boolean }[] = [
                { l: 'Total yards', a: a.total_yds, h: h.total_yds, ad: String(a.total_yds), hd: String(h.total_yds) },
                { l: 'Passing yds', a: a.pass_yds, h: h.pass_yds, ad: String(a.pass_yds), hd: String(h.pass_yds) },
                { l: 'Rushing yds', a: a.rush_yds, h: h.rush_yds, ad: String(a.rush_yds), hd: String(h.rush_yds) },
                { l: 'EPA / play', a: a.epa_per_play, h: h.epa_per_play, ad: fmtEpa(a.epa_per_play), hd: fmtEpa(h.epa_per_play) },
                { l: 'Success rate', a: a.success_rate, h: h.success_rate, ad: fmtPct(a.success_rate, 0), hd: fmtPct(h.success_rate, 0) },
                { l: 'Explosive plays', a: a.explosive, h: h.explosive, ad: String(a.explosive), hd: String(h.explosive) },
                { l: '3rd down', a: r(a.third_conv, a.third_att), h: r(h.third_conv, h.third_att), ad: `${a.third_conv}/${a.third_att}`, hd: `${h.third_conv}/${h.third_att}` },
                { l: 'Red zone TD', a: r(a.rz_td, a.rz_trips), h: r(h.rz_td, h.rz_trips), ad: `${a.rz_td}/${a.rz_trips}`, hd: `${h.rz_td}/${h.rz_trips}` },
              ]
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 116px minmax(0,1fr) 64px', gap: 8, fontFamily: DISPLAY, fontWeight: 800, fontSize: 16 }}><span style={{ textAlign: 'right' }}>{away.id}</span><span /><span /><span /><span>{home.id}</span></div>
                  {rows.map(x => <CompareBar key={x.l} label={x.l} away={x.a} home={x.h} awayDisplay={x.ad} homeDisplay={x.hd} awayColor={away.color} homeColor={home.color} />)}
                  <CompareBar label="Turnovers" away={a.turnovers} home={h.turnovers} awayDisplay={String(a.turnovers)} homeDisplay={String(h.turnovers)} awayColor={away.color} homeColor={home.color} higherBetter={false} />
                  <CompareBar label="Sacks taken" away={a.sacks_taken} home={h.sacks_taken} awayDisplay={String(a.sacks_taken)} homeDisplay={String(h.sacks_taken)} awayColor={away.color} homeColor={home.color} higherBetter={false} />
                  <CompareBar label="Penalty yds" away={pen[away.id]?.yards ?? 0} home={pen[home.id]?.yards ?? 0} awayDisplay={`${pen[away.id]?.count ?? 0} for ${pen[away.id]?.yards ?? 0}`} homeDisplay={`${pen[home.id]?.count ?? 0} for ${pen[home.id]?.yards ?? 0}`} awayColor={away.color} homeColor={home.color} higherBetter={false} />
                </div>
              )
            })() : <Empty>Team box score is still being prepared.</Empty>}
            <Foot>Scrimmage plays only (no kneels, spikes or two-point tries). Source: nflverse play-by-play.</Foot>
          </Card>
        </Section>

        <Section id="qb" num="04" title="Quarterback night" sub="The lead passer's line and how it compares to his own season so far (before this game).">
          {qbs.length ? (
            <div className="tp-grid-2">
              {qbs.map(q => {
                const t = tn(q.team)!
                return (
                  <Card key={q.id} style={{ borderTop: `4px solid ${t.color}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, textTransform: 'uppercase', letterSpacing: '.1em' }}>{t.nick}</div>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24 }}>{q.name}</div>
                    <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 15, margin: '6px 0 12px' }}>{q.tonight.cmp}/{q.tonight.att} · {q.tonight.yds} yds · {q.tonight.td} TD · {q.tonight.int} INT</div>
                    <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                      {([['EPA / att', q.tonight.epaAtt, q.season?.epaAtt ?? null, fmtEpa], ['CPOE', q.tonight.cpoe, q.season?.cpoe ?? null, (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`)], ['Completion %', q.tonight.compPct, q.season?.compPct ?? null, (v: number | null) => fmtPct(v, 0)], ['Yards / att', q.tonight.ypa, q.season?.ypa ?? null, (v: number | null) => (v == null ? '—' : v.toFixed(1))]] as const).map(([l, a, b, f]) => (
                        <div key={l} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8 }}><span style={{ color: '#5b5347' }}>{l}</span><Delta tonight={a} season={b} fmt={f} /></div>
                      ))}
                    </div>
                    <Foot>{q.season ? `Season baseline: ${q.season.games} earlier game${q.season.games === 1 ? '' : 's'} in ${game.season}.` : 'No earlier games this season, so there is no baseline to compare against.'} ▲/▼ = better/worse than his season average.</Foot>
                  </Card>
                )
              })}
            </div>
          ) : <Card><Empty>No quarterback line available for this game yet.</Empty></Card>}
        </Section>

        <Section id="snaps" num="05" title="Snap leaders" sub="Who actually played. Share of the club's offensive or defensive snaps.">
          {snaps.length ? (
            <div className="tp-grid-2">
              {[away, home].map(t => (
                <Card key={t.id} title={t.nick}>
                  {(['offense', 'defense'] as const).map(side => (
                    <div key={side} style={{ marginBottom: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 6 }}>{side}</div>
                      {snaps.filter(s => s.team === t.id && s.side === side).map(s => (
                        <div key={s.name + side} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,140px) minmax(0,1fr) 88px', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                          <div style={{ height: 8, background: C.soft, borderRadius: 4 }}><div style={{ width: `${Math.min(100, s.pct * 100)}%`, height: '100%', background: t.color, borderRadius: 4 }} /></div>
                          <span style={{ fontFamily: MONO, fontSize: 10, textAlign: 'right' }}>{Math.round(s.pct * 100)}% · {s.snaps}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          ) : <Card><Empty>Snap counts for this game have not been loaded yet.</Empty></Card>}
          <Foot>Source: nflverse / Pro Football Reference snap counts. The full snap and personnel board is in the Scout Report.</Foot>
        </Section>

        <Section id="drives" num="06" title="Scoring drives" sub="Every drive that ended in points, in order. Bar length = yards gained on the drive.">
          <Card>
            {payload?.scoring_drives.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {payload.scoring_drives.map((d, i) => {
                  const t = tn(d.team)
                  const maxY = Math.max(75, ...payload.scoring_drives.map(x => x.yards))
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '66px 44px minmax(0,1fr) 190px', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{d.q != null ? (d.q > 4 ? 'OT' : `Q${d.q}`) : ''} {d.clock}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t && <TeamLogo team={t} size={18} />}<b style={{ fontSize: 12 }}>{d.team}</b></span>
                      <div style={{ height: 10, background: C.soft, borderRadius: 5 }}><div style={{ width: `${Math.max(3, (d.yards / maxY) * 100)}%`, height: '100%', background: t?.color ?? C.orange, borderRadius: 5 }} /></div>
                      <span style={{ fontSize: 12, color: '#3a352c' }}><Chip tone={d.result === 'Field goal' ? 'plain' : 'good'}>{d.result}</Chip> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{d.plays ? `${d.plays} plays · ${d.yards} yds` : 'defense'}</span></span>
                    </div>
                  )
                })}
              </div>
            ) : <Empty>No scoring-drive detail available yet.</Empty>}
          </Card>
        </Section>

        <Section id="turnovers" num="07" title="Turnovers &amp; penalties">
          <div className="tp-grid-2">
            <Card title="Turnovers">
              {payload?.turnovers.length ? payload.turnovers.map((t, i) => (
                <div key={i} style={{ padding: '7px 0', borderTop: i ? `1px solid ${C.soft}` : 'none', fontSize: 12.5 }}>
                  <Chip tone="bad">{t.team} · {t.kind}</Chip> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{t.q > 4 ? 'OT' : `Q${t.q}`} {t.clock}</span>
                  <div style={{ color: '#5b5347', marginTop: 3 }}>{t.desc}</div>
                </div>
              )) : <Empty>{payload ? 'No turnovers in this game.' : 'Not available yet.'}</Empty>}
            </Card>
            <Card title="Penalties">
              {payload ? (
                <>
                  {[away, home].map(t => <div key={t.id} style={{ fontSize: 13, marginBottom: 4 }}><b>{t.id}</b> {payload.penalties.by_team[t.id]?.count ?? 0} for {payload.penalties.by_team[t.id]?.yards ?? 0} yards</div>)}
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, textTransform: 'uppercase', margin: '10px 0 4px' }}>Costliest</div>
                  {payload.penalties.costliest.map((p, i) => <div key={i} style={{ fontSize: 12.5, padding: '4px 0', borderTop: `1px solid ${C.soft}` }}>{p.team} · {p.type ?? 'Penalty'} · {p.yards} yds <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{p.q > 4 ? 'OT' : `Q${p.q}`} {p.clock}</span></div>)}
                </>
              ) : <Empty>Not available yet.</Empty>}
            </Card>
          </div>
        </Section>

        <Section id="scorecard" num="08" title="Key players scorecard" sub="Each club's three busiest skill players going into the game: did they beat their own per-game yardage?">
          <Card>
            {scorecard.length ? (
              <div className="tp-grid-2" style={{ gap: 20 }}>
                {[away, home].map(t => (
                  <div key={t.id}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.orange, textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 6 }}>{t.nick}</div>
                    {scorecard.filter(s => s.team === t.id).map(s => (
                      <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '7px 0', borderTop: `1px solid ${C.soft}`, alignItems: 'center' }}>
                        <span><b style={{ fontSize: 13 }}>{s.name}</b> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{s.pos} · avg {s.expected.toFixed(0)} yds ({s.basis})</span></span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{s.actual} yds</b><Chip tone={s.hit ? 'good' : 'bad'}>{s.hit ? 'Above avg' : 'Below avg'}</Chip></span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : <Empty>The scorecard needs at least one earlier game this season to compare against.</Empty>}
            <Foot>Yardage is rushing for running backs and receiving for everyone else. A description of how each player did against his own norm.</Foot>
          </Card>
        </Section>

        <Section id="pro" num="09" title="Trajectory" sub="Tonight vs the season: the Pro read on what changed.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProPanel isPro={isPro} title="QB dial & skill trajectory" blurb="Pressure faced, time to throw, and who got more or fewer touches than usual." features={['Pressure rate faced, tonight vs season', 'Time to throw (Next Gen Stats)', 'EPA per attempt trend with tonight marked', 'Touches and snap share vs earlier games']}>
              {isPro && pro ? (
                <div style={{ display: 'grid', gap: 18 }}>
                  <div className="tp-grid-2">
                    {qbs.map(q => {
                      const d = pro.qbDial.find(x => x.team === q.team)
                      return (
                        <Card key={q.id} title={`${q.name} · dial`}>
                          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}><span>Pressure faced</span><Delta tonight={d?.pressurePct ?? null} season={d?.pressureSeason ?? null} fmt={v => fmtPct(v, 0)} higherBetter={false} /></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}><span>Time to throw</span><Delta tonight={d?.tttTonight ?? null} season={d?.tttSeason ?? null} fmt={v => (v == null ? '—' : `${v.toFixed(2)}s`)} higherBetter={false} /></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}><span>EPA/att by game</span><Spark values={q.epaByGame.map(g => g.epaAtt)} color={tn(q.team)?.color} width={140} height={28} /></div>
                          </div>
                          <Foot>{q.epaByGame.length} games in the sparkline; the last point is this game. Pressure: Pro Football Reference. Time to throw: Next Gen Stats.</Foot>
                        </Card>
                      )
                    })}
                  </div>
                  <Card title="Skill trajectory" note="touches = targets + carries">
                    {pro.skill.length ? pro.skill.map(s => (
                      <div key={s.team + s.name} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 170px', gap: 8, padding: '7px 0', borderTop: `1px solid ${C.soft}`, fontSize: 12.5, alignItems: 'center' }}>
                        <span><b>{s.name}</b> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{s.team} · {s.pos}</span></span>
                        <span>Touches <Delta tonight={s.touchesTonight} season={s.touchesPrior} fmt={v => (v == null ? '—' : v.toFixed(0))} /></span>
                        <span>Snap share <Delta tonight={s.snapTonight} season={s.snapPrior} fmt={v => fmtPct(v, 0)} /></span>
                      </div>
                    )) : <Empty>No skill-player usage yet.</Empty>}
                  </Card>
                </div>
              ) : null}
            </ProPanel>

            <ProPanel isPro={isPro} title="Defense, situations & FTN night" blurb="How the defenses held up, how each offense did on third down and in the red zone, and the pre-snap tendencies." features={['EPA allowed vs pass and run, tonight vs season', 'Third-down and red-zone conversion vs season', 'Blitz faced, motion and play-action rates (FTN)', 'Depth-chart starters vs the snaps they took']}>
              {isPro && pro ? (
                pro.hasSplits ? (
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div className="tp-grid-2">
                      <Card title="Defensive outing" note="EPA allowed / play · lower is better">
                        {pro.defFlags.map(f => (
                          <div key={f.team} style={{ display: 'grid', gap: 6, fontSize: 13, padding: '6px 0', borderTop: `1px solid ${C.soft}` }}>
                            <b>{f.team} defense</b>
                            <div>vs pass <Delta tonight={f.passTonight} season={f.passSeason} fmt={fmtEpa} higherBetter={false} /></div>
                            <div>vs run <Delta tonight={f.rushTonight} season={f.rushSeason} fmt={fmtEpa} higherBetter={false} /></div>
                          </div>
                        ))}
                      </Card>
                      <Card title="Situational audit" note="tonight vs season (season includes tonight)">
                        {pro.situational.map(f => (
                          <div key={f.team} style={{ display: 'grid', gap: 6, fontSize: 13, padding: '6px 0', borderTop: `1px solid ${C.soft}` }}>
                            <b>{f.team} offense</b>
                            <div>3rd down <Delta tonight={f.thirdTonight} season={f.thirdSeason} fmt={v => fmtPct(v, 0)} /></div>
                            <div>Red-zone TD <Delta tonight={f.rzTonight} season={f.rzSeason} fmt={v => fmtPct(v, 0)} /> <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>({f.rzTripsTonight} trips)</span></div>
                          </div>
                        ))}
                      </Card>
                    </div>
                    <Card title="FTN night" note="pre-snap tendencies · FTN Data via nflverse">
                      {pro.ftn.map(f => (
                        <div key={f.team} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.soft}`, fontSize: 12.5 }}>
                          <b>{f.team}</b>
                          <span>Blitz faced <Delta tonight={f.blitzFacedTonight} season={f.blitzFacedSeason} fmt={v => fmtPct(v, 0)} /></span>
                          <span>Motion <Delta tonight={f.motionTonight} season={f.motionSeason} fmt={v => fmtPct(v, 0)} /></span>
                          <span>Play-action <Delta tonight={f.paTonight} season={f.paSeason} fmt={v => fmtPct(v, 0)} /></span>
                        </div>
                      ))}
                      <Foot>{pro.ftn[0]?.n ?? 0} charted plays per side. Motion and play-action are shares of plays; blitz is share of dropbacks.</Foot>
                    </Card>
                    <Card title="Personnel audit" note="depth chart as filed vs snaps taken">
                      <div className="tp-grid-2" style={{ gap: 20 }}>
                        {[away, home].map(t => (
                          <div key={t.id}>
                            {pro.personnel.filter(p => p.team === t.id).map(p => (
                              <div key={p.pos + p.name} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px', gap: 8, fontSize: 12.5, padding: '5px 0', borderTop: `1px solid ${C.soft}` }}>
                                <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{p.pos}</span><span>{p.name}</span>
                                <span style={{ textAlign: 'right', color: p.snapPct != null && p.snapPct < 0.5 ? C.bad : C.ink }}>{p.snapPct == null ? 'DNP' : `${Math.round(p.snapPct * 100)}%`}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                ) : <Empty>Situational and FTN splits are still being prepared for this game.</Empty>
              ) : null}
            </ProPanel>

            <ProPanel isPro={isPro} title="Into next week" blurb="Heavy-workload players and the turnaround to the next game." features={['Players who took 90%+ of the snaps', 'Days of rest before the next game', 'Short-week flag']}>
              {isPro && pro ? (
                <div className="tp-grid-2">
                  {pro.nextWeek.map(n => (
                    <Card key={n.team} title={`${n.team} · next`}>
                      <div style={{ fontSize: 13 }}>{n.nextOpp ? <>Next opponent <b>{n.nextOpp}</b>{n.restDays != null && <> · <b>{n.restDays} days</b> rest{n.restDays <= 5 ? ' (short week)' : ''}</>}</> : 'No further game on the schedule.'}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, textTransform: 'uppercase', margin: '10px 0 4px' }}>Took 90%+ of snaps</div>
                      {n.heavy.length ? n.heavy.map(h => <div key={h.name} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{h.name}</span><span style={{ fontFamily: MONO }}>{Math.round(h.pct * 100)}%</span></div>) : <Empty>No one at that level.</Empty>}
                    </Card>
                  ))}
                </div>
              ) : null}
            </ProPanel>
          </div>
        </Section>

        <Section id="next" num="10" title="Next up">
          <div className="tp-grid-2">
            {[away, home].map(t => {
              const ng = nextGames[t.id]
              const opp = ng ? tn(ng.homeId === t.id ? ng.awayId : ng.homeId) : null
              return (
                <Card key={t.id} title={`${t.nick} next`}>
                  {ng && opp ? (
                    <Link href={`/nfl/${ng.slug}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, color: C.ink }}>
                      <TeamLogo team={opp} size={30} />
                      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>{ng.homeId === t.id ? 'vs' : '@'} {opp.nick}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{weekLabel(ng)} · {dateLabel(ng.gameday)}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: C.orange, fontWeight: 700 }}>PREVIEW →</span>
                    </Link>
                  ) : <Empty>No further game on the schedule.</Empty>}
                </Card>
              )
            })}
          </div>
          <div style={{ marginTop: 14 }}><Link href="/nfl" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.orange, textDecoration: 'none', fontWeight: 700 }}>Rest of the week&apos;s slate →</Link></div>
        </Section>

        <p style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, textAlign: 'center', marginTop: 40, lineHeight: 1.6, maxWidth: 820, marginInline: 'auto' }}>
          {DISCLAIMER} Sources: nflverse play-by-play, player stats and snap counts; FTN Data via nflverse; Next Gen Stats; Pro Football Reference. Descriptions of what happened, not predictions.
        </p>
      </div>
    </div>
  )
}
