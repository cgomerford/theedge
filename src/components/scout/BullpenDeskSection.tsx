// src/components/scout/BullpenDeskSection.tsx: Bullpen tab body (server). Both clubs' arms with their fatigue, usage and splits, and the OTHER club's lineup
// (the hitters each pen would face), handed to the client BullpenLab. A postseason game reads the box scores of recent games of every kind
// (lib/scout/recent-work.ts via getBullpenDesk). The head-to-head grid is fetched by the client only when it is opened.
import { getBullpenDesk } from '@/lib/scout/bullpen-desk'
import { getBullpenTrends, type ArmUsage } from '@/lib/scout/bullpen-trends'
import { getProjectedLineup } from '@/lib/lineups'
import BullpenLab, { type ClubPen } from './lab/BullpenLab'
import type { ScoutClub, ScoutContext } from './types'

async function load(club: ScoutClub, opp: ScoutClub, ctx: ScoutContext): Promise<ClubPen> {
  const [desk, lineup] = await Promise.all([
    getBullpenDesk(club.id, ctx.gameDate, ctx.postseason).catch(() => null),
    getProjectedLineup(opp.id, ctx.gameDate, ctx.gamePk).catch(() => null),
  ])
  const trends = desk ? await getBullpenTrends(club.id, club.abbr, club.name, desk.arms.map(a => a.id), ctx.gameDate).catch(() => null) : null
  const usage: Record<number, ArmUsage> = {}
  for (const [id, u] of trends?.arms ?? []) usage[id] = u
  return {
    club: { id: club.id, abbr: club.abbr, name: club.name }, oppAbbr: opp.abbr,
    desk, usage,
    pen: trends ? { byRest: trends.byRest, byPrevLoad: trends.byPrevLoad, loadVsRuns: trends.loadVsRuns, team: trends.team } : null,
    lineup: (lineup?.batters ?? []).map(b => ({ id: b.player_id, name: b.player_name, order: b.batting_order, pos: b.position })),
    lineupSource: lineup?.source ?? 'unavailable',
  }
}

export default async function BullpenDeskSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([load(ctx.away, ctx.home, ctx), load(ctx.home, ctx.away, ctx)])
  return <BullpenLab gameDate={ctx.gameDate} clubs={{ away, home }} />
}
