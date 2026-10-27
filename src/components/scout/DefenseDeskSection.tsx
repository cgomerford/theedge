// src/components/scout/DefenseDeskSection.tsx: Fielding tab body (server). For each club as the DEFENSE: its alignment mix (Savant, cached by savant-cache), the opposing
// hitters it faces with their pull rates, and its fielders with Outs Above Average by direction (the league OAA leaderboard, one cached fetch). Handed to the client
// FieldingLab. Nothing is fetched by the browser.
import { getDefenseDesk, MIN_ALIGN_PITCHES, MIN_VS_HITTER } from '@/lib/scout/defense'
import { getLeagueOaa } from '@/lib/batter-fielding'
import FieldingLab, { type DefenseSide } from './lab/FieldingLab'
import type { ScoutClub, ScoutContext } from './types'

async function load(def: ScoutClub, off: ScoutClub, ctx: ScoutContext): Promise<DefenseSide> {
  const season = Number(ctx.gameDate.slice(0, 4))
  const [desk, oaa] = await Promise.all([
    getDefenseDesk(def.id, def.abbr, off.id, ctx.gameDate, ctx.gamePk, def.probableId).catch(() => null),
    getLeagueOaa(season).catch(() => ({} as Awaited<ReturnType<typeof getLeagueOaa>>)),
  ])
  return {
    club: { id: def.id, abbr: def.abbr, name: def.name }, oppAbbr: off.abbr, desk,
    fielders: (desk?.fielders ?? []).map(f => {
      const o = oaa[String(f.id)]
      return { ...f, front: o?.oaaInFront ?? null, to3B: o?.oaaLateralToward3B ?? null, to1B: o?.oaaLateralToward1B ?? null, back: o?.oaaBehind ?? null, vsR: o?.oaaVsRHH ?? null, vsL: o?.oaaVsLHH ?? null, actual: o?.actualSuccessRate ?? null, est: o?.estimatedSuccessRate ?? null }
    }),
  }
}

export default async function DefenseDeskSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([load(ctx.away, ctx.home, ctx), load(ctx.home, ctx.away, ctx)])
  return <FieldingLab clubs={{ away, home }} minAlign={MIN_ALIGN_PITCHES} minVs={MIN_VS_HITTER} />
}
