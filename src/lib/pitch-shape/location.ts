// src/lib/pitch-shape/location.ts
//
// Pure constants and types for the Pitch Shape Lab location panel (where pitches near a spot on the movement map cross
// the plate). Shared by the server reader (data.ts), the API route and LocationPanel.tsx. The grid is defined by
// scripts/build_pitch_shape_locations.py — change one, change the other.
//
//   lx 0..23  across, in the BATTER's frame (inside on the left), 0.166 ft per column; the rulebook zone (+-0.83 ft) is columns 7..16
//   lz 0..27  up, a tenth of the batter's own zone height per row (zone padded 0.12 ft top and bottom); the zone is rows 9..18

export const LOC_COLS = 24
export const LOC_ROWS = 28
export const ZONE_COL0 = 7
export const ZONE_COL1 = 16
export const ZONE_ROW0 = 9
export const ZONE_ROW1 = 18
/** fewer pitches than this near a spot is too thin to draw a distribution */
export const MIN_LOC_PITCHES = 60

export type LocationWindow = { n: number; cells: number[] } // cells: flat [lx, lz, pitches, ...]
export type LocationPayload = {
  seasons: number[]       // seasons that have rows, oldest first
  latest: number
  latestWindow: LocationWindow
  allWindow: LocationWindow
}
