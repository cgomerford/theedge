// src/app/mlb/[slug]/print/page.tsx
//
// Standalone print route — deliberately outside the normal game page's
// layout/nav so `window.print()` (via the button below, or Cmd+P) produces
// a clean A4 page with nothing but the digest on it.
//
// Reads from the game_postgame_reports cache table directly rather than
// re-aggregating — this route should only ever be hit for a Final game
// that the main game page has already generated a report for.
//
// SUPABASE CLIENT: written with a self-contained createClient() call
// rather than assuming an import path for a shared client, since I don't
// have that import confirmed. If you already have a shared server client
// (e.g. `@/lib/supabase`), swap the two lines at the top of GET-equivalent
// below for that instead — everything else is unaffected.

import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { PostgameDigest } from '@/components/postgame/PostgameDigest'
import type { PostgameReport } from '@/types/postgame'
import { PrintButton } from './PrintButton'
const supa = createAdminClient()

export default async function PrintPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data } = await supa
    .from('game_postgame_reports')
    .select('report_data')
    .eq('slug', slug)
    .maybeSingle()

  if (!data?.report_data) {
    notFound()
  }

  const report = data.report_data as PostgameReport

  return (
    <div className="min-h-screen bg-stone-100 py-8">
      <div className="print:hidden max-w-[794px] mx-auto mb-4 flex justify-end">
        <PrintButton />
      </div>
      <PostgameDigest report={report} />
    </div>
  )
}
