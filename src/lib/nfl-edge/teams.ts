// src/lib/nfl-edge/teams.ts
//
// The 32 NFL clubs from nfl_teams (colour + logo come from load_teams via sync_teams.py).
// One cached read shared by every NFL page. No ESPN calls: ESPN team-ID maps are known-corrupt
// (CLAUDE.md §4), so everything here keys on the nflverse team abbreviation (KC, LAR, WAS ...).
//
// Table read: nfl_teams (writer: scripts/nfl/sync_teams.py).

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'

export type NflTeam = {
  id: string            // nflverse abbreviation, e.g. "KC"
  name: string          // "Kansas City Chiefs"
  nick: string          // "Chiefs"
  city: string          // "Kansas City"
  conference: 'AFC' | 'NFC'
  division: string      // "AFC West"
  color: string         // primary brand colour (hero background)
  color2: string
  textOn: string        // readable text colour on `color`
  logo: string
  slug: string          // "kansas-city-chiefs"
}

/** Black or white, whichever reads better on the given hex background. */
export function textOnColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#1A1A1A' : '#FFFFFF'
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

type TeamRow = {
  team_id: string; team_name: string; team_nick: string | null; conference: string | null; division: string | null
  team_color: string | null; team_color2: string | null; team_logo_url: string | null
}

const loadTeams = unstable_cache(
  async (): Promise<NflTeam[]> => {
    const { data, error } = await createAdminClient()
      .from('nfl_teams')
      .select('team_id,team_name,team_nick,conference,division,team_color,team_color2,team_logo_url')
    if (error) {
      console.error('[getNflTeams] Supabase error:', error.message)
      return []
    }
    return (data as TeamRow[]).map(t => {
      const nick = t.team_nick ?? t.team_name.split(' ').slice(-1)[0]
      const color = t.team_color ?? '#1A1A1A'
      return {
        id: t.team_id, name: t.team_name, nick,
        city: t.team_name.endsWith(nick) ? t.team_name.slice(0, -nick.length).trim() : t.team_name,
        conference: (t.conference === 'NFC' ? 'NFC' : 'AFC') as 'AFC' | 'NFC',
        division: t.division ?? '',
        color, color2: t.team_color2 ?? '#FFFFFF', textOn: textOnColor(color),
        logo: t.team_logo_url ?? `https://a.espncdn.com/i/teamlogos/nfl/500/${t.team_id.toLowerCase()}.png`,
        slug: slugify(t.team_name),
      }
    })
  },
  ['nfl-edge-teams'],
  { revalidate: 86400 },
)

export async function getNflTeams(): Promise<Map<string, NflTeam>> {
  const list = await loadTeams()
  return new Map(list.map(t => [t.id, t]))
}
