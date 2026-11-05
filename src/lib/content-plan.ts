// src/lib/content-plan.ts
//
// The content calendar's database side (admin only). Table ownership: this file is the only writer of content_plan and content_settings
// (supabase/migrations/20261105100000_content_plan.sql). Articles are only read. Until the migration is run every call reports `missing`.

import { createAdminClient } from '@/lib/supabase'
import { log } from '@/lib/log'
import { DEFAULT_TARGETS, MAX_ASSETS, addDays, cleanTargets, type ArticleRef, type Asset, type NewItem, type PlanItem, type Source, type Targets } from '@/lib/content-plan-core'

const COLS_OLD = 'id, plan_date, kind, title, notes, status, article_id, url'
const COLS = `${COLS_OLD}, brief, source, external_key, assets`
const NEW_FIELDS = ['brief', 'source', 'external_key'] as const
const isMissingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || /column .* does not exist|could not find the .* column/i.test(e.message ?? ''))
const withDefaults = (r: Record<string, unknown>): PlanItem => ({ brief: '', source: 'george', external_key: null, assets: [], ...r }) as unknown as PlanItem
const isMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? ''))

/** Plan items with a date in [from, to]. `missing` is true when the table has not been created yet. */
export async function listPlan(from: string, to: string): Promise<{ items: PlanItem[]; missing: boolean }> {
  const q = (cols: string) => createAdminClient().from('content_plan').select(cols).gte('plan_date', from).lte('plan_date', to).order('plan_date').limit(2000)
  let { data, error } = await q(COLS)
  // Until the briefs migration is run the new columns do not exist; the calendar keeps working on the old ones.
  if (isMissingColumn(error)) ({ data, error } = await q(COLS_OLD))
  if (isMissing(error)) return { items: [], missing: true }
  if (error) { log.error('listPlan', 'Supabase error', error.message); return { items: [], missing: false } }
  return { items: ((data ?? []) as unknown as Record<string, unknown>[]).map(withDefaults), missing: false }
}

/** Articles published (or scheduled) between two days, for showing on the calendar. */
export async function listPublishedArticles(from: string, to: string): Promise<ArticleRef[]> {
  const { data, error } = await createAdminClient().from('articles').select('id, title, slug, status, published_at, updated_at').eq('status', 'published')
    .gte('published_at', `${addDays(from, -1)}T00:00:00Z`).lte('published_at', `${addDays(to, 2)}T00:00:00Z`).order('published_at').limit(500)
  if (error) { log.error('listPublishedArticles', 'Supabase error', error.message); return [] }
  return (data ?? []) as ArticleRef[]
}

/** The most recently edited articles, drafts included, for linking a plan item to one. */
export async function listLinkableArticles(): Promise<ArticleRef[]> {
  const { data, error } = await createAdminClient().from('articles').select('id, title, slug, status, published_at, updated_at').order('updated_at', { ascending: false }).limit(60)
  if (error) { log.error('listLinkableArticles', 'Supabase error', error.message); return [] }
  return (data ?? []) as ArticleRef[]
}

export async function getTargets(): Promise<Targets> {
  const { data, error } = await createAdminClient().from('content_settings').select('value').eq('key', 'targets').maybeSingle()
  if (error && !isMissing(error)) log.error('getTargets', 'Supabase error', error.message)
  return data?.value ? cleanTargets(data.value) : { ...DEFAULT_TARGETS }
}

type Result = { ok: true } | { ok: false; missing?: boolean; error: string }
const fail = (e: { code?: string; message: string }): Result => (isMissing(e) ? { ok: false, missing: true, error: 'The content calendar tables have not been created yet.' } : { ok: false, error: 'Could not save. Try again.' })

const NEEDS_SQL = 'The brief columns have not been created yet. Run supabase/migrations/20261106100000_content_plan_briefs.sql in Supabase.'

export async function createItems(items: NewItem[]): Promise<Result & { ids?: string[] }> {
  const supa = createAdminClient()
  let { data, error } = await supa.from('content_plan').insert(items).select('id')
  if (isMissingColumn(error)) {
    // old table: save without the new fields rather than refuse (a brief typed now would be lost, so say so)
    if (items.some(i => i.brief)) return { ok: false, missing: true, error: NEEDS_SQL }
    ;({ data, error } = await supa.from('content_plan').insert(items.map(i => { const o: Record<string, unknown> = { ...i }; for (const f of NEW_FIELDS) delete o[f]; return o })).select('id'))
  }
  if (error) { log.error('createItems', 'Supabase error', error.message); return fail(error) }
  return { ok: true, ids: ((data ?? []) as { id: string }[]).map(r => r.id) }
}
export async function updateItem(id: string, patch: Partial<NewItem>): Promise<Result> {
  const { error } = await createAdminClient().from('content_plan').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (isMissingColumn(error)) return { ok: false, missing: true, error: NEEDS_SQL }
  if (error) { log.error('updateItem', 'Supabase error', error.message); return fail(error) }
  return { ok: true }
}

// ── Assistant uploads ─────────────────────────────────────────────────────────────────────

export type Outcome = 'created' | 'updated' | 'locked'
export type UpsertResult = { external_key: string | null; id: string | null; outcome: Outcome }

/** Items from an assistant. One with an external_key is matched on (source, key): a new one is created; an existing one is updated only while it is still planned or drafted, and is left alone ("locked") once George has scheduled, published or skipped it. An item without a key is always a new row. Images are never touched. */
export async function upsertAgentItems(items: NewItem[]): Promise<{ ok: true; results: UpsertResult[] } | { ok: false; missing?: boolean; error: string }> {
  const supa = createAdminClient()
  const results: UpsertResult[] = []
  const insert = async (it: NewItem) => supa.from('content_plan').insert(it).select('id').single()
  for (const it of items) {
    if (!it.external_key) {
      const { data, error } = await insert(it)
      if (isMissingColumn(error)) return { ok: false, missing: true, error: NEEDS_SQL }
      if (error || !data) { log.error('upsertAgentItems', 'insert error', error?.message); return isMissing(error) ? { ok: false, missing: true, error: 'The content calendar tables have not been created yet.' } : { ok: false, error: 'Could not save. Try again.' } }
      results.push({ external_key: null, id: (data as { id: string }).id, outcome: 'created' })
      continue
    }
    const found = await supa.from('content_plan').select('id, status').eq('source', it.source).eq('external_key', it.external_key).maybeSingle()
    if (isMissingColumn(found.error)) return { ok: false, missing: true, error: NEEDS_SQL }
    if (found.error) { log.error('upsertAgentItems', 'lookup error', found.error.message); return isMissing(found.error) ? { ok: false, missing: true, error: 'The content calendar tables have not been created yet.' } : { ok: false, error: 'Could not save. Try again.' } }
    const row = found.data as { id: string; status: string } | null
    if (row) {
      if (row.status !== 'planned' && row.status !== 'drafted') { results.push({ external_key: it.external_key, id: row.id, outcome: 'locked' }); continue }
      const { error } = await supa.from('content_plan').update({ title: it.title, notes: it.notes, brief: it.brief, kind: it.kind, plan_date: it.plan_date, url: it.url, status: it.status, updated_at: new Date().toISOString() }).eq('id', row.id)
      if (error) { log.error('upsertAgentItems', 'update error', error.message); return { ok: false, error: 'Could not save. Try again.' } }
      results.push({ external_key: it.external_key, id: row.id, outcome: 'updated' })
      continue
    }
    const { data, error } = await insert(it)
    if (error || !data) { log.error('upsertAgentItems', 'insert error', error?.message); return { ok: false, error: 'Could not save. Try again.' } }
    results.push({ external_key: it.external_key, id: (data as { id: string }).id, outcome: 'created' })
  }
  return { ok: true, results }
}

/** The items one source uploaded between two days, for that assistant to see what it has already sent. The brief itself is not returned, only its length. */
export async function listSourceItems(source: Source, from: string, to: string) {
  const { data, error } = await createAdminClient().from('content_plan').select('id, plan_date, kind, title, status, external_key, brief').eq('source', source).gte('plan_date', from).lte('plan_date', to).order('plan_date').limit(300)
  if (isMissingColumn(error) || isMissing(error)) return { ok: false as const, missing: true }
  if (error) { log.error('listSourceItems', 'Supabase error', error.message); return { ok: false as const, missing: false } }
  return { ok: true as const, items: ((data ?? []) as unknown as { id: string; plan_date: string; kind: string; title: string; status: string; external_key: string | null; brief: string }[]).map(({ brief, ...r }) => ({ ...r, brief_length: brief?.length ?? 0 })) }
}

// ── Images (the files live in the private content-assets bucket; the row keeps the list) ──

export async function getItemMeta(id: string): Promise<{ id: string; source: Source; assets: Asset[] } | null | 'missing'> {
  const { data, error } = await createAdminClient().from('content_plan').select('id, source, assets').eq('id', id).maybeSingle()
  if (isMissingColumn(error) || isMissing(error)) return 'missing'
  if (error) { log.error('getItemMeta', 'Supabase error', error.message); return null }
  const r = data as { id: string; source: Source; assets: Asset[] | null } | null
  return r ? { id: r.id, source: r.source, assets: Array.isArray(r.assets) ? r.assets : [] } : null
}
export async function addAsset(id: string, asset: Asset): Promise<{ ok: true } | { ok: false; error: string; full?: boolean }> {
  const meta = await getItemMeta(id)
  if (!meta || meta === 'missing') return { ok: false, error: 'That item was not found.' }
  if (meta.assets.length >= MAX_ASSETS) return { ok: false, error: `An item can hold ${MAX_ASSETS} images.`, full: true }
  const { error } = await createAdminClient().from('content_plan').update({ assets: [...meta.assets, asset], updated_at: new Date().toISOString() }).eq('id', id)
  if (error) { log.error('addAsset', 'Supabase error', error.message); return { ok: false, error: 'Could not save the image.' } }
  return { ok: true }
}
export async function removeAsset(id: string, path: string): Promise<{ ok: true; had: boolean } | { ok: false; error: string }> {
  const meta = await getItemMeta(id)
  if (!meta || meta === 'missing') return { ok: false, error: 'That item was not found.' }
  const kept = meta.assets.filter(a => a.path !== path)
  const { error } = await createAdminClient().from('content_plan').update({ assets: kept, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) { log.error('removeAsset', 'Supabase error', error.message); return { ok: false, error: 'Could not remove the image.' } }
  return { ok: true, had: kept.length !== meta.assets.length }
}
export async function deleteItem(id: string): Promise<Result> {
  const { error } = await createAdminClient().from('content_plan').delete().eq('id', id)
  if (error) { log.error('deleteItem', 'Supabase error', error.message); return fail(error) }
  return { ok: true }
}
export async function saveTargets(t: Targets): Promise<Result> {
  const { error } = await createAdminClient().from('content_settings').upsert({ key: 'targets', value: t, updated_at: new Date().toISOString() })
  if (error) { log.error('saveTargets', 'Supabase error', error.message); return fail(error) }
  return { ok: true }
}

/** One item in full (the brief included), read when its drawer is opened so the calendar page itself never carries every brief. */
export async function getItem(id: string): Promise<{ id: string; plan_date: string; kind: string; title: string; notes: string; status: string; brief: string; source: Source; url: string; article_id: string | null } | null | 'missing'> {
  const { data, error } = await createAdminClient().from('content_plan').select('id, plan_date, kind, title, notes, status, brief, source, url, article_id').eq('id', id).maybeSingle()
  if (isMissingColumn(error)) {
    // old table: no brief or source yet
    const old = await createAdminClient().from('content_plan').select('id, plan_date, kind, title, notes, status, url, article_id').eq('id', id).maybeSingle()
    if (old.error || !old.data) return old.error ? 'missing' : null
    return { ...(old.data as Record<string, unknown>), brief: '', source: 'george' } as never
  }
  if (isMissing(error)) return 'missing'
  if (error) { log.error('getItem', 'Supabase error', error.message); return null }
  return data as never
}

/** What each assistant has uploaded lately: how many items in the last 30 days and when the latest one arrived. */
export async function sourceActivity(): Promise<{ missing: boolean; by: Record<string, { count: number; last: string | null }> }> {
  const { data, error } = await createAdminClient().from('content_plan').select('source, updated_at').neq('source', 'george').order('updated_at', { ascending: false }).limit(1000)
  if (isMissingColumn(error) || isMissing(error)) return { missing: true, by: {} }
  if (error) { log.error('sourceActivity', 'Supabase error', error.message); return { missing: false, by: {} } }
  const cutoff = Date.now() - 30 * 86_400_000
  const by: Record<string, { count: number; last: string | null }> = {}
  for (const r of (data ?? []) as { source: string; updated_at: string }[]) {
    const e = (by[r.source] ??= { count: 0, last: null })
    if (new Date(r.updated_at).getTime() >= cutoff) e.count++
    if (!e.last) e.last = r.updated_at
  }
  return { missing: false, by }
}
