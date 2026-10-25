// src/app/mlb/lab/pitch-map/page.tsx
//
// "The Pitch Map: where this comes from". A public, static explainer for the Pitching Lab's Shape tab: the idea
// behind the map, how it is built here, and the public work it builds on. Every source below was opened and read
// before it was cited. We found no research or documentation published BY a club, so the page says that plainly
// rather than implying one. Nothing on this page is a prediction and it shows no numbers from the lab.

import type { Metadata } from 'next'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { C, Card, Section } from '@/components/team/ui'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'The Pitch Map: how it works',
  description:
    'How the Pitch Map compares a pitch with every similar pitch in the league, the public research behind the idea, and what the map can and cannot tell you.',
  path: '/mlb/lab/pitch-map',
})

const SOURCES: { id: string; kicker: string; title: string; by: string; what: string; href: string }[] = [
  {
    id: 'statcast',
    kicker: 'MLB Statcast',
    title: 'Pitch Movement (Statcast glossary)',
    by: 'MLB.com',
    what: 'Statcast shows a pitch’s movement with gravity included, and judges it against an “average” built from pitches thrown at a similar velocity and release point. A slower pitch is not better just because it has more time to move. It is the same move our map makes: compare a pitch only with pitches that share its basic shape.',
    href: 'https://www.mlb.com/glossary/statcast/pitch-movement',
  },
  {
    id: 'petriello',
    kicker: 'MLB.com',
    title: 'Ace stuff from names you may not recognize',
    by: 'Mike Petriello, March 1, 2021',
    what: 'Finds pitches that look like a star’s pitches by lining pitches up on five measures (velocity, release height, total movement, active spin and spin direction), comparing left-handers only with left-handers, and leaving results out on purpose. It is explicit that a pitch shaped like an ace’s does not make a pitcher successful: command, deception, health and how his pitches play off each other still matter.',
    href: 'https://www.mlb.com/news/pitchers-who-throw-like-aces',
  },
  {
    id: 'fangraphs',
    kicker: 'FanGraphs Library',
    title: 'Stuff, Location and Pitching Primer',
    by: 'Owen McGrattan, March 10, 2023 (Stuff+ models by Eno Sarris and Max Bay)',
    what: 'Stuff+ grades a pitch only from its physical traits: release point, velocity, vertical and horizontal movement and spin. A secondary pitch is judged against the pitcher’s own main fastball, using the gaps in speed and movement between the two. It is a public example of a model that treats shape, not results, as the thing being measured.',
    href: 'https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer',
  },
  {
    id: 'sabr',
    kicker: 'SABR Analytics Conference',
    title: 'Using Clustering to Find Pitch Subtypes and Effective Pairings',
    by: 'Gregory Dvoroscik, Eno Sarris and Joe Camp, 2020',
    what: 'Groups pitches into 30 subtypes from Statcast movement, velocity and spin (2016 and 2017 seasons, left- and right-handers separately), then looks at how each subtype did when a pitcher also threw each other subtype. The authors say it could help with pitch design, player development and scouting.',
    href: 'https://sabr.org/analytics/presentations/2020',
  },
]

export default function PitchMapAbout() {
  return (
    <main style={{ minHeight: '100vh', background: C.cream }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Pitch Map', path: '/mlb/lab/pitch-map' }]} />
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 24px 100px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: C.orange }}>⊕ MLB · LAB</div>
        <h1 style={{ margin: '2px 0 6px', fontWeight: 800, fontSize: 'clamp(34px,5.6vw,52px)', letterSpacing: '-.02em', lineHeight: 1 }}>The Pitch Map</h1>
        <p style={{ color: '#5b5347', fontSize: 16, maxWidth: 720, margin: '0 0 6px', lineHeight: 1.5 }}>
          Where it comes from, how we build it, and what it can and cannot tell you.
        </p>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          <Link href="/mlb/lab/pitching-lab" style={{ color: C.orange, fontWeight: 700 }}>← Back to the Pitching Lab</Link>
        </p>

        <Section id="thesis" num="01" title="The idea">
          <Card>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#3a352c', margin: '0 0 10px' }}>
              <b>A pitch is, first, a shape.</b> How fast it leaves the hand, how much it rises or sinks, how far it runs, and the arm angle it comes from. Pitches with the same shape have tended to get hitters to swing and miss about as often, and to be hit about as hard, whoever threw them.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#3a352c', margin: '0 0 10px' }}>
              So the fairest way to judge a sinker is to put it next to every other sinker with the same shape. If his sinker gets more whiffs than the league’s sinkers with that shape, something beyond shape is helping: command, sequencing, deception. If it gets fewer, something is holding it back that shape alone does not explain. That gap is the interesting part, and the map shows where it sits.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: C.mute, margin: 0 }}>
              Everything here describes what already happened, with the sample behind it. It does not predict anything.
            </p>
          </Card>
        </Section>

        <Section id="how" num="02" title="How the map is built">
          <Card>
            <ol style={{ margin: 0, paddingLeft: 22, listStyle: 'decimal', fontSize: 14.5, lineHeight: 1.65, color: '#3a352c' }}>
              <li><b>Every pitch becomes a point</b> on two axes: arm-side horizontal break and induced vertical break, in inches (left-handers flipped so arm-side is always to the right). Savant measures both for every pitch.</li>
              <li><b>The league’s pitches of that type and hand</b> fill the map. We store them in 0.1-inch boxes, one table row per season.</li>
              <li><b>Each box is coloured by whiffs per swing</b>, but one 0.1-inch box holds only about one pitch, so a box shows the rate for every league pitch within ±0.5, ±1 or ±2 inches of it. A box with under 40 swings in that window is left blank. Nothing is filled in from anywhere else.</li>
              <li><b>His pitches go on top as dots</b>, with his average and a ring one standard deviation wide, so you can see where his pitch is grouped and what the league has done from that spot.</li>
              <li><b>You choose the seasons:</b> the current season alone (the same year as his dots) or 2024 to now (a bigger sample, at the cost of mixing seasons).</li>
            </ol>
          </Card>
        </Section>

        <Section id="sources" num="03" title="Where the idea comes from" sub="Public work that uses the same core idea: compare a pitch with similar pitches, and judge it by its shape. We opened and read each of these before citing it.">
          <div style={{ display: 'grid', gap: 12 }}>
            {SOURCES.map(s => (
              <Card key={s.id} title={s.kicker}>
                <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.01em', color: C.ink }}>{s.title}</div>
                <div style={{ fontSize: 12, color: C.mute, margin: '2px 0 8px' }}>{s.by}</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#3a352c', margin: '0 0 8px' }}>{s.what}</p>
                <a href={s.href} target="_blank" rel="noopener noreferrer" style={{ color: C.orange, fontWeight: 700, fontSize: 13 }}>Read it →</a>
              </Card>
            ))}
          </div>
          <Card style={{ marginTop: 12, background: '#FFF9E0', border: '1px solid #EBC24A' }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>What about the clubs themselves?</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#3a352c', margin: 0 }}>
              We looked for pitch-shape research or documentation published by a club and did not find any. Clubs build their own pitch models and keep them private, so we do not claim to know how any club uses its own. The work above is public and uses the same core idea; MLB’s own Statcast data is what all of it, and this map, is built on.
            </p>
          </Card>
        </Section>

        <Section id="limits" num="04" title="What the map does not tell you">
          <Card>
            <ul style={{ margin: 0, paddingLeft: 22, listStyle: 'disc', fontSize: 14.5, lineHeight: 1.65, color: '#3a352c' }}>
              <li><b>Shape is not everything.</b> Command, deception, how the pitch is sequenced and a pitcher’s health are not in the map. The MLB.com piece above makes the same point.</li>
              <li><b>It is a description, not a forecast.</b> It says what pitches like this have done, not what this one will do.</li>
              <li><b>Samples can be thin.</b> That is why a box needs 40 swings in its window and why the page shows the sample behind every number.</li>
              <li><b>A season is a small sample.</b> The current-season view matches his dots; the longer view steadies the rate but mixes seasons.</li>
            </ul>
          </Card>
        </Section>
      </div>
    </main>
  )
}
