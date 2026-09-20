// src/components/team/TeamPage.tsx
//
// The redesigned team page: a full profile of the club — its season, its
// identity, its pitching staff, offense, defense/running/ABS, roster and
// schedule — told mostly through ranks, charts and tables. Replaces the old
// TeamDugoutView (now in components/archive/).
//
// Server component. Everything below the hero is a section component that
// takes the already-built TeamProfile; the two slow pieces (ABS record and
// pitch mix) are async children behind <Suspense> inside their sections.
//
// Responsive layout: plain CSS @media in one <style> block (Tailwind
// responsive classes are unreliable under Turbopack — CLAUDE.md).
//
// Gating: the base page is free. Each section ends with a Pro "expand" panel
// (components/team/ProModules.tsx) — `isPro` is a REQUIRED prop, never defaulted,
// and Pro data is only fetched when it is true.

import Link from 'next/link'
import type { Team } from '@/lib/teams'
import type { TeamProfile } from '@/lib/team-profile'
import type { TeamComposition } from '@/lib/team-composition'
import type { TeamTransaction } from '@/lib/team-transactions'
import type { AffiliateStandout } from '@/lib/team-minors'
import type { MLBNextGame, MLBNewsItem } from '@/lib/mlb-homepage'
import type { ScheduleRow } from '@/lib/team-schedule'
import HeroSection from './HeroSection'
import SeasonSection from './SeasonSection'
import IdentitySection from './IdentitySection'
import StaffSection from './StaffSection'
import OffenseSection from './OffenseSection'
import DefenseRunningSection from './DefenseRunningSection'
import RosterSection from './RosterSection'
import { ScheduleSection, NewsSection } from './ScheduleNewsSection'
import { C, MONO, SANS } from './ui'

const NAV: [string, string][] = [
  ['season', 'Season'], ['identity', 'Identity'], ['pitching', 'Pitching'], ['offense', 'Offense'],
  ['defense', 'Defense & ABS'], ['roster', 'Roster'], ['schedule', "What's next"], ['news', 'News'],
]

const CSS = `
.tp-root b,.tp-root strong,.tp-root h1,.tp-root h2,.tp-root h3,.tp-root .font-bold,.tp-root .font-semibold,.tp-root .font-black,.tp-root .font-serif{font-family:var(--font-outfit),system-ui,sans-serif !important;font-variant-numeric:tabular-nums}
.tp-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.tp-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.tp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.tp-tiles-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.tp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.tp-nav a{font-family:${MONO};font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#5b5347;text-decoration:none;padding:6px 10px;border-radius:999px;white-space:nowrap}
.tp-nav a:hover{background:#1A1A1A;color:#FAF8F3}
@media (max-width:900px){
  .tp-grid-2,.tp-grid-3{grid-template-columns:1fr}
  .tp-grid-2>*,.tp-grid-3>*{grid-column:auto !important}
}
`

export default function TeamPage({
  team, profile, season, todayET, isPro, nextGame, schedule, news, composition, ilList, moves, minors, articlesSlot,
}: {
  team: Team
  profile: TeamProfile
  season: number
  todayET: string
  /** REQUIRED, never defaulted — resolved from the subscriber session by the route */
  isPro: boolean
  nextGame: MLBNextGame | null
  schedule: ScheduleRow[]
  news: MLBNewsItem[]
  composition: TeamComposition | null
  ilList: TeamTransaction[]
  moves: TeamTransaction[]
  minors: AffiliateStandout[]
  articlesSlot: React.ReactNode
}) {
  return (
    <div className="tp-root" style={{ background: C.cream, fontFamily: SANS }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 14 }}>
          <Link href="/mlb" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: C.orange, textDecoration: 'none' }}>← Back</Link>
        </div>

        <HeroSection team={team} profile={profile} />

        <nav className="tp-nav" aria-label="Team page sections" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(250,248,243,.95)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${C.line}`, margin: '16px -24px 0', padding: '10px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <SeasonSection team={team} profile={profile} isPro={isPro} />
        <IdentitySection team={team} profile={profile} isPro={isPro} />
        <StaffSection team={team} profile={profile} season={season} isPro={isPro} />
        <OffenseSection team={team} profile={profile} isPro={isPro} season={season} />
        <DefenseRunningSection team={team} profile={profile} todayET={todayET} isPro={isPro} />
        <RosterSection team={team} profile={profile} isPro={isPro} composition={composition} ilList={ilList} moves={moves} minors={minors} />
        <ScheduleSection nextGame={nextGame} schedule={schedule} />
        <NewsSection team={team} news={news} articlesSlot={articlesSlot} />

        <p style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, textAlign: 'center', marginTop: 40, lineHeight: 1.6 }}>
          Ranks are among all 30 MLB clubs, season to date. Sources: MLB Stats API (standings, team, starter/reliever and platoon splits, rosters), Baseball Savant (outs above average, batted-ball types, sprint speed, pitch arsenals), MLB&apos;s ABS challenge log. Descriptions of what has happened — not predictions.
        </p>
      </div>
    </div>
  )
}
