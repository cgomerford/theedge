// src/app/nfl/offensive-coordinator/page.tsx

import SiteHeader from '@/components/SiteHeader'
import NflOffCoordinatorClient from './NflOffCoordinatorClient'
import { getOffCoordinatorLeaderboard, getActiveStatsSeason } from '@/lib/nfl/queries'

export const metadata = {
  title: 'Offensive Coordinator · NFL Scheme Breakdown · The Edge',
  description: 'Every NFL team\'s most-used formation, personnel, and run/pass split — with real playbook-style diagrams.',
}

export const revalidate = 3600

export default async function OffCoordinatorPage() {
  const statsSeason = await getActiveStatsSeason()
  const teams = await getOffCoordinatorLeaderboard(statsSeason)

  return (
    <>
      <SiteHeader />
      <NflOffCoordinatorClient statsSeason={statsSeason} teams={teams} />
    </>
  )
}