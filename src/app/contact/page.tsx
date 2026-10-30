import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { CONTACT_EMAIL, X_HANDLE, X_URL } from '@/lib/site'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'Contact',
  description: 'How to reach x9Lab: questions, corrections, press and data questions. One person reads every message.',
  path: '/contact',
})

const h2: React.CSSProperties = { margin: '32px 0 4px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }
const p: React.CSSProperties = { margin: '0 0 14px', fontSize: 17, lineHeight: 1.65, color: '#3a352c' }

export default function ContactPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>Contact x9Lab</h1>
        <p style={p}>x9Lab is built and run by one person, <Link href="/authors/george" style={{ color: '#B83A0E', fontWeight: 700 }}>George</Link>. Every message is read by him.</p>
        <p style={{ ...p, fontSize: 20, fontWeight: 800 }}><a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#B83A0E' }}>{CONTACT_EMAIL}</a></p>
        <h2 style={h2}>Corrections</h2>
        <p style={p}>If a number on the site looks wrong, say which page and which figure. We check it against the public source and fix it, and an article that changes after publishing shows an Updated date.</p>
        <h2 style={h2}>Press and data questions</h2>
        <p style={p}>Questions about where a number comes from, how a measure is built, or using something we published: send them here. Everything on the site is built on public game data, and the pages say which.</p>
        <h2 style={h2}>Also</h2>
        <p style={p}>On X: <a href={X_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#B83A0E', fontWeight: 700 }}>{X_HANDLE}</a>. More about the site is on the <Link href="/about" style={{ color: '#B83A0E', fontWeight: 700 }}>About page</Link>. x9Lab is independent and not affiliated with MLB.</p>
      </div>
    </main>
  )
}
