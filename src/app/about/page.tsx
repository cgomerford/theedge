export const metadata = pageMeta({
  title: 'About',
  description:
    'Why x9Lab exists and who builds it: a baseball fan from the UK with a data science background, putting front-office-style tools in front of fans. Built on public game data.',
  path: '/about',
})

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { CONTACT_EMAIL } from '@/lib/site'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

const row: React.CSSProperties = { padding: '16px 0', borderTop: '1px solid #e7e2d8' }
const h2: React.CSSProperties = { margin: '40px 0 4px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }
const p: React.CSSProperties = { margin: '0 0 16px', fontSize: 17, lineHeight: 1.65, color: '#3a352c' }

const PRINCIPLES: { name: string; body: string }[] = [
  { name: 'Show the sample', body: 'Every number carries the count behind it, and a number from too few pitches is marked as a small sample instead of being shown as if it meant something.' },
  { name: 'Compare to something', body: "A .320 average only means something against the league. Stats are shown against league averages and as percentile ranks, and zone maps are shaded against the league baseline." },
  { name: 'Keep the context', body: 'A park changes what a fly ball is worth, and a count changes what a pitcher throws. Where context matters, it is on the page next to the number.' },
  { name: 'Describe, do not forecast', body: 'The pages say what players and pitchers have done and how often. They do not claim to know what happens next.' },
  { name: 'Say what is missing', body: 'Where the data is not there, the page says so. Nothing is filled in to make a page look complete.' },
]

export default function AboutPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <style dangerouslySetInnerHTML={{ __html: '.ab-bio{display:flex;gap:28px;align-items:center;margin:0 0 28px}.ab-photo{flex:0 0 240px;margin:0}@media (max-width:640px){.ab-bio{flex-direction:column;align-items:flex-start;gap:16px}.ab-photo{flex:none;width:100%;max-width:300px}}' }} />
        <div className="ab-bio">
          <figure className="ab-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/about/george-citizens-bank-park.jpg" alt="George at Citizens Bank Park, home of the Phillies" width={800} height={1000}
              style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 14, border: '1px solid #e7e2d8' }} />
            <figcaption style={{ marginTop: 8, fontSize: 12.5, color: '#8a8275', lineHeight: 1.4 }}>Citizens Bank Park, where it started.</figcaption>
          </figure>
          <div>
            <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>About x9Lab</h1>
            <p style={{ ...p, margin: 0 }}>
              I&apos;m George. I built x9Lab. I&apos;m a baseball fan from the UK, and I love the sport for its statistics as much as for the games.
            </p>
          </div>
        </div>
        <p style={p}>
          It started at a Phillies game. The scoreboard was full of numbers I had never seen on a screen at a ballpark: pitch speeds, spin, how a hitter does against each pitch. It made me want to understand all of it, so I went looking for where those numbers came from and found Baseball Savant. The data was all there, but I found it hard to use. Working out what a column meant, which page to open, and how a number should be read took more effort than watching the game did.
        </p>
        <p style={p}>
          So I decided to build the thing I was looking for: the same public data, laid out so a fan can read it, with the depth still there for anyone who wants to keep digging.
        </p>

        <h2 style={h2}>Why now</h2>
        <p style={p}>
          Teams now employ whole analytics departments, and the tools they use to prepare for a game are far ahead of what fans can see. I work with data for a living, and I wanted to use that to build the kind of tools a front office might use, with the same discipline behind them, and put them in front of fans.
        </p>

        <h2 style={h2}>What that means in practice</h2>
        <div>
          {PRINCIPLES.map(r => (
            <div key={r.name} style={row}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{r.name}</div>
              <div style={{ fontSize: 15, color: '#3a352c', marginTop: 2, lineHeight: 1.55 }}>{r.body}</div>
            </div>
          ))}
        </div>

        <h2 style={h2}>Who it is for</h2>
        <p style={p}>
          Fans who want to watch with more to look at, people who play fantasy, writers who want an angle their colleagues missed, and anyone who has wondered why the same pitcher dominates one lineup and struggles against another. It is information, not advice, and it is independent of MLB and its clubs.
        </p>
        <p style={{ ...p, marginBottom: 0 }}>
          To see how it is built, read <Link href="/how-it-works" style={{ color: '#FF5722', fontWeight: 800 }}>How it works</Link> and <Link href="/why-edge" style={{ color: '#FF5722', fontWeight: 800 }}>Why x9Lab</Link>.
        </p>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e7e2d8', fontSize: 14, color: '#8a8275' }}>
          Have a question, a correction or an idea? <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#FF5722', fontWeight: 800 }}>{CONTACT_EMAIL}</a>
        </div>
      </div>
    </main>
  )
}
