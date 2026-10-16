// src/lib/lab/pitch-meta.ts
//
// Pitch-type names and colours shared by the lab's server and client pieces.
// No server-only imports, so client components can use it.

export const PITCH_NAME: Record<string, string> = {
  FF: '4-seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', SV: 'Slurve',
  CU: 'Curveball', KC: 'Knuckle-curve', CS: 'Slow curve', CH: 'Changeup', FS: 'Splitter',
  FO: 'Forkball', EP: 'Eephus', KN: 'Knuckleball', SC: 'Screwball',
}

// Fastballs warm, breaking balls cool, offspeed green — so a mix reads at a glance.
export const PITCH_COLOR: Record<string, string> = {
  FF: '#D4533B', SI: '#E8833A', FC: '#C9A227', SL: '#2F6FDE', ST: '#6F4FD1', SV: '#8E6BC9',
  CU: '#17315F', KC: '#3E5C99', CS: '#5B7DB1', CH: '#1D9E75', FS: '#5DCAA5', FO: '#8CCBB2',
  EP: '#a89e8c', KN: '#a89e8c', SC: '#a89e8c',
}

export const PITCH_ORDER = ['FF', 'SI', 'FC', 'SL', 'ST', 'SV', 'CU', 'KC', 'CS', 'CH', 'FS', 'FO', 'EP', 'KN', 'SC']
