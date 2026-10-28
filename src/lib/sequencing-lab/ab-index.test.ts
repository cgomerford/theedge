import { describe, it, expect } from 'vitest'
import { matchSequence, parseIndex, type MatchSpec } from './ab-index'

// A tiny index in the exact layout of scripts/build_league_ab_index.py: three at-bats.
//   AB0 (RHP v RHB): FF 95 up-and-in zone 11 ball, SL 86 zone 14 swinging strike, FF 95 zone 5 in play a hit  -> 1B
//   AB1 (RHP v RHB): FF 95 zone 11 ball, SL 86 zone 14 swinging strike, SL 86 zone 14 swinging strike          -> K
//   AB2 (LHP v RHB): FF 95 zone 11 ball, SL 86 zone 14 swinging strike                                          -> BB
function build(): Buffer {
  const types = ['FF', 'SI', 'FC', 'SL', 'ST', 'SV', 'CU', 'KC', 'CS', 'CH', 'FS', 'FO', 'EP', 'KN', 'SC', '?']
  const outcomes = ['unknown', 'K', 'BB', 'HBP', '1B', '2B', '3B', 'HR', 'OUT', 'OTHER']
  const P = [ // type idx, speed, hb, ivb, zone, res
    [0, 95, 8, 16, 11, 1], [3, 86, -4, 1, 14, 3], [0, 95, 8, 16, 5, 5],
    [0, 95, 8, 16, 11, 1], [3, 86, -4, 1, 14, 3], [3, 86, -4, 1, 14, 3],
    [0, 95, -8, 16, 11, 1], [3, 86, 4, 1, 14, 3],
  ]
  const header = Buffer.from(JSON.stringify({ season: 2026, builtAt: 't', nPitches: P.length, nAbs: 3, types, outcomes }))
  const parts: Buffer[] = [Buffer.from('X9AB'), Buffer.alloc(4), header]
  parts[1].writeUInt32LE(header.length)
  const col = (f: (p: number[]) => number, T: 'u8' | 'i8') => { const b = Buffer.alloc(P.length); P.forEach((p, i) => (T === 'u8' ? b.writeUInt8(f(p), i) : b.writeInt8(f(p), i))); return b }
  parts.push(col(p => p[0], 'u8'), col(p => p[1] * 2, 'u8'), col(p => p[2] * 2, 'i8'), col(p => p[3] * 2, 'i8'), col(p => p[4], 'u8'), col(p => p[5], 'u8'))
  const u32 = (a: number[]) => { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b }
  const u16 = (a: number[]) => { const b = Buffer.alloc(a.length * 2); a.forEach((v, i) => b.writeUInt16LE(v, i * 2)); return b }
  parts.push(u32([0, 3, 6]), u32([11, 11, 12]), u32([21, 22, 23]), u32([900, 900, 901]), u16([2000, 2000, 2001]), Buffer.from([3, 3, 2]), Buffer.from([0, 0, 1]), Buffer.from([0, 0, 0]), Buffer.from([4, 1, 2]))
  return Buffer.concat(parts)
}
const ff = { t: 'FF', speed: 95, hb: 8, ivb: 16 }
const sl = { t: 'SL', speed: 86, hb: -4, ivb: 1 }

describe('matchSequence', () => {
  const ix = parseIndex(build())
  it('parses the file', () => { expect(ix.nAbs).toBe(3); expect(ix.nPitches).toBe(8); expect(ix.types[ix.type[1]]).toBe('SL') })
  it('finds the at-bats that start with the stacked pitches, for the right hand', () => {
    const spec: MatchSpec = { hand: 'R', stand: null, mode: 'start', pitches: [ff, sl] }
    const r = matchSequence(ix, spec)
    expect(r.total).toBe(2)                                   // AB2 is a left-hander, so it is left out
    expect(r.outcomes).toEqual({ '1B': 1, K: 1 })
    expect(r.next).toEqual({ FF: 1, SL: 1 })
  })
  it('narrows with a zone and a result', () => {
    const r = matchSequence(ix, { hand: 'R', stand: null, mode: 'start', pitches: [{ ...ff, zone: 11, res: 'B' }, { ...sl, res: 'W' }, { ...ff, zone: 5 }] })
    expect(r.total).toBe(1); expect(r.outcomes).toEqual({ '1B': 1 })
  })
  it('matches anywhere in the at-bat when asked, and counts each at-bat once', () => {
    expect(matchSequence(ix, { hand: 'R', stand: null, mode: 'start', pitches: [sl] }).total).toBe(0)
    const r = matchSequence(ix, { hand: 'R', stand: null, mode: 'any', pitches: [sl] })
    expect(r.total).toBe(2)
  })
  it('respects the speed and break windows', () => {
    expect(matchSequence(ix, { hand: 'L', stand: null, mode: 'start', pitches: [{ ...ff, hb: -8 }] }).total).toBe(1)
    expect(matchSequence(ix, { hand: 'R', stand: null, mode: 'start', pitches: [{ ...ff, speed: 99 }] }).total).toBe(0)
  })
  it('returns recent samples with the pitches thrown', () => {
    const r = matchSequence(ix, { hand: 'R', stand: null, mode: 'start', pitches: [ff] })
    expect(r.samples).toHaveLength(2); expect(r.samples[0].pitches[0]).toEqual({ t: 'FF', res: 'B', speed: 95 })
  })
})
