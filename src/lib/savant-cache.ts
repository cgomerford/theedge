// src/lib/savant-cache.ts
//
// Cache-aside layer for expensive per-player/per-team Savant Statcast CSV
// pulls that exceed Next's fetch Data Cache 2MB-per-item ceiling
// (confirmed via repeated "Failed to set Next.js data cache... items
// over 2MB can not be cached" warnings — `next: { revalidate }` on these
// fetches was always a silent no-op, so every call re-downloaded the
// full raw CSV live, with zero caching between repeat hits on the same
// player). This caches the PARSED/aggregated result instead — far
// smaller than the raw CSV — in Supabase, which is the thing Next's
// built-in cache can't hold. See scripts/sql/create_savant_fetch_cache.sql.

import { createAdminClient } from '@/lib/supabase'

export async function withSavantCache<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const supa = createAdminClient()

  const { data, error: readError } = await supa
    .from('savant_fetch_cache')
    .select('payload, fetched_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (readError) console.error(`savant-cache read failed (${cacheKey}):`, readError.message)

  if (data && Date.now() - new Date(data.fetched_at).getTime() < ttlSeconds * 1000) {
    return data.payload as T
  }

  const fresh = await fetchFn()

  // Never cache a null/empty miss — a transient Savant failure shouldn't
  // get pinned as the answer for the whole TTL window.
  const isEmpty = fresh == null || (Array.isArray(fresh) && fresh.length === 0)
  if (!isEmpty) {
    // Must be awaited, not fire-and-forget: an un-awaited write here can
    // get dropped once the response is sent (same reason page.tsx's
    // game_previews upsert needs `after()` — a promise nobody waits on
    // isn't guaranteed to finish). This is a small aggregated payload,
    // not the raw multi-MB CSV, so awaiting it costs little.
    const { error: writeError } = await supa.from('savant_fetch_cache').upsert({
      cache_key: cacheKey,
      payload: fresh as unknown as Record<string, unknown>,
      fetched_at: new Date().toISOString(),
    })
    if (writeError) console.error(`savant-cache write failed (${cacheKey}):`, writeError.message)
  }

  return fresh
}
