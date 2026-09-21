// src/components/nfl-edge/preview/GamePreview.tsx
//
// NFL Game Preview: the free door. "Should I care, who is playing, a light why." Server component; the
// interactive pieces live in PreviewClient.tsx. Section order follows the spec: header, team snapshot,
// Edge indicator, starting QBs, depth cards, key players, recent form, CTAs.
//
// Excluded on purpose (Scout-only): snap boards, EPA matrices, FTN blitz/motion, NGS depth, PFF grades, lines.
// Every number has its sample beside it; missing data is an empty state.

import Link from 'next/link'
import type { NflGame } from '@/lib/nfl-edge/games'
import { dateLabel, kickoffLabel, roofKind, weekLabel, isPrimetime } from '@/lib/nfl-edge/games'
import type { NflTeam } from '@/lib/nfl-edge/teams'
import type { EdgeRead } from '@/lib/nfl-edge/factors'
import { leanLabel } from '@/lib/nfl-edge/factors'
import type { QbCardData, TeamPlayers } from '@/lib/nfl-edge/players'
import type { KeyPlayer, Meeting, SnapRow } from '@/lib/nfl-edge/preview'
import { ordinal } from '@/lib/ordinal'
import {
  C, MONO, SANS, DISPLAY, Card, Chip, CompareBar, DISCLAIMER, Empty, Foot, GameHero, LeanPill, NflStyles, RestBadge, Section, TabStrip, TiltGauge, WeatherIcon, roofText,
} from '../ui'
import { DepthGrid, FactorExplorer, KeyPlayerCards, QbCards, type TeamLite } from './PreviewClient'

const lite = (t: NflTeam): TeamLite => ({ id: t.id, nick: t.nick, color: t.color, textOn: t.textOn, logo: t.logo })

const NAV: [string, string][] = [['snapshot', 'Snapshot'], ['edge', 'Edge read'], ['qbs', 'QBs'], ['depth', 'Starters'], ['key', 'Key players'], ['form', 'Recent form'], ['scout', 'Scout']]

export default function GamePreview({
  game, home, away, homeRec, awayRec, read, snapshot, qbs, weapons, homePlayers, awayPlayers, homeKey, awayKey, lastMeeting, homeForm, awayForm, teams,
}: {
  game: NflGame; home: NflTeam; away: NflTeam; homeRec: string; awayRec: string
  read: EdgeRead
  snapshot: SnapRow[]
  qbs: [QbCardData | null, QbCardData | null]     // [away, home]
  weapons: [string | null, string | null]
  homePlayers: TeamPlayers; awayPlayers: TeamPlayers
  homeKey: KeyPlayer[]; awayKey: KeyPlayer[]
  lastMeeting: Meeting | null; homeForm: NflGame[]; awayForm: NflGame[]
  teams: Map<string, NflTeam>
}) {
  const rk = roofKind(game.roof, game.stadium)
  const outdoorsKnown = rk === 'outdoors' && (game.temp != null || game.wind != null)
  const label = leanLabel(read, home.id, away.id)
  const leadCount = read.lean === 'home' ? read.homeCount : read.lean === 'away' ? read.awayCount : 0
  const availability = (p: TeamPlayers) => p.injuries.filter(i => i.status === 'Out' || i.status === 'Doubtful').length

  const resultLine = (g: NflGame, teamId: string) => {
    const isHome = g.homeId === teamId
    const my = isHome ? g.homeScore! : g.awayScore!, their = isHome ? g.awayScore! : g.homeScore!
    const opp = isHome ? g.awayId : g.homeId
    return { text: `${my > their ? 'W' : my < their ? 'L' : 'T'} ${my}–${their} ${isHome ? 'vs' : '@'} ${opp}`, win: my > their, when: `${g.season} · Wk ${g.week}` }
  }

  return (
    <div className="tp-root" style={{ background: C.cream, fontFamily: SANS }}>
      <NflStyles />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 14 }}>
          <Link href="/nfl" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: C.orange, textDecoration: 'none' }}>← NFL slate</Link>
        </div>

        {/* § header ---------------------------------------------------------------- */}
        <GameHero game={game} home={home} away={away} homeRec={homeRec} awayRec={awayRec} kicker={`Game Preview · ${weekLabel(game)} · ${kickoffLabel(game.kickoff)}`}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 18, alignItems: 'center' }}>
            {game.stadium && <Chip tone="dark">{game.stadium}</Chip>}
            <span style={{ background: 'rgba(255,255,255,.94)', borderRadius: 999, padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 9.5, color: '#3a352c', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              <WeatherIcon roof={rk} temp={game.temp} wind={game.wind} size={15} /> {roofText(rk, game.roof)}{game.surface ? ` · ${game.surface}` : ''}
              {outdoorsKnown ? ` · ${game.temp != null ? `${game.temp}°F` : ''}${game.wind != null ? ` · ${game.wind} mph wind` : ''}` : ''}
            </span>
            <RestBadge days={game.awayRest} label={away.id} />
            <RestBadge days={game.homeRest} label={home.id} />
            {game.divGame && <Chip tone="yellow">Division game</Chip>}
            {isPrimetime(game) && <Chip tone="dark">Primetime</Chip>}
            {game.seasonType !== 'REG' && <Chip tone="yellow">Playoffs</Chip>}
          </div>
        </GameHero>
        <TabStrip game={game} active="preview" />
        {rk === 'outdoors' && !outdoorsKnown && (
          <p style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, margin: '8px 2px 0' }}>Temperature and wind are added to the schedule after a game is played, so there is no reading for this game yet.</p>
        )}

        <nav className="tp-nav" aria-label="Preview sections" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(250,248,243,.95)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${C.line}`, margin: '16px -24px 0', padding: '10px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {NAV.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}
        </nav>

        {/* § 01 snapshot ---------------------------------------------------------- */}
        <Section id="snapshot" num="01" title="Team snapshot" sub="How each club has played, side by side. Bar length compares the two clubs; the rank is among all 32.">
          <Card>
            {snapshot.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 116px minmax(0,1fr) 64px', gap: 8, fontFamily: DISPLAY, fontWeight: 800, fontSize: 16 }}>
                  <span style={{ textAlign: 'right' }}>{away.id}</span><span /><span style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9, fontWeight: 400, color: C.faint, alignSelf: 'center' }}>{awayRec} vs {homeRec}</span><span /><span>{home.id}</span>
                </div>
                {snapshot.map(r => (
                  <CompareBar key={r.label} label={r.label} away={r.away} home={r.home} awayDisplay={r.awayDisplay} homeDisplay={r.homeDisplay}
                    awayColor={away.color} homeColor={home.color} higherBetter={r.higherBetter}
                    note={[r.awayRank ? `${away.id} ${ordinal(r.awayRank)}` : null, r.homeRank ? `${home.id} ${ordinal(r.homeRank)}` : null].filter(Boolean).join(' · ') || undefined} />
                ))}
              </div>
            ) : (
              <Empty>Team form is still being built for this season. It fills in as games are played.</Empty>
            )}
            <Foot>Blended season-to-date play-by-play (early in the year, last season is folded in at a fading weight). Deeper trends, snaps and EPA splits are in the Scout Report.</Foot>
          </Card>
        </Section>

        {/* § 02 edge -------------------------------------------------------------- */}
        <Section id="edge" num="02" title="Edge indicator" sub="Up to ten factors, each read head to head. We count which club leans ahead on more of them.">
          {read.ready && read.total > 0 ? (
            <>
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
                  <TiltGauge home={home} away={away} homeCount={read.homeCount} awayCount={read.awayCount} total={read.total} size={200} />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <LeanPill label={label} count={leadCount} total={read.total} ready />
                    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, color: C.ink, marginTop: 8, lineHeight: 1.1 }}>
                      {read.lean === 'even' ? `${read.homeCount} of ${read.total} each way` : `${leadCount} of ${read.total} factors lean ${read.lean === 'home' ? home.id : away.id}`}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', marginTop: 4 }}>
                      {away.id} leads on {read.awayCount} · {home.id} leads on {read.homeCount} · {read.evenCount} even
                    </div>
                    {read.earlyNote && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.orange, marginTop: 8, maxWidth: 520 }}>{read.earlyNote}</div>}
                  </div>
                </div>
                <Foot>The needle points toward the club leading on more factors. It is a count, not a probability. {DISCLAIMER}</Foot>
              </Card>
              <FactorExplorer factors={read.factors} home={lite(home)} away={lite(away)} />
            </>
          ) : (
            <Card><Empty>The factor read needs at least some played games (this season or last) for both clubs. It appears here as soon as that data is in.</Empty></Card>
          )}
        </Section>

        {/* § 03 QBs --------------------------------------------------------------- */}
        <Section id="qbs" num="03" title="Starting quarterbacks" sub="Efficiency, touchdowns, and interceptions, with the sample behind each number.">
          <QbCards qbs={qbs} teams={[lite(away), lite(home)]} weapons={weapons} />
          <Foot>Quarterbacks come from the game record when set, otherwise the depth chart. Passing EPA and CPOE are nflverse play-by-play figures. Passing Lab depth is coming to Pro.</Foot>
        </Section>

        {/* § 04 depth ------------------------------------------------------------- */}
        <Section id="depth" num="04" title="Likely starters" sub="Position pills, injury dots and last-game snap share. Tap a player for the season and last three games.">
          <div className="tp-grid-2">
            {([[away, awayPlayers], [home, homePlayers]] as [NflTeam, TeamPlayers][]).map(([t, p]) => {
              const all = [...(p.qb ? [p.qb] : []), ...p.skill, ...p.ol, ...p.defense]
              const out = availability(p)
              return (
                <Card key={t.id} title={`${t.nick} · offense, line, defense`} note={out ? `${out} Out / Doubtful on the report` : 'no Out / Doubtful designations'}>
                  <DepthGrid side={all} team={lite(t)} />
                  <div style={{ display: 'flex', gap: 12, fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 10, flexWrap: 'wrap' }}>
                    <span>● Out</span><span style={{ color: '#E58A2B' }}>● Doubtful / DNP</span><span style={{ color: '#c9a400' }}>● Questionable / limited</span><span style={{ color: C.good }}>● Full / none</span>
                  </div>
                </Card>
              )
            })}
          </div>
          <Foot>{homePlayers.depthAsOf}. The full injury desk with practice status is in the Scout Report.</Foot>
        </Section>

        {/* § 05 key players ------------------------------------------------------- */}
        <Section id="key" num="05" title="Key players" sub="Three skill players per side, with what the opposing defense means for them in plain English.">
          <div className="tp-grid-2">
            <Card title={`${away.nick} · vs ${home.nick}`}><KeyPlayerCards players={awayKey} team={lite(away)} /></Card>
            <Card title={`${home.nick} · vs ${away.nick}`}><KeyPlayerCards players={homeKey} team={lite(home)} /></Card>
          </div>
          <Foot>Players are ranked by touches (targets plus carries) per game; the chip compares the opposing unit&apos;s rank in EPA allowed. Descriptions of usage and matchup, not predictions.</Foot>
        </Section>

        {/* § 06 recent form ------------------------------------------------------- */}
        <Section id="form" num="06" title="Recent form &amp; last meeting">
          <div className="tp-grid-3">
            <Card title="Last meeting">
              {lastMeeting ? (
                <div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24 }}>
                    {teams.get(lastMeeting.game.awayId)?.id} {lastMeeting.game.awayScore} – {lastMeeting.game.homeScore} {teams.get(lastMeeting.game.homeId)?.id}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 4 }}>{lastMeeting.game.season} · {weekLabel(lastMeeting.game)} · {dateLabel(lastMeeting.game.gameday)}</div>
                  <Link href={`/nfl/${lastMeeting.game.slug}/postgame`} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.orange, textDecoration: 'none', fontWeight: 700, display: 'inline-block', marginTop: 10 }}>Postgame report →</Link>
                </div>
              ) : <Empty>These clubs have not met in the last two seasons.</Empty>}
            </Card>
            {([[away, awayForm], [home, homeForm]] as [NflTeam, NflGame[]][]).map(([t, gs]) => (
              <Card key={t.id} title={`${t.nick} · last ${gs.length || 2}`}>
                {gs.length ? gs.map(g => {
                  const r = resultLine(g, t.id)
                  return (
                    <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: `1px solid ${C.soft}` }}>
                      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: r.win ? C.good : C.bad }}>{r.text}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{r.when}</span>
                    </div>
                  )
                }) : <Empty>No completed games on record.</Empty>}
              </Card>
            ))}
          </div>
        </Section>

        {/* § 07 CTAs -------------------------------------------------------------- */}
        <Section id="scout" num="07" title="Go deeper in Scout">
          <Card>
            <p style={{ fontSize: 14, color: '#3a352c', lineHeight: 1.55, margin: '0 0 14px', maxWidth: 760 }}>
              Injury detail, snap shares, EPA trends, situational football and (for Pro) pressure and motion charting are in the Scout Report.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href={`/nfl/${game.slug}/scout`} style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', background: C.ink, color: '#FAF8F3', padding: '11px 18px', borderRadius: 8, textDecoration: 'none' }}>Open Scout Report →</Link>
              <Link href="/nfl" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.orange, padding: '11px 4px', textDecoration: 'none', fontWeight: 700 }}>Rest of the slate →</Link>
            </div>
          </Card>
        </Section>

        <p style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, textAlign: 'center', marginTop: 40, lineHeight: 1.6, maxWidth: 820, marginInline: 'auto' }}>
          {DISCLAIMER} Sources: nflverse (schedule, rosters, depth charts, injuries, play-by-play, player stats). Ranks are among all 32 clubs.
        </p>
      </div>
    </div>
  )
}
