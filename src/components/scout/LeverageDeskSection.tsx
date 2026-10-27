// src/components/scout/LeverageDeskSection.tsx: Leverage tab body (server). For each club: the club-level late/close picture (getLeverage), runs and relievers from the
// 7th on (getLateInnings), the club's own lineup hitters and bullpen arms with their situational lines (getManySits, MLB Stats API, cached an hour), handed to
// the client LeverageLab. Everything is a count of what has happened.
import { getLeverage } from '@/lib/scout/leverage'
import { getLateInnings } from '@/lib/scout/late-innings'
import { getManySits } from '@/lib/scout/leverage-players'
import { getProjectedLineup } from '@/lib/lineups'
import LeverageLab, { type ClubLeverage } from './lab/LeverageLab'
import type { ScoutClub, ScoutContext } from './types'

async function load(club: ScoutClub, opp: ScoutClub, ctx: ScoutContext): Promise<ClubLeverage> {
  const season = ctx.gameDate.slice(0, 4)
  const [lv, late, lineup] = await Promise.all([
    getLeverage(club.id, ctx.gameDate),
    getLateInnings(club.id, opp.id, ctx.gameDate).catch(() => null),
    getProjectedLineup(club.id, ctx.gameDate, ctx.gamePk).catch(() => null),
  ])
  const hitters = (lineup?.batters ?? []).map(b => ({ id: b.player_id, name: b.player_name, order: b.batting_order, pos: b.position }))
  const arms = (lv?.arms ?? []).slice(0, 10)
  const [hitSits, penSits] = await Promise.all([
    getManySits(hitters.map(h => h.id), 'hitting', season),
    getManySits(arms.map(a => a.arm.id), 'pitching', season),
  ])
  return {
    club: { id: club.id, abbr: club.abbr, name: club.name }, oppAbbr: opp.abbr,
    lv, late, hitters, lineupSource: lineup?.source ?? 'unavailable', hitSits, penSits,
  }
}

export default async function LeverageDeskSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([load(ctx.away, ctx.home, ctx), load(ctx.home, ctx.away, ctx)])
  return <LeverageLab clubs={{ away, home }} />
}
