// src/app/mlb/lab/rotation/page.tsx
//
// Rotation Lab: any club's rotation as a dashboard, with fatigue and workload signals and links into the other labs. Choose a club with ?team=<abbrev>.
// SIGN-UP gate only (no Pro), like the Contact, Sequencing and x9Stuff labs.
// Reads stored rows only (rotation_apps and rotation_pitchers, written by scripts/build_rotation_board.py): no Savant fetch in the render path.
// A static route, so it wins over /mlb/lab/[slug].

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignUpGate from '@/components/SignUpGate'
import { ChartFramePreview } from '@/components/pro/previews'
import RotationLab, { type LeagueLite, type TeamOption } from '@/components/rotation/RotationLab'
import { Empty } from '@/components/team/ui'
import { isSignedIn } from '@/lib/require-signup'
import { MLB_TEAMS } from '@/lib/teams'
import { getLeagueBoard, getRotationData, getTeamRotation } from '@/lib/rotation/data'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'Rotation Lab',
  description: 'Every club\'s rotation in one place: fastball speed, pitch counts, rest and arm slot for each starter, with the signals that suggest fatigue and links into the other labs.',
  path: '/mlb/lab/rotation',
})
export const dynamic = 'force-dynamic'

export default async function RotationLabPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Rotation Lab"
      blurb="See any club's rotation the way its pitching department does: speed, pitch counts, rest and arm slot for each starter, with the signals that point to fatigue."
      preview={<ChartFramePreview title="Rotation signals" x="Outing" y="Fastball speed" />}
      features={['Every starter\'s last three outings set against his season', 'Flags for fastball speed, late-outing speed, pitch count, rest and arm slot', 'One click into the Pitching, Pitch Shape, x9Stuff and Sequencing labs']}
    />
  }
  const sp = await searchParams
  const team = MLB_TEAMS.find(t => t.abbrev === (sp.team ?? '').toUpperCase()) ?? MLB_TEAMS.find(t => t.abbrev === 'PHI')!
  const data = await getRotationData()
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Rotation Lab', path: '/mlb/lab/rotation' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '22px 24px 100px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>Rotation Lab</div>
        <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Is the rotation holding up?</h1>
        <p style={{ margin: '0 0 18px', fontSize: 15, color: '#5b5347', maxWidth: 780 }}>Each starter&apos;s last three outings against the rest of his season: fastball speed, how he finishes an outing, pitch counts, rest and arm slot. A signal says something changed, not why.</p>
        {!data ? <Empty>The rotation data is not loaded yet.</Empty> : <Loaded team={team} data={data} />}
      </div>
    </main>
  )
}

function Loaded({ team, data }: { team: (typeof MLB_TEAMS)[number]; data: NonNullable<Awaited<ReturnType<typeof getRotationData>>> }) {
  const read = getTeamRotation(data, team.abbrev)
  const league: LeagueLite[] = getLeagueBoard(data).map(r => ({
    abbr: r.abbr, name: r.name, id: r.id, flagged: r.flagged, watch: r.watch, steady: r.steady, thin: r.thin, out: r.out, rotation: r.rotation,
    lead: r.lead ? { name: r.lead.name, why: r.lead.signals.filter(s => s.key !== 'miss' && (s.level === 'watch' || s.level === 'flag')).slice(0, 2).map(s => `${s.label.toLowerCase()} ${s.value}`).join(', ') } : null,
  }))
  const teams: TeamOption[] = MLB_TEAMS.map(t => ({ abbr: t.abbrev, name: t.name, group: `${t.league} ${t.division}` }))
  return <RotationLab key={team.abbrev} team={{ abbr: team.abbrev, name: team.name, id: team.id, primary: team.primary_color, text: team.text_on_primary }}
    teams={teams} read={read} league={league} asOf={data.asOf} season={data.season} />
}
