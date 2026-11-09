// src/lib/milb-shape/limits.ts
//
// The sample-size rules of the Pitch Shape Lab, per level, in one place. MLB, Triple-A and the Florida State League keep the rules the Lab has always had (a season is long, so a
// small sample is noise and is left out or marked thin). Spring Training and the Arizona Fall League are a few weeks of games, so they carry a SMALL minimum only: a pitcher needs 30 pitches of a type to be
// listed, compared and ranked. Every square on the map still shows (thin ones are smoothed toward the league average, see priorSwings), and a measure is blank only when nothing was recorded.
// The server readers and the client both ask here, so a level cannot be gated one way on the map and another way in the list.

import { isExhibition, type Level } from './levels'

export type Limits = {
  /** false: every measure shows from whatever sample there is (measuresOf(x, false)) */
  gated: boolean
  /** pitches of a type a pitcher needs to be listed on the map and in "who throws it" */
  comparePitches: number
  /** pitches a pitcher needs to be listed on the Shape Score board */
  boardPitches: number
  /** pitches of his own needed before his runs saved are compared with his shape's (below it: shown, flagged thin) */
  ownPitches: number
  /** swings a map square or window needs before it has a whiff rate */
  windowSwings: number
  /** swings at which a square is drawn at full strength (below it: faded) */
  strongSwings: number
  /** swings in a window for a numbered "best spot" */
  spotSwings: number
  /** swings of his own before he is called ahead of or behind his shape */
  ownSwings: number
  /**
   * Smoothing for the map colour: a square's whiff rate is pulled toward the league rate as if it carried this many extra swings at the league rate, so a square with one swing
   * cannot read as 0% or 100%. 0 = none (the standard levels, whose thin squares are simply left blank). Display only: the figures shown in the readout stay the raw counts.
   */
  priorSwings: number
}

const STANDARD: Limits = { gated: true, comparePitches: 300, boardPitches: 100, ownPitches: 300, windowSwings: 40, strongSwings: 100, spotSwings: 200, ownSwings: 100, priorSwings: 0 }
// spotSwings is not a display minimum: it only decides which squares are RANKED as the numbered "best spots", so a square with one swing that missed does not become spot 1 (every square still shows).
export const EXHIBITION_MIN_PITCHES = 30   // George, 2026-11-09: a small minimum of 30 pitches on Spring Training and the Arizona Fall League
const NONE: Limits = { gated: false, comparePitches: EXHIBITION_MIN_PITCHES, boardPitches: EXHIBITION_MIN_PITCHES, ownPitches: EXHIBITION_MIN_PITCHES, windowSwings: 1, strongSwings: 1, spotSwings: 15, ownSwings: 1, priorSwings: 30 }

export const limitsFor = (level: Level): Limits => (isExhibition(level) ? NONE : STANDARD)
