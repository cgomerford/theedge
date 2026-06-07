// src/app/fantasy/page.tsx
//
// "/fantasy" is no longer a standalone page. Fantasy is a layer, not a place.
// The content now lives inline on /mlb (Fantasy Intel section) and on
// individual game pages (FantasyTabContent). Sub-pages like
// /fantasy/streamers still work at their current URLs.
//
// This redirect ensures old links, bookmarks, and nav items land somewhere
// useful instead of a dead page.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function FantasyRedirect() {
  redirect('/mlb')
}
