import 'server-only'
// src/lib/dashboard/store.ts
//
// One saved layout per signed-in person (user_dashboards). SINGLE WRITER of that table. Both functions return null / false on failure with a logged reason; a missing
// table (the SQL not run yet) reads as "nothing saved" so the page falls back to the starter layout.

import { createAdminClient } from '@/lib/supabase'
import { logOnce } from '@/lib/log'
import { parseLayout, type Layout } from './layout'

export async function getSavedLayout(subscriberId: string, isPro: boolean): Promise<Layout | null> {
  const { data, error } = await createAdminClient().from('user_dashboards').select('layout').eq('subscriber_id', subscriberId).maybeSingle()
  if (error) { logOnce('dashboard.get', 'getSavedLayout', 'Supabase error', error.message); return null }
  return data ? parseLayout((data as { layout: unknown }).layout, isPro) : null
}

export async function saveLayout(subscriberId: string, layout: Layout): Promise<boolean> {
  const { error } = await createAdminClient().from('user_dashboards').upsert({ subscriber_id: subscriberId, layout, updated_at: new Date().toISOString() }, { onConflict: 'subscriber_id' })
  if (error) { logOnce('dashboard.save', 'saveLayout', 'Supabase error', error.message); return false }
  return true
}
