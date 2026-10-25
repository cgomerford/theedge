// src/components/admin/story-v5/remotion/config.ts
//
// One config for the whole video: size, timings and themes. Change a scene's length here and every scene follows
// (the scenes read their own length; the video is as long as the ticked slides, up to MAX_SECONDS).
// Rule of the build: every count-up finishes and then holds for at least 1.5 s (45 frames) before its scene cuts.

export const FPS = 30
export const WIDTH = 1080
export const HEIGHT = 1350
export const MARGIN = 100                 // content margin left and right
export const TITLE_TOP = 90               // the kicker / headline block starts here
export const FOOTER_BOTTOM = 210          // footer sits this far from the bottom edge
export const HOLD_FRAMES = 45             // 1.5 s

export type SceneId = 'hook' | 'matchup' | 'replay' | 'arsenal' | 'arsenalHome' | 'compare' | 'tunnel' | 'defense' | 'defenseAway' | 'scout' | 'custom' | 'custom2' | 'bullpen' | 'outro'
export const SCENE_LENGTHS: Record<SceneId, number> = { hook: 100, matchup: 110, replay: 185, arsenal: 190, arsenalHome: 190, compare: 130, tunnel: 175, defense: 95, defenseAway: 95, scout: 120, custom: 100, custom2: 100, bullpen: 95, outro: 60 }
/** Every slide that exists, with its label for the admin panel. `optional` slides are off in the default video. */
export const SCENE_CATALOG: { id: SceneId; label: string; blurb: string; optional?: boolean; pinned?: 'first' | 'last' }[] = [
  { id: 'hook', label: 'Cold open', blurb: 'hardest pitch of the last game flies in, hook number, score and first pitch time', pinned: 'first' },
  { id: 'matchup', label: 'Matchup', blurb: 'both clubs with logos, starting pitchers, first pitch time, series and ballpark', optional: true },
  { id: 'replay', label: 'Previous game replay', blurb: 'key plays of the last meeting on a diamond', optional: true },
  { id: 'arsenal', label: 'Away starter arsenal', blurb: 'up to 4 average pitch paths, usage and whiff' },
  { id: 'arsenalHome', label: 'Home starter arsenal', blurb: 'the same view for the home starter', optional: true },
  { id: 'compare', label: 'Two arsenals side by side', blurb: 'both starters: each pitch, how often it is thrown and how often it misses bats', optional: true },
  { id: 'tunnel', label: 'Home starter tunnel', blurb: 'two pitches sharing a tunnel, then times through the order' },
  { id: 'defense', label: 'Defense, OAA', blurb: 'Outs Above Average on a field (home team, or both side by side)' },
  { id: 'defenseAway', label: 'Defense, away team', blurb: 'the away team on the same field: put it after the home slide for home then away', optional: true },
  { id: 'scout', label: 'Scout Report slide', blurb: 'another part of the Scout Report: running game or late and close', optional: true },
  { id: 'custom', label: 'Custom slide 1', blurb: 'build your own from blocks: big number, text, team logos, matchup, pitchers, head to head table', optional: true },
  { id: 'custom2', label: 'Custom slide 2', blurb: 'a second one, built the same way', optional: true },
  { id: 'bullpen', label: 'Bullpens', blurb: 'pitch counts per reliever' },
  { id: 'outro', label: 'Outro', blurb: 'matchup, first pitch time, x9Lab', pinned: 'last' },
]
export const ALL_SCENES: SceneId[] = SCENE_CATALOG.map(c => c.id)
export const DEFAULT_SCENES: SceneId[] = SCENE_CATALOG.filter(c => !c.optional).map(c => c.id)
export const MAX_SECONDS = 45
export const MAX_FRAMES = MAX_SECONDS * FPS   // 45 s (1350 frames): the longest a video can be

/** Lay the chosen slides end to end. Unknown ids are dropped; an empty list is returned as is (the caller shows an empty state). */
export function layout(ids: SceneId[]): { scenes: { id: SceneId; from: number; length: number }[]; total: number } {
  let at = 0
  const scenes = ids.filter(id => id in SCENE_LENGTHS).map(id => { const s = { id, from: at, length: SCENE_LENGTHS[id] }; at += SCENE_LENGTHS[id]; return s })
  return { scenes, total: at }
}

export const TIMING = {
  hook: { flyFrom: 4, flyTo: 40, flashEnd: 56, countFrom: 4, countFrames: 20, outAt: 70, groupAt: 74 },
  replay: { firstBeat: 24, maxGap: 24 },
  arsenal: { firstPitch: 6, gap: 28, flight: 22 },       // gap is 28 (not 34) so the last whiff count can hold 1.5 s
  tunnel: { flyFrom: 8, flight: 34, calloutFrom: 50, calloutTo: 98, barsFrom: 98, barsDone: 126 },
  defense: { first: 6, step: 3, countFrames: 20 },
  bullpen: { first: 6, step: 3, countFrames: 24 },
  scout: { first: 8, step: 6, countFrames: 28 },
  matchup: { first: 4, step: 6 },
  compare: { first: 6, step: 4, countFrames: 26 },
  custom: { first: 6, countFrames: 24 },
}

export type Theme = {
  name: 'paper' | 'dark'
  bg: string; text: string; accent: string; dim: string; card: string; line: string
  ball: string; bar: string; glow: string; negative: string
}
export const THEMES: Record<'paper' | 'dark', Theme> = {
  paper: { name: 'paper', bg: '#FAF8F3', text: '#1A1A1A', accent: '#FF5722', dim: '#5C5A55', card: '#FFFFFF', line: '#E7E2D8', ball: '#1A1A1A', bar: '#B9B3A6', glow: 'rgba(255,87,34,0.05)', negative: '#4F7CAC' },
  dark: { name: 'dark', bg: '#121212', text: '#FAF8F3', accent: '#FF5722', dim: '#8A867E', card: '#1D1D1D', line: '#2E2E2E', ball: '#FAF8F3', bar: '#4A4A4A', glow: 'rgba(255,87,34,0.07)', negative: '#8FBCE6' },
}
