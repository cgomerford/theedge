// src/components/admin/story/pitchColors.ts
//
// One colour per pitch type, in the spirit of Baseball Savant's pitch palette, so
// a given pitch reads the same on the zone and in the table.

const BY_CODE: Record<string, string> = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C', CH: '#1DBE3A', FS: '#3BACAC', FO: '#3BACAC',
  CU: '#00D1ED', KC: '#6236CD', CS: '#00D1ED', SL: '#EEE716', ST: '#DDB33A', SV: '#93AFD4',
  KN: '#3C44CD', EP: '#999999', SC: '#999999',
}
const FALLBACK = '#B8B8B8'

export const pitchColor = (code: string) => BY_CODE[code.toUpperCase()] ?? FALLBACK
