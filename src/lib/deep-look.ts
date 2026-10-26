// One full Pro module a day for a free account. A "module" is a feature plus a key (for example 'batting_lab' + a player id).
// Opening the same module again the same day does not use another. The day rolls over at midnight Europe/London.
// Table: deep_looks (supabase/migrations/20261026120000_deep_looks.sql). If the table is missing, free accounts count as having
// no deep look left (locked state); nothing throws. Single writer: recordDeepLook below.

import { createAdminClient } from '@/lib/supabase'

export const dayLondon = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

type Row = { feature: string; key: string }

async function todaysRow(userId: string): Promise<{ row: Row | null; ok: boolean }> {
  const { data, error } = await createAdminClient().from('deep_looks').select('feature, key').eq('user_id', userId).eq('day', dayLondon()).maybeSingle()
  if (error) {
    console.error('[deepLook] read error (run the deep_looks migration?):', error.message)
    return { row: null, ok: false }
  }
  return { row: (data as Row | null) ?? null, ok: true }
}

/** True while the account has not used today's deep look. False if it has, or the table is not there yet. */
export async function hasDeepLookLeft(userId: string): Promise<boolean> {
  const { row, ok } = await todaysRow(userId)
  return ok && !row
}

/** True if any module was opened today (used to let that account's data requests through). */
export async function hasDeepLookToday(userId: string): Promise<boolean> {
  const { row } = await todaysRow(userId)
  return !!row
}

/** True if today's deep look was spent on exactly this module. */
export async function isTodaysModule(userId: string, feature: string, key: string): Promise<boolean> {
  const { row } = await todaysRow(userId)
  return !!row && row.feature === feature && row.key === key
}

/** Spend today's deep look on a module. Returns false if it was already spent or the write failed. */
export async function recordDeepLook(userId: string, feature: string, key: string): Promise<boolean> {
  const { error } = await createAdminClient().from('deep_looks').insert({ user_id: userId, day: dayLondon(), feature, key })
  if (error) {
    if (error.code !== '23505') console.error('[recordDeepLook] insert error:', error.message)
    return false
  }
  return true
}
