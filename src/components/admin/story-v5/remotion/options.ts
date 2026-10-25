// src/components/admin/story-v5/remotion/options.ts
//
// Per-slide options (what a slide shows) and the global look (header and watermark). One catalog drives both the video and the admin panel:
// add an option here, read it with useOpt() in the scene, and the panel shows its control automatically.
// A value you have not touched is the default, so a saved selection from before an option existed keeps working.

import type { SceneId } from './config'

export type OptValue = boolean | string
export type OptDef =
  | { key: string; label: string; type: 'bool'; default: boolean }
  | { key: string; label: string; type: 'select'; default: string; choices: { value: string; label: string }[] }
export type SlideOptions = Partial<Record<SceneId, Record<string, OptValue>>>

const yes = (key: string, label: string, def = true): OptDef => ({ key, label, type: 'bool', default: def })
const pick = (key: string, label: string, def: string, choices: [string, string][]): OptDef => ({ key, label, type: 'select', default: def, choices: choices.map(([value, l]) => ({ value, label: l })) })
const arsenal: OptDef[] = [pick('maxPitches', 'Pitches shown', '4', [['2', '2'], ['3', '3'], ['4', '4']]), yes('showLine', 'Postseason line (IP, K, BB)'), yes('showHeadshot', 'Headshot and logo'), yes('showCards', 'Pitch cards')]

export const SLIDE_OPTIONS: Partial<Record<SceneId, OptDef[]>> = {
  hook: [yes('showHeadshot', 'Pitcher headshot'), yes('showScore', 'Score, game and first pitch time at the end'), yes('showUnit', 'MPH label')],
  matchup: [yes('showLogos', 'Team logos'), yes('showPitchers', 'Starting pitchers with headshots'), yes('showFirstPitch', 'First pitch time (ET and PT)'), yes('showSeries', 'Series status'), yes('showVenue', 'Ballpark')],
  arsenal, arsenalHome: arsenal,
  compare: [pick('maxPitches', 'Pitches per starter', '4', [['2', '2'], ['3', '3'], ['4', '4']]), yes('showHeadshots', 'Headshots')],
  tunnel: [yes('showCallout', 'Tunnel callout (inches apart)'), yes('showBars', 'Times through the order bars'), yes('showHeadshot', 'Headshot and logo'), yes('showCards', 'Pitch cards')],
  defense: [yes('showPills', 'Team OAA chips'), yes('showHeadshots', 'Fielder headshots'), yes('showNotes', 'Footnote for off-position fielders')],
  defenseAway: [yes('showPills', 'Team OAA chips'), yes('showHeadshots', 'Fielder headshots'), yes('showNotes', 'Footnote for off-position fielders')],
  scout: [yes('showHeadshot', 'Catcher headshots'), yes('showAbs', 'ABS record (running game)')],
  bullpen: [pick('maxRows', 'Relievers shown', '8', [['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8']]), yes('showHeadshots', 'Headshots'), yes('showClosing', 'Closing line')],
  outro: [yes('showMatchup', 'Team logos'), yes('showHeadshots', 'Starter headshots'), yes('showTime', 'First pitch time'), yes('showButton', 'Button')],
}

export function getOpt(opts: SlideOptions | undefined, id: SceneId, key: string): OptValue {
  const v = opts?.[id]?.[key]
  const def = SLIDE_OPTIONS[id]?.find(d => d.key === key)
  if (v === undefined || !def) return def?.default ?? false
  if (def.type === 'bool') return typeof v === 'boolean' ? v : def.default
  return def.choices.some(c => c.value === v) ? v : def.default
}
export const optBool = (opts: SlideOptions | undefined, id: SceneId, key: string) => getOpt(opts, id, key) === true
export const optNum = (opts: SlideOptions | undefined, id: SceneId, key: string) => Number(getOpt(opts, id, key))

/** The look that applies to every slide. header: a strip of team logos or the matchup at the top right. watermark: faint big logos behind the slide. */
export type Look = { header: 'off' | 'logos' | 'matchup'; watermark: boolean }
export const DEFAULT_LOOK: Look = { header: 'off', watermark: false }
