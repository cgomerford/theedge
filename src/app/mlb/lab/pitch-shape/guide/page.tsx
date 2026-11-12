// src/app/mlb/lab/pitch-shape/guide/page.tsx
//
// How to read the Pitch Shape Lab: what each part of the page shows and how to read it, in the order the page shows it (the banner and filters, then the tabs, then a pitcher's story). Static text, no data fetched.
// Descriptive only: nothing on this page says what will happen.

import Link from 'next/link'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { C } from '@/components/team/ui'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata: Metadata = pageMeta({
  title: 'How to read the Pitch Shape Lab',
  description: 'What the Pitch Shape Lab shows and how to read it: the banner and filters, the movement map and its colours, who throws a shape, the levels, the league average for a shape, the leaderboard, a pitcher’s story, comparing pitchers and the fantasy view.',
  path: '/mlb/lab/pitch-shape/guide',
})

const ASSETS = '/guide/pitch-shape'
const WRAP: React.CSSProperties = { maxWidth: 1800, margin: '0 auto', padding: '28px 32px 100px' }
const H2: React.CSSProperties = { margin: '44px 0 6px', fontWeight: 800, fontSize: 'clamp(22px,3.4vw,30px)', letterSpacing: '-.02em', lineHeight: 1.1, scrollMarginTop: 80 }
const P: React.CSSProperties = { fontSize: 16, lineHeight: 1.6, color: '#3a352c', margin: '0 0 12px', maxWidth: 980 }
const K: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B83A0E' }
const UL: React.CSSProperties = { ...P, paddingLeft: 22, listStyleType: 'disc' }
const OL: React.CSSProperties = { ...P, paddingLeft: 22, listStyleType: 'decimal' }
const A: React.CSSProperties = { color: '#B83A0E', fontWeight: 700 }


/** A real screenshot of the page, full width of the column, with what to look at. */
function Shot({ file, alt, caption, w, h }: { file: string; alt: string; caption: string; w: number; h: number }) {
  return (
    <figure style={{ margin: '14px 0 26px' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${ASSETS}/${file}`} alt={alt} width={w} height={h} loading="lazy" style={{ width: '100%', maxWidth: 1100, height: 'auto', display: 'block', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff' }} />
      <figcaption style={{ fontSize: 13.5, color: '#5b5347', lineHeight: 1.5, marginTop: 8, maxWidth: 980 }}>{caption}</figcaption>
    </figure>
  )
}

const TOC: [string, string][] = [
  ['start', 'Start here'], ['banner', 'The banner and filters'], ['map', 'Read the map'], ['players', 'Players'], ['levels', 'Levels'], ['average', 'League average'], ['board', 'Leaderboard'],
  ['fantasy', 'Fantasy'], ['story', 'A pitcher’s story'], ['plate', 'The plate view'], ['compare', 'Compare pitchers'], ['dial', 'Try a different shape'], ['hands', 'Left, right or both'],
  ['limits', 'What it cannot tell you'], ['terms', 'Words used here'],
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
        <p style={{ ...P, fontSize: 18 }}>A pitch has a shape: how fast it is, how much it rises, how far it runs toward the pitcher’s arm side, and the angle of his arm. The Lab places every pitch of one type by how it moves, shows how often hitters missed pitches that move that way, and lists who throws them. This page walks through each part in the order you meet it.</p>
        <p style={{ ...P, marginBottom: 18 }}><Link href="/mlb/lab/pitch-shape" style={{ color: '#B83A0E', fontWeight: 800 }}>Open the Pitch Shape Lab →</Link></p>

        <style>{'.pg-shell{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:40px;align-items:start;margin-top:22px}.pg-toc{position:sticky;top:16px}@media(max-width:1100px){.pg-shell{grid-template-columns:minmax(0,1fr)}.pg-toc{position:static;order:-1}}'}</style>
        <div className="pg-shell">
        <div style={{ minWidth: 0 }}>

        <h2 id="start" style={H2}>Start here</h2>
        <p style={P}>Most visits follow three steps:</p>
        <ol style={OL}>
          <li><b>Choose a pitch.</b> In the panel on the right of the banner, set the level, the pitch type and which pitchers throw it (right-handed, left-handed or both).</li>
          <li><b>Click the map.</b> Red boxes are movements that hitters miss often, blue ones rarely. A click shows what that movement has produced and who throws it.</li>
          <li><b>Open a pitcher.</b> Search a name, click a marked pitcher on the map, or open a row in a table, and the page becomes his story, with his club’s colours, his headshot and his numbers.</li>
        </ol>
        <p style={P}>Two things are worth keeping in mind from the first look. The boxes are not the strike zone: they describe how a pitch moves, not where it crosses the plate. And everything is a description of what has already happened, with the sample behind it, never a forecast.</p>
        <Shot file="v3-top.jpg" w={2100} h={1400} alt="The Pitch Shape Lab league view: a banner for the four-seam with a stat strip, the filters and how to use in a column on the right, and the story tabs below" caption="The league view. Left: the pitch banner, its league numbers and the tabs. Right: the search and filters, then How to use." />
        <p style={P}>The top right of the page has a <b>Page design</b> switch: <b>v3 · story tabs</b> (what this guide describes) and <b>v2 · current</b> (the original single page), so the two can be compared.</p>

        <h2 id="banner" style={H2}>The banner and filters</h2>
        <p style={P}>The banner names the pitch you are looking at, with a spinning ball in the pitch’s own colour stuck to its top corner, and a strip of league numbers: how many pitches and swings are behind it, the league’s whiffs per swing, the typical speed (the middle half of pitches) and the average shape (ride and run). On the right of the banner are the search box and four dropdowns:</p>
        <ul style={UL}>
          <li><b>Find a pitcher.</b> Type a name to open his story.</li>
          <li><b>View.</b> One pitch up close, every pitch type side by side, or one pitch across every level.</li>
          <li><b>Level.</b> MLB, Triple-A, the Florida State League, the Arizona Fall League or Spring Training (see <a href="#levels" style={A}>Levels</a>).</li>
          <li><b>Thrown by.</b> Right-handed, left-handed or both (see <a href="#hands" style={A}>Left, right or both</a>).</li>
          <li><b>Pitch type.</b> Four-seam and sweeper are free; the other pitch types are Pro.</li>
        </ul>


        <h2 id="map" style={H2}>Read the map</h2>
        <p style={P}>The Map tab holds the big picture: every way the pitch can move. Each box is one movement, in inches. Higher means more ride, further right means more run toward the pitcher’s arm side, and the colour is the share of swings that missed at pitches moving that way.</p>
        <ul style={UL}>
          <li><b>Axes.</b> Up is more ride (induced vertical break): the ball drops less than a hitter expects. Right is more run toward the arm side. Left-handed pitches are flipped so both arms share one map.</li>
          <li><b>Colour the map by.</b> Whiffs, wOBA, xwOBA, average, slugging or runs saved, with called strikes plus whiffs, hard-hit, ground-ball rate and contact quality under More. Red is always better for the pitcher and blue is worse. The key beside the map says what each colour means in that measure’s own numbers.</li>
          <li><b>Colour scale.</b> “Stretched to this pitch” spreads the blue-to-red range over what that pitch actually covers, so a sweeper (which misses far more bats than a fastball) is not all one colour. “Fixed league scale” keeps one scale for every pitch so pitches can be compared. A box with too few swings is left blank, never coloured.</li>
          <li><b>Marked pitchers.</b> By default the map marks pitchers with a strong shape (Shape Score 67 or more) whose own results were below it, labelled with their ERA. Switch the set to ERA above xERA, strong shape with little attention, unusual shapes, or none. Click a name to open his story.</li>
          <li><b>Click the map.</b> A dashed box marks the movement you chose. The panel beside the map shows what league pitches inside it have produced and who throws them. Arrow keys move the selected spot.</li>
          <li><b>Hover panel.</b> Under the map, the shape under the cursor, what hitters did against it (with the league average beside it) and how many pitchers have it as their <i>average</i> shape. “No pitcher averages this shape” means nobody’s typical pitch is there; some pitchers may still throw it now and then, and the panel counts those separately.</li>
          <li><b>Filters.</b> Under “Advanced filters”, narrow the map to a speed or arm-angle range and set how wide the comparison window is (±½, ±1 or ±2 inches). The season control chooses one season or all of them where the measure allows.</li>
        </ul>
        <Shot file="v3-map-spot.jpg" w={1456} h={2240} alt="The Map tab with a spot chosen: the colour buttons, the colour key, the map with marked pitchers and the panel on the right with the results at that spot" caption="The Map tab with a spot chosen. The dashed box is the movement you clicked; the panel on the right shows what pitches like it have produced and who throws them." />

        <h2 id="players" style={H2}>Players</h2>
        <p style={P}>Which pitchers have a pitch shaped like the spot you chose, or anywhere in the league. Use the lenses to surface who gets less attention than their shape suggests:</p>
        <ul style={UL}>
          <li><b>Everyone</b> whose <i>average</i> shape falls inside the window.</li>
          <li><b>Strong shape, little attention.</b> Shape Score 67 or more, rostered in under 30% of ESPN leagues, no All-Star or major award.</li>
          <li><b>Results above or below their shape.</b> His own runs saved this season were more than 0.4 per 100 above or below what league pitches with his shape produced.</li>
        </ul>
        <p style={P}>Narrow any lens by name, team, role, pitches thrown, speed range, how widely he is rostered or Shape Score. Every column sorts. <b>+ Compare</b> adds a pitcher to the Compare tab. This describes who gets attention; it is not a ranking of who is better.</p>
        <Shot file="v3-players.jpg" w={1456} h={2100} alt="The Players tab: lenses, a filter bar and a table of pitchers with speed, ride, run, whiffs, Shape Score, against his shape, rostered share and a Compare button" caption="The Players tab: lenses at the top, the filter bar, then a sortable table with a Compare button on every row." />

        <h2 id="levels" style={H2}>Levels</h2>
        <p style={P}>Each level is measured against its own hitters and its own league, never mixed into MLB’s numbers. The Levels tab sets the same pitch side by side across levels (average shape by level, the same pitchers at two levels, and the spot you chose at each level). Results are never compared across levels because the hitters differ, so only shape is compared directly.</p>
        <Shot file="v3-levels.jpg" w={1456} h={2100} alt="The Levels tab: average shape by level, the same pitchers at two levels and the spot at each level" caption="The Levels tab. Shapes are compared across levels; results are only ever read within a level." />
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
        <p style={P}>“Pending” means the source does not carry the figure, so the Lab shows the word instead of a number. It is never filled in from another level. A level shows data only once it has been loaded.</p>

        <h2 id="average" style={H2}>League average</h2>
        <p style={P}>For the spot you chose: what league pitches inside the window have produced, with the window you set (±½, ±1 or ±2 inches), the number of pitches and swings behind it, and a sample badge: <b>strong</b> (200 or more swings), <b>moderate</b> (100 to 199) or <b>thin</b> (under 100). It shows whiffs per swing, runs saved per 100 pitches, wOBA, xwOBA, average and slugging against the league average, and where those pitches cross the plate, with the strike zone outlined. A figure under its minimum sample is left blank rather than estimated.</p>
        <Shot file="v3-average.jpg" w={1456} h={1893} alt="The League average tab: window buttons, the results table against the league average with a sample badge, and where those pitches cross the plate" caption="The League average tab for the spot you chose: the window, the sample badge, the results table and where those pitches cross the plate." />

        <h2 id="board" style={H2}>Leaderboard</h2>
        <p style={P}>Every pitcher with enough of the pitch, in column sets you can switch between: <b>Basics</b> (pitches, speed, whiffs), <b>Shape</b> (speed, ride, run, arm angle, Shape Score) and <b>Results</b> (his runs saved against what his shape produced, the gap, whiffs, wOBA and xwOBA). Filter to those above or below their shape and click any heading to sort.</p>
        <ul style={UL}>
          <li><b>Shape Score</b> (1 to 99) is where the runs saved by league pitches with his shape rank among all the shapes pitchers throw. It rates the shape, not the pitcher.</li>
          <li><b>Gap</b> is his own runs saved this season minus what his shape produced. Green is above the shape by more than 0.4 runs per 100, red is below by more than that, grey is about level.</li>
          <li>The shape side adds up every season we hold; his own results are this season’s. The leaderboard says so above the table.</li>
        </ul>
        <Shot file="v3-leaderboard.jpg" w={1456} h={2100} alt="The Leaderboard tab with Basics, Shape and Results column sets, filters and a sortable table with the gap and its colour" caption="The Leaderboard on the Results column set: every heading sorts, and the gap is coloured only beyond the 0.4 runs per 100 band." />

        <h2 id="fantasy" style={H2}>Fantasy</h2>
        <p style={P}>Two places carry the fantasy facts, and nothing else does. The <b>Fantasy tab</b> lists the league: how widely each pitcher is rostered, his role, innings, ERA, xERA, FIP, the gap between ERA and xERA, and his Shape Score, with lenses for rostered in few leagues, strong shape, ERA above xERA and ERA below xERA. A pitcher’s own <b>Fantasy</b> sub-tab reads his season line against the contact he allowed and lists the pitchers with the closest shape. It describes the season so far; it makes no recommendation about who to roster.</p>
        <Shot file="v3-fantasy.jpg" w={1456} h={2100} alt="The Fantasy tab: lenses, the filter bar and a table of rostered share, role, innings, ERA, xERA, FIP and Shape Score" caption="The league Fantasy tab." />

        <h2 id="story" style={H2}>A pitcher’s story</h2>
        <p style={P}>Choose a pitcher and the page opens on his own banner (his club’s colours, headshot, club badge and key numbers), his pitches as buttons, and a “story so far” line setting his results against his shape. Then seven sub-tabs, each one question:</p>
        <Shot file="v3-pitcher-top.jpg" w={2100} h={1400} alt="A pitcher banner in his club colours with his headshot, club badge, name, links and a stat strip" caption="The pitcher banner: his club’s colours, headshot, badge and the key numbers for the open pitch, with his pitches as buttons and a way back to the league view." />
        <ul style={UL}>
          <li><b>Overview.</b> His results on the open pitch against what league pitches with his shape produced, his full stat line on the pitch, and every other pitch he throws, with column sets for basics, results, plate and contact, and shape.</li>

          <li><b>His shape.</b> His sampled pitches and average on the league map, the league-average ring, and the plate view (below), with his speed, ride, run, arm angle and how much each varies pitch to pitch.</li>
          <li><b>Who else throws it.</b> The pitchers who average this shape, named, and the nearest others marked with how far their average is.</li>
          <li><b>Over the season.</b> Month by month, how far each month’s speed, ride and run were from his own season average, and what the whiffs per swing were in those months, with the pitch and swing counts. Season to season sits underneath. Months under 50 pitches are greyed.</li>

          <li><b>Across levels.</b> His shape at each level he has thrown at. The same arm, so a difference is a change in the pitch.</li>
          <li><b>Why the results.</b> Platoon, speed, extension, arm angle, location, sequencing, and defense and luck, each measured against league pitches with his shape. It names the measured differences; it does not claim a cause.</li>
          <li><b>Fantasy.</b> See above.</li>
        </ul>
        <Shot file="v3-story-overview.jpg" w={1957} h={1895} alt="The Overview sub-tab: his results against his shape, the full stat line and his other pitches" caption="Overview: his results on the open pitch against his shape, his full stat line, and his other pitches with column sets for basics, results, plate and contact, and shape." />
        <Shot file="v3-story-shape.jpg" w={1957} h={2520} alt="The His shape sub-tab: the movement map over the league heat map next to the plate view of his pitches coloured by result, then his numbers and the dial" caption="His shape: the movement map over the league heat map beside the plate view. The dots are his pitches coloured by what happened; “Only this shape” narrows them to the shape you chose." />
        <Shot file="v3-story-who.jpg" w={1957} h={2520} alt="The Who else throws it sub-tab: the pitchers who average this shape, named, and the nearest others" caption="Who else throws it: the pitchers who average this shape are named, and the nearest others are marked with how far away their average is." />
        <Shot file="v3-story-season.jpg" w={1957} h={2392} alt="The Over the season sub-tab: month by month deviation from his season average with whiffs per swing" caption="Over the season: each month’s speed, ride and run against his own season average, with whiffs per swing and the pitch counts." />
        <Shot file="v3-story-levels.jpg" w={1957} h={1424} alt="The Across levels sub-tab: his shape at each level" caption="Across levels: his shape at each level he has thrown at." />
        <Shot file="v3-story-why.jpg" w={1957} h={1950} alt="The Why the results sub-tab: measured differences from league pitches with his shape, each with a status" caption="Why the results: each measured factor against league pitches with his shape, with a plain status and the plate-location grids." />
        <Shot file="v3-story-fantasy.jpg" w={1957} h={1194} alt="The pitcher Fantasy sub-tab: rostered share, role, ERA, xERA and FIP and the closest-shape pitchers" caption="The pitcher’s Fantasy sub-tab." />

        <h2 id="plate" style={H2}>The plate view</h2>
        <p style={P}>Seen from behind the plate. <b>His pitches (dots)</b> draws every pitch of the type he threw that season where it crossed the plate, coloured by what happened: swing and miss, called strike, ball, foul, hit, and in play for an out. Click a result in the key to hide or show it. Switch to one batter side and “inside” and “away” read correctly. <b>Only this shape</b> narrows the dots to the pitches he threw with the shape you chose (within ±½, ±1 or ±2 inches), with his other pitches faint behind them. <b>League heat map for his shape</b> shows where league pitches with that shape crossed the plate instead. The dashed box is a standard zone; the real zone moves with each batter’s height. Dots exist for MLB, Triple-A and the Florida State League.</p>

        <h2 id="compare" style={H2}>Compare pitchers</h2>
        <p style={P}>Choose up to four pitchers with <b>+ Compare</b> or by search. Their average shapes are drawn on the league heat map behind them, and a table lines up their numbers, with each difference measured from the first pitcher. Under it, each pitcher’s plate view. The closer two rings are, the more alike the shapes; the same colour under them means hitters missed those shapes about as often.</p>
        <Shot file="v3-compare-two.jpg" w={1957} h={2380} alt="The Compare tab: average shapes on the league heat map and a table of numbers with the plate view for each pitcher" caption="Compare: the pitchers’ average shapes on the league heat map, a table of their numbers and each pitcher’s plate view." />

        <h2 id="dial" style={H2}>Try a different shape</h2>
        <p style={P}>In a pitcher’s “His shape” tab, move ride and run away from his average (or load another pitcher’s shape) and see what league pitches at that shape have produced next to what his own shape has. It compares what other pitchers’ pitches did; it does not say he can throw the movement or that his results would change. Speed and arm angle are held as they are.</p>

        <h2 id="hands" style={H2}>Left, right or both</h2>
        <p style={P}>“Thrown by” sets the arm. Run is stored arm-side positive for both arms, so a left-hander’s four-seam and a right-hander’s share one map. Choosing Both adds the two hands together square by square and lists pitchers of both arms. Each pitcher keeps his own hand and his own Shape Score, ranked among his own arm. The plate view depends on the arm, so it shows one hand at a time.</p>

        <h2 id="limits" style={H2}>What it cannot tell you</h2>
        <ul style={UL}>
          <li>It does not say what a pitcher or a pitch will do next. It describes what pitches of a shape have done.</li>
          <li>Location, sequencing, deception, defense and ballpark are not in the shape. A pitcher whose results are below his shape may differ on any of them.</li>
          <li>Levels are not on one scale: each is measured against its own hitters and parks. Compare shapes directly; compare results only within a level.</li>
          <li>Shape and month-by-month history exist for MLB 2025 and 2026 for now; league results by shape cover 2024 to 2026. Seasons before that, and start-by-start history, are not loaded, so the page shows nothing for them rather than guessing.</li>
          <li>Spring Training and the Arizona Fall League are a few weeks of games and have no sample minimum, so every number is shown; a figure from a small sample carries a flag. Read each figure beside its sample.</li>
        </ul>

        <h2 id="terms" style={H2}>Words used here</h2>
        <dl style={{ ...P, display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) minmax(0, 1fr)', gap: '8px 16px' }}>
          {[
            ['Ride', 'Induced vertical break, in inches. More ride means the pitch drops less than a hitter expects.'],
            ['Run', 'Horizontal break toward the pitcher’s arm side, in inches.'],
            ['Arm angle', 'The angle of the pitcher’s arm at release, in degrees. Available at MLB, Triple-A and the Florida State League.'],
            ['Whiffs per swing', 'Of the swings at a pitch, the share that missed.'],
            ['Runs saved per 100', 'League run expectancy minus the window’s, per 100 pitches. Higher is better for the pitcher.'],
            ['Shape Score', 'A 1 to 99 rank of a shape’s runs saved among the shapes pitchers throw. It rates the shape, not the pitcher.'],
            ['Gap', 'His own runs saved minus what his shape produced. Above, below or in line, beyond a 0.4 runs per 100 band.'],
            ['Average shape', 'The typical ride and run of a pitcher’s pitch over his season. A pitcher “averages” a shape when that average falls inside the window.'],
            ['Window', 'How far around a box or spot the page reads, in inches (±½, ±1 or ±2).'],
            ['Sample badge', 'Strong, moderate or thin: how many swings are behind a number.'],
            ['xwOBA', 'Expected weighted on-base average from the speed and angle of contact. Lower is better for the pitcher.'],
            ['xERA', 'The ERA a pitcher’s contact, strikeouts and walks would usually give.'],
          ].map(([t, d]) => <div key={t} style={{ display: 'contents' }}><dt style={{ fontWeight: 800 }}>{t}</dt><dd style={{ margin: 0 }}>{d}</dd></div>)}
        </dl>

        </div>
        <nav aria-label="On this page" className="pg-toc" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', display: 'grid', gap: 2 }}>
          <div style={{ ...K, marginBottom: 4 }}>On this page</div>
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`} style={{ padding: '6px 4px', color: C.ink, textDecoration: 'none', fontWeight: 700, fontSize: 13.5, borderBottom: `1px solid ${C.soft}` }}>{label}</a>)}
        </nav>
        </div>

        <p style={{ ...P, marginTop: 36, fontSize: 13, color: '#8a8275' }}>Source: Baseball Savant / Statcast and the MLB Stats API. Built on public game data. Independent, not affiliated with MLB.</p>
      </div>
    </main>
  )
}
