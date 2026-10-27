// src/components/scout/RunLabSection.tsx: Base running tab body (server). One OFFENSE running against the other club's battery, for each club (lib/scout/run-lab.ts).
// Only the boards for the lineup runners and the probable starter are handed to the client, with the league averages. Nothing is fetched by the browser.
import { getRunLab, MIN_LEAD_CHANCES, type RunBoards } from '@/lib/scout/run-lab'
import { MIN_ATTEMPTS } from '@/lib/scout/run-game'
import { MIN_SITUATION_N } from '@/lib/scout/situations'
import RunningLab, { type RunSide } from './lab/RunningLab'
import type { ScoutClub, ScoutContext } from './types'

async function load(off: ScoutClub, def: ScoutClub, ctx: ScoutContext): Promise<RunSide> {
  const lab = await getRunLab(off.id, def.id, ctx.gameDate, ctx.gamePk, def.probableId)
  const b = lab.boards
  const ids = new Set((lab.rg?.offense.runners ?? []).map(r => String(r.id)))
  const slim: RunBoards | null = b ? {
    runner: Object.fromEntries(Object.entries(b.runner).filter(([id]) => ids.has(id))),
    xb: Object.fromEntries(Object.entries(b.xb).filter(([id]) => ids.has(id))),
    split90: Object.fromEntries(Object.entries(b.split90).filter(([id]) => ids.has(id))),
    pitcher: def.probableId ? Object.fromEntries(Object.entries(b.pitcher).filter(([id]) => id === String(def.probableId))) : {},
    league: b.league,
  } : null
  return { club: { id: off.id, abbr: off.abbr, name: off.name }, def: { id: def.id, abbr: def.abbr, name: def.name, probableName: def.probableName }, rg: lab.rg, sit: lab.sit, against: lab.against, boards: slim, sprintField: lab.sprintField }
}

export default async function RunLabSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([load(ctx.away, ctx.home, ctx), load(ctx.home, ctx.away, ctx)])
  return <RunningLab clubs={{ away, home }} minAttempts={MIN_ATTEMPTS} minSit={MIN_SITUATION_N} minLead={MIN_LEAD_CHANCES} />
}
