// src/app/how-it-works/page.tsx
//
// How the site turns public data into the pages, how to read them, and how Ask the stats and the lookups work. Server-rendered divider rows.
// Only describe what is built. Sample minimums come straight from src/lib/min-sample.ts so this list can never disagree with the pages.
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { MIN_SAMPLE, type MinSampleKey } from '@/lib/min-sample'
import { FREE_FOLLOW_LIMITS } from '@/lib/pricing'

export const metadata = pageMeta({
  title: 'How it works',
  description:
    'Where the numbers come from, how to read the charts, what a small sample means, and how Ask the stats turns a question into numbers. Built on public game data.',
  path: '/how-it-works',
})

type Row = { name: string; body: string }

const STEPS: Row[] = [
  { name: 'Public game data in', body: 'Schedules, lineups, box scores and play-by-play from the MLB Stats API, and pitch-level Statcast data from Baseball Savant. All of it is public, and none of it is edited by hand.' },
  { name: 'Worked out ahead of time', body: 'The heavy numbers (hot zones, pitch arsenals, park effects, percentile ranks) are calculated overnight and saved, so a page opens with the answer ready instead of fetching and adding up files while you wait. Scores, lineups and probable pitchers are read fresh and kept for a few minutes.' },
  { name: 'Plain numbers out', body: 'Each starter, lineup, bullpen and park is laid out as a table, chart or map, with the number of pitches or plate appearances behind it. If a number is not available the page says so, and a block marked Pending is one we have not finished.' },
  { name: 'Your own page', body: `A free account lets you follow up to ${FREE_FOLLOW_LIMITS.players} players and ${FREE_FOLLOW_LIMITS.teams} teams, read the scout reports and recaps, use the stats graphs, ask questions in plain words and open one full deep look a day.` },
]

const READING: Row[] = [
  { name: 'Hot zone maps', body: "The strike zone is cut into nine squares plus the chase area around it. Each square is shaded from sky blue (below league average) through neutral to red (above), so for a hitter, red is where he does damage. Hover a square for the exact numbers and how many pitches are in it." },
  { name: 'Percentile bars', body: 'A bar shows where a number ranks among MLB players, with the 100th percentile at the far right. The number is bold and coloured from green (high) to red (low). On a stat where lower is better, such as walk rate for a pitcher, it is flipped so green is still good.' },
  { name: 'Pitch colours', body: 'Every pitch type has one colour across the site, and always a text label beside it, never colour alone. The spinning ball beside a pitch shows its spin: how fast, and which way it turns.' },
  { name: 'Pitch mix and count plan', body: 'Pitch mix is the share of a pitcher\'s pitches by type. The count plan shows what he throws in each count, as a bar with the share labelled on each pitch.' },
  { name: 'Park index and hits by park', body: 'The park index compares how a ballpark plays against the others. The hits table ranks each park by hits per game and shows where the hits go: left, centre and right. The index is the runs per game (both teams) in home games at that park, divided by the runs per game the same home teams score and allow away from it, over the last three seasons, times 100. 100 is neutral; 110 means 10% more runs at that park than the same teams see on the road.' },
  { name: 'Bullpen usage', body: "Counted from the box scores: for each reliever, how many pitches on each of the last few days, so you can see who has been used and who is rested. A reliever is any pitcher who entered after the starter." },
]

const ASK: Row[] = [
  { name: 'Say it in words', body: 'Type a question in the box on Ask the stats, such as "2 out home runs in the 5th inning", "ERA with runners in scoring position", "last grand slam in a World Series" or "Juan Soto vs Yankees". The page reads the player, the club, the situation, the year and the game type, shows what it understood, and sets the filters for you.' },
  { name: 'Or use the dropdowns', body: 'Every situation, season and view is also a dropdown on the same page. Searching that way is unlimited and open to everyone. Asking in words just makes it quicker.' },
  { name: 'Player against a club', body: 'A question about one player against one club is answered with his career record against them: games, plate appearances, average, on-base and slugging, home runs, runs batted in and strikeouts, with a season-by-season view.' },
  { name: 'The last time it happened', body: 'Questions that begin "last time" or "last grand slam" look back from today, newest game first, across every game type unless you name one (a World Series, say). They stop as soon as they have the most recent few, so they are quick.' },
  { name: 'Lookups', body: 'Each new question typed in words uses one lookup: 10 a day with an account, 5 without one, unlimited on Pro. Changing the seasons or filters on the same question within 15 minutes is free. A question that returns nothing, or an error, is not counted. The count resets at midnight UK time.' },
  { name: 'Slow first run', body: 'Situations such as outs by inning are built from every plate appearance, which come from Baseball Savant one game day at a time. A new situation across a full season can take a little while the first time; after that the days are stored and it is quick.' },
]

const STATS: Row[] = [
  { name: 'Any season, level and game type', body: 'The Stats page covers any season back to 1990, MLB and every minor-league level down to Rookie ball, and regular season, postseason, spring training or the All-Star game. Statcast and advanced tabs are MLB regular-season data.' },
  { name: 'Qualified players', body: 'A batter qualifies with 3.1 plate appearances per team game, and a pitcher with 1.0 innings per team game, the same rule MLB uses. Untick "Qualified only" to see everyone.' },
  { name: 'Extra columns, sorting and graphs', body: 'Choose extra stats as columns and click a column to sort by it. With an account, turn the table into bars, a line or a scatter of one stat against another, overlay other years, colour by team, and download the picture.' },
]

const SAMPLE_LABELS: Record<MinSampleKey, string> = {
  h2hPA: 'Career head-to-head (plate appearances)',
  batterPercentilePA: 'Batter percentile ranks (plate appearances)',
  hardHitBBE: 'Hard-hit rate (batted balls)',
  pitcherPercentileBF: 'Pitcher percentile ranks (batters faced)',
  arsenalPitchesPerType: 'A pitch in an arsenal (pitches of that type)',
  whiffSwings: 'Whiff rate (swings)',
  zonePitchesSeen: 'Zone maps (pitches seen)',
  zoneCellPitches: 'One square of a zone map (pitches)',
  whatChangedPA: 'What changed, batters (plate appearances)',
  whatChangedBF: 'What changed, pitchers (batters faced)',
  splitPA: 'Splits (plate appearances)',
  teamGames: 'Team three-sentence summary (games)',
  sprayBBE: 'Spray charts (batted balls)',
  vsPitchTypeSeen: 'A batter against a pitch type (pitches seen)',
  shapePitchesPerType: 'Pitch shape (pitches of that type)',
  secondLookGroup: 'Second Look, each group (second at-bats)',
  secondLookLine: 'A Second Look line on a Game Plan Card (pairs)',
  kStructurePAs: 'A pitcher\'s strikeout rate by time through (plate appearances)',
  kStructureKs: 'How a pitcher\'s strikeouts were built by time through (strikeouts)',
  gamePlanFirstPitch: 'Game Plan Card, first-pitch swing rate (0-0 pitches)',
  gamePlanOpenerAbs: 'Game Plan Card, opener line (league at-bats)',
  gamePlanTwoStrikeSwings: 'Game Plan Card, two-strike whiff rate (swings)',
  gamePlanDamageBip: 'Game Plan Card, damage zones (balls in play)',
}

const row: React.CSSProperties = { padding: '14px 0', borderTop: '1px solid #e7e2d8' }
const h2: React.CSSProperties = { margin: '40px 0 4px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }

function Rows({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map(r => (
        <div key={r.name} style={row}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{r.name}</div>
          <div style={{ fontSize: 15, color: '#3a352c', marginTop: 2, lineHeight: 1.55 }}>{r.body}</div>
        </div>
      ))}
    </>
  )
}

export default function HowItWorksPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'How it works', path: '/how-it-works' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>How it works</h1>
        <p style={{ margin: 0, fontSize: 18, color: '#3a352c', lineHeight: 1.5 }}>
          Where the numbers come from, how to read the charts, what a small sample means, and how a question in plain words becomes an answer. For the reasons behind it, see <Link href="/why-edge" style={{ color: '#FF5722', fontWeight: 800 }}>Why x9Lab</Link>.
        </p>

        <h2 style={h2}>From data to page</h2>
        <Rows rows={STEPS} />

        <h2 style={h2}>How to read the charts</h2>
        <Rows rows={READING} />

        <h2 style={h2}>Ask the stats</h2>
        <Rows rows={ASK} />

        <h2 style={h2}>Stats and graphs</h2>
        <Rows rows={STATS} />

        <section id="sample-size" style={{ marginTop: 48, scrollMarginTop: 96 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800 }}>Sample-size minimums</h2>
          <p style={{ margin: '0 0 12px', fontSize: 15, color: '#5b5347', lineHeight: 1.55 }}>
            A rate built on a handful of pitches can swing wildly, so every number on the site shows how many pitches or plate appearances stand behind it, on hover or in a footnote. Below the minimum for that kind of number, the page shows a red asterisk or "Small sample" in place of a rate. The minimums are:
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(Object.entries(MIN_SAMPLE) as [MinSampleKey, number][]).map(([key, n]) => (
              <li key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderTop: '1px solid #e7e2d8', fontSize: 14 }}>
                <span>{SAMPLE_LABELS[key]}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</b>
              </li>
            ))}
          </ul>
          <p style={{ margin: '14px 0 0', fontSize: 14, color: '#8a8275' }}>Batters with fewer than 30 plate appearances in a window always show "Small sample".</p>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: '#8a8275' }}>On the Scout Report a red asterisk means the same thing, and the minimums each tab uses (splits, ABS challenges, steals, alignment, late innings) are listed in the appendix at the bottom of the report.</p>
        </section>
      </div>
    </main>
  )
}
