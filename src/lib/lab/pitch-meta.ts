// src/lib/lab/pitch-meta.ts
//
// Pitch-type names and colours shared by the lab's server and client pieces.
// No server-only imports, so client components can use it.

export const PITCH_NAME: Record<string, string> = {
  FF: 'Four-seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', SV: 'Slurve',
  CU: 'Curveball', KC: 'Knuckle-curve', CS: 'Slow curve', CH: 'Changeup', FS: 'Splitter',
  FO: 'Forkball', EP: 'Eephus', KN: 'Knuckleball', SC: 'Screwball',
}

// THE one pitch colour map for the whole site. Hues come from the Okabe-Ito colour-blind-safe set; pairs that often appear
// together (FF/SI/FC, SL/ST/SV, CU/KC/CS, CH/FS/FO, EP/KN/SC) stay distinct under simulated deutan, protan and tritan vision.
// FS (yellow) is a FILL only: never use it as text on cream. Colour is never the only cue: always show the code/name beside it.
export const PITCH_COLOR: Record<string, string> = {
  FF: '#D55E00', SI: '#E69F00', FC: '#7A4A1E',
  SL: '#0072B2', ST: '#56B4E9', SV: '#CC79A7',
  CU: '#1B2A49', KC: '#8E5BB5', CS: '#9DB4D6',
  CH: '#009E73', FS: '#F0E442', FO: '#0B4D3A',
  EP: '#8A8A8A', KN: '#4A3B2A', SC: '#CFC9BA',
  FA: '#D55E00', UN: '#BBBBBB',
}
const PITCH_FALLBACK = '#8A8A8A'

export const pitchColor = (code: string | null | undefined): string => PITCH_COLOR[(code ?? '').toUpperCase()] ?? PITCH_FALLBACK
/** Full name for a pitch code, e.g. "Four-seam". Falls back to the code. */
export const pitchLabel = (code: string | null | undefined): string => PITCH_NAME[(code ?? '').toUpperCase()] ?? (code ?? '')

export const PITCH_ORDER = ['FF', 'SI', 'FC', 'SL', 'ST', 'SV', 'CU', 'KC', 'CS', 'CH', 'FS', 'FO', 'EP', 'KN', 'SC']
