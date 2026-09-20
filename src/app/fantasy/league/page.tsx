import { getCurrentSubscriber } from '@/lib/auth'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import LeagueDesk from './LeagueDesk'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My League · The Edge Fantasy Desk',
  description:
    'Upload your roster, grade the team, and get real start/sit/waiver/trade calls from ESPN ownership plus remaining MLB schedule.',
}

export default async function FantasyLeaguePage() {
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro === true || subscriber?.role === 'admin'

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      <FantasySubNav active="league" isPro={isPro} />
      <LeagueDesk isPro={isPro} />
    </main>
  )
}
