// src/app/why-edge/page.tsx
//
// "Why x9Lab": what the site is for and what is on it. Server-rendered, plain divider rows, no prices (the price lives on /pricing only).
// Every feature named here exists in the code; keep it that way when this page is edited.
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { pageMeta } from '@/lib/seo'
import { FREE_FOLLOW_LIMITS } from '@/lib/pricing'

export const metadata = pageMeta({
  title: 'Why x9Lab',
  description: 'x9Lab turns advanced baseball stats into tables, charts and graphics a fan can read, with the sample size beside every number. Built on public game data.',
  path: '/why-edge',
})

const BELIEFS: { name: string; body: string }[] = [
  {
    name: 'Advanced stats, made readable',
    body: "Front offices have had pitch-level data for years. Most fans meet it as a wall of columns. x9Lab lays the same numbers out as tables, charts and graphics you can take in at a glance, with the full depth one click away for people who want it. Short written notes support the numbers; they don't replace them.",
  },
  {
    name: 'The sample is always visible',
    body: 'A rate with no count behind it is easy to misread. Here every stat carries the number of pitches or plate appearances behind it, shown on hover or in a footnote. When the sample is too small to mean much, the number is marked with a red asterisk, or the page says "Small sample" instead of showing a rate. Charts built from pitch data say how recent the data is.',
  },
  {
    name: 'Description, not advice',
    body: "Pages say what players and pitchers have done, and in how many chances. They don't say what will happen, and they aren't for placing wagers. It is information about how baseball is being played.",
  },
  {
    name: 'Empty beats made up',
    body: 'If a number is not available, the page says so. A block marked Pending is a block we have not finished, never a guess dressed up as data.',
  },
  {
    name: 'Built on public game data',
    body: 'Pitch-level data from Baseball Savant and box scores and schedules from the MLB Stats API, all of it public. Independent, not affiliated with MLB.',
  },
]

const FEATURES: { name: string; body: string; href: string }[] = [
  { name: 'Game pages', body: 'Each game has a Preview with both starters and their pitch mix, then tabs for Pitchers, Batters, Bullpen and park, and the Series. Hot zones are drawn on a strike-zone map, bullpen use is counted from the box scores, and the park shows how it plays for hits.', href: '/mlb' },
  { name: 'Scout reports and recaps', body: 'The pre-game scout report, and after the game a recap: the linescore, who got the decisions, pitching lines, how the starters mixed their pitches against their season, and the plate appearances that mattered most.', href: '/mlb#scout-reports' },
  { name: 'Pitching Lab and Batting Lab', body: "A pitcher's arsenal, shape, location and sequencing. A batter's contact, swing, approach, outcomes, platoon splits, spray chart and results against each pitch type. Both open on an overview page for any player.", href: '/mlb/lab/pitching-lab' },
  { name: 'Stats', body: 'Leaderboards for batting, pitching, Statcast and advanced stats, for any season back to 1990, any level from MLB down to Rookie ball, and regular season, postseason, spring training or the All-Star game. Choose extra columns, sort by any of them, and hover a number to see where it ranks.', href: '/mlb/stats' },
  { name: 'Graphs', body: 'With an account, turn any leaderboard into horizontal or vertical bars, a line, or a scatter of one stat against another. Colour the bars by team, show headshots, overlay other years, and download the picture.', href: '/mlb/stats' },
  { name: 'Ask the stats', body: 'Type a question the way you would say it, like "2 out home runs in the 5th inning", "last grand slam in a World Series" or "Juan Soto vs Yankees". It sets the filters for you. A player against a club gets a one-row record with his headshot, games, average, home runs and more, season by season. The same page has a dropdown search for every situation, unlimited and open to everyone.', href: '/mlb/ask' },
  { name: 'Team pages', body: 'Record, run differential and division place, the three things worth knowing, leaders, the next game with its probable pitchers, the park, pitch mix, defence and running, the roster, the schedule and the news, in tabs.', href: '/mlb' },
  { name: 'Scores', body: 'Any day on a calendar, with the final, the decisions and links to the box score and the scout report.', href: '/mlb/scores' },
  { name: 'Your own page', body: `Follow up to ${FREE_FOLLOW_LIMITS.players} players and ${FREE_FOLLOW_LIMITS.teams} teams and see them together.`, href: '/me' },
]

const row: React.CSSProperties = { padding: '14px 0', borderTop: '1px solid #e7e2d8' }
const h2: React.CSSProperties = { margin: '40px 0 4px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }

export default function WhyPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Why x9Lab', path: '/why-edge' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>Why x9Lab</h1>
        <p style={{ margin: '0 0 8px', fontSize: 18, color: '#3a352c', lineHeight: 1.5 }}>
          Baseball already has plenty of numbers. What it lacks is an easy way to read them. x9Lab takes the advanced stats that teams use and puts them in front of fans as tables, charts and graphics, with enough depth left in for the people who want to dig.
        </p>
        <p style={{ margin: 0, fontSize: 15, color: '#8a8275' }}>Between the dense stat sites and the long-form previews: clear visuals, with the sample size shown.</p>

        <h2 style={h2}>What we believe</h2>
        {BELIEFS.map(p => (
          <div key={p.name} style={row}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</div>
            <div style={{ fontSize: 15, color: '#3a352c', marginTop: 2, lineHeight: 1.55 }}>{p.body}</div>
          </div>
        ))}

        <h2 style={h2}>What is on the site</h2>
        {FEATURES.map(f => (
          <div key={f.name} style={row}>
            <Link href={f.href} style={{ fontSize: 17, fontWeight: 800, color: '#1A1A1A', textDecoration: 'none', borderBottom: '2px solid #FF5722' }}>{f.name}</Link>
            <div style={{ fontSize: 15, color: '#3a352c', marginTop: 4, lineHeight: 1.55 }}>{f.body}</div>
          </div>
        ))}

        <h2 style={h2}>Free account and Pro</h2>
        <div style={row}>
          <div style={{ fontSize: 15, color: '#3a352c', lineHeight: 1.55 }}>
            A free account follows players and teams, reads the scout reports and recaps, opens the stats graphs, asks ten questions a day in plain words (five without an account), and opens one full deep module a day. The dropdown search and the leaderboards are unlimited for everyone. Pro opens every deep module, for every player, and makes Ask the stats unlimited. <Link href="/pricing" style={{ color: '#FF5722', fontWeight: 800 }}>See what is in each</Link>.
          </div>
        </div>

        <h2 style={h2}>Who builds it</h2>
        <div style={row}>
          <div style={{ fontSize: 15, color: '#3a352c', lineHeight: 1.55 }}>
            x9Lab is built and run by one person, which is why it moves quickly and says plainly where something is not finished yet. Fixes and requests are welcome. <Link href="/about" style={{ color: '#FF5722', fontWeight: 800 }}>More about x9Lab</Link>.
          </div>
        </div>
      </div>
    </main>
  )
}
