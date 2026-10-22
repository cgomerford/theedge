// src/app/stats/page.tsx
//
// The stats hub now lives at /mlb/stats. This keeps old links and bookmarks
// working (query-string filters are carried over). /stats/player/[id] is unchanged.

import { redirect } from 'next/navigation'

export default async function StatsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v)
    else if (Array.isArray(v)) v.forEach(x => qs.append(k, x))
  }
  redirect(`/mlb/stats${qs.toString() ? `?${qs}` : ''}`)
}
