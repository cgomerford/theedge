// src/components/scout/ABSDeskSection.tsx: ABS tab body (server). Reads the challenge log, the plate umpire and both clubs' desks (lib/scout/abs-lab.ts) and hands
// them to the client AbsLab. Nothing is fetched by the browser.
import { getAbsLab } from '@/lib/scout/abs-lab'
import AbsLab from './lab/AbsLab'
import type { ScoutContext } from './types'

export default async function ABSDeskSection({ ctx }: { ctx: ScoutContext }) {
  const lab = await getAbsLab(ctx.away, ctx.home, ctx.gameDate, ctx.gamePk)
  return <AbsLab away={{ id: ctx.away.id, abbr: ctx.away.abbr, name: ctx.away.name }} home={{ id: ctx.home.id, abbr: ctx.home.abbr, name: ctx.home.name }} lab={lab} />
}
