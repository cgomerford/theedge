// src/app/me/settings/page.tsx: My x9Lab settings: the four items that used to sit at the bottom of /me (Email address, Pick your teams, See plans or Manage subscription, Sign out).
// Private, never cached; signed-out visitors go to Create account.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import SettingsPanel from '@/components/me/SettingsPanel'
import { C, EYEBROW, SANS } from '@/components/me/ui'
import { getCurrentSubscriber } from '@/lib/auth'
import { noindex } from '@/lib/seo'
import { signupHref } from '@/lib/site'

export const metadata = { title: 'Settings · My x9Lab', ...noindex() }
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MeSettingsPage() {
  const sub = await getCurrentSubscriber()
  if (!sub) redirect(signupHref('me'))
  return (
    <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: SANS }}>
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 80px' }}>
        <Link href="/me" style={{ fontSize: 13, fontWeight: 800, color: C.orange, textDecoration: 'none' }}>← My x9Lab</Link>
        <div style={{ ...EYEBROW, marginTop: 16 }}>My x9Lab</div>
        <h1 style={{ margin: '6px 0 22px', fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Settings</h1>
        <SettingsPanel email={sub.email} preferencesToken={sub.preferences_token || null} isPro={sub.is_pro === true} />
      </div>
    </main>
  )
}
