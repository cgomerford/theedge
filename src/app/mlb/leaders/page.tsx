// src/app/mlb/leaders/page.tsx
//
// Moved to /mlb/stats — kept as a redirect so old links/bookmarks still work.
import { redirect } from 'next/navigation'

export default function MLBLeadersRedirect() {
  redirect('/mlb/stats')
}
