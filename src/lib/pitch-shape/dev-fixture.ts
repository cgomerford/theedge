// src/lib/pitch-shape/dev-fixture.ts
//
// SYNTHETIC SAMPLE DATA — dev preview only (/dev/pitch-shape-preview, which 404s in production).
// Ported from the mockup's model so the real UI + the real lookup code can be judged before the
// pitch_shape_bins writer has produced a row. Nothing here is a real pitch, pitcher or league
// number, and no production route imports this file.

import { BIN_WIDTH, type Hand, type PitchViewMonth, type PitcherPitchShape, type Shape, type ShapeBin, type ShapeLabData } from './model'

type Gen = { c: Shape; sd: { ivb: number; hb: number; velo: number }; a: number; b: number; base: { whiff: number; gb: number; xw: number } }
const GEN: Record<string, Gen> = {
  FF: { c: { velo: 94, ivb: 16, hb: 8, slot: 40 }, sd: { ivb: 3.6, hb: 4.2, velo: 2.2 }, a: 0.011, b: -0.003, base: { whiff: 0.23, gb: 0.30, xw: 0.372 } },
  ST: { c: { velo: 83, ivb: 1, hb: -15, slot: 35 }, sd: { ivb: 3.4, hb: 3.6, velo: 2.0 }, a: -0.003, b: -0.010, base: { whiff: 0.34, gb: 0.44, xw: 0.332 } },
  SL: { c: { velo: 86, ivb: 2, hb: -6, slot: 40 }, sd: { ivb: 3.2, hb: 3.2, velo: 2.0 }, a: -0.004, b: -0.011, base: { whiff: 0.33, gb: 0.46, xw: 0.318 } },
  CH: { c: { velo: 86, ivb: 6, hb: 15, slot: 40 }, sd: { ivb: 3.6, hb: 3.8, velo: 2.2 }, a: -0.006, b: 0.005, base: { whiff: 0.31, gb: 0.47, xw: 0.316 } },
}
export const FIXTURE_TYPES = Object.keys(GEN)

const clamp = (x: number, l: number, h: number) => Math.max(l, Math.min(h, x))
const gauss = (z: number) => Math.exp(-0.5 * z * z)
const ripple = (h: number, i: number) => 0.012 * Math.sin(h * 0.9 + i * 0.55) + 0.008 * Math.cos(h * 0.37 - i * 0.8)

export function fixtureBins(type: string, hand: Hand): ShapeBin[] {
  const g = GEN[type]
  if (!g) return []
  const handF = hand === 'L' ? 0.27 : 1
  const out: ShapeBin[] = []
  const vb0 = Math.round(g.c.velo / BIN_WIDTH.velo), ib0 = Math.round(g.c.ivb / BIN_WIDTH.ivb), hb0 = Math.round(g.c.hb / BIN_WIDTH.hb)
  for (let dv = -7; dv <= 7; dv++) for (let di = -12; di <= 12; di++) for (let dh = -12; dh <= 12; dh++) for (let sb = 2; sb <= 9; sb++) {
    const velo = (vb0 + dv) * BIN_WIDTH.velo, ivb = (ib0 + di) * BIN_WIDTH.ivb, hb = (hb0 + dh) * BIN_WIDTH.hb, slot = sb * BIN_WIDTH.slot
    const dens = gauss((hb - g.c.hb) / (g.sd.hb * 1.35)) * gauss((ivb - g.c.ivb) / (g.sd.ivb * 1.35)) * gauss((velo - g.c.velo) / (g.sd.velo * 1.35)) * gauss((slot - g.c.slot) / 11)
    const swings = Math.round(44 * dens * handF)
    if (swings < 1) continue
    const w = clamp(g.base.whiff + g.a * (ivb - g.c.ivb) + g.b * (hb - g.c.hb) + 0.004 * (velo - g.c.velo) - 0.0016 * Math.abs(slot - g.c.slot) + ripple(hb, ivb), 0.03, 0.62)
    const pitches = Math.round(swings / 0.47)
    const bbe = Math.round(swings * 0.3)
    const xw = clamp(g.base.xw + 0.0042 * (ivb - g.c.ivb) - 0.0006 * Math.abs(hb - g.c.hb) + ripple(hb + 3, ivb) * 0.4, 0.2, 0.55)
    const gb = clamp(g.base.gb - 0.011 * (ivb - g.c.ivb), 0.12, 0.75)
    const whiffs = Math.round(swings * w)
    out.push({
      veloBin: vb0 + dv, ivbBin: ib0 + di, hbBin: hb0 + dh, slotBin: sb, pitches, swings, whiffs,
      calledStrikes: Math.round(pitches * 0.17), csw: Math.round(pitches * clamp(0.16 + 0.55 * w, 0.1, 0.6)), bbe,
      xwobaConSum: bbe * xw, hardHit: Math.round(bbe * 0.38), gb: Math.round(bbe * gb),
    })
  }
  return out
}

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647 }

function pitchOf(type: string, cur: Omit<PitcherPitchShape['current'], 'n'> & { n: number }, prev: PitcherPitchShape['prev'], own: PitcherPitchShape['own']): PitcherPitchShape {
  const rnd = seeded(7 + type.charCodeAt(0))
  const g = () => { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return ((u - 3) / Math.sqrt(0.5)) * 0.7 }
  return { pitchType: type, current: cur, prev, own, points: Array.from({ length: 46 }, () => ({ hb: cur.hb + g() * cur.sdHb, ivb: cur.ivb + g() * cur.sdIvb })) }
}

/** SYNTHETIC monthly rows (a right-hander), physically plausible, so the 3D story model can be judged in the dev preview. */
function fixtureView(speed0: number, ivb0: number, hb0: number): PitchViewMonth[] {
  return [4, 5, 6, 7, 8, 9].map((month, k) => {
    const speed = speed0 + 0.12 * k - (k === 4 ? 0.4 : 0)
    return {
      month, n: k === 5 ? 38 : 120 + k * 9, releaseX: -1.9 - 0.04 * k, releaseY: 53.9 - 0.03 * k, releaseZ: 5.95 + 0.02 * k - (k === 3 ? .06 : 0), extension: 6.6 + 0.03 * k,
      speed, spin: 2300 + 6 * k, vx0: 2.8 + 0.1 * k, vy0: -speed * 1.467 * 1.03, vz0: -2.4, ax: -hb0 / 12 * 2 / 0.16 * 0.5, ay: 29, az: -32.17 + ivb0 / 12 * 2 / 0.16 * 0.5,
      plateX: -0.1 + 0.05 * k, plateZ: 2.7 + 0.03 * k, szTop: 3.4, szBot: 1.6, ivb: ivb0 - 0.2 * k, hb: hb0 + 0.15 * k,
      nSwings: 60 + 4 * k, nWhiffs: 18 + (k % 3) * 3, nCsw: 40 + k, nBbe: 28 + k, xwobaConSum: (28 + k) * (0.31 + 0.01 * ((k * 5) % 4)),   // SYNTHETIC
      nWeak: 9 + (k % 3), absN: 6 + k % 2, absUpheld: 3 + (k % 3), season: 2026,
    }
  })
}

export function fixtureLab(): ShapeLabData {
  const types = ['SL', 'FF', 'CH']
  return {
    pitcherId: 0, name: 'Sample Pitcher', hand: 'R', teamAbbr: 'SMP', teamColor: '#002D72', season: 2026, prevSeason: 2025, leagueSpan: '2024–2026 (synthetic)',
    pitches: [
      pitchOf('SL', { hb: -6.8, ivb: 1.6, velo: 86.2, slot: 42, sdHb: 2.5, sdIvb: 2.2, n: 488 }, { hb: -5.4, ivb: 0.4, velo: 86.9, slot: 44, sdHb: 2.5, sdIvb: 2.2, n: 612 }, { whiff: 0.351, swings: 224 }),
      pitchOf('FF', { hb: 8.9, ivb: 17.4, velo: 94.3, slot: 42, sdHb: 3.0, sdIvb: 2.8, n: 1105 }, { hb: 8.2, ivb: 16.1, velo: 94.8, slot: 44, sdHb: 3.0, sdIvb: 2.8, n: 1021 }, { whiff: 0.238, swings: 508 }),
      pitchOf('CH', { hb: 14.6, ivb: 6.5, velo: 87.0, slot: 42, sdHb: 2.8, sdIvb: 2.6, n: 262 }, { hb: 15.2, ivb: 6.0, velo: 87.4, slot: 44, sdHb: 2.8, sdIvb: 2.6, n: 244 }, { whiff: 0.318, swings: 121 }),
    ],
    bins: Object.fromEntries(types.map(t => [t, fixtureBins(t, 'R')])),
    counts: Object.fromEntries(types.map(t => [t, [{ label: 'Ahead in count', whiff: 0.34, swings: 140 }, { label: 'Even count', whiff: 0.29, swings: 160 }, { label: 'Behind in count', whiff: null, swings: 62 }]])),
    batterSides: Object.fromEntries(types.map(t => [t, [{ label: 'vs left-handed', xwobaCon: 0.341, bbe: 118 }, { label: 'vs right-handed', xwobaCon: 0.322, bbe: 177 }]])),
    monthly: Object.fromEntries(types.map(t => [t, ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((label, k) => ({ label, velo: 86.9 - k * 0.12, pitches: k === 5 ? 38 : 70 + k * 6 }))])),
    view: { SL: fixtureView(86.2, 1.6, -6.8), FF: fixtureView(94.3, 17.4, 8.9), CH: fixtureView(87.0, 6.5, 14.6) },
    compare: {},
    viewSeasons: { '2026': { SL: fixtureView(86.2, 1.6, -6.8), FF: fixtureView(94.3, 17.4, 8.9), CH: fixtureView(87.0, 6.5, 14.6) } },
    validation: { stability: { r: 0.71, detail: 'SYNTHETIC · mockup sample figure' }, within: { r: 0.58, detail: 'SYNTHETIC · mockup sample figure' } },
  }
}

