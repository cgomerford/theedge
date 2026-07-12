// src/app/dugout/page.tsx
//
// /dugout no longer renders its own page — it's a redirect to the
// subscriber's primary team page. Kept as a route (rather than deleted)
// so existing bookmarks, SiteHeader's "My Dugout" links, and anything else
// pointing here still resolve to something real instead of 404ing.

import { redirect } from 'next/navigation'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export default async function DugoutRedirect() {
  const sub = await getCurrentSubscriber()
  if (!sub) redirect('/')

  const supa = createAdminClient()
  const { data: subscriber } = await supa
    .from('subscribers')
    .select('primary_team, teams')
    .eq('id', sub.id)
    .single()

  const primarySlug = subscriber?.primary_team ?? subscriber?.teams?.[0] ?? 'phillies'
  redirect(`/mlb/teams/${primarySlug}`)
}