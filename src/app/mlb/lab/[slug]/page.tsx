// src/app/mlb/lab/[slug]/page.tsx
//
// Teaser page for every Labs-menu item that isn't built yet (status 'soon' in
// src/lib/nav/labsMenu.ts). Static routes (/mlb/lab/pitching-lab, /batting-lab) win over
// this dynamic segment, so only unbuilt labs land here. Add an item to LABS_MENU and it
// gets a page automatically (name, one-sentence blurb, Coming soon badge, placeholder art and a
// notify-me signup posting to /api/subscribe with source `lab_<slug>`); build the real lab and give it its own folder to replace it.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import SignupForm from '@/components/SignupForm'
import LabArt from '@/components/lab/LabArt'
import { LABS_MENU } from '@/lib/nav/labsMenu'
import { C, SANS, MONO } from '@/components/team/ui'

const stubFor = (slug: string) => LABS_MENU.find(i => i.status === 'soon' && i.href === `/mlb/lab/${slug}`)

export const dynamicParams = false
export function generateStaticParams() {
  return LABS_MENU.filter(i => i.status === 'soon').map(i => ({ slug: i.href.split('/').pop()! }))
}

export default async function LabStub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = stubFor(slug)
  if (!item) notFound()
  return (
    <main style={{ minHeight: '100vh', background: C.cream }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', background: C.yellow, color: C.ink, padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
          Coming soon
        </span>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40, letterSpacing: '-0.02em', margin: '14px 0 12px', color: C.ink }}>{item.label}</h1>
        <p style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.5, color: '#5b5347', margin: '0 0 28px' }}>
          {item.blurb ?? 'This lab isn’t built yet. Nothing is shown here until there is real data behind it.'}
        </p>
        <div style={{ margin: '0 0 32px' }}><LabArt art={item.art} /></div>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 12 }}>
          ⊕ Get notified when this launches
        </div>
        <SignupForm source={`lab_${slug.replace(/-/g, '_')}`} buttonText="Get notified when this launches →" />
        <Link href="/mlb/lab/pitching-lab" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, textDecoration: 'none' }}>
          Open the Pitching Lab →
        </Link>
      </div>
    </main>
  )
}
