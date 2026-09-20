// src/components/scout/PitcherAttackSection.tsx — §9 server wrapper: loads both starters' attack profiles.

import { getPitcherAttack } from '@/lib/scout/pitcher-attack'
import { teamLogoUrl } from '@/lib/mlb'
import PitcherAttack from './PitcherAttack'
import type { ScoutContext } from './types'

export default async function PitcherAttackSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([
    ctx.away.probableId ? getPitcherAttack(ctx.away.probableId, ctx.away.probableName ?? 'Starter') : Promise.resolve(null),
    ctx.home.probableId ? getPitcherAttack(ctx.home.probableId, ctx.home.probableName ?? 'Starter') : Promise.resolve(null),
  ])
  return (
    <div className="space-y-4">
      <PitcherAttack data={[away, home]} meta={[
        { clubName: ctx.away.name, abbr: ctx.away.abbr, logo: teamLogoUrl(ctx.away.id), pitcherName: ctx.away.probableName ?? 'TBD', pitcherId: ctx.away.probableId },
        { clubName: ctx.home.name, abbr: ctx.home.abbr, logo: teamLogoUrl(ctx.home.id), pitcherName: ctx.home.probableName ?? 'TBD', pitcherId: ctx.home.probableId },
      ]} />
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Built from Statcast pitch data aggregated per starter for the season (all hitters / vs left-handed / vs right-handed). Zone labels are the zone each pitch lands in most often in that count. Movement, stuff and release charts live in Pitching Lab. These describe what he has done, not what he will do.
      </p>
    </div>
  )
}
