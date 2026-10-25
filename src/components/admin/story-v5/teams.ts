// src/components/admin/story-v5/teams.ts
//
// Team table keyed by MLB teamId: primary colour plus a light accent (used for chip text and border).
// Logo and headshot URLs are the MLB static CDN formats George specified.

import type { TeamInfo } from './types'

const T: Record<number, { primary: string; light: string }> = {
  108: { primary: '#BA0021', light: '#E7ECEF' }, 109: { primary: '#A71930', light: '#E3D4AD' }, 110: { primary: '#DF4601', light: '#FBD9C6' },
  111: { primary: '#BD3039', light: '#F7C6C9' }, 112: { primary: '#0E3386', light: '#9DB8F2' }, 113: { primary: '#C6011F', light: '#FFFFFF' },
  114: { primary: '#00385D', light: '#F4A6B1' }, 115: { primary: '#333366', light: '#C4CED4' }, 116: { primary: '#0C2340', light: '#FFA98C' },
  117: { primary: '#002D62', light: '#F4A261' }, 118: { primary: '#004687', light: '#E3C98F' }, 119: { primary: '#005A9C', light: '#FFFFFF' },
  120: { primary: '#AB0003', light: '#FFFFFF' }, 121: { primary: '#002D72', light: '#FF9B6A' }, 133: { primary: '#003831', light: '#EFB21E' },
  134: { primary: '#27251F', light: '#FDB827' }, 135: { primary: '#2F241D', light: '#FFC425' }, 136: { primary: '#0C2C56', light: '#5BC4B3' },
  137: { primary: '#27251F', light: '#FD5A1E' }, 138: { primary: '#C41E3A', light: '#FEDB00' }, 139: { primary: '#092C5C', light: '#8FBCE6' },
  140: { primary: '#003278', light: '#FFFFFF' }, 141: { primary: '#134A8E', light: '#A8C8F0' }, 142: { primary: '#002B5C', light: '#F5A6B8' },
  143: { primary: '#E81828', light: '#FFFFFF' }, 144: { primary: '#CE1141', light: '#FFFFFF' }, 145: { primary: '#27251F', light: '#C4CED4' },
  146: { primary: '#00A3E0', light: '#FFFFFF' }, 147: { primary: '#0C2340', light: '#C4CED3' }, 158: { primary: '#12284B', light: '#FFC52F' },
}

export const logoUrl = (teamId: number) => `https://www.mlbstatic.com/team-logos/${teamId}.svg`
export const headshotUrl = (playerId: number) => `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`

/** Null when the team id is not in the table (a loud error upstream, never a guessed colour). */
export function teamInfo(id: number, abbr: string, name: string, nickname: string): TeamInfo | null {
  const c = T[id]
  return c ? { id, abbr, name, nickname, primary: c.primary, light: c.light, logo: logoUrl(id) } : null
}
