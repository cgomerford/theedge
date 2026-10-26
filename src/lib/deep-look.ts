// Server-side reads of the free deep-look cookie (see deep-look-cookie.ts). The cookie is SET by the proxy (src/proxy.ts) the
// first time a signed-in free account opens a gated module page, and by allowDeepLookFor() for the pitch-shape APIs.
import { cookies } from 'next/headers'
import { LOOK_COOKIE, LOOK_MAX_AGE, signLook, verifyLook, type Look } from '@/lib/deep-look-cookie'

export type { Look }

/** Today's look for this browser, or null if none was claimed today. */
export async function readLook(): Promise<Look | null> {
  const jar = await cookies()
  return verifyLook(jar.get(LOOK_COOKIE)?.value)
}

/** True if today's look was spent on exactly this module. */
export async function isTodaysModule(feature: string, key: string): Promise<boolean> {
  const l = await readLook()
  return !!l && l.feature === feature && l.key === key
}

/** For route handlers only (cookies can be set there): claim today's look for a module if it is still free. */
export async function claimLook(feature: string, key: string): Promise<boolean> {
  const l = await readLook()
  if (l) return l.feature === feature && l.key === key
  const jar = await cookies()
  jar.set(LOOK_COOKIE, await signLook(feature, key), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: LOOK_MAX_AGE, secure: process.env.NODE_ENV === 'production' })
  return true
}
