import { beforeEach, describe, expect, it, vi } from 'vitest'

// A small in-memory stand-in for the calls upsertAgentItems makes, so created / updated / locked can be checked without a database.
type Row = Record<string, unknown>
const rows: Row[] = []
let n = 0
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (v: Row) => { const row = { id: `r${++n}`, assets: [], ...v }; rows.push(row); return { select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }) } },
      select: () => { const f: [string, unknown][] = []; const q = { eq: (k: string, v: unknown) => { f.push([k, v]); return q }, maybeSingle: async () => ({ data: rows.find(r => f.every(([k, v]) => r[k] === v)) ?? null, error: null }) }; return q },
      update: (patch: Row) => ({ eq: async (k: string, v: unknown) => { Object.assign(rows.find(r => r[k] === v) ?? {}, patch); return { error: null } } }),
    }),
  }),
}))

import { upsertAgentItems } from './content-plan'
import { cleanAgentItem } from './content-plan-core'

const item = (o: Record<string, unknown> = {}) => cleanAgentItem({ plan_date: '2026-11-08', title: 'Scouting video', kind: 'video', brief: 'v1', external_key: 'yt-1', ...o }, 'youtube')!

describe('assistant uploads', () => {
  beforeEach(() => { rows.length = 0; n = 0 })

  it('creates a new keyed item, then updates it on a re-upload instead of duplicating', async () => {
    const a = await upsertAgentItems([item()])
    expect(a).toEqual({ ok: true, results: [{ external_key: 'yt-1', id: 'r1', outcome: 'created' }] })
    const b = await upsertAgentItems([item({ title: 'Scouting video v2', brief: 'v2' })])
    expect(b).toEqual({ ok: true, results: [{ external_key: 'yt-1', id: 'r1', outcome: 'updated' }] })
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ title: 'Scouting video v2', brief: 'v2', source: 'youtube', status: 'planned' })
  })
  it('leaves an item alone once George has scheduled, published or skipped it', async () => {
    for (const status of ['scheduled', 'published', 'skipped']) {
      rows.length = 0
      await upsertAgentItems([item()])
      rows[0].status = status
      const r = await upsertAgentItems([item({ title: 'Changed', brief: 'changed' })])
      expect(r).toMatchObject({ ok: true, results: [{ outcome: 'locked', id: 'r' + n }] })
      expect(rows[0]).toMatchObject({ title: 'Scouting video', brief: 'v1', status })
    }
  })
  it('still updates an item George has only drafted', async () => {
    await upsertAgentItems([item()]); rows[0].status = 'drafted'
    expect(await upsertAgentItems([item({ title: 'Better title' })])).toMatchObject({ results: [{ outcome: 'updated' }] })
  })
  it('never touches images or the source when it updates', async () => {
    await upsertAgentItems([item()]); rows[0].assets = [{ path: 'a/b.png', label: 'x', role: 'thumbnail' }]
    await upsertAgentItems([item({ title: 'T2' })])
    expect(rows[0].assets).toEqual([{ path: 'a/b.png', label: 'x', role: 'thumbnail' }]); expect(rows[0].source).toBe('youtube')
  })
  it('keeps each source\'s keys separate and always inserts an item with no key', async () => {
    await upsertAgentItems([item()])
    await upsertAgentItems([cleanAgentItem({ plan_date: '2026-11-08', title: 'Same key, other source', external_key: 'yt-1' }, 'x')!])
    expect(rows).toHaveLength(2)
    const r = await upsertAgentItems([item({ external_key: undefined }), item({ external_key: undefined })])
    expect(r).toMatchObject({ ok: true, results: [{ outcome: 'created', external_key: null }, { outcome: 'created', external_key: null }] }); expect(rows).toHaveLength(4)
  })
  it('a published status in the body is stored as planned', async () => {
    await upsertAgentItems([item({ status: 'published' })]); expect(rows[0].status).toBe('planned')
  })
})
