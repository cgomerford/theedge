import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/auth', () => ({ getCurrentSubscriber: async () => null }))
vi.mock('@/lib/require-pro', () => ({ isProViewer: async () => false }))

import { hasRows, ipHash, londonDay, questionKey, signAnon, verifyAnon } from './ask-lookups'

const KEY = 'test-key-not-a-real-secret-0123456789'
const base = { group: 'hitting', gameType: 'R', view: 'summary', metric: 'ops', family: 'month', split: '', deep: null } as const

describe('question key', () => {
  it('is the same for refines (seasons are not part of it) and differs for a new metric or view', () => {
    expect(questionKey(base)).toBe(questionKey({ ...base }))
    expect(questionKey(base)).not.toBe(questionKey({ ...base, metric: 'avg' }))
    expect(questionKey(base)).not.toBe(questionKey({ ...base, view: 'breakdown' }))
    expect(questionKey(base)).not.toBe(questionKey({ ...base, gameType: 'P' }))
  })
})

describe('anonymous cookie', () => {
  it('verifies its own signature and rejects forged or tampered values', () => {
    const v = signAnon('abc123', KEY)
    expect(verifyAnon(v, KEY)).toBe('abc123')
    expect(verifyAnon('abc123.forged', KEY)).toBeNull()
    expect(verifyAnon(v.replace('abc123', 'other'), KEY)).toBeNull()
    expect(verifyAnon(undefined, KEY)).toBeNull()
    expect(verifyAnon(v, 'a-different-secret-entirely-0123456789')).toBeNull()
  })
})

describe('ip hash', () => {
  it('is 64 hex characters, never the address, and changes with the day', () => {
    const a = ipHash('203.0.113.9', '2026-10-27', KEY)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toContain('203')
    expect(ipHash('203.0.113.9', '2026-10-28', KEY)).not.toBe(a)
    expect(ipHash('203.0.113.9', '2026-10-27', KEY)).toBe(a)
  })
})

describe('London day (the salt, and the same rollover the SQL uses)', () => {
  it('rolls over at midnight UK time, in summer and winter', () => {
    expect(londonDay(new Date('2026-07-01T22:59:00Z'))).toBe('2026-07-01')   // 23:59 BST
    expect(londonDay(new Date('2026-07-01T23:00:00Z'))).toBe('2026-07-02')   // 00:00 BST
    expect(londonDay(new Date('2026-12-01T23:59:00Z'))).toBe('2026-12-01')   // 23:59 GMT
    expect(londonDay(new Date('2026-12-02T00:00:00Z'))).toBe('2026-12-02')   // 00:00 GMT
    expect(londonDay(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25')    // day before the clocks go back, 00:30 BST
  })
})

describe('has rows', () => {
  const empty = { query: {} as never, seasons: [], league: null, baseline: null }
  it('is false for empty and partial results, true when something came back', () => {
    expect(hasRows(empty)).toBe(false)
    expect(hasRows({ ...empty, loading: { done: 1, total: 9 }, league: {} as never })).toBe(false)
    expect(hasRows({ ...empty, league: {} as never })).toBe(true)
    expect(hasRows({ ...empty, breakdown: [{} as never] })).toBe(true)
  })
})
