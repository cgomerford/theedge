// src/lib/stadium-dimensions.ts
//
// Pro Lab — #5: stadium geometry, feeding the spray-chart-on-real-dimensions
// visual (pitcher HR-allowed locations, batter hit locations).
//
// ⚠ DATA SOURCE NOTE — read before extending or shipping
// Unlike everything else in pro-lab-*.ts, there is no live API for park
// dimensions, so this can't be "verified via curl" the way the Statcast
// endpoints were flagged. What's here:
//   - LF / LCF / CF / RCF / RF distances, and headline wall heights (e.g.
//     Fenway's 37ft Green Monster) — these are well-published, stable,
//     low-risk-of-being-wrong numbers repeated consistently across MLB.com,
//     Wikipedia park pages, and Statcast's own venue displays.
//   - A simplified 5-point wall polygon per park, interpolated from those
//     same headline numbers — this is an APPROXIMATION of the true wall
//     shape, not a traced outline. Fine for "which part of the field did
//     this land in" visuals; NOT precise enough for anything claiming exact
//     wall-clearance margins.
// Before this goes live: spot-check 3-4 parks against MLB.com's official
// ballpark pages, and flag any park renovated in the last 2 seasons for
// re-check (dimensions do occasionally change).
//
// Distances in feet. Wall heights in feet. Angles in degrees from home
// plate, where 0° = straight down the LF line, 90° = straight to CF,
// 180° = straight down the RF line (matches how spray angle is normally
// described in scouting/broadcast contexts).

export type StadiumGeometry = {
  venue: string
  team: string
  orientation_deg: number | null // compass bearing from home plate through CF, null = unconfirmed
  indoor: boolean
  wall: {
    lf_line_ft: number
    lf_power_alley_ft: number | null
    cf_ft: number
    rf_power_alley_ft: number | null
    rf_line_ft: number
  }
  wall_height_ft: {
    lf_line: number
    cf: number
    rf_line: number
    notes?: string // e.g. Fenway's Green Monster, Minute Maid's Crawford Boxes
  }
  backstop_ft: number | null // home plate to backstop — unconfirmed for most parks, kept null rather than guessed
}

// Simplified wall polygon point — angle in degrees (0=LF line, 90=CF, 180=RF line),
// distance in feet from home plate. 5 points is enough to place a batted-ball
// dot relative to the wall; it is NOT a traced outline.
export type WallPoint = { angle_deg: number; distance_ft: number }

export function wallPolygon(g: StadiumGeometry): WallPoint[] {
  return [
    { angle_deg: 0, distance_ft: g.wall.lf_line_ft },
    { angle_deg: 45, distance_ft: g.wall.lf_power_alley_ft ?? interpolate(g.wall.lf_line_ft, g.wall.cf_ft) },
    { angle_deg: 90, distance_ft: g.wall.cf_ft },
    { angle_deg: 135, distance_ft: g.wall.rf_power_alley_ft ?? interpolate(g.wall.cf_ft, g.wall.rf_line_ft) },
    { angle_deg: 180, distance_ft: g.wall.rf_line_ft },
  ]
}

function interpolate(a: number, b: number): number {
  return Math.round((a + b) / 2)
}

// =====================================================
// PARK DATA — headline distances only. Fill in as verified.
// Teams not yet added fall back to a league-average generic shape
// (see genericStadium()) rather than guessed real numbers.
// =====================================================

export const STADIUM_GEOMETRY: Record<string, StadiumGeometry> = {
  'Fenway Park': {
    venue: 'Fenway Park', team: 'Red Sox', orientation_deg: 45, indoor: false,
    wall: { lf_line_ft: 310, lf_power_alley_ft: 379, cf_ft: 390, rf_power_alley_ft: 380, rf_line_ft: 302 },
    wall_height_ft: { lf_line: 37, cf: 17, rf_line: 3, notes: 'Green Monster in LF (37ft) — shortest line distance in MLB offset by the wall height.' },
    backstop_ft: null,
  },
  'Yankee Stadium': {
    venue: 'Yankee Stadium', team: 'Yankees', orientation_deg: 75, indoor: false,
    wall: { lf_line_ft: 318, lf_power_alley_ft: 399, cf_ft: 408, rf_power_alley_ft: 385, rf_line_ft: 314 },
    wall_height_ft: { lf_line: 8, cf: 8, rf_line: 8, notes: 'Short porch in RF (314ft), a known factor in the park HR rating.' },
    backstop_ft: null,
  },
  'Coors Field': {
    venue: 'Coors Field', team: 'Rockies', orientation_deg: 75, indoor: false,
    wall: { lf_line_ft: 347, lf_power_alley_ft: 390, cf_ft: 415, rf_power_alley_ft: 375, rf_line_ft: 350 },
    wall_height_ft: { lf_line: 8, cf: 8, rf_line: 8, notes: 'Largest outfield in MLB by area — altitude, not wall shape, drives the HR factor.' },
    backstop_ft: null,
  },
  'Oracle Park': {
    venue: 'Oracle Park', team: 'Giants', orientation_deg: 90, indoor: false,
    wall: { lf_line_ft: 339, lf_power_alley_ft: 364, cf_ft: 399, rf_power_alley_ft: 415, rf_line_ft: 309 },
    wall_height_ft: { lf_line: 8, cf: 8, rf_line: 24, notes: '"Triples Alley" in RCF, plus the McCovey Cove short porch in RF.' },
    backstop_ft: null,
  },
  'Wrigley Field': {
    venue: 'Wrigley Field', team: 'Cubs', orientation_deg: 30, indoor: false,
    wall: { lf_line_ft: 355, lf_power_alley_ft: 368, cf_ft: 400, rf_power_alley_ft: 368, rf_line_ft: 353 },
    wall_height_ft: { lf_line: 11.5, cf: 11.5, rf_line: 11.5, notes: 'Ivy-covered brick, uniform ~11.5ft around the field.' },
    backstop_ft: null,
  },
  'Minute Maid Park': {
    venue: 'Minute Maid Park', team: 'Astros', orientation_deg: 60, indoor: true,
    wall: { lf_line_ft: 315, lf_power_alley_ft: 362, cf_ft: 409, rf_power_alley_ft: 373, rf_line_ft: 326 },
    wall_height_ft: { lf_line: 19, cf: 21, rf_line: 7, notes: 'Crawford Boxes in LF (19ft wall, short porch).' },
    backstop_ft: null,
  },
  'Dodger Stadium': {
    venue: 'Dodger Stadium', team: 'Dodgers', orientation_deg: 30, indoor: false,
    wall: { lf_line_ft: 330, lf_power_alley_ft: 375, cf_ft: 395, rf_power_alley_ft: 375, rf_line_ft: 330 },
    wall_height_ft: { lf_line: 8, cf: 8, rf_line: 8 },
    backstop_ft: null,
  },
  // Remaining ~23 parks: intentionally omitted rather than filled with
  // recalled-from-memory numbers I can't stand behind at the same
  // confidence level as the above. Add them the same way — headline
  // distances + one wall-height note each — verifying against MLB.com
  // as you go, rather than me batch-guessing the rest.
}

/** Fallback for any park not yet in STADIUM_GEOMETRY — a generic, clearly-labeled shape. */
export function genericStadium(venueName: string, teamName: string): StadiumGeometry {
  return {
    venue: venueName, team: teamName, orientation_deg: null, indoor: false,
    wall: { lf_line_ft: 330, lf_power_alley_ft: 375, cf_ft: 400, rf_power_alley_ft: 375, rf_line_ft: 330 },
    wall_height_ft: { lf_line: 8, cf: 8, rf_line: 8, notes: 'GENERIC PLACEHOLDER — real dimensions for this park not yet added.' },
    backstop_ft: null,
  }
}

export function getStadiumGeometry(venueName: string | undefined, teamName: string = ''): StadiumGeometry {
  if (!venueName) return genericStadium('Unknown', teamName)
  return STADIUM_GEOMETRY[venueName] ?? genericStadium(venueName, teamName)
}

// =====================================================
// STATCAST hc_x / hc_y → feet-from-home-plate conversion
//
// ⚠ UNOFFICIAL FORMULA. MLB/Statcast has never published the exact
// hc_x/hc_y coordinate system officially — this is the community-derived
// conversion (origin offset + scale factor) that's been cross-checked by
// the public sabermetrics community against known hit distances for years.
// It should still be validated here: run it against a handful of this
// pitcher's/batter's real logged home runs (hit_distance_sc from the
// pro-lab-*.ts fetchers) and confirm the computed distance lands within a
// few feet of the real one before trusting the spray chart's placement.
// =====================================================

export type FieldCoordFt = {
  x_ft: number       // + = toward RF line, - = toward LF line, 0 = straight up the middle
  y_ft: number       // distance from home plate toward CF
  distance_ft: number
  angle_deg: number  // 0 = LF line, 90 = CF, 180 = RF line (matches wallPolygon)
}

const HC_ORIGIN_X = 125.42
const HC_ORIGIN_Y = 198.27
const HC_SCALE = 2.495 // feet per Statcast coordinate unit — COMMUNITY VALUE, VERIFY

export function hcToFieldCoord(hc_x: number, hc_y: number): FieldCoordFt {
  const rawX = (hc_x - HC_ORIGIN_X) * HC_SCALE
  const rawY = (HC_ORIGIN_Y - hc_y) * HC_SCALE
  const distance_ft = Math.sqrt(rawX * rawX + rawY * rawY)
  // atan2 gives angle from straight-up-the-middle (0°), +right/-left —
  // remap to the 0(LF line)-180(RF line) convention used by wallPolygon.
  const fromCenter = Math.atan2(rawX, rawY) * (180 / Math.PI) // -90..+90 roughly
  const angle_deg = 90 + fromCenter
  return { x_ft: Math.round(rawX), y_ft: Math.round(rawY), distance_ft: Math.round(distance_ft), angle_deg: Math.round(angle_deg) }
}
