// src/app/mlb/leaders/page.tsx
//
// Moved to /mlb/stats — kept as a redirect so old links/bookmarks still work.
import { redirect } from 'next/navigation'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'MLB leaders',
  description:
    'Season leaders in the main batting and pitching categories, with recent windows to compare, and the sample size next to every stat. Updated daily.',
  path: '/mlb/leaders',
})

export default function MLBLeadersRedirect() {
  redirect('/mlb/stats')
}
