// /pricing/start?interval=month|year — where "Start Pro" lands after the emailed sign-in link.
// Signed out -> back to signup with the Pro choice kept. Already Pro -> /me. Otherwise start Stripe checkout.
import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import StartCheckout from '@/components/pro/StartCheckout'
import { getCurrentSubscriber } from '@/lib/auth'
import { noindex } from '@/lib/seo'
import { linkRef, proSignupPath } from '@/lib/referral'

export const metadata = { title: 'Starting Pro', ...noindex() }
export const dynamic = 'force-dynamic'

export default async function StartProPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = Array.isArray(sp.interval) ? sp.interval[0] : sp.interval
  const interval = raw === 'month' ? 'month' : 'year'
  const ref = linkRef(Array.isArray(sp.ref) ? sp.ref[0] : sp.ref)   // the code that rode in with the emailed link

  const subscriber = await getCurrentSubscriber()
  if (!subscriber) redirect(proSignupPath(interval, ref))
  if (subscriber.is_pro) redirect('/me')

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 16px' }}>
        <StartCheckout interval={interval} refCode={ref} />
      </div>
    </main>
  )
}
