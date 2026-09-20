// src/components/postgame/report/sections.ts
//
// The Postgame report's section registry — order, tier and the scope each section is built
// to. Same shape as the Scout Report's (ScoutSectionMeta), so the shared ScoutSection frame
// renders it. `status` is the honest record of what is live; PostgameShell flips a section to
// live when its component is added to SECTION_BODIES.
//
// Free (1–13): the recap — what happened, how it swung, who did it, and what's next.
// Pro (14–22): was anything concerning? — pitchers and hitters checked against their own baselines, the Preview's plan checked
// against the night, and team-level charts. Season baselines only until the per-game Statcast precompute exists (last-5 velocity,
// hard-hit / barrel allowed baselines) — see SESSION_NOTES_2026-09-19_POSTGAME.md. Hitter last-15 form is live (batter_form_l15()).
// Design rule: postgame = THIS game only. Anything the Preview already shows about a series
// or a season is not repeated here.

import type { ScoutSectionMeta } from '@/components/scout/sections'

export const POSTGAME_SECTIONS: ScoutSectionMeta[] = [
  { id: 'final', num: 1, title: 'Final', tier: 'free', status: 'live', scope: ['Final score, innings, venue, attendance', 'A short plain read of the game', 'Series update'] },
  { id: 'swing', num: 2, title: 'How the game swung', tier: 'free', status: 'live', scope: ['Win probability by plate appearance', '3–5 inflection plays called out on the chart'] },
  { id: 'performers', num: 3, title: 'Top performers', tier: 'free', status: 'live', scope: ['Top 3 batters and top 3 pitchers of this game', 'Decisive / Solid / Quiet, with the game line'] },
  { id: 'box', num: 4, title: 'Box score', tier: 'free', status: 'live', scope: ['Batting lines, both clubs', 'Pitching lines with pitch counts', 'Pitch-by-pitch log behind a toggle'] },
  { id: 'scorecard', num: 5, title: 'The scorecard', tier: 'free', status: 'live', scope: ['Every plate appearance, scored by hand', 'Download either sheet as an image'] },
  { id: 'starters', num: 6, title: 'Starters: plan vs night', tier: 'free', status: 'live', scope: ['What the Preview said each starter would throw vs what he threw', 'One-sentence read per starter', 'Link to the deeper Pitching Lab postgame'] },
  { id: 'contact', num: 7, title: 'Spray & contact', tier: 'free', status: 'live', scope: ['Spray chart of every ball in play', 'Hard-hit % and barrel % this game vs season'] },
  { id: 'abs', num: 8, title: 'ABS & challenges', tier: 'free', status: 'live', scope: ['Challenges used, remaining and overturned', 'Who initiated each one', 'Timeline markers on the win-probability chart'] },
  { id: 'bullpen', num: 9, title: 'Bullpen used tonight', tier: 'free', status: 'live', scope: ['Who pitched, pitch counts, when they entered', '"Into tomorrow" fatigue chips (pitches over the last 1–3 days)'] },
  { id: 'defense', num: 10, title: 'Defense & run game', tier: 'free', status: 'live', scope: ['Errors and clean key plays', 'Steal attempts, caught stealing, pickoffs'] },
  { id: 'umpires', num: 11, title: 'Umpire report', tier: 'free', status: 'live', scope: ['Crew', 'Zone summary only where the data supports it'] },
  { id: 'key-players', num: 12, title: 'Key players scorecard', tier: 'free', status: 'live', scope: ['The Preview\'s key players: showed up, missed, or stayed quiet'] },
  { id: 'next', num: 13, title: 'Next up', tier: 'free', status: 'live', scope: ['Tomorrow\'s Preview and the series state', 'Count × pitch teaser for tomorrow\'s starter'] },
  { id: 'pitcher-check', num: 14, title: 'Pitchers: was anything concerning?', tier: 'pro', status: 'live', scope: ['Outing vs season and last five starts (sparklines, tonight as a dot)', 'Velocity fade by inning, whiff % by pitch, usage shock, chase & zone, first-pitch strikes, release drift', 'Concern dial: Quiet night / Mixed / Concerning'] },
  { id: 'seq-audit', num: 15, title: 'What\'s next break', tier: 'pro', status: 'live', scope: ['After each pitch, what he threw next vs his usual follow-ups', 'Predictable tonight, or lost his sequencing?'] },
  { id: 'count-audit', num: 16, title: 'Did the put-away spot hold?', tier: 'pro', status: 'live', scope: ['Where each pitch went in each count vs the pre-game map', 'Two-strike locations tonight vs his usual spots'] },
  { id: 'zone-result', num: 17, title: 'Zone clash result', tier: 'pro', status: 'live', scope: ['Which hitters\' damage zones fired against the starter\'s attack'] },
  { id: 'arsenal-night', num: 18, title: 'Full arsenal night chart', tier: 'pro', status: 'live', scope: ['Usage by count, hitter hand and time through the order'] },
  { id: 'hitter-check', num: 19, title: 'Hitters: hot, cooling, or turning a corner?', tier: 'pro', status: 'live', scope: ['Tonight vs each hitter\'s last 15 games: exit velocity, hard-hit, xwOBA on contact, whiffs, chase', 'Exit velocity vs launch angle for every ball in play, and where he did damage vs his usual zones'] },
  { id: 'leverage-line', num: 20, title: 'Leverage timeline', tier: 'pro', status: 'live', scope: ['MLB\'s leverage index for every plate appearance with a result strip'] },
  { id: 'team-charts', num: 21, title: 'Team & game charts', tier: 'pro', status: 'live', scope: ['Bullpen stress vs a typical bullpen day', 'Offense process: hard-hit and barrel % vs season', 'Starter watch for the rest of the series'] },
  { id: 'tomorrow', num: 22, title: 'Into tomorrow — Scout teaser', tier: 'pro', status: 'live', scope: ['Fatigue and matchup notes for game N+1'] },
]
