// src/lib/content-plan.ts
//
// The content calendar's database side (admin only). Table ownership: this file is the only writer of content_plan and content_settings
// (supabase/migrations/20261105100000_content_plan.sql). Articles are only read. Until the migration is run every call reports `missing`.

import { createAdminClient } from '@/lib/supabase'
import { log } from '@/lib/log'
import { DEFAULT_TARGETS, addDays, cleanTargets, type ArticleRef, type NewItem, type PlanItem, type Targets } from '@/lib/content-plan-core'

const COLS = 'id, plan_date, kind, title, notes, status, article_id, url'
const isMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? ''))

/** Plan items with a date in [from, to]. `missing` is true when the table has not been created yet. */
export async function listPlan(from: string, to: string): Promise<{ items: PlanItem[]; missing: boolean }> {
  const { data, error } = await createAdminClient().from('content_plan').select(COLS).gte('plan_date', from).lte('plan_date', to).order('plan_date').limit(2000)
  if (isMissing(error)) return { items: [], missing: true }
  if (error) { log.error('listPlan', 'Supabase error', error.message); return { items: [], missing: false } }
  return { items: (data ?? []) as PlanItem[], missing: false }
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

export async function createItems(items: NewItem[]): Promise<Result> {
  const { error } = await createAdminClient().from('content_plan').insert(items)
  if (error) { log.error('createItems', 'Supabase error', error.message); return fail(error) }
  return { ok: true }
}
export async function updateItem(id: string, patch: Partial<NewItem>): Promise<Result> {
  const { error } = await createAdminClient().from('content_plan').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) { log.error('updateItem', 'Supabase error', error.message); return fail(error) }
  return { ok: true }
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
