// src/lib/fantasy-ownership.ts
//
// Shared utilities for fantasy ownership data.
// normalizeName is the single source of truth — used by the cron route
// and any client-side matching. No Python duplicate.

/**
 * Normalize a player name for fuzzy matching:
 * strip diacritics, lowercase, remove suffixes (Jr, Sr, II, III),
 * collapse whitespace.
 */
export function normalizeName(name: string): string {
  let n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
  n = n.toLowerCase()
  n = n.replace(/\b(jr|sr|ii|iii)\.?\b/g, '')                  // strip suffixes
  n = n.replace(/[^a-z0-9\s]/g, '')                             // strip punctuation
  n = n.replace(/\s+/g, ' ').trim()                             // collapse whitespace
  return n
}