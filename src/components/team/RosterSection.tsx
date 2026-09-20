// src/components/team/RosterSection.tsx
//
// § 06 "The roster": how the club is built (age, birth country), who is hurt,
// what moves it has made, and who is coming up through the system. Reuses the
// existing, already-verified data functions (getTeamComposition,
// getTeamTransactions, getAffiliateStandouts) — restyled, not re-fetched.

import type { Team } from '@/lib/teams'
import type { TeamComposition } from '@/lib/team-composition'
import type { TeamTransaction } from '@/lib/team-transactions'
import type { AffiliateStandout, MinorLeader } from '@/lib/team-minors'
import { Card, Empty, Foot, Section, C, MONO, SANS, headshot } from './ui'
import { Donut } from './charts'
import { RosterPro } from './ProModules'
import type { TeamProfile } from '@/lib/team-profile'
import Link from 'next/link'

const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function MinorList({ title, rows }: { title: string; rows: MinorLeader[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, marginBottom: 5 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={r.personId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, padding: '2px 0' }}>
          <span>{i + 1}. {r.name}{r.age ? <span style={{ color: C.faint }}> ({r.age})</span> : ''}</span>
          <b style={{ fontFamily: MONO }}>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

export default function RosterSection({ team, profile, isPro, composition, ilList, moves, minors }: {
  team: Team; profile: TeamProfile; isPro: boolean; composition: TeamComposition | null; ilList: TeamTransaction[]; moves: TeamTransaction[]; minors: AffiliateStandout[]
}) {
  const slices = (xs: { label: string; count: number; color: string }[]) => xs.map(x => ({ label: x.label, value: x.count, color: x.color }))
  return (
    <Section
      id="roster" num="06" title="The roster"
      sub="How the club is built, who is on the injured list, and who is coming up behind them."
    >
      <div className="tp-grid-2">
        <Card title="Age of the 40-man" note={composition ? `${composition.rosterSize} players` : undefined}>
          {composition && composition.ageGroups.length > 0 ? <Donut slices={slices(composition.ageGroups)} center={String(composition.rosterSize)} /> : <Empty>Roster composition unavailable.</Empty>}
        </Card>
        <Card title="Where they are from" note="birth country">
          {composition && composition.nationality.length > 0 ? <Donut slices={slices(composition.nationality)} /> : <Empty>Roster composition unavailable.</Empty>}
        </Card>
      </div>

      <div className="tp-grid-2" style={{ marginTop: 16 }}>
        <Card title="Injured list" note={`${ilList.length} recent placements`}>
          {ilList.length === 0 ? <Empty>No recent injured-list placements.</Empty> : ilList.slice(0, 8).map(tx => (
            <div key={tx.transaction_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.soft}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={headshot(tx.player_id, 60)} alt="" referrerPolicy="no-referrer" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', background: C.soft }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Link href={`/mlb/players/${tx.player_id}`} style={{ fontSize: 12, fontWeight: 600, color: C.ink, textDecoration: 'none' }}>{tx.player_name}</Link>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{short(tx.transaction_date)}{tx.injury_reason ? ` · ${tx.injury_reason}` : ''}</div>
              </div>
              <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 9, fontWeight: 700, background: '#FAEEDA', color: '#412402', padding: '2px 6px', borderRadius: 5 }}>{tx.il_days ? `IL-${tx.il_days}` : 'IL'}</span>
            </div>
          ))}
        </Card>
        <Card title="Latest moves" note="last 30 days">
          {moves.length === 0 ? <Empty>No recent roster moves.</Empty> : moves.slice(0, 8).map(tx => (
            <div key={tx.transaction_id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.soft}`, alignItems: 'baseline' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, width: 46, flexShrink: 0 }}>{short(tx.transaction_date)}</span>
              <span style={{ fontSize: 12, color: C.ink }}><b>{tx.player_name}</b> — {tx.category.toLowerCase()}{tx.is_milb_move && tx.to_affiliate_level ? ` to ${tx.to_affiliate_level}` : tx.to_team_name ? ` to ${tx.to_team_name}` : ''}</span>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}><RosterPro team={team} profile={profile} isPro={isPro} /></div>

      <div style={{ marginTop: 22 }}>
        <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 10 }}>The pipeline · {team.name} minor-league affiliates</div>
        {minors.length === 0 ? <Card><Empty>No affiliate data available right now.</Empty></Card> : (
          <div className="tp-grid-2">
            {minors.map(m => (
              <Card key={m.affiliateId}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{m.level} · {m.affiliateName}</div>
                </div>
                <div className="tp-tiles-2" style={{ gap: 14 }}>
                  <MinorList title="Top OPS" rows={m.topOPS} /><MinorList title="Top HR" rows={m.topHR} />
                  <MinorList title="Top ERA" rows={m.topERA} /><MinorList title="Top K" rows={m.topK} />
                </div>
                {m.youngPerformers.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.soft}` }}>
                    <MinorList title="To watch · age 23 & under" rows={m.youngPerformers} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        <Foot>Real season stats per affiliate from the MLB Stats API.</Foot>
      </div>
    </Section>
  )
}
