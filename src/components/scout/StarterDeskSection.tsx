// src/components/scout/StarterDeskSection.tsx: Starters tab body (server): the two probable starters and their season breakdowns (count state, platoon,
// inning by inning, times through the order, hot zones), computed from each starter's full pitch log, handed to the client StarterDesk.
import { getStarterProfile, type StarterProfile } from '@/lib/scout/starter-profile'
import StarterDesk, { type Starter } from './lab/StarterDesk'
import type { ScoutContext } from './types'

export default async function StarterDeskSection({ ctx }: { ctx: ScoutContext }) {
  const starters: Starter[] = [
    { id: ctx.away.probableId, name: ctx.away.probableName ?? 'TBD', clubId: ctx.away.id, abbr: ctx.away.abbr, side: 'Away' },
    { id: ctx.home.probableId, name: ctx.home.probableName ?? 'TBD', clubId: ctx.home.id, abbr: ctx.home.abbr, side: 'Home' },
  ]
  const season = Number(ctx.gameDate.slice(0, 4))
  const got = await Promise.all(starters.map(s => (s.id != null ? getStarterProfile(s.id, season).catch(() => null) : Promise.resolve(null))))
  const profiles: Record<number, StarterProfile | null> = {}
  starters.forEach((s, i) => { if (s.id != null) profiles[s.id] = got[i] })
  return <StarterDesk starters={starters} profiles={profiles} />
}
