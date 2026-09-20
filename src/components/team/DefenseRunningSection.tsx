// src/components/team/DefenseRunningSection.tsx
//
// § 05 "Defense, running & the ABS challenge": how the club prevents runs
// with its glove, what it does on the bases, and how it uses ABS challenges.
// The ABS card is an async server component (streamed) backed by the same
// abs_challenge_log module the Scout Report uses.

import { Suspense } from 'react'
import type { Team } from '@/lib/teams'
import type { TeamProfile } from '@/lib/team-profile'
import { getTeamAbs, ordinal } from '@/lib/team-profile'
import { DefensePro } from './ProModules'
import { Card, Empty, Foot, RankBars, Section, Tile, VersusBars, C, MONO, SANS } from './ui'

const pct0 = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)

async function AbsCard({ team, todayET }: { team: Team; todayET: string }) {
  const abs = await getTeamAbs(team.id, todayET)
  if (!abs || abs.season.all.n === 0) {
    return <Card title="ABS challenges"><Empty>No ABS challenge log is available for {team.abbrev} yet.</Empty></Card>
  }
  const s = abs.season, l = abs.league
  const rate = (b: { n: number }, games: number) => (games > 0 ? b.n / games : null)
  const ov = (b: { n: number; ov: number }) => (b.n > 0 ? b.ov / b.n : null)
  const rows = [
    { label: 'Challenges / game', team: rate(s.all, s.games), league: rate(l.all, l.games) },
  ]
  const overturn = [
    { label: 'All challenges', team: ov(s.all) == null ? null : (ov(s.all) as number) * 100, league: ov(l.all) == null ? null : (ov(l.all) as number) * 100 },
    { label: 'Batter-started', team: ov(s.batter) == null ? null : (ov(s.batter) as number) * 100, league: ov(l.batter) == null ? null : (ov(l.batter) as number) * 100 },
    { label: 'Catcher-started', team: ov(s.catcher) == null ? null : (ov(s.catcher) as number) * 100, league: ov(l.catcher) == null ? null : (ov(l.catcher) as number) * 100 },
  ]
  const late = s.all.n > 0 ? (s.late.n / s.all.n) * 100 : null
  const lateLg = l.all.n > 0 ? (l.late.n / l.all.n) * 100 : null

  return (
    <Card title="ABS challenges" note={`through ${abs.coveredThrough.slice(5).replace('-', '/')}`}>
      <div className="tp-tiles-2">
        <Tile label="Challenges" value={String(s.all.n)} sub={`${(s.all.n / Math.max(s.games, 1)).toFixed(2)} per game`} />
        <Tile label="Overturned" value={pct0(ov(s.all))} sub={`${s.all.ov} of ${s.all.n}`} tone={ov(s.all) != null && (ov(s.all) as number) >= (ov(l.all) ?? 0) ? 'good' : 'bad'} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 6 }}>How often they challenge</div>
        <VersusBars color={team.primary_color} unit="" decimals={2} rows={rows} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 6 }}>How often they win (overturned %)</div>
        <VersusBars color={team.primary_color} unit="%" decimals={0} rows={overturn} />
      </div>
      <p style={{ fontFamily: SANS, fontSize: 13, color: '#3a352c', lineHeight: 1.5, margin: '12px 0 0' }}>
        Ranks {ordinal(abs.rank.rate)} of {abs.rank.of} in challenge rate
        {late != null && lateLg != null ? `; ${late.toFixed(0)}% of them come in the 7th or later (MLB ${lateLg.toFixed(0)}%).` : '.'}
      </p>
      <Foot>Source: MLB&apos;s game-feed challenge log (the data behind Baseball Savant&apos;s ABS boards). A description of how the club has used its challenges — not a recommendation.</Foot>
    </Card>
  )
}

export default function DefenseRunningSection({ team, profile: p, todayET, isPro }: { team: Team; profile: TeamProfile; todayET: string; isPro: boolean }) {
  return (
    <Section
      id="defense" num="05" title="Defense, running & ABS"
      sub="Run prevention with the glove, pressure on the bases, and how the club uses its ABS challenges."
    >
      <div className="tp-grid-2">
        <Card title="Defense" note="rank among 30">
          <RankBars metrics={p.ranks.defense} />
          <Foot>OAA (outs above average) is Baseball Savant&apos;s range-based fielding measure, summed for the club. Catcher CS % and steals allowed are the battery&apos;s running-game defense.</Foot>
        </Card>
        <Card title="Outs above average by area" note="team vs MLB average">
          {p.oaa.length === 0 ? <Empty>Positional OAA unavailable.</Empty> : (
            <VersusBars color={team.primary_color} unit="" decimals={1} signed rows={p.oaa} />
          )}
          <Foot>Right of the line = more outs than an average defense records at that area.</Foot>
        </Card>
      </div>

      <div className="tp-grid-2" style={{ marginTop: 16 }}>
        <Card title="Running game" note="rank among 30">
          <RankBars metrics={p.ranks.running} />
          <Foot>Steals are a real-results ranking, not a claim about any single runner. Sprint speed is Baseball Savant&apos;s season figure in feet per second.</Foot>
        </Card>
        <Suspense fallback={<Card title="ABS challenges"><Empty>Loading the ABS challenge record…</Empty></Card>}>
          <AbsCard team={team} todayET={todayET} />
        </Suspense>
      </div>
      <div style={{ marginTop: 16 }}><DefensePro team={team} isPro={isPro} todayET={todayET} /></div>
    </Section>
  )
}
