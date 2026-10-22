// src/app/mlb/swing-decisions/page.tsx
//
// The Swing Decisions league page was replaced by the Contact Lab (/mlb/lab/contact). Old links and bookmarks land there.
// (SwingLeague.tsx and getSwingLeaders in lib/swing-decisions/data.ts are no longer used by any page.)

import { permanentRedirect } from 'next/navigation'

export default function SwingDecisionsMoved(): never {
  permanentRedirect('/mlb/lab/contact')
}
