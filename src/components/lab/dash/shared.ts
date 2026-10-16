// src/components/lab/dash/shared.ts
//
// Context + small helpers shared by every dashboard visual.

import { C, SANS } from '@/components/team/ui'
import { METRIC_BY_KEY, ROLE_LABEL, type MetricDef, type TeamSummary } from '@/lib/lab/team-summary'
import type { Role } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'
import type { Team } from '@/lib/teams'
import type { Channel } from '@/components/lab/dash/types'

export type Ctx = {
  clubs: Team[]                                            // clubs passing the league / division slicers
  val: (c: Channel, id: number) => number | null           // a club's number for a channel (honours the role override)
  summaryOf: (role: Role, id: number) => TeamSummary | undefined   // exactly the role asked for (override NOT applied)
  force: Role | null                                       // the "Pitchers" slicer override, when set
  sel: number[]
  toggle: (id: number) => void
  season: number
  loading: boolean
}

export const AXIS = { fontSize: 10, fontFamily: SANS, fill: '#a89e8c' }
export const md = (c: Channel) => METRIC_BY_KEY.get(c.metric) as MetricDef
export const short = (c: Channel) => `${md(c)?.label ?? c.metric}${c.role === 'all' ? '' : ` (${ROLE_LABEL[c.role].toLowerCase()})`}`
export const LOW = [93, 202, 165]
export const HIGH = [212, 83, 59]
export const ramp = (t: number) => `rgb(${LOW.map((v, i) => Math.round(v + (HIGH[i] - v) * Math.min(1, Math.max(0, t)))).join(',')})`
export const NOTE = { fontFamily: SANS, fontSize: 9.5, color: C.faint, lineHeight: 1.5 } as const
