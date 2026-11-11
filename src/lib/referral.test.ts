import { describe, it, expect } from 'vitest'
import { cleanRef, linkRef, proSignupPath, proStartPath, refCookieString, refFromCookieHeader } from './referral'
import { readAttribution } from './attribution'

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

describe('linkRef (the form a code takes in a link we build)', () => {
  it('cleans and upper-cases', () => expect(linkRef('friend_10-x')).toBe('FRIEND_10-X'))
  it('drops a code that is nothing but junk, so no ref goes into the link', () => {
    expect(linkRef('!!! <> ??')).toBeNull()
    expect(linkRef('')).toBeNull()
    expect(linkRef(undefined)).toBeNull()
    expect(linkRef(['FRIEND'])).toBeNull()
  })
  it('keeps at most 40 characters', () => expect(linkRef('a'.repeat(60))).toBe('A'.repeat(40)))
})

describe('the emailed link carries the referral code', () => {
  it('the Pro start path holds plan interval and ref', () => {
    expect(proStartPath('month', 'friend10')).toBe('/pricing/start?interval=month&ref=FRIEND10')
    expect(proStartPath('year', 'friend10')).toBe('/pricing/start?interval=year&ref=FRIEND10')
  })
  it('an invalid ref is dropped from the path, the interval stays', () => {
    expect(proStartPath('month', '<<>>')).toBe('/pricing/start?interval=month')
    expect(proStartPath('year')).toBe('/pricing/start?interval=year')
  })
  it('survives the trip: it is stored as the link\'s return_to, and the page the link lands on reads the same code back', () => {
    const path = proStartPath('month', 'friend10')
    // what /api/auth/login stores for the emailed link (safeReturnPath keeps the query string)
    const stored = readAttribution(k => (k === 'return_to' ? path : undefined)).return_to
    expect(stored).toBe(path)
    // what /pricing/start reads when the link is opened, in any browser, with no cookie
    const url = new URL(stored as string, 'https://x9.test')
    expect(url.pathname).toBe('/pricing/start')
    expect(url.searchParams.get('interval')).toBe('month')
    expect(linkRef(url.searchParams.get('ref'))).toBe('FRIEND10')
  })
  it('signed-out visitors on the start page go back to signup with the choice and the code kept', () => {
    expect(proSignupPath('month', 'friend10')).toBe('/signup?plan=pro&interval=month&ref=FRIEND10')
    expect(proSignupPath('year', null)).toBe('/signup?plan=pro&interval=year')
  })
})

describe('refCookieString', () => {
  it('lasts 30 days, covers the whole site and is SameSite=Lax', () => {
    const c = refCookieString('FRIEND10')
    expect(c).toContain('edge_ref=FRIEND10')
    expect(c).toContain(`Max-Age=${30 * 24 * 60 * 60}`)
    expect(c).toContain('Path=/')
    expect(c).toContain('SameSite=Lax')
    expect(c).not.toContain('Secure')
    expect(refCookieString('FRIEND10', true)).toContain('Secure')
  })
  it('the cookie it writes is the one checkout reads back', () => expect(refFromCookieHeader(refCookieString('FRIEND10').split(';')[0])).toBe('FRIEND10'))
})
