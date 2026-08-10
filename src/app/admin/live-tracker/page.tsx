// src/app/admin/live-tracker/page.tsx
//
// Thin shell — all the logic lives in LiveTrackerBoard (client component,
// needs to be client for the polling + Notification API). If your /admin
// tree has an auth wrapper or shared layout, this page should already
// inherit it from a parent layout.tsx — nothing auth-related is handled
// here specifically, so double check this actually sits behind whatever
// gate the rest of /admin uses before this goes anywhere near prod.

import { LiveTrackerBoard } from '@/components/admin/LiveTrackerBoard'

export default function LiveTrackerPage() {
  return <LiveTrackerBoard />
}
