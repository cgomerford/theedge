// src/app/api/dashboard/compare-profile/route.ts
//
// TEMPORARILY DISABLED — getPlayerCompareProfile() was never implemented in
// lib/playerCompare.ts (only getPlayerHotZones exists there). This route was
// written expecting it, which broke `npm run build`. Rather than fabricate a
// response or delete the file, this returns an honest 501 so PlayerCompareView.tsx
// gets a clear "not available yet" instead of a silent crash, and the build is
// unblocked without touching the unrelated post-game email work.
//
// TO RESTORE: implement getPlayerCompareProfile(id, subjectType, season) in
// lib/playerCompare.ts (same file getPlayerHotZones lives in), then swap the
// GET handler below back to the original version — it's preserved in git history
// on this same file, nothing else needs to change.

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Player compare is not available yet', detail: 'getPlayerCompareProfile is unimplemented' },
    { status: 501 },
  )
}