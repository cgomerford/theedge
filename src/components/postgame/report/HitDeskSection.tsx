// src/components/postgame/report/HitDeskSection.tsx: Hitters tab body (server): the game's pitch log from the live feed, handed to the client HitDesk.
import { getPostData } from '@/lib/postgame/data'
import { buildPitchLog } from '@/lib/postgame/pitchlog'
import HitDesk from './lab/HitDesk'
import { Empty } from './ui'
import type { PostgameContext } from './types'

export default async function HitDeskSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const pitches = data ? buildPitchLog(data) : []
  if (pitches.length === 0) return <Empty>No pitch data is available for this game.</Empty>
  return <HitDesk pitches={pitches} away={ctx.away} home={ctx.home} season={Number(ctx.gameDate.slice(0, 4))} />
}
