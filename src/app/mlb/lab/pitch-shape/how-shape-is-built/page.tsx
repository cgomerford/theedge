// src/app/mlb/lab/pitch-shape/how-shape-is-built/page.tsx
//
// Method page for the Pitch Shape Lab: how a league shape map is made from every tracked pitch, in plain language. Static (no data is read), so every number here is a rule of the build, not a count
// that can go stale. The definitions below are copied from the writers that fill the tables (scripts/build_pitch_shape_bins.py, build_pitch_shape_cells.py, src/lib/milb-shape/) and from heatGrid.ts,
// so they describe what the maps actually do. "How shape is used" only describes public tools and published writing: clubs do not publish their internal methods, and nothing here claims they do.
// Describes what pitches do; no prediction language. Still noindex while the lab is being rebuilt.

import Link from 'next/link'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import HeatLegend from '@/components/pitch-shape/HeatLegend'
import { C } from '@/components/team/ui'
import { pageMeta, noindex } from '@/lib/seo'

export const metadata: Metadata = { ...pageMeta({ title: 'How pitch shape is built', description: 'How every tracked pitch becomes a box on a pitch shape map, and how the maps are read.', path: '/mlb/lab/pitch-shape/how-shape-is-built' }), ...noindex() }

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '18px 22px', marginBottom: 18 }
const h2: React.CSSProperties = { margin: '0 0 10px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }
const p: React.CSSProperties = { margin: '0 0 10px', fontSize: 15, lineHeight: 1.55, color: '#3d382f' }
const li: React.CSSProperties = { marginBottom: 8, fontSize: 15, lineHeight: 1.55, color: '#3d382f' }
const code: React.CSSProperties = { background: C.soft, borderRadius: 4, padding: '1px 5px', fontSize: 13.5 }

function Figure() {
  // One pitch lands in one tenth-of-an-inch box; the colour of a box comes from every pitch inside the square window around it.
  return (
    <svg viewBox="0 0 380 300" role="img" aria-label="A grid of small boxes. One pitch sits in one box. A larger square around it marks the smoothing window: every pitch inside the square is used to colour that box." style={{ width: '100%', maxWidth: 420, display: 'block' }}>
      <rect x="40" y="10" width="320" height="250" fill="#FAF8F3" stroke={C.line} />
      {Array.from({ length: 15 }, (_, i) => <line key={`v${i}`} x1={40 + i * 20} y1="10" x2={40 + i * 20} y2="260" stroke={C.soft} />)}
      {Array.from({ length: 12 }, (_, i) => <line key={`h${i}`} x1="40" y1={10 + i * 20} x2="360" y2={10 + i * 20} stroke={C.soft} />)}
      {[[150, 100], [162, 118], [176, 92], [190, 126], [204, 108], [168, 140], [214, 94], [182, 112], [196, 84], [158, 104], [222, 130], [172, 128], [210, 118], [186, 100], [200, 138]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill="#8a8275" />)}
      <rect x="140" y="70" width="80" height="80" fill="#FF5722" fillOpacity=".08" stroke="#FF5722" strokeWidth="1.6" strokeDasharray="5 3" />
      <rect x="170" y="100" width="20" height="20" fill="#B2182B" fillOpacity=".25" stroke="#B2182B" strokeWidth="2" />
      <circle cx="180" cy="110" r="3.6" fill="#1A1A1A" />
      <text x="228" y="62" fontSize="11" fontWeight="700" fill="#B83A0E">window: every pitch in here</text>
      <text x="228" y="76" fontSize="11" fill="#B83A0E">sets this box&apos;s colour</text>
      <path d="M224 80 L196 106" stroke="#B83A0E" strokeWidth="1.2" fill="none" />
      <text x="40" y="282" fontSize="11" fontWeight="700" fill="#5b5347">← GLOVE SIDE · RUN · ARM SIDE →</text>
      <text x="14" y="248" fontSize="11" fontWeight="700" fill="#5b5347" transform="rotate(-90 14 248)">RIDE: stays up ↑</text>
    </svg>
  )
}

const SOURCES: [string, string][] = [
  ['MLB Glossary: Pitch Movement', 'https://www.mlb.com/glossary/statcast/pitch-movement'],
  ['MLB Glossary: Induced Vertical Break', 'https://www.mlb.com/glossary/statcast/induced-vertical-break'],
  ['Baseball Savant: Pitch Movement leaderboard', 'https://baseballsavant.mlb.com/leaderboard/pitch-movement'],
  ['MLB.com: The hot new pitch that’s sweeping across the Majors', 'https://www.mlb.com/news/sweeper-slider-latest-pitching-trend-explained'],
  ['MLB.com: Two Rays relievers rely on changeups, but they’re nothing alike', 'https://www.mlb.com/news/rays-bryan-baker-kevin-kelly-changeup-comparison'],
  ['FanGraphs: Minesweeping, looking for baseball’s next popular pitch', 'https://blogs.fangraphs.com/minesweeping-looking-for-baseballs-next-popular-pitch'],
  ['Baseball Research Journal (SABR), spring 2020: Analytics and Metrics', 'https://s2.smu.edu/~camp/pubs/Dvorocsik_BRJ-2020-Spring-v49_1.pdf'],
]

export default function HowShapeIsBuilt() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <style>{`.hsb-grid{display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:36px;align-items:start}@media(max-width:1050px){.hsb-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1800, margin: '0 auto', padding: '22px 32px 100px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
          <Link href="/mlb/lab/pitch-shape" style={{ fontSize: 13, fontWeight: 700, color: C.orange, textDecoration: 'none' }}>← Back to the pitch shape maps</Link>
          <Link href="/mlb/lab/pitch-shape/guide" style={{ fontSize: 13, fontWeight: 700, color: C.orange, textDecoration: 'none' }}>How to read the lab →</Link>
        </div>
        <h1 style={{ margin: '10px 0 6px', fontSize: 32, fontWeight: 800, letterSpacing: '-0.01em' }}>How pitch shape is built</h1>
        <p style={{ ...p, maxWidth: 1000, fontSize: 16 }}>Every map on the Pitch Shape Lab is made by counting real pitches. Nothing is modelled and nothing is filled in. This page walks through how one pitch becomes a coloured box, what the smoothing window does, and how shape is used in the game.</p>

        <div className="hsb-grid">
          <div style={{ minWidth: 0 }}>
            <section style={card}>
              <h2 style={h2}>From one pitch to one box</h2>
              <ol style={{ margin: 0, paddingLeft: 20 , listStyleType: 'decimal' }}>
                <li style={li}><b>Every pitch is tracked.</b> Statcast follows each pitch in flight, and Baseball Savant publishes one row per pitch. We read the regular season one day at a time, from 2024 to now.</li>
                <li style={li}><b>Each pitch is turned into a shape.</b> Two numbers, both in inches: <b>ride</b> (induced vertical break, how much the pitch stays up compared with a ball thrown with no spin) and <b>run</b> (horizontal break, how far it moves sideways). Run is counted as positive toward the pitcher&apos;s arm side (to the right on the maps) and negative toward his glove side (to the left), so left-handers are flipped to line up with right-handers.
                  <div style={{ marginTop: 6, fontSize: 14, color: '#5b5347' }}>For example, a right-hander&apos;s four-seam that Savant records with vertical movement of 1.35 ft and horizontal movement of −0.70 ft becomes <span style={code}>ride 16.2 in</span> and <span style={code}>run 8.4 in</span> (feet × 12, with the sign flipped for right-handers).</div></li>
                <li style={li}><b>The pitch is filed.</b> By pitch type (four-seam, sweeper and so on) and by the pitcher&apos;s hand, then placed in a box one tenth of an inch wide. A second table also records speed (1 mph steps) and arm angle (10 degree bands) with ride and run in 2-inch steps, which the lab uses for other views.</li>
                <li style={li}><b>What happened is counted.</b> For every box: pitches thrown, swings, whiffs, called strikes, and balls in play. A <b>swing</b> is a swinging strike, a swinging strike blocked, a foul, a foul tip, a ball in play, a foul bunt or a missed bunt. A <b>whiff</b> is a swinging strike, a swinging strike blocked or a missed bunt, so a foul tip counts as a swing but not a whiff. The number on the map is <b>whiffs per swing</b>.</li>
                <li style={li}><b>The window smooths it.</b> One box holds about one pitch, which is far too few to judge. So each box looks at every pitch within a window around it (see below).</li>
                <li style={li}><b>Colour is added.</b> The share of swings that miss is turned into a colour on one fixed scale (shown at the bottom of this page).</li>
              </ol>
            </section>

            <section style={card}>
              <h2 style={h2}>The smoothing window, in plain words</h2>
              <p style={p}>Imagine laying a small square over the map and asking, &ldquo;of all the swings at pitches that moved like this, how many missed?&rdquo; That square is the window. The map offers three sizes: ±0.5, ±1 and ±2 inches (a square 1, 2 or 4 inches wide).</p>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20 , listStyleType: 'disc' }}>
                <li style={li}><b>Smaller window:</b> sharper detail, but each box rests on fewer swings, so the picture is noisier and more boxes at the edges go blank.</li>
                <li style={li}><b>Larger window:</b> a steadier picture, because each box rests on more swings, but fine detail blurs and neighbouring spots look more alike.</li>
                <li style={li}><b>Blank boxes:</b> a box needs at least 40 swings inside its window. Under that it is left blank, never estimated or filled in from somewhere else.</li>
              </ul>
              <p style={p}>The pitches never change when you change the window. Only how far around each box we look changes.</p>
            </section>

            <section style={card}>
              <h2 style={h2}>The levels</h2>
              <ul style={{ margin: 0, paddingLeft: 20 , listStyleType: 'disc' }}>
                <li style={li}><b>MLB:</b> every tracked regular-season pitch from 2024 to now. The map can show the latest season on its own, or all seasons added together for a bigger sample.</li>
                <li style={li}><b>Triple-A and the Florida State League (Single-A):</b> the same build, from Baseball Savant&apos;s minor-league tracking. Of the Single-A leagues only the Florida State League is used.</li>
                <li style={li}><b>Arizona Fall League and Spring Training:</b> short seasons, so samples are smaller, and a few details (such as arm angle) are not available.</li>
                <li style={li}><b>Double-A, High-A and Rookie ball:</b> there is no pitch tracking at these levels, so there are no maps for them.</li>
                <li style={li}>Every level is kept apart. A Triple-A map is never mixed with MLB pitches, because parks, hitters and strike zones differ.</li>
              </ul>
            </section>

            <section style={card}>
              <h2 style={h2}>How shape is used in the game</h2>
              <p style={{ ...p, color: '#5b5347' }}>Clubs do not publish their internal methods, so this section only describes how public tools and published writing use shape.</p>
              <ul style={{ margin: 0, paddingLeft: 20 , listStyleType: 'disc' }}>
                <li style={li}><b>Comparing a pitch with similar pitches.</b> Baseball Savant&apos;s pitch movement leaderboard measures a pitch against others of the same type, within about 2 mph and about half a foot of release extension, because movement depends on speed and release.</li>
                <li style={li}><b>Reading ride by pitch type.</b> For a four-seam fastball, more vertical movement than average means more rise. For breaking balls, sinkers and offspeed pitches, it means more downward movement.</li>
                <li style={li}><b>Telling apart pitches that share a name.</b> Two changeups can look alike by name and still move very differently. MLB.com has compared two Rays relievers&apos; changeups by vertical movement against comparable changeups.</li>
                <li style={li}><b>Designing new pitches.</b> MLB.com&apos;s explainer on the sweeper describes it as pitchers designing new movement profiles, and FanGraphs has written about how similar pitches differ in horizontal and vertical break.</li>
                <li style={li}><b>Sorting pitches into types.</b> Research in the Baseball Research Journal notes that broad classes like slider or changeup still vary in movement, velocity and spin rate.</li>
              </ul>
            </section>

            <section style={card}>
              <h2 style={h2}>What shape does not tell you</h2>
              <ul style={{ margin: 0, paddingLeft: 20 , listStyleType: 'disc' }}>
                <li style={li}>It is not speed. Two pitches with the same shape can be thrown at different speeds.</li>
                <li style={li}>It is not where the pitch crosses the plate. The map plots how a pitch moved, not the strike zone.</li>
                <li style={li}>It describes what already happened, for the sample shown. It is not a forecast for any pitcher.</li>
              </ul>
            </section>

            <section style={card}>
              <h2 style={h2}>Sources</h2>
              <ul style={{ margin: 0, paddingLeft: 20 , listStyleType: 'disc' }}>
                {SOURCES.map(([t, u]) => <li key={u} style={{ ...li, marginBottom: 4 }}><a href={u} target="_blank" rel="noopener noreferrer" style={{ color: '#B83A0E' }}>{t}</a></li>)}
              </ul>
              <p style={{ ...p, marginTop: 10, color: '#5b5347', fontSize: 13.5 }}>Pitch data: Baseball Savant (Statcast), regular season. Counts and the whiff and swing definitions above are the ones the maps use.</p>
            </section>
          </div>

          <aside>
            <section style={card}>
              <h2 style={{ ...h2, fontSize: 17 }}>The window, drawn</h2>
              <Figure />
              <p style={{ ...p, fontSize: 13.5, color: '#5b5347', marginTop: 8 }}>The small dark box holds one pitch. The dashed square is the window: every pitch inside it sets the colour of the dark box. A bigger window means more pitches behind each colour.</p>
            </section>
            <section style={card}>
              <h2 style={{ ...h2, fontSize: 17 }}>The colour scale</h2>
              <HeatLegend />
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
