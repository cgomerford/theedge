// src/components/scout/LineupDeskSection.tsx: Lineups tab body (server): reads both lineups, hands them to the client LineupDesk.
import { getProjectedLineup } from '@/lib/lineups'
import LineupDesk, { type LineupSide } from './lab/LineupDesk'
import type { ScoutContext } from './types'

export default async function LineupDeskSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([getProjectedLineup(ctx.away.id, ctx.gameDate, ctx.gamePk), getProjectedLineup(ctx.home.id, ctx.gameDate, ctx.gamePk)])
  const map = (l: typeof away) => l.batters.map(b => ({ id: b.player_id, name: b.player_name, order: b.batting_order }))
  const sides: LineupSide[] = [
    { label: `${ctx.away.abbr} lineup vs ${ctx.home.probableName ?? 'the home starter'}`, pitcher: ctx.home.probableId ? { id: ctx.home.probableId, name: ctx.home.probableName ?? 'Starter' } : null, lineup: map(away), source: away.source },
    { label: `${ctx.home.abbr} lineup vs ${ctx.away.probableName ?? 'the away starter'}`, pitcher: ctx.away.probableId ? { id: ctx.away.probableId, name: ctx.away.probableName ?? 'Starter' } : null, lineup: map(home), source: home.source },
  ]
  return <LineupDesk sides={sides} />
}
