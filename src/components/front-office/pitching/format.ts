// Formatting, pitch-type names/colours (from the approved mockup) and the "vs league" shading used by every
// Pitching Desk table. Pure functions, no hooks: safe to import from server and client components.

export const PITCH_NAME: Record<string, string> = {
  FF: 'Four-seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', SV: 'Slurve', CU: 'Curveball', KC: 'Knuckle-curve',
  CS: 'Slow curve', CH: 'Changeup', FS: 'Splitter', FO: 'Forkball', SC: 'Screwball', KN: 'Knuckleball',
}
export const PITCH_COLOR: Record<string, string> = {
  FF: '#D63A3A', SI: '#E8842C', FC: '#8C5A3C', SL: '#E3B53B', ST: '#B08A1E', SV: '#9C7A2E', CU: '#3E7CB1', KC: '#2F5F8A',
  CS: '#5C93C4', CH: '#3E9C7A', FS: '#6FBFA8', FO: '#4F9E8B', SC: '#7A6FBF', KN: '#8a8275',
}
export const pitchName = (t: string) => PITCH_NAME[t] ?? t
export const pitchColor = (t: string) => PITCH_COLOR[t] ?? '#8a8275'

export const dash = '—'
export const fx = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? dash : v.toFixed(d))
export const fint = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? dash : String(Math.round(v)))
export const fsigned = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? dash : `${v > 0 ? '+' : ''}${v.toFixed(d)}`)
export const f3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? dash : v.toFixed(3).replace(/^0\./, '.'))

/** Decimal innings (176.333) -> baseball notation (176.1). */
export function ipDisplay(ip: number | null | undefined): string {
  if (ip == null || !Number.isFinite(ip)) return dash
  const whole = Math.floor(ip + 1e-6)
  const thirds = Math.round((ip - whole) * 3)
  return thirds >= 3 ? `${whole + 1}.0` : `${whole}.${thirds}`
}

export type LeagueStat = { mean: number | null; sd: number | null }
export type Tone = { bg: string; fg: string } | null

/** Shade by how many SDs the value sits from the league mean. `higherIsBetter` flips the colours. */
export function shade(value: number | null | undefined, stat: LeagueStat | undefined, higherIsBetter: boolean): Tone {
  if (value == null || !stat || stat.mean == null || stat.sd == null || !(stat.sd > 0)) return null
  const z = ((value - stat.mean) / stat.sd) * (higherIsBetter ? 1 : -1)
  if (z >= 1.5) return { bg: '#CDEBDD', fg: '#085041' }
  if (z >= 0.5) return { bg: '#E6F4EC', fg: '#0F6E56' }
  if (z <= -1.5) return { bg: '#F7CFC6', fg: '#7A1F14' }
  if (z <= -0.5) return { bg: '#FBE7E1', fg: '#8A3A24' }
  return null
}
