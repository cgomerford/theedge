
// src/components/admin/DataRoom.tsx
//
// Server entry for the pre-game Data Room. Fetches rolling stats from the
// MLB Stats API and the rule-based takes, hands fully-computed serializable
// data to the client component. No edge_predictions dependency at all —
// this works even before a Read has been generated for the game.
//
// Mount on a per-game admin view, e.g. inside /admin/dashboard, or use the
// drop-in route below.
//
// TODO: wire `lineupPlayerIds` to the existing projected-lineup logic in
// lib/lineups.ts once confirmed lineups land. Until then the watchlist
// panel shows its "lineup not confirmed yet" empty state.

import { getDataRoomBundle, type LineupPlayerIds } from '@/lib/pregame-stats'
import { buildAllTakes } from '@/lib/pregame-takes'
import DataRoomClient from '@/components/admin/DataRoomClient'

type Props = {
  gamePk: number
  lineupPlayerIds?: LineupPlayerIds
}

export default async function DataRoom({ gamePk, lineupPlayerIds }: Props) {
  const bundle = await getDataRoomBundle(gamePk, lineupPlayerIds)

  if (!bundle) {
    return (
      <div className="border border-[#E2DCCF] bg-white p-6 font-mono text-xs text-[#8A857B]">
        Couldn't load pre-game data for gamePk {gamePk}. Check it's today's
        slate and that statsapi.mlb.com is reachable.
      </div>
    )
  }

  const { info, homeStats, awayStats, homeWatchlist, awayWatchlist } = bundle
  const takes = buildAllTakes(
    { abbr: info.homeAbbr, stats: homeStats, watchlist: homeWatchlist },
    { abbr: info.awayAbbr, stats: awayStats, watchlist: awayWatchlist },
  )

  return (
    <DataRoomClient
      info={info}
      home={{ stats: homeStats, watchlist: homeWatchlist, takes: takes.home }}
      away={{ stats: awayStats, watchlist: awayWatchlist, takes: takes.away }}
    />
  )
}