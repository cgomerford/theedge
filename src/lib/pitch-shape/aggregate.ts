// src/lib/pitch-shape/aggregate.ts
//
// Pure helper (no 3D, no React): collapse a pitcher's monthly rows into one whole-season row.
import type { PitchViewMonth } from './model'

/** One row per season: pitch-weighted mean of the shape terms, summed counts. Counts stay null if no month had them. */
export function aggregateSeason(season: number, months: PitchViewMonth[]): PitchViewMonth | null {
  const total = months.reduce((s, m) => s + m.n, 0)
  if (!months.length || total === 0) return null
  const wm = (f: (m: PitchViewMonth) => number) => months.reduce((s, m) => s + f(m) * m.n, 0) / total
  const wmOpt = (f: (m: PitchViewMonth) => number | null) => {
    const ms = months.filter(m => f(m) != null)
    const w = ms.reduce((s, m) => s + m.n, 0)
    return w ? ms.reduce((s, m) => s + (f(m) as number) * m.n, 0) / w : null
  }
  const sum = (f: (m: PitchViewMonth) => number | null) => (months.some(m => f(m) != null) ? months.reduce((s, m) => s + (f(m) ?? 0), 0) : null)
  return {
    month: season, season, label: String(season), n: total,
    releaseX: wm(m => m.releaseX), releaseY: wm(m => m.releaseY), releaseZ: wm(m => m.releaseZ), extension: wmOpt(m => m.extension),
    speed: wm(m => m.speed), spin: wmOpt(m => m.spin),
    vx0: wm(m => m.vx0), vy0: wm(m => m.vy0), vz0: wm(m => m.vz0), ax: wm(m => m.ax), ay: wm(m => m.ay), az: wm(m => m.az),
    plateX: wm(m => m.plateX), plateZ: wm(m => m.plateZ), szTop: wm(m => m.szTop), szBot: wm(m => m.szBot), ivb: wm(m => m.ivb), hb: wm(m => m.hb),
    nSwings: sum(m => m.nSwings), nWhiffs: sum(m => m.nWhiffs), nCsw: sum(m => m.nCsw), nBbe: sum(m => m.nBbe), xwobaConSum: sum(m => m.xwobaConSum),
    nWeak: sum(m => m.nWeak), absN: sum(m => m.absN), absUpheld: sum(m => m.absUpheld),
  }
}
