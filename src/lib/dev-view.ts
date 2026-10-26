// Local-only "view as" switch: signed out / signed in (free) / Pro, set by the floating DevViewSwitcher.
// Only ever read under `next dev` (NODE_ENV is 'production' on every deployed build), so it cannot affect the live site.
import { cookies } from 'next/headers'

export type DevView = 'out' | 'member' | 'pro'
export const DEV_VIEW_COOKIE = 'edge_dev_view'

export async function getDevView(): Promise<DevView | null> {
  if (process.env.NODE_ENV !== 'development') return null
  const v = (await cookies()).get(DEV_VIEW_COOKIE)?.value
  return v === 'out' || v === 'member' || v === 'pro' ? v : null
}
