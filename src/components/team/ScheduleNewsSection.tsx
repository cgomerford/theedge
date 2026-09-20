// src/components/team/ScheduleNewsSection.tsx
//
// § 07 "What's next" (next game + upcoming probables) and § 08 headlines.
// Probable starters marked "predicted" come from the rotation pattern in
// lib/team-rotation.ts and are labelled as predictions, never as confirmed.

import Link from 'next/link'
import type { Team } from '@/lib/teams'
import { MLB_TEAMS } from '@/lib/teams'
import type { MLBNextGame, MLBNewsItem } from '@/lib/mlb-homepage'
import type { ScheduleRow } from '@/lib/team-schedule'
import { Card, Empty, Section, C, MONO, headshot, SANS, DISPLAY } from './ui'

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Probable({ p, predicted }: { p: { personId: number; name: string } | null; predicted?: boolean }) {
  if (!p) return <span style={{ fontSize: 11, color: C.faint, fontStyle: 'italic' }}>TBD</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={headshot(p.personId, 60)} alt="" referrerPolicy="no-referrer" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: C.soft }} />
      <Link href={`/mlb/players/${p.personId}`} style={{ fontSize: 12, color: C.ink, textDecoration: 'none' }}>{p.name}</Link>
      {predicted && <span style={{ fontSize: 8, fontWeight: 700, color: '#854F0B', background: '#FAEEDA', padding: '1px 5px', borderRadius: 4 }}>predicted</span>}
    </span>
  )
}

export function ScheduleSection({ nextGame, schedule }: { nextGame: MLBNextGame | null; schedule: ScheduleRow[] }) {
  return (
    <Section id="schedule" num="07" title="What's next" sub="The next game, the probable starters and the week ahead.">
      <div className="tp-grid-2">
        <Card title="Next game">
          {nextGame ? (
            <div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, lineHeight: 1, color: C.ink }}>{nextGame.isHome ? 'vs' : '@'} {nextGame.opponent}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.mute, marginTop: 4 }}>{nextGame.venue} · {new Date(nextGame.gameTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</div>
              <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
                <Link href={`/mlb/${nextGame.slug}`} style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, textDecoration: 'none' }}>Game preview →</Link>
                <Link href={`/mlb/${nextGame.slug}/scout-report`} style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, textDecoration: 'none' }}>Scout report →</Link>
              </div>
            </div>
          ) : <Empty>No upcoming games found.</Empty>}
        </Card>
        <Card title="Probable starters" note="next 10 days">
          {schedule.length === 0 ? <Empty>No scheduled games in the next 10 days.</Empty> : schedule.slice(0, 8).map(g => {
            const opp = MLB_TEAMS.find(t => t.abbrev === g.opponentAbbrev)
            return (
              <div key={g.gamePk} style={{ display: 'grid', gridTemplateColumns: '50px 56px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${C.soft}` }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.mute }}>{new Date(`${g.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                {opp ? <Link href={`/mlb/teams/${opp.slug}`} style={{ fontFamily: MONO, fontSize: 11, color: C.ink, textDecoration: 'none' }}>{g.isHome ? 'vs' : '@'} {g.opponentAbbrev}</Link> : <span style={{ fontFamily: MONO, fontSize: 11 }}>{g.isHome ? 'vs' : '@'} {g.opponentAbbrev}</span>}
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <Probable p={g.teamProbable} predicted={g.teamProbableSource === 'rotation_pattern'} />
                  <span style={{ fontSize: 10, color: C.faint }}>vs</span>
                  <Probable p={g.opponentProbable} />
                </span>
              </div>
            )
          })}
        </Card>
      </div>
    </Section>
  )
}

export function NewsSection({ team, news, articlesSlot }: { team: Team; news: MLBNewsItem[]; articlesSlot: React.ReactNode }) {
  return (
    <Section id="news" num="08" title="Headlines & analysis">
      <div className="tp-grid-2">
        <Card title={`Latest ${team.short} news`}>
          {news.length === 0 ? <Empty>No recent headlines.</Empty> : news.slice(0, 6).map(item => (
            <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '9px 0', borderTop: `1px solid ${C.soft}`, textDecoration: 'none' }}>
              <div style={{ fontFamily: SANS, fontSize: 14, color: C.ink, lineHeight: 1.35 }}>{item.headline}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, textTransform: 'uppercase', marginTop: 3 }}>{timeAgo(item.published)}</div>
            </a>
          ))}
        </Card>
        <div>{articlesSlot}</div>
      </div>
    </Section>
  )
}
