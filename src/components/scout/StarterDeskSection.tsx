// src/components/scout/StarterDeskSection.tsx: Starters tab body (server): the two probable starters, handed to the client StarterDesk.
import StarterDesk, { type Starter } from './lab/StarterDesk'
import type { ScoutContext } from './types'

export default function StarterDeskSection({ ctx }: { ctx: ScoutContext }) {
  const starters: Starter[] = [
    { id: ctx.away.probableId, name: ctx.away.probableName ?? 'TBD', clubId: ctx.away.id, abbr: ctx.away.abbr, side: 'Away' },
    { id: ctx.home.probableId, name: ctx.home.probableName ?? 'TBD', clubId: ctx.home.id, abbr: ctx.home.abbr, side: 'Home' },
  ]
  return <StarterDesk starters={starters} />
}
