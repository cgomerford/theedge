// src/lib/active-roster.ts
//
// Extracted from mlb/[slug]/page.tsx and scout-bundle.ts, where it existed
// as near-identical copy-pasted local functions in multiple files. Those
// duplicates meant wrapping each in cache() independently didn't actually
// deduplicate anything — React's cache() only merges calls to the SAME
// function reference within a request, and two separately-declared copies
// are two different functions even if the code is identical. This is the
// one true shared version — import this everywhere instead of redeclaring.

import { cache } from 'react'

export const getActiveRosterIds = cache(async function getActiveRosterIds(teamId: number): Promise<Set<number>> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return new Set()
    const data = await res.json()
    return new Set((data.roster ?? []).map((r: any) => r.person?.id).filter(Boolean))
  } catch {
    return new Set()
  }
})