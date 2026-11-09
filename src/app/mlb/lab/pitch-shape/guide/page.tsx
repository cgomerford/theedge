// src/app/mlb/lab/pitch-shape/guide/page.tsx
//
// How to read the Pitch Shape Lab: what each part shows, with pictures and short recordings of the tool itself (public/guide/pitch-shape/). Static, no data fetched. The tool's own
// page no longer carries the long explanation, it links here. Descriptive only: nothing on this page says what will happen.

import Link from 'next/link'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { C } from '@/components/team/ui'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata: Metadata = pageMeta({
  title: 'How to read the Pitch Shape Lab',
  description: 'What the Pitch Shape Lab shows and how to read it: the movement map, the numbered spots, choosing a pitcher, Shape Score and runs saved, the five levels, and left and right hands together.',
  path: '/mlb/lab/pitch-shape/guide',
})

const ASSETS = '/guide/pitch-shape'
const WRAP: React.CSSProperties = { maxWidth: 980, margin: '0 auto', padding: '28px 20px 100px' }
const H2: React.CSSProperties = { margin: '44px 0 6px', fontWeight: 800, fontSize: 'clamp(22px,3.4vw,30px)', letterSpacing: '-.02em', lineHeight: 1.1, scrollMarginTop: 80 }
const P: React.CSSProperties = { fontSize: 16, lineHeight: 1.6, color: '#3a352c', margin: '0 0 12px', maxWidth: 760 }
const K: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B83A0E' }

/** A still picture of the tool, with what to look at. */
function Shot({ file, alt, caption, w, h }: { file: string; alt: string; caption: string; w: number; h: number }) {
  return (
    <figure style={{ margin: '14px 0 22px' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${ASSETS}/${file}`} alt={alt} width={w} height={h} loading="lazy" style={{ width: '100%', maxWidth: w, height: 'auto', display: 'block', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff' }} />
      <figcaption style={{ fontSize: 13.5, color: '#5b5347', lineHeight: 1.5, marginTop: 8, maxWidth: Math.max(w, 560) }}>{caption}</figcaption>
    </figure>
  )
}

/** A short recording of the tool in use (an animated image that loops, no sound). */
function Recording({ file, alt, caption, w, h }: { file: string; alt: string; caption: string; w: number; h: number }) {
  return (
    <figure style={{ margin: '14px 0 22px' }}>
      <div style={{ ...K, margin: '0 0 6px' }}>Recording</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${ASSETS}/${file}`} alt={alt} width={w} height={h} loading="lazy" style={{ width: '100%', height: 'auto', display: 'block', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff' }} />
      <figcaption style={{ fontSize: 13.5, color: '#5b5347', lineHeight: 1.5, marginTop: 8 }}>{caption}</figcaption>
    </figure>
  )
}

const TOC: [string, string][] = [
  ['what', 'What it shows'], ['map', 'Read the map'], ['levels', 'The five levels'], ['pitcher', 'Choose a pitcher'], ['read', 'Read a pitcher'],
  ['hands', 'Left, right or both'], ['compare', 'Compare levels'], ['limits', 'What it cannot tell you'], ['terms', 'Words used here'],
]

export default function PitchShapeGuidePage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: C.ink }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Pitch Shape Lab', path: '/mlb/lab/pitch-shape' }, { name: 'How to read it', path: '/mlb/lab/pitch-shape/guide' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={WRAP}>
        <div style={K}>⊕ MLB · Lab · Pitch shape · Guide</div>
        <h1 style={{ margin: '6px 0 10px', fontWeight: 800, fontSize: 'clamp(30px,5vw,46px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>How to read the Pitch Shape Lab</h1>
        <p style={{ ...P, fontSize: 18 }}>A pitch has a shape: how fast it is, how much it rises, how far it runs toward the pitcher’s arm side, and the angle of his arm. The Lab places every pitch of one type by how it moves, shows how often hitters missed pitches that move that way, and lists who throws them. This page walks through each part, with pictures and short recordings of the tool.</p>
        <p style={{ ...P, marginBottom: 18 }}><Link href="/mlb/lab/pitch-shape" style={{ color: '#B83A0E', fontWeight: 800 }}>Open the Pitch Shape Lab →</Link></p>

        <nav aria-label="On this page" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`} style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 4, background: '#fff', color: C.ink, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>{label}</a>)}
        </nav>

        <h2 id="what" style={H2}>What it shows</h2>
        <p style={P}>Choose a pitch (four-seam by default) and the hand it is thrown with. The big square picture is a map of every way that pitch can move. Each small square is one movement, measured in inches: higher on the map means more ride, further right means more run toward the pitcher’s arm side. The colour of a square is the share of swings that missed when hitters swung at pitches moving that way.</p>
        <p style={P}>Two things are worth keeping in mind from the first look. The squares are not the strike zone: they describe movement, not where the pitch crosses the plate. And everything is a description of what has already happened, with the sample behind it, never a forecast.</p>
        <Shot file="map-overview.png" w={643} h={1094} alt="The Pitch Shape Lab movement map for MLB four-seams, with a blue to orange colour scale and three numbered spots" caption="The movement map for MLB right-handed four-seams. Orange squares: hitters missed more often than the average. Blue-grey squares: fewer. Pale squares are near the average. The three numbered circles mark the shapes where the most swings missed." />

        <h2 id="map" style={H2}>Read the map</h2>
        <ul style={{ ...P, paddingLeft: 22 }}>
          <li><b>Axes.</b> Up is more ride (induced vertical break): the ball drops less than a hitter expects. Right is more run toward the pitcher’s arm side. Left-handed pitches are flipped so both arms share one map.</li>
          <li><b>Colour.</b> Each square compares swings that missed with the league average for this pitch, shown under the map. Orange is above it, blue-grey below. Switch “Colour by” to see runs saved, wOBA, xwOBA, average or slugging instead.</li>
          <li><b>Blank and faded squares.</b> A square is blank when too few swings have been recorded there to say anything. Faded squares have a thinner sample. At Spring Training and the Arizona Fall League, thin squares are also pulled toward the league average so one swing cannot colour a square.</li>
          <li><b>Window.</b> Each square reads every pitch within a small distance of it. The Window control sets that distance (±½, ±1 or ±2 inches): larger is smoother, smaller is sharper.</li>
          <li><b>Numbered spots.</b> The circles mark the movements where the most swings missed. Choose one to see what that shape is, how it compares with the league, and who throws it.</li>
          <li><b>Dots.</b> Each dot is a pitcher at his average movement. Orange: his own pitches get more misses than pitches of his shape usually do. Blue: fewer. White: about level. Hover for his name, choose it to open him.</li>
        </ul>
        <Recording file="map-hover.webp" w={960} h={750} alt="Recording: moving the pointer over the map shows the miss rate under it, then choosing a numbered spot opens its read on the right" caption="Moving over the map reads the squares under the pointer (how many swings, what share missed). Choosing spot 1 opens its read on the right: the shape, its miss rate against the average, and the pitchers at it." />

        <h2 id="levels" style={H2}>The five levels</h2>
        <p style={P}>The level bar above the map switches the whole page between MLB, Triple-A, the Florida State League, the Arizona Fall League and Spring Training. Each level is measured against its own hitters and its own league, never mixed into MLB’s numbers, and the badge beside the bar says what that level contains.</p>
        <Shot file="level-bar.png" w={1244} h={56} alt="The level bar with MLB, Triple-A, Florida State League, Arizona Fall League and Spring Training, and a coverage badge for Spring Training" caption="The level bar and coverage badge. The badge gives the season, whether every day was loaded, the dates, and how many tracked pitches the level holds." />
        <div style={{ overflowX: 'auto', margin: '6px 0 16px' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr>{['Level', 'Where the pitches come from', 'What is pending', 'Pitchers listed from'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `2px solid ${C.ink}`, fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {[
                ['MLB', 'Baseball Savant, regular season, 2024 on', 'Nothing', '300 pitches of the type'],
                ['Triple-A', 'Baseball Savant minor-league data, International and Pacific Coast Leagues', 'Nothing', '100 to 300 pitches, by view'],
                ['Florida State League', 'Baseball Savant minor-league data, Single-A', 'Nothing', '100 to 300 pitches, by view'],
                ['Spring Training', 'Baseball Savant, spring games between two major-league clubs (college, World Baseball Classic and NPB games left out)', 'Arm angle, xwOBA', '30 pitches of the type'],
                ['Arizona Fall League', 'The MLB Stats API game feed (the league is not on Baseball Savant); parks the feed does not track contribute no pitches', 'Arm angle, run values, xwOBA, so Shape Score and runs saved', '30 pitches of the type'],
              ].map(r => <tr key={r[0]} style={{ borderBottom: `1px solid ${C.line}`, verticalAlign: 'top' }}>{r.map((c, i) => <td key={i} style={{ padding: '8px 10px', fontWeight: i === 0 ? 800 : 400 }}>{c}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <p style={P}>“Pending” means the source does not carry the figure, so the Lab shows the word instead of a number. It is never filled in from another level.</p>
        <Recording file="levels.webp" w={960} h={750} alt="Recording: choosing each level in turn, MLB, Triple-A, Florida State League, Arizona Fall League and Spring Training, and the map and badge changing each time" caption="Switching level redraws the map from that level’s own pitches and changes the badge. The map is smaller at the exhibition levels because they are a few weeks of games." />

        <h2 id="pitcher" style={H2}>Choose a pitcher</h2>
        <p style={P}>Below the map, “Find me a pitcher” lists real pitchers. Choose a lens (for example, strong shape with results that trail it), narrow it with the filters (ERA, xERA, Shape Score, role, years since debut, ESPN rostered), or shuffle six. Searching a name finds any pitcher at the chosen level. At the minor-league and exhibition levels, “Refine” narrows by MLB career facts: who has not made the jump, who was sent down, who was traded.</p>
        <Shot file="finder.png" w={585} h={900} alt="Find me a pitcher: a lens selector, filters, and a row of pitcher cards each with a headshot, Shape Score, ERA, xERA and ESPN rostered percentage" caption="Each card shows a pitcher’s Shape Score, ERA, xERA, how many pitches of this type he has thrown and the share of ESPN fantasy leagues that roster him. Choosing a card puts him on the map and opens his read." />
        <Recording file="pick-pitcher.webp" w={960} h={750} alt="Recording: choosing a pitcher card, the map showing only his dot, and his read opening" caption="Choosing a pitcher cuts the map to his dot and opens his read." />

        <h2 id="read" style={H2}>Read a pitcher</h2>
        <p style={P}>The read compares what a pitcher’s pitch has done with what pitches shaped like it have done across the league.</p>
        <ul style={{ ...P, paddingLeft: 22 }}>
          <li><b>His shape.</b> Average speed, ride, run and arm angle, and how much each varies from pitch to pitch.</li>
          <li><b>Runs saved per 100 pitches.</b> The change in run expectancy Statcast records on each pitch, for the league’s pitches minus the pitch window’s, so higher is better for the pitcher. It counts run expectancy as runs; it is a measure of what happened on this pitch only.</li>
          <li><b>Shape Score (1 to 99).</b> Where the runs saved by pitches shaped like his rank among all the shapes pitchers throw. It rates the shape, not the pitcher.</li>
          <li><b>Ahead or behind his shape.</b> Underperforming means his own results trail what the shape has produced by more than 0.4 runs per 100; outperforming means he beats it. The comparison always shows the sample behind each side.</li>
          <li><b>Small sample.</b> A figure from few pitches is shown with a thin-sample flag, not hidden.</li>
        </ul>
        <Shot file="pitcher-read.png" w={1240} h={1500} alt="A pitcher read: his shape numbers, Shape Score, runs saved against his shape, and his results against what his shape has produced" caption="A pitcher’s read. The right-hand column of each comparison is what league pitches shaped like his have produced; the left is his own." />

        <h2 id="hands" style={H2}>Left, right or both</h2>
        <p style={P}>“Thrown by” sets the arm. Run is stored arm-side positive for both arms, so a left-hander’s four-seam and a right-hander’s share one map. Choosing Both adds the two hands together square by square, lists pitchers of both arms, and shows the level comparison for each arm in turn. Each pitcher keeps his own hand and his own Shape Score, ranked among his own arm. The plate view, which depends on the arm, shows one hand at a time.</p>
        <Recording file="both-hands.webp" w={960} h={750} alt="Recording: choosing Right, Left and then Both for Thrown by, and the map and the pitcher count changing" caption="Right, then Left, then Both. The intro line, the map and the number of matching pitchers follow the choice." />

        <h2 id="compare" style={H2}>Compare levels</h2>
        <p style={P}>Lower on the page, three views put the levels side by side.</p>
        <ul style={{ ...P, paddingLeft: 22 }}>
          <li><b>Average shape by level.</b> Each level’s pitch-weighted average speed, ride, run and arm angle, with how far it sits from MLB.</li>
          <li><b>The maps side by side.</b> One blue-to-red scale on every map, so a redder map is a level where hitters swung more (or missed more) and a bluer one fewer. Hover one map and the same spot is read on the others.</li>
          <li><b>The same pitchers at two levels.</b> Pitchers who threw the pitch at both levels, and how his average shape changed.</li>
        </ul>
        <Shot file="maps-side-by-side.png" w={1244} h={430} alt="Five movement maps side by side, MLB, Triple-A, Florida State League, Arizona Fall League and Spring Training, on one blue to red scale" caption="The same pitch at five levels on one blue-to-red scale. Misses are measured within each level, so read across the maps as where hitters behaved differently, not as one combined average." />
        <Shot file="average-shape.png" w={1252} h={397} alt="Table of average shape by level with velocity, ride, run, arm angle and whiffs per swing, and the difference from MLB" caption="Average shape by level. The small figure under each row is the difference from MLB. Arm angle is pending at Spring Training and the Arizona Fall League." />

        <h2 id="limits" style={H2}>What it cannot tell you</h2>
        <ul style={{ ...P, paddingLeft: 22 }}>
          <li>It does not say what a pitcher or a pitch will do next. It describes what pitches of a shape have done.</li>
          <li>Location, sequencing, deception, defense and ballpark are not in the shape. A pitcher whose results trail his shape may differ on any of them.</li>
          <li>Levels are not on one scale: each is measured against its own hitters and parks. Compare shapes directly; compare results only within a level.</li>
          <li>Spring Training and the Arizona Fall League are a few weeks of games, with a small minimum sample. Read each figure beside its sample.</li>
        </ul>

        <h2 id="terms" style={H2}>Words used here</h2>
        <dl style={{ ...P, display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) minmax(0, 1fr)', gap: '8px 16px' }}>
          {[
            ['Ride', 'Induced vertical break, in inches. More ride means the pitch drops less than a hitter expects.'],
            ['Run', 'Horizontal break toward the pitcher’s arm side, in inches.'],
            ['Arm angle', 'The angle of the pitcher’s arm at release, in degrees. Available at MLB, Triple-A and the Florida State League.'],
            ['Whiffs per swing', 'Of the swings at a pitch, the share that missed.'],
            ['Runs saved per 100', 'League run expectancy minus the window’s, per 100 pitches. Higher is better for the pitcher.'],
            ['Shape Score', 'A 1 to 99 rank of a shape’s runs saved among the shapes pitchers throw.'],
            ['xwOBA', 'Expected weighted on-base average from the speed and angle of contact.'],
            ['Window', 'How far around a square the map reads, in inches.'],
          ].map(([t, d]) => <div key={t} style={{ display: 'contents' }}><dt style={{ fontWeight: 800 }}>{t}</dt><dd style={{ margin: 0 }}>{d}</dd></div>)}
        </dl>

        <p style={{ ...P, marginTop: 36, fontSize: 13, color: '#8a8275' }}>Source: Baseball Savant / Statcast and the MLB Stats API. Built on public game data. Independent, not affiliated with MLB.</p>
      </div>
    </main>
  )
}
