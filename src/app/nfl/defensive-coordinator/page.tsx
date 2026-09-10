// src/app/nfl/defensive-coordinator/page.tsx

import SiteHeader from '@/components/SiteHeader'
import NflDefCoordinatorClient from './NflDefCoordinatorClient'
import { getDefCoordinatorLeaderboard, getActiveStatsSeason } from '@/lib/nfl/queries'

export const metadata = {
  title: "Defensive Coordinator · NFL Coverage Breakdown · The Edge",
  description: "Every NFL team's most-used coverage shell and the coverage they've been most susceptible to — with real playbook-style diagrams.",
}

export const revalidate = 3600

export default async function DefCoordinatorPage() {
  const statsSeason = await getActiveStatsSeason()
  const teams = await getDefCoordinatorLeaderboard(statsSeason)

  return (
    <>
      <SiteHeader />
      <NflDefCoordinatorClient statsSeason={statsSeason} teams={teams} />
    </>
  )
}