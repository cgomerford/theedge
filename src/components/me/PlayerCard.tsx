// src/components/me/PlayerCard.tsx: one followed player: header (headshot, name, team and position), last or next game, the season's eight stat tiles, Statcast percentiles (free 3 plus
// Pro placeholders), the best-skill line, and unfollow. Server component. Headshots and club marks stay (George, 2026-10-29). Missing values show "pending"; nothing is invented.
import Link from 'next/link'
import { Headshot, TeamMark } from '@/components/home/Logo'
import UnfollowButton from '@/components/pro/UnfollowButton'
import { MLB_TEAMS } from '@/lib/teams'
import { ordinal } from '@/lib/ordinal'
import type { FollowedPlayer } from '@/lib/follows/me-data'
import type { PctBlock } from '@/lib/follows/percentiles'
import Percentiles from './Percentiles'
import { CARD, EYEBROW, GREY, NUMS, C, SANS, dateShort } from './ui'

const UNIT: Record<string, string> = { hr: 'HR', bb: 'BB', avg: 'AVG', sb: 'SB', ops: 'OPS', k: 'K', era: 'ERA' }

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr)', gap: 8, padding: '7px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13.5, lineHeight: 1.35 }}><span style={{ color: GREY }}>{label}</span><span style={{ minWidth: 0 }}>{children}</span></div>
}

export default function PlayerCard({ p, block, isPro, inSeason, thisYear }: { p: FollowedPlayer; block: PctBlock | undefined; isPro: boolean; inSeason: boolean; thisYear: number }) {
  const team = MLB_TEAMS.find(t => t.id === p.teamId)
  const best = block?.best
  const statText = best && p.raw[best.stat] && p.raw[best.stat] !== 'pending' ? `${p.raw[best.stat]} ${UNIT[best.stat]}` : null
  return (
    <article style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column' }}>
      <Link href={`/mlb/players/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
        <Headshot id={p.id} name={p.name} size={44} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15, fontFamily: SANS }}>{p.name}</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: GREY, marginTop: 3 }}>
            {p.teamAbbrev ? <TeamMark id={p.teamId ?? 0} abbr={p.teamAbbrev} size={18} /> : 'Team pending'}{p.pos ? ` · ${p.pos}` : ''}
          </span>
        </span>
      </Link>

      <div style={{ marginTop: 10 }}>
        {inSeason && <Line label="Next game">{p.next ? <Link href={`/mlb/${p.next.slug}`} style={{ color: C.orange, fontWeight: 800, textDecoration: 'none' }}>{dateShort(p.next.date)} {p.next.label}</Link> : <span style={{ color: GREY }}>pending</span>}</Line>}
        <Line label="Last game">{p.lastGame ? <>{p.lastGame.kind}, {dateShort(p.lastGame.date)} v {p.lastGame.opp}: <b style={NUMS}>{p.lastGame.line}</b></> : <span style={{ color: GREY }}>none in {p.statsSeason}</span>}</Line>
        {inSeason && p.change.n > 0 && p.change.rows && (
          <Line label="What changed, 30 days">{p.change.rows.map(r => <span key={r.label} style={{ marginRight: 8, whiteSpace: 'nowrap', ...NUMS }}>{r.label} <b>{r.last30}</b> <span style={{ color: GREY }}>vs {r.season}</span></span>)}<span style={{ color: GREY, fontSize: 11.5 }}>n {p.change.n}</span></Line>
        )}
      </div>

      <div style={{ ...EYEBROW, margin: '12px 0 6px' }}>{p.statsSeason} season{p.statsSeason < thisYear ? ' (live line in season)' : ''}</div>
      {p.stats.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: GREY }}>Season line pending.</p> : (
        <div className="me-tiles">
          {p.stats.map((t, i) => (
            <div key={i} style={{ background: '#f4f1ea', borderRadius: 8, padding: '7px 2px 6px', textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontSize: t.v.length > 5 ? 13 : 17, fontWeight: 800, lineHeight: 1.1, ...NUMS }}>{t.v}</div>
              <div style={{ fontSize: 10.5, color: GREY, marginTop: 2 }}>{t.l}</div>
            </div>
          ))}
        </div>
      )}

      <Percentiles block={block} isPro={isPro} unit={p.isPitcher ? 'batters faced' : 'plate appearances'} />

      {best && (
        <div style={{ marginTop: 12, borderLeft: `3px solid ${C.orange}`, background: '#faf8f3', padding: '8px 10px', fontSize: 12.5, lineHeight: 1.45 }}>
          <b>Best skill:</b> {best.skill}: {statText ? `${statText}, ` : ''}<span style={NUMS}>{ordinal(best.pct)}</span> pct {best.label}
          <div style={{ color: GREY, marginTop: 3 }}>Change one thing: Coming soon</div>
        </div>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 12, textAlign: 'right' }}>
        <UnfollowButton kind="player" refId={String(p.id)} name={p.name} />
      </div>
    </article>
  )
}
