// src/lib/shape/demoFixture.ts
//
// Synthetic demo data for the pitch-shape guide only. Not a real pitcher. Never used on a data surface.
//
// Imported by exactly one route (/mlb/lab/pitch-shape/guide); a test enforces that. Shapes match the real
// Shape tab's prop types (ShapeLabData and friends) exactly, so the real components render it unchanged.
// The league bins are generated deterministically (no Math.random) and deep-frozen at load.
//
// What the demo is built to show, before a reader meets it on a live page:
//   - map cells under the 150-swing gate (the thin edges of the movement map)  -> hatched
//   - arm-slot bands under the gate (the steep over-the-top slots)             -> hatched
//   - one slot band whose exact match was too thin and was "widened to ±2"      -> asterisk + badge
// Demo RHP's four-seam: 100.6 mph, +15.3" IVB, +11.2" HB, 30° arm angle. This is intentionally an extreme
// velocity, so the league neighbourhood around it is thin, which is what makes the gates visible.

import { BIN_WIDTH, type PitcherPitchShape, type ShapeBin, type ShapeLabData } from '@/lib/pitch-shape/model'

const CENTRE = { velo: 95.0, ivb: 16, hb: 8, slot: 32 }
const SD = { velo: 3.4, ivb: 3.8, hb: 4.4, slot: 10.5 }
const SCALE = 11 // swings in the densest bin

const g = (z: number) => Math.exp(-0.5 * z * z)
const clamp = (x: number, l: number, h: number) => Math.max(l, Math.min(h, x))
// Smooth, deterministic wobble so the map is not a perfect gradient.
const ripple = (h: number, i: number) => 0.012 * Math.sin(h * 0.9 + i * 0.55) + 0.008 * Math.cos(h * 0.37 - i * 0.8)

function bins(): ShapeBin[] {
  const out: ShapeBin[] = []
  const v0 = Math.round(CENTRE.velo / BIN_WIDTH.velo), i0 = Math.round(CENTRE.ivb / BIN_WIDTH.ivb), h0 = Math.round(CENTRE.hb / BIN_WIDTH.hb)
  for (let dv = -8; dv <= 11; dv++) for (let di = -10; di <= 10; di++) for (let dh = -11; dh <= 11; dh++) for (let sb = 2; sb <= 9; sb++) {
    const velo = (v0 + dv) * BIN_WIDTH.velo, ivb = (i0 + di) * BIN_WIDTH.ivb, hb = (h0 + dh) * BIN_WIDTH.hb, slot = sb * BIN_WIDTH.slot
    const dens = g((velo - CENTRE.velo) / SD.velo) * g((ivb - CENTRE.ivb) / SD.ivb) * g((hb - CENTRE.hb) / SD.hb) * g((slot - CENTRE.slot) / SD.slot)
    const swings = Math.round(SCALE * dens * 100) / 100 >= 0.5 ? Math.round(SCALE * dens * 10) : 0
    if (swings < 1) continue
    const w = clamp(0.23 + 0.011 * (ivb - CENTRE.ivb) - 0.003 * (hb - CENTRE.hb) + 0.012 * (velo - CENTRE.velo) - 0.0016 * Math.abs(slot - CENTRE.slot) + ripple(hb, ivb), 0.04, 0.62)
    const pitches = Math.round(swings / 0.47)
    const bbe = Math.round(swings * 0.3)
    const xw = clamp(0.372 + 0.0042 * (ivb - CENTRE.ivb) - 0.0006 * Math.abs(hb - CENTRE.hb) + ripple(hb + 3, ivb) * 0.4, 0.2, 0.55)
    out.push({
      veloBin: v0 + dv, ivbBin: i0 + di, hbBin: h0 + dh, slotBin: sb, pitches, swings, whiffs: Math.round(swings * w),
      calledStrikes: Math.round(pitches * 0.17), csw: Math.round(pitches * clamp(0.16 + 0.55 * w, 0.1, 0.6)), bbe,
      xwobaConSum: bbe * xw, hardHit: Math.round(bbe * 0.38), gb: Math.round(bbe * clamp(0.3 - 0.011 * (ivb - CENTRE.ivb), 0.12, 0.75)),
    })
  }
  return out
}

// His pitches: a fixed 46-point cloud around the average, from a seeded generator.
function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647 }
function cloud(hb: number, ivb: number, sdHb: number, sdIvb: number) {
  const r = seeded(11)
  const z = () => { let u = 0; for (let k = 0; k < 6; k++) u += r(); return ((u - 3) / Math.sqrt(0.5)) * 0.7 }
  return Array.from({ length: 46 }, () => ({ hb: hb + z() * sdHb, ivb: ivb + z() * sdIvb }))
}

const pitch: PitcherPitchShape = {
  pitchType: 'FF',
  current: { velo: 100.6, ivb: 15.3, hb: 11.2, slot: 30, sdHb: 2.4, sdIvb: 2.1, n: 812 },
  prev: { velo: 99.8, ivb: 14.6, hb: 10.5, slot: 31, sdHb: 2.5, sdIvb: 2.2, n: 764 },
  points: cloud(11.2, 15.3, 2.4, 2.1),
  own: { whiff: 0.318, swings: 355 },
}

const data: ShapeLabData = {
  pitcherId: 0,
  name: 'Demo RHP',
  hand: 'R',
  teamAbbr: 'DEMO',
  teamColor: '#1A1A1A',
  season: 2026,
  prevSeason: 2025,
  leagueSpan: '2024–2026 (synthetic)',
  pitches: [pitch],
  bins: { FF: bins() },
  counts: { FF: null },
  batterSides: { FF: null },
  monthly: { FF: null },
  view: {},
  viewSeasons: {},
  compare: {},
  validation: { stability: null, within: null },
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const k of Object.keys(o as object)) deepFreeze((o as Record<string, unknown>)[k])
  }
  return o
}

export const DEMO_SHAPE: Readonly<ShapeLabData> = deepFreeze(data)
