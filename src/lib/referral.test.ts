import { describe, it, expect } from 'vitest'
import { cleanRef, refFromCookieHeader } from './referral'

describe('cleanRef', () => {
  it('keeps letters, digits, underscore and hyphen', () => expect(cleanRef('Friend_2-ok')).toBe('Friend_2-ok'))
  it('strips everything else', () => expect(cleanRef('a b<script>"c"')).toBe('abscriptc'))
  it('caps at 40 characters', () => expect(cleanRef('x'.repeat(60))).toHaveLength(40))
  it('returns null for empty, non-string or all-junk values', () => {
    expect(cleanRef('')).toBeNull(); expect(cleanRef(undefined)).toBeNull(); expect(cleanRef(42)).toBeNull(); expect(cleanRef('!!!')).toBeNull()
  })
})

describe('refFromCookieHeader', () => {
  it('finds edge_ref among other cookies', () => expect(refFromCookieHeader('a=1; edge_ref=FRIEND; b=2')).toBe('FRIEND'))
  it('returns null when absent', () => { expect(refFromCookieHeader('a=1')).toBeNull(); expect(refFromCookieHeader(null)).toBeNull() })
})
