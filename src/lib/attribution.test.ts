import { describe, expect, it, vi } from 'vitest'

const inserts: Record<string, unknown>[] = []
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: '1', email_verified: true } }) }) }),
      insert: async (row: Record<string, unknown>) => {
        if (table === 'login_links') inserts.push(row)
        return { error: null }
      },
    }),
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({}) }))

import { readAttribution, safeReturnPath } from '@/lib/attribution'
import { createLoginLink } from '@/lib/auth'

describe('signup attribution', () => {
  it('stores source=player_682928 and utm on the login_links row', async () => {
    const fd = new FormData()
    fd.set('source', 'player_682928'); fd.set('utm_source', 'x'); fd.set('return_to', '/mlb/players/682928')
    await createLoginLink('a@b.com', readAttribution((k) => fd.get(k)))
    expect(inserts[0]).toMatchObject({ email: 'a@b.com', source: 'player_682928', utm_source: 'x', return_to: '/mlb/players/682928' })
  })
  it('rejects off-site return paths', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/api/x', '/login']) expect(safeReturnPath(bad)).toBeUndefined()
  })
})
