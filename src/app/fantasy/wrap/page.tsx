// src/app/fantasy/wrap/page.tsx
//
// The Weekly Wrap — one page, four feeds, built to scroll and screenshot:
// ownership movers, heating/cooling model signals, the IL report, and the
// full transaction log, all scoped to the current calendar week (Mon–Sun).
//
// ?week=last shows the previous completed week instead of the current one.

import { getWeeklyWrapData } from '@/lib/fantasy-wrap'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import WeeklyWrapBoard from './WeeklyWrapBoard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Weekly Wrap · The Edge Fantasy Desk',
  description: 'Ownership movers, trending players, the IL report, and the full transaction log — one page, built for the week.',
}

export default async function WeeklyWrapPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const offsetWeeks = week === 'last' ? -1 : 0

  const data = await getWeeklyWrapData(offsetWeeks)

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A]">
      <SiteHeader variant="page" />
      {/* "wrap" isn't a tab FantasySubNav knows about yet — see README for
          the one-line addition needed there. Passing an unrecognized
          `active` value is harmless; it just won't highlight anything. */}
      <FantasySubNav active="wrap" isPro={true} />
      <WeeklyWrapBoard data={data} />
    </main>
  )
}
