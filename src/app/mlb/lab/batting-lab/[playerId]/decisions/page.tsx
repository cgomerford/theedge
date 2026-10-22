// src/app/mlb/lab/batting-lab/[playerId]/decisions/page.tsx
//
// The Decisions tab was renamed Approach. Old links and bookmarks land on the new tab. (SwingLab.tsx and /api/lab/swing-pitches belonged to the
// retired 25-cell grid and are no longer used by any page.)

import { permanentRedirect } from 'next/navigation'

export default async function DecisionsMoved({ params }: { params: Promise<{ playerId: string }> }): Promise<never> {
  const { playerId } = await params
  permanentRedirect(`/mlb/lab/batting-lab/${playerId}/approach`)
}
