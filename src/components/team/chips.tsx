// src/components/team/chips.tsx
//
// TeamChip / PlayerChip -- identity chips with NO team logo and NO player
// headshot, ever. Built for the NHL prototype (CLAUDE.md N1/N2 lock: "No NHL
// images: no logos, headshots or clip URLs. Teams use TeamChip; players use
// PlayerChip... Do NOT call headshot() or teamLogo() from ui.tsx") and shared
// by any future sport that needs the same rule. Colour comes from data
// (team.color_hex / text_on_hex), never an image asset.
//
// Server-safe: plain divs + inline styles, no hooks, no client JS.

import { SANS, MONO, C } from './ui'

export interface ChipTeam {
  id: number | string
  abbrev: string
  name?: string | null
  color?: string | null
  textColor?: string | null
}

export function TeamChip({ team, size = 'md' }: { team: ChipTeam; size?: 'sm' | 'md' }) {
  const bg = team.color || C.soft
  const fg = team.textColor || (team.color ? '#fff' : C.ink)
  const pad = size === 'sm' ? '2px 8px' : '4px 10px'
  const fontSize = size === 'sm' ? 10 : 11

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: SANS,
        fontWeight: 800,
        fontSize,
        letterSpacing: '.02em',
        padding: pad,
        borderRadius: 999,
        background: bg,
        color: fg,
        lineHeight: 1.4,
      }}
    >
      {team.abbrev}
      {team.name && (
        <span style={{ fontWeight: 600, opacity: 0.85 }}>{team.name}</span>
      )}
    </span>
  )
}

export interface ChipPlayer {
  id: number | string
  name: string
  position?: string | null
  sweaterNumber?: number | null
}

export function PlayerChip({ player }: { player: ChipPlayer }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontFamily: SANS, fontSize: 13, color: C.ink }}>
      {player.sweaterNumber != null && (
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>#{player.sweaterNumber}</span>
      )}
      <span style={{ fontWeight: 700 }}>{player.name}</span>
      {player.position && (
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, textTransform: 'uppercase' }}>{player.position}</span>
      )}
    </span>
  )
}
