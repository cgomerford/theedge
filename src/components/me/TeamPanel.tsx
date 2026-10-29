// src/components/me/TeamPanel.tsx: one followed club: its record, its latest roster moves from team_transactions (newest first, up to five), the arbitration / free agents row (Coming
// soon: no data source yet) and the labour-agreement context row. Server component. "Add a team" goes to the existing team picker (Pick your teams).
import Link from 'next/link'
import UnfollowButton from '@/components/pro/UnfollowButton'
import { MLB_TEAMS } from '@/lib/teams'
import { LABOR_DEAL_EXPIRES } from '@/lib/mlb-offseason'
import type { FollowedTeam } from '@/lib/follows/me-data'
import type { TeamTransaction } from '@/lib/team-transactions'
import { CARD, EYEBROW, GREY, NUMS, C, dateShort, dateLong } from './ui'

const Row = ({ children, last }: { children: React.ReactNode; last?: boolean }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13.5, lineHeight: 1.4, ...(last ? {} : {}) }}>{children}</div>

export default function TeamPanel({ team, moves, inSeason, statsSeason, leftToAdd, isPro, pickHref, showAdd }: { team: FollowedTeam; moves: TeamTransaction[]; inSeason: boolean; statsSeason: number; leftToAdd: number; isPro: boolean; pickHref: string | null; showAdd: boolean }) {
  const short = (MLB_TEAMS.find(t => t.slug === team.slug)?.short ?? team.name).toUpperCase()
  const showLabor = new Date().toISOString().slice(0, 10) <= new Date(new Date(`${LABOR_DEAL_EXPIRES}T12:00:00Z`).getTime() + 120 * 86400000).toISOString().slice(0, 10)
  return (
    <section style={{ ...CARD, padding: 16 }} aria-label={`${team.name} panel`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ ...EYEBROW, color: '#1A1A1A', margin: 0 }}>{short} · {inSeason ? 'Team panel' : 'Off-season tracker'}</h2>
        <UnfollowButton kind="team" refId={team.slug} name={team.name} />
      </div>
      <div style={{ marginTop: 8 }}>
        {inSeason && <Row><span>Next game</span>{team.next ? <Link href={`/mlb/${team.next.slug}`} style={{ color: C.orange, fontWeight: 800, textDecoration: 'none' }}>{dateShort(team.next.date)} {team.next.label}</Link> : <span style={{ color: GREY }}>pending</span>}</Row>}
        <Row><span>{statsSeason}</span><b style={{ ...NUMS, fontSize: 15 }}>{team.record ?? 'pending'}</b></Row>
        {moves.length === 0 ? <Row><span style={{ color: GREY }}>No roster moves in the last 30 days.</span></Row> : moves.slice(0, 5).map(m => (
          <div key={m.transaction_id} style={{ display: 'grid', gridTemplateColumns: '54px minmax(0,1fr)', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13.5, lineHeight: 1.4 }}>
            <span style={{ color: GREY, fontSize: 12.5, ...NUMS }}>{dateShort(m.transaction_date)}</span><span>{m.description}</span>
          </div>
        ))}
        <Row><span>Arbitration / free agents</span><span style={{ color: GREY, fontSize: 12.5 }}>Coming soon</span></Row>
        {showLabor && <Row><span>Labour agreement expires {dateLong(LABOR_DEAL_EXPIRES)}</span><span style={{ color: GREY, fontSize: 12.5 }}>context</span></Row>}
      </div>
      {showAdd && (isPro || leftToAdd > 0) && pickHref && <Link href={pickHref} style={{ display: 'inline-block', marginTop: 10, fontSize: 13, fontWeight: 800, color: GREY, textDecoration: 'none' }}>+ Add a team{isPro ? '' : ` (${leftToAdd} left)`}</Link>}
    </section>
  )
}
