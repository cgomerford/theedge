/* eslint-disable @typescript-eslint/no-explicit-any -- the scout bundle is loosely typed (any[]) by design */
import { describe, expect, it } from 'vitest'
import * as copy from '../copy'

const BANNED = /\b(picks?|odds|locks?|bets?|betting|parlay|value|fade|hammer|leans?|factors?|tilts?|favou?rites?|predictions?)\b|toss-up|edge score|start\/sit|sit\/start/i

describe('copy.ts', () => {
  it('contains no betting or prediction vocabulary', () => {
    const strings: string[] = []
    for (const v of Object.values(copy)) {
      if (typeof v === 'string') strings.push(v)
      else if (typeof v === 'function' && v.length === 1) {
        try { strings.push(String((v as (x: any) => unknown)(true)), String((v as (x: any) => unknown)('MIL'))) } catch { /* formatter needs another shape */ }
      }
    }
    expect(strings.length).toBeGreaterThan(15)
    for (const s of strings) expect(s, s).not.toMatch(BANNED)
  })
  it('formats numbers and dates', () => {
    expect(copy.fmt3(0.745)).toBe('.745')
    expect(copy.fmt3(1.012)).toBe('1.012')
    expect(copy.fmt3(null)).toBe('—')
    expect(copy.fmtDateRange(['2026-10-04', '2026-10-05', '2026-10-06'])).toBe('Oct 4–6')
    expect(copy.fmtDateRange(['2026-09-30', '2026-10-01', '2026-10-02'])).toBe('Sep 30–Oct 2')
    expect(copy.signed(3)).toBe('+3')
    expect(copy.signed(-4)).toBe('−4')
  })
})
