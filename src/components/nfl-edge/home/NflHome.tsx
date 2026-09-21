// src/components/nfl-edge/home/NflHome.tsx
//
// NFL homepage, laid out exactly like the MLB homepage (src/app/mlb/MLBHomepage.tsx):
//   player search (top right) → card ticker with a date bar → main column + 320px sidebar:
//     § All 32 teams · § Featured game · § League leaders + comprehensive leaderboard · § Standings + quality map ·
//     § Coverage desk · § Injury alert · § How the Edge works · § Fantasy context
//     sidebar: § Around the league (news) + Latest from The Edge (articles)
// The CSS below is the MLB block (class names differ only by prefix), so spacing, cards and the ticker match.
//
// Content rules: no spreads / totals / odds; the lean is factor COUNTS only ("6/9 lean BUF"), never a score or probability;
// empty state over fabricated data. Everything is read from nflverse-backed tables (nothing live from ESPN except the news feed).

import Link from 'next/link'
import type { Slate, SlateGame, StandingRow, TickerWeek } from '@/lib/nfl-edge/slate'
import { recordStr } from '@/lib/nfl-edge/slate'
import type { CoverageDesk, Leaders, TeamBoardRow } from '@/lib/nfl-edge/league'
import type { NflTeam } from '@/lib/nfl-edge/teams'
import { kickoffLabel } from '@/lib/nfl-edge/games'
import PlayerSearch from '@/components/PlayerSearch'
import NewsFeedSidebar, { type NewsSidebarItem } from '@/components/NewsFeedSidebar'
import SignupForm from '@/components/home/SignupForm'
import { C, Chip, DISCLAIMER, InjuryDot, RestBadge, TeamLogo, TiltGauge, WeatherIcon, roofText } from '../ui'
import { CoverageSection, TeamQualitySection } from './LeagueDesk'
import { LeaderPanel, NflTicker, Sec, Standings, TeamTable, type LeaderTab, type StandingsData, type TeamTableCol, type TeamTableRow, type TickerCard, type TickerWeekData } from './HomeClient'

const FONT = 'var(--font-outfit), system-ui, sans-serif'

const CSS = `
.nfl-page { background: #FAF8F3; min-height: 100vh; font-family: ${FONT}; }
.ticker-outer { position: relative; background: #FAF8F3; border-bottom: 1px solid rgba(26,26,26,0.08); }
.ticker-wrap { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 10px 16px 12px; }
.ticker-wrap::-webkit-scrollbar { display: none; }
.ticker-track { display: flex; gap: 8px; max-width: 1400px; margin: 0 auto; }
.ticker-card { position: relative; overflow: hidden; min-width: 150px; padding: 10px 12px; background: #fff; border: 1px solid rgba(26,26,26,0.08); border-radius: 10px; display: block; flex-shrink: 0; transition: border-color 0.1s, box-shadow 0.1s; }
.ticker-card:hover { border-color: rgba(26,26,26,0.2); box-shadow: 0 2px 8px rgba(26,26,26,0.06); }
.ticker-card-overlay { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 4px; padding: 8px; background: rgba(26,26,26,0.9); opacity: 0; pointer-events: none; transition: opacity 0.15s; }
.ticker-card:hover .ticker-card-overlay { opacity: 1; pointer-events: auto; }
.ticker-card-overlay-btn { font-family: ${FONT}; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; text-align: center; text-decoration: none; color: #1A1A1A; background: #fff; border-radius: 6px; padding: 6px 4px; transition: background 0.1s, color 0.1s; }
.ticker-card-overlay-btn:hover { background: #FF5722; color: #fff; }
.ticker-arrow { position: absolute; top: 32px; bottom: 0; width: 40px; display: flex; align-items: center; justify-content: center; background: linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0)); z-index: 2; cursor: pointer; border: none; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
.ticker-arrow.right { background: linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0)); right: 0; }
.ticker-arrow.left { left: 0; }
.ticker-outer:hover .ticker-arrow { opacity: 1; pointer-events: auto; }
.nh-main { max-width: 1600px; margin: 0 auto; padding: 24px 16px 48px; }
.nh-layout { display: grid; grid-template-columns: 1fr; gap: 24px; }
@media (min-width: 1024px) { .nh-layout { grid-template-columns: 1fr 320px; gap: 32px; } }
.nh-sidebar { min-width: 0; }
.nh-section { margin-bottom: 32px; }
.nh-standings-row { display: grid; grid-template-columns: 1fr; gap: 24px; }
@media (min-width: 768px) { .nh-standings-row { grid-template-columns: 1fr 1.2fr; gap: 32px; } .nh-main { padding: 24px 24px 48px; } }
.nh-leaders-row { display: grid; grid-template-columns: 1fr; gap: 24px; }
@media (min-width: 900px) { .nh-leaders-row { grid-template-columns: 1fr 1.5fr; gap: 32px; } }
.tp-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.tp-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
@media (max-width: 900px) { .tp-grid-2 { grid-template-columns: 1fr !important; } }
`

const card: React.CSSProperties = { background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, padding: 16 }

function toCard(g: SlateGame): TickerCard {
  const r = g.read
  const lead = r.lean === 'home' ? { n: r.homeCount, id: g.home.id } : { n: r.awayCount, id: g.away.id }
  return {
    id: g.game.id, slug: g.game.slug,
    away: { id: g.away.id, logo: g.away.logo, rec: g.awayRec }, home: { id: g.home.id, logo: g.home.logo, rec: g.homeRec },
    awayScore: g.game.awayScore, homeScore: g.game.homeScore, phase: g.phase,
    label: g.phase === 'final' ? 'FINAL' : g.phase === 'awaiting' ? 'FINAL SOON' : kickoffLabel(g.game.kickoff).replace(' ET', ''),
    lean: g.phase === 'final' || !r.ready || r.total === 0 ? { kind: 'pending', text: '' } : r.lean === 'even' ? { kind: 'even', text: '' } : { kind: 'lean', text: `${lead.n}/${r.total} lean ${lead.id}` },
  }
}

function AllTeamsStrip({ teams }: { teams: Map<string, NflTeam> }) {
  const list = [...teams.values()].sort((a, b) => a.id.localeCompare(b.id))
  return (
    <div className="nh-section">
      <Sec>All 32 teams</Sec>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {list.map(t => (
          <Link key={t.id} href={`/nfl/teams/${t.id.toLowerCase()}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 6px', background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 999, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.logo} alt="" width={16} height={16} style={{ flexShrink: 0, objectFit: 'contain' }} />
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.03em' }}>{t.id}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Featured({ g }: { g: SlateGame }) {
  const r = g.read
  const inj = (t: NflTeam, n: number) => (
    <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12, color: '#3a352c' }}>
      <InjuryDot status={n > 0 ? 'Out' : null} /> {t.id}: {n > 0 ? `${n} starter${n === 1 ? '' : 's'} Out / Doubtful` : 'no starters Out / Doubtful'}
    </span>
  )
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div style={{ padding: 22, background: `linear-gradient(100deg, ${g.away.color}, ${g.home.color})`, color: '#fff' }}>
          <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,.4)' }}>★ Featured · {kickoffLabel(g.game.kickoff)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            {[g.away, g.home].map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ background: 'rgba(255,255,255,.92)', borderRadius: 999, width: 60, height: 60, display: 'grid', placeItems: 'center' }}><TeamLogo team={t} size={42} /></span>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 28, letterSpacing: '-.02em', lineHeight: 1, textShadow: '0 1px 3px rgba(0,0,0,.35)' }}>{t.nick}</div>
                  <div style={{ fontFamily: FONT, fontSize: 10.5, textShadow: '0 1px 2px rgba(0,0,0,.35)' }}>{i === 0 ? g.awayRec : g.homeRec}</div>
                </div>
                {i === 0 && <span style={{ fontFamily: FONT, fontSize: 11, background: 'rgba(26,26,26,.75)', padding: '4px 9px', borderRadius: 999 }}>@</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
            {g.game.stadium && <Chip tone="dark">{g.game.stadium}</Chip>}
            <span style={{ background: 'rgba(255,255,255,.92)', borderRadius: 999, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT, fontSize: 9.5, color: '#3a352c', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              <WeatherIcon roof={g.roof} temp={g.game.temp} wind={g.game.wind} size={14} /> {roofText(g.roof, g.game.roof)}
            </span>
            {g.game.divGame && <Chip tone="yellow">Division game</Chip>}
            {g.primetime && <Chip tone="dark">Primetime</Chip>}
            <RestBadge days={g.game.awayRest} label={g.away.id} />
            <RestBadge days={g.game.homeRest} label={g.home.id} />
          </div>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
          {r.ready && r.total > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <TiltGauge home={g.home} away={g.away} homeCount={r.homeCount} awayCount={r.awayCount} total={r.total} size={160} />
              <div>
                <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 22, color: C.ink, lineHeight: 1.1 }}>{r.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 13, color: '#5b5347', marginTop: 4 }}>{r.homeCount} of {r.total} factors lean {g.home.id} · {r.awayCount} lean {g.away.id}</div>
                <div style={{ fontFamily: FONT, fontSize: 9.5, color: '#A3A3A3', marginTop: 4 }}>Needle = which club leads on more factors. Not a probability.</div>
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: FONT, fontSize: 12, color: '#A3A3A3', fontStyle: 'italic' }}>The factor read builds as clubs play. Open the preview for what is already known.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{inj(g.away, g.starInjuries.away)}{inj(g.home, g.starInjuries.home)}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`/nfl/${g.game.slug}`} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', background: C.ink, color: '#FAF8F3', padding: '9px 14px', borderRadius: 6, textDecoration: 'none' }}>Game Preview</Link>
            <Link href={`/nfl/${g.game.slug}/scout`} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.orange, padding: '9px 4px', textDecoration: 'none' }}>Scout Report →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const epa = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`)

export default function NflHome({
  slate, weeks, standings, leaders, board, coverage, teams, news, articlesTeaser,
}: {
  slate: Slate | null
  weeks: TickerWeek[]
  standings: { season: number; divisions: { conference: 'AFC' | 'NFC'; division: string; teams: StandingRow[] }[]; through: number } | null
  leaders: Leaders | null
  board: TeamBoardRow[]
  coverage: CoverageDesk | null
  teams: Map<string, NflTeam>
  news: NewsSidebarItem[]
  articlesTeaser: React.ReactNode
}) {
  const tickerWeeks: TickerWeekData[] = weeks.map(w => ({ key: w.key, label: w.label, week: w.week, cards: w.games.map(toCard) }))

  const recOf = new Map<string, StandingRow>()
  standings?.divisions.forEach(d => d.teams.forEach(t => recOf.set(t.id, t)))
  const standingsData: StandingsData = (standings?.divisions ?? []).map(d => ({
    conference: d.conference, division: d.division,
    teams: d.teams.map(t => ({ id: t.id, name: teams.get(t.id)?.nick ?? t.id, logo: teams.get(t.id)?.logo ?? '', w: t.w, l: t.l, t: t.t, diff: t.pf - t.pa, streak: t.streak })),
  }))

  const tab = (key: string, label: string, short: string): LeaderTab => {
    const b = leaders?.boards.find(x => x.key === key)
    return { key, label, short, rows: (b?.rows ?? []).map(r => ({ id: r.id, name: r.name, team: r.team, headshot: r.headshot, value: r.value, sub: r.sub })) }
  }
  const tableCols: TeamTableCol[] = [
    { label: 'Net EPA', title: 'Offense EPA per play minus defense EPA allowed per play', higherBetter: true },
    { label: 'Off EPA', title: 'Offense EPA per play', higherBetter: true },
    { label: 'Def EPA', title: 'EPA allowed per play (lower is better)', higherBetter: false },
    { label: 'Pass EPA', title: 'Offense EPA per dropback', higherBetter: true },
    { label: 'Rush EPA', title: 'Offense EPA per carry', higherBetter: true },
    { label: 'Expl%', title: 'Share of offensive plays gaining 20+ passing or 10+ rushing yards', higherBetter: true },
    { label: 'Sack%', title: 'Sacks allowed per dropback (lower is better)', higherBetter: false },
    { label: 'Blitz%', title: 'Share of opposing dropbacks the defense blitzed (FTN)', higherBetter: true },
  ]
  const tableRows: TeamTableRow[] = board.flatMap(b => {
    const t = teams.get(b.id)
    if (!t) return []
    const net = b.offEpa != null && b.defEpa != null ? b.offEpa - b.defEpa : null
    const s = recOf.get(b.id)
    return [{
      id: b.id, name: t.nick, logo: t.logo, rec: s ? recordStr({ w: s.w, l: s.l, t: s.t }) : '0-0',
      v: [net, b.offEpa, b.defEpa, b.passEpaO, b.rushEpaO, b.explosiveO, b.sackAllowed, b.blitz],
      d: [epa(net), epa(b.offEpa), epa(b.defEpa), epa(b.passEpaO), epa(b.rushEpaO), pct(b.explosiveO), pct(b.sackAllowed), pct(b.blitz)],
    }]
  })
  const early = board.some(b => b.usesPrior)
  const injuryTeams = slate ? slate.games.flatMap(g => [{ t: g.away, n: g.starInjuries.away }, { t: g.home, n: g.starInjuries.home }]).filter(x => x.n > 0).sort((a, b) => b.n - a.n) : []

  return (
    <div className="nfl-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '12px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', maxWidth: 320 }}><PlayerSearch maintenance={false} sport="NFL" rounded /></div>
      </div>

      <NflTicker weeks={tickerWeeks} />

      <div className="nh-main">
        <div className="nh-layout">
          <div>
            <AllTeamsStrip teams={teams} />

            {slate?.featured && (
              <div className="nh-section">
                <Sec>Featured game · {slate.label}</Sec>
                <Featured g={slate.featured} />
                <div style={{ fontFamily: FONT, fontSize: 9.5, color: '#A3A3A3', marginTop: 6 }}>The strongest combined-quality matchup still to play this week. Kickoffs in Eastern time. The lean counts how many of up to 10 factors point each way; it reads the data, it does not predict.</div>
              </div>
            )}

            <div className="nh-section nh-leaders-row">
              <div>
                <Sec>League leaders</Sec>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <LeaderPanel title="Passing" accent="#FF5722" tabs={[tab('pass', 'Passing yards', 'PASS YDS'), tab('ptd', 'Passing touchdowns', 'PASS TD')]} />
                  <div style={{ borderTop: '1px solid rgba(26,26,26,0.08)' }} />
                  <LeaderPanel title="Rushing & receiving" accent="#185FA5" tabs={[tab('rush', 'Rushing yards', 'RUSH YDS'), tab('rec', 'Receiving yards', 'REC YDS')]} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(26,26,26,0.08)', marginTop: 16 }}>
                  <Link href="/nfl/league" style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none' }}>Full leaderboards →</Link>
                  <Link href="/nfl/qb-room" style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A3A3A3', textDecoration: 'none' }}>QB Room →</Link>
                </div>
                {leaders && <div style={{ fontFamily: FONT, fontSize: 9, color: '#A3A3A3' }}>{leaders.season} regular season through Week {leaders.games}. Source: nflverse.</div>}
              </div>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>Comprehensive leaderboard</div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: '#8A8577', marginTop: 2, marginBottom: 8 }}>
                  Every team, expected points added per play. Click a column to sort. Click a team to open its page.{early ? ' Early season: last year is blended in at a fading weight.' : ''}
                </div>
                <TeamTable rows={tableRows} cols={tableCols} note="Team numbers appear once games are played and loaded from nflverse." />
              </div>
            </div>

            <div className="nh-section nh-standings-row">
              <div>
                {standingsData.length ? <Standings data={standingsData} /> : (
                  <div><Sec>Standings</Sec><div style={{ ...card, fontFamily: FONT, fontSize: 12, color: '#A3A3A3', fontStyle: 'italic', textAlign: 'center' }}>Standings appear once the schedule is loaded.</div></div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <TeamQualitySection board={board} teams={teams} />
              </div>
            </div>

            <CoverageSection desk={coverage} board={board} teams={teams} currentSeason={slate?.season ?? new Date().getUTCFullYear()} />

            <div className="nh-section">
              <Sec>Injury alert</Sec>
              <div style={card}>
                {slate?.injuryTotals ? (
                  <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
                    {([['Out', slate.injuryTotals.out, 'Out'], ['Doubtful', slate.injuryTotals.doubtful, 'Doubtful'], ['Questionable', slate.injuryTotals.questionable, 'Questionable']] as const).map(([label, n, st]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <InjuryDot status={st} />
                        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: '#1A1A1A' }}>{n}</span>
                        <span style={{ fontFamily: FONT, fontSize: 9, color: '#8A8577', textTransform: 'uppercase', letterSpacing: '.1em' }}>{label} league-wide</span>
                      </div>
                    ))}
                    <div style={{ flexBasis: '100%', height: 1, background: '#f1eee6' }} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {injuryTeams.length ? injuryTeams.map(x => <Chip key={x.t.id} tone="bad">{x.t.id} · {x.n} starter{x.n === 1 ? '' : 's'} out</Chip>) : <span style={{ fontFamily: FONT, fontSize: 12.5, color: '#8A8577' }}>No starters on this slate are listed Out or Doubtful.</span>}
                    </div>
                  </div>
                ) : <div style={{ fontFamily: FONT, fontSize: 12, color: '#A3A3A3', fontStyle: 'italic' }}>This week&apos;s injury report has not been published yet. It usually lands Wednesday.</div>}
                <div style={{ fontFamily: FONT, fontSize: 9, color: '#A3A3A3', marginTop: 10 }}>Starters (depth-chart #1) listed Out or Doubtful. Source: nflverse injury reports. Full detail is in each game&apos;s Scout Report.</div>
              </div>
            </div>

            <div className="nh-section">
              <Sec>How the Edge works</Sec>
              <div className="tp-grid-2">
                <div style={card}>
                  <p style={{ fontFamily: FONT, fontSize: 15, color: '#1A1A1A', lineHeight: 1.55, margin: 0 }}>
                    We line up ten factors: quarterback form, protection, passing and rushing offense and defense, red zone, turnovers, rest and weather. Then we count how many favor each club. You get a lean, the receipts behind it, and none of the noise.
                  </p>
                  <div style={{ marginTop: 14 }}><SignupForm source="nfl-home" buttonLabel="Get the free weekly read →" /></div>
                </div>
                <div style={card}>
                  <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', marginBottom: 10 }}>Free vs Pro</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {[['Game Preview', 'Free', 'Who is playing, the factor read, both quarterbacks, likely starters, key players.'], ['Scout Report', 'Free signup', 'Availability desk, form trends, snap and personnel shares, situational football.'], ['Pro Scout', 'Pro', 'FTN motion / blitz / play-action, Next Gen Stats depth, matchup clashes, full splits.']].map(([t, tier, blurb]) => (
                      <div key={t} style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 10, alignItems: 'start' }}>
                        <div><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: '#1A1A1A' }}>{t}</div><Chip tone={tier === 'Pro' ? 'yellow' : tier === 'Free' ? 'good' : 'orange'}>{tier}</Chip></div>
                        <div style={{ fontFamily: FONT, fontSize: 12.5, color: '#5b5347', lineHeight: 1.45 }}>{blurb}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="nh-section">
              <Sec>Fantasy context</Sec>
              <div style={{ border: '1.5px dashed #d8d2c4', borderRadius: 12, padding: 18, background: 'rgba(255,255,255,.55)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', background: '#FDE047', color: '#1A1A1A', padding: '3px 7px', borderRadius: 5 }}>PRO</span>
                  <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 20, color: '#1A1A1A' }}>Snap &amp; opportunity context</span>
                </div>
                <p style={{ fontFamily: FONT, fontSize: 13, color: '#5b5347', margin: '8px 0 12px', lineHeight: 1.5, maxWidth: 680 }}>Who is actually on the field and who is getting the ball: snap share and target share by player, week over week. Context only, so you can make your own calls.</p>
                <Link href="/pricing" style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', background: '#1A1A1A', color: '#FAF8F3', padding: '9px 14px', borderRadius: 6, textDecoration: 'none' }}>Unlock with Pro →</Link>
              </div>
            </div>

            <p style={{ fontFamily: FONT, fontSize: 9.5, color: '#A3A3A3', lineHeight: 1.6, maxWidth: 820 }}>
              {DISCLAIMER} Sources: nflverse (schedule, team, injury and play-by-play data), FTN charting via nflverse.
            </p>
          </div>

          <div className="nh-sidebar">
            {news.length ? <NewsFeedSidebar items={news} /> : (
              <div className="nh-section"><Sec>Around the league</Sec><div style={{ fontFamily: FONT, fontSize: 12, color: '#A3A3A3', fontStyle: 'italic' }}>NFL headlines are unavailable right now.</div></div>
            )}
            {articlesTeaser}
          </div>
        </div>
      </div>
    </div>
  )
}
