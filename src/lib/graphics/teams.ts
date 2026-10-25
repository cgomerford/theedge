// src/lib/graphics/teams.ts
//
// Team colours and ids for the text chips and logos. MLB_TEAMS is the single source of truth for
// ids/colours; TB and MIL keep the brand chip colours from the Game 1 mockups.

import { MLB_TEAMS } from '@/lib/teams'
import type { GraphicSpec, TeamKey } from './types'

const OVERRIDE: Record<string, { bg: string; fg: string }> = {
  TB: { bg: '#092C5C', fg: '#DCE8FA' },
  MIL: { bg: '#FFC52F', fg: '#1A1A1A' },
}

export function teamStyle(key: TeamKey): { bg: string; fg: string; border: string } {
  if (key === 'neutral') return { bg: '#FFFFFF', fg: '#1A1A1A', border: '#1A1A1A' }
  const o = OVERRIDE[key]
  if (o) return { ...o, border: o.bg }
  const t = MLB_TEAMS.find(x => x.abbrev === key)
  return t ? { bg: t.primary_color, fg: t.text_on_primary, border: t.primary_color } : { bg: '#1A1A1A', fg: '#FAF8F3', border: '#1A1A1A' }
}

export const teamId = (abbr: string): number | null => MLB_TEAMS.find(t => t.abbrev === abbr)?.id ?? null
export const teamColor = (abbr: string): string => MLB_TEAMS.find(t => t.abbrev === abbr)?.primary_color ?? '#12295A'

/** Every image key a spec wants, so the studio can preload them. */
export function imageKeys(spec: GraphicSpec): string[] {
  const keys = new Set<string>(['x9'])
  for (const c of spec.chips) if (c.team !== 'neutral') keys.add(`team:${c.team}`)
  for (const s of spec.stats) {
    if (s.team && s.team !== 'neutral') keys.add(`team:${s.team}`)
    if (s.playerId) keys.add(`player:${s.playerId}`)
  }
  if (spec.player) {
    keys.add(`player:${spec.player.id}`)
    if (spec.player.team) keys.add(`team:${spec.player.team}`)
  }
  return [...keys]
}
