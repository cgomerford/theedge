// src/app/nfl/wr-room/page.tsx

import SiteHeader from '@/components/SiteHeader'
import NflWrRoomClient from '@/app/nfl/wr-room/NflWrRoomClient'
import {
  getWrNgsSeasonProfiles, getWrNgsWeekly, getWrNgsWeeklyGrid, getWrRadarProfile,
  getFantasyProjections, getWrCoverageSplits, getWrPressureSplits, getActiveStatsSeason,
} from '@/lib/nfl/queries'

export const metadata = {
  title: 'WR Room · NFL Stats & Analytics · The Edge',
  description: 'Every qualified NFL WR, ranked and visualized — target depth, separation, YAC above expectation, and who is actually winning their matchups.',
}

export const revalidate = 3600

export default async function WrRoomPage() {
  const statsSeason = await getActiveStatsSeason()
  const profiles = await getWrNgsSeasonProfiles(statsSeason)
  const defaultWr = profiles[0] ?? null

  const [defaultWeekly, weeklyGrid, defaultRadar, fantasyProjectionsRaw, defaultCoverage, defaultPressure] = await Promise.all([
    defaultWr ? getWrNgsWeekly(defaultWr.playerId, statsSeason) : Promise.resolve([]),
    getWrNgsWeeklyGrid(statsSeason),
    defaultWr ? getWrRadarProfile(defaultWr.playerId, statsSeason) : Promise.resolve(null),
    getFantasyProjections(50),
    defaultWr ? getWrCoverageSplits(defaultWr.playerId, statsSeason) : Promise.resolve([]),
    defaultWr ? getWrPressureSplits(defaultWr.playerId, statsSeason) : Promise.resolve([]),
  ])

  const wrIds = new Set(profiles.map((p) => p.playerId))
  const wrFantasyProjections = fantasyProjectionsRaw.filter((f) => wrIds.has(f.gsisId))

  return (
    <>
      <SiteHeader />
      <NflWrRoomClient
        statsSeason={statsSeason}
        profiles={profiles}
        defaultWr={defaultWr}
        defaultWeekly={defaultWeekly}
        weeklyGrid={weeklyGrid}
        defaultRadar={defaultRadar}
        fantasyProjections={wrFantasyProjections}
        defaultCoverage={defaultCoverage}
        defaultPressure={defaultPressure}
      />
    </>
  )
}