// src/app/nfl/qb-room/page.tsx
// FULL REPLACEMENT

import SiteHeader from '@/components/SiteHeader'
import NflQbRoomClient from '@/app/nfl/qb-room/NflQbRoomClient'
import {
  getQbNgsSeasonProfiles,
  getQbNgsWeekly,
  getQbNgsWeeklyGrid,
  getQbZoneProfile,
  getQbZoneLeagueAverages,
  getQbRadarProfile,
  getQbCoverageSplits,
  getQbPressureSplits,
  getQbFormationRate,
  getActiveStatsSeason,
} from '@/lib/nfl/queries'

export const metadata = {
  title: 'QB Room · NFL Stats & Analytics · x9Lab',
  description: 'Every qualified NFL QB, ranked and visualized — intended vs completed air yards, aggressiveness, checkdown rate, coverage/pressure splits, and who is actually pushing the ball downfield.',
}

export const revalidate = 3600

export default async function QbRoomPage() {
  const statsSeason = await getActiveStatsSeason()
  const profiles = await getQbNgsSeasonProfiles(statsSeason)
  const defaultQb = profiles[0] ?? null

  const [defaultWeekly, weeklyGrid, defaultZoneProfile, zoneLeagueAvg, defaultRadar, defaultCoverage, defaultPressure, defaultFormation] = await Promise.all([
    defaultQb ? getQbNgsWeekly(defaultQb.playerId, statsSeason) : Promise.resolve([]),
    getQbNgsWeeklyGrid(statsSeason),
    defaultQb ? getQbZoneProfile(defaultQb.playerId, statsSeason) : Promise.resolve(null),
    getQbZoneLeagueAverages(statsSeason),
    defaultQb ? getQbRadarProfile(defaultQb.playerId, statsSeason) : Promise.resolve(null),
    defaultQb ? getQbCoverageSplits(defaultQb.playerId, statsSeason) : Promise.resolve([]),
    defaultQb ? getQbPressureSplits(defaultQb.playerId, statsSeason) : Promise.resolve([]),
    defaultQb ? getQbFormationRate(defaultQb.playerId, statsSeason) : Promise.resolve([]),
  ])

  return (
    <>
      <SiteHeader />
      <NflQbRoomClient
        statsSeason={statsSeason}
        profiles={profiles}
        defaultQb={defaultQb}
        defaultWeekly={defaultWeekly}
        weeklyGrid={weeklyGrid}
        defaultZoneProfile={defaultZoneProfile}
        zoneLeagueAvg={zoneLeagueAvg}
        defaultRadar={defaultRadar}
        defaultCoverage={defaultCoverage}
        defaultPressure={defaultPressure}
        defaultFormation={defaultFormation}
      />
    </>
  )
}