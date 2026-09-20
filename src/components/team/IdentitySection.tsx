// src/components/team/IdentitySection.tsx
//
// § 02 "Who they are": the identity radar (12 axes, each a rank among MLB
// clubs turned into a percentile) plus the plainest possible read of it —
// what ranks highest and what ranks lowest across offense, rotation,
// bullpen, defense and running. Descriptive ranks only.

import type { Team } from '@/lib/teams'
import type { Metric, TeamProfile } from '@/lib/team-profile'
import { Card, Empty, Foot, RankChip, Section, C, MONO, SANS } from './ui'
import { TeamRadar } from './charts'
import { IdentityPro } from './ProModules'

type Tagged = { unit: string; m: Metric }

export default function IdentitySection({ team, profile: p, isPro }: { team: Team; profile: TeamProfile; isPro: boolean }) {
  const all: Tagged[] = [
    ...p.ranks.offense.map(m => ({ unit: 'Offense', m })),
    ...p.ranks.rotation.map(m => ({ unit: 'Rotation', m })),
    ...p.ranks.bullpen.map(m => ({ unit: 'Bullpen', m })),
    ...p.ranks.defense.map(m => ({ unit: 'Defense', m })),
    ...p.ranks.running.map(m => ({ unit: 'Running', m })),
  ].filter(x => x.m.rank != null)
  const sorted = [...all].sort((a, b) => (a.m.rank as number) - (b.m.rank as number))
  const strengths = sorted.filter(x => (x.m.rank as number) <= 10).slice(0, 6)
  const soft = [...sorted].reverse().filter(x => (x.m.rank as number) >= 21).slice(0, 6)

  const list = (rows: Tagged[], empty: string) =>
    rows.length === 0 ? <Empty>{empty}</Empty> : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(x => (
          <div key={`${x.unit}-${x.m.key}`} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto 40px', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint }}>{x.unit}</span>
            <span style={{ fontSize: 12, color: '#3a352c' }}>{x.m.label}</span>
            <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700 }}>{x.m.display}</span>
            <RankChip m={x.m} />
          </div>
        ))}
      </div>
    )

  return (
    <Section
      id="identity" num="02" title="Who they are"
      sub="One picture of the whole club. Every spoke is a rank among the 30 clubs (outer edge = best in MLB), so a big shape means a well-rounded team and a lopsided one means a team with a clear identity."
    >
      <div className="tp-grid-2">
        <Card title="Identity radar" note="rank → percentile · hover a spoke">
          <TeamRadar axes={p.radar} color={team.primary_color} />
          <Foot>Offense: run scoring, power (ISO), patience (walk rate), contact (strikeout rate), RISP OPS, stolen bases. Pitching: starter ERA, bullpen ERA, staff strikeout and walk rates. Defense: outs above average, fielding %.</Foot>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="What they do best" note="top-10 ranks">{list(strengths, 'No category ranks in the top 10 of MLB.')}</Card>
          <Card title="Soft spots" note="bottom-10 ranks">{list(soft, 'No category ranks in the bottom 10 of MLB.')}</Card>
        </div>
      </div>
      <div style={{ marginTop: 16 }}><IdentityPro team={team} profile={p} isPro={isPro} /></div>
      <p style={{ fontFamily: SANS, fontSize: 12, color: C.faint, margin: '10px 0 0', fontStyle: 'italic' }}>
        Ranks are among all 30 MLB clubs, season to date. Lower-is-better stats (ERA, strikeout rate for hitters, errors) are ranked so that 1st is always best.
      </p>
    </Section>
  )
}
