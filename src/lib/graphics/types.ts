// src/lib/graphics/types.ts
//
// Data model for the admin graphic blocks (/admin/graphics). Plain data only:
// a GraphicSpec is everything a block needs to draw itself. The footer and
// handle are NOT part of the spec (see constants.ts), so they cannot be edited away.

/** 'neutral' (white pill) or an MLB abbreviation such as 'TB', 'MIL', 'NYY'. */
import type { OtdBody } from './otd-types'

export type TeamKey = string
export type SizeKey = 'landscape' | 'portrait' // 1200x675 | 1080x1350
export type TemplateId = 'collision' | 'arsenal' | 'contrast' | 'attack' | 'scoreboard' | 'textlist' | 'otd' | 'sotd'

/** Text pill only, e.g. "TB", "MIL", "PROJECTED". */
export interface Chip { text: string; team: TeamKey }

export interface Stat {
  group?: string            // layout slot, see each block
  team?: TeamKey
  /** MLB player id: shows that person's headshot on the panel (collision hero, catcher card). */
  playerId?: number
  label: string
  value?: string            // already formatted, e.g. "26.7%", ".336", "11 for 11"
  sub?: string              // small line under the value
  rank?: string             // e.g. "1st"
  n?: number                // 0 to 100, drives bar length where a bar is drawn
  cells?: string[]          // extra table cells (arsenal: usage, whiff, xwOBA; attack: pitch, xwOBA, whiff)
  vs?: { label: string; value: string; n: number } // contrast blocks (season comparison)
}

/** Preloaded images as data URLs, keyed 'x9', 'team:TB', 'player:607259'. Blocks never fetch; a missing key just means no image. */
export type GraphicImages = Record<string, string>

export interface GraphicSpec {
  id: string
  template: TemplateId
  kicker: string            // top right, e.g. "World Series Game 1 Scout"
  title: string
  subtitle?: string
  chips: Chip[]
  columns?: string[]        // table column headings
  stats: Stat[]
  /** Pitcher templates: headshot circle beside the title. */
  player?: { id: number; team?: string }
  /** Optional panel tab text per group (defaults live in each block). */
  panels?: Record<string, string>
  /** Optional small footnote under a group's panel, keyed by group. */
  notes?: Record<string, string>
  /** 'On this day' and 'Stat of the day' only: the event date as free text and the card body. These two templates never draw a team or player image. */
  otd?: { date: string; body: OtdBody }
}
