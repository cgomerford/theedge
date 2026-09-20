// src/components/team-desk/sections.ts
//
// Section registry for the team page's "Club Desk" — the Scout Report's
// concepts (ABS, run game, defense, bullpen, splits, leverage, form, club
// status, manager card) turned inward: one club's season-long profile, with
// its next game as the reference point where a matchup is needed.
//
// Reuses the Scout Report's ScoutSectionMeta / ScoutSection frame so tiers
// and the locked-section note behave identically. Tiers deliberately mirror
// scout/sections.ts (club status, form, bullpen = free; the rest Pro; the
// manager card = free teaser) — change them there and here together if the
// product decision moves.

import type { ScoutSectionMeta } from '@/components/scout/sections'

export const TEAM_DESK_SECTIONS: ScoutSectionMeta[] = [
  { id: 'manager-card', num: 1, title: 'Next game: watch-fors', tier: 'teaser', status: 'live', scope: [] },
  { id: 'club-status', num: 2, title: 'Club status & roster construction', tier: 'free', status: 'live', scope: [] },
  { id: 'form-vs-skill', num: 3, title: 'Form vs skill trends', tier: 'free', status: 'live', scope: [] },
  { id: 'bullpen', num: 4, title: 'Bullpen intelligence', tier: 'free', status: 'live', scope: [] },
  { id: 'abs', num: 5, title: 'ABS challenge desk', tier: 'pro', status: 'live', scope: [] },
  { id: 'run-game', num: 6, title: 'Run game: steals & baserunning', tier: 'pro', status: 'live', scope: [] },
  { id: 'defense', num: 7, title: 'Defense & alignment', tier: 'pro', status: 'live', scope: [] },
  { id: 'splits', num: 8, title: 'Platoon · home/road · day/night', tier: 'pro', status: 'live', scope: [] },
  { id: 'leverage', num: 9, title: 'Leverage & late tendencies', tier: 'pro', status: 'live', scope: [] },
]
