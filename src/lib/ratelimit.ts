import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

// Fail-open wrapper. If Upstash is unreachable (deleted DB, bad env var, outage)
// the underlying .limit() throws, which used to 500 sign-in, signup and
// preferences. Rate limiting is a secondary protection here (Turnstile is the
// primary bot gate on login/signup), so we log loudly and let the request
// through rather than lock every user out.
function failOpen(name: string, limiter: Ratelimit): Pick<Ratelimit, 'limit'> {
  return {
    limit: async (identifier: string) => {
      try {
        return await limiter.limit(identifier)
      } catch (e) {
        console.error(`[ratelimit:${name}] Redis unavailable, allowing request:`, e instanceof Error ? e.message : e)
        return { success: true, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve() }
      }
    },
  }
}

// Signup: 5 per minute per IP
export const signupLimit = failOpen(
  'signup',
  new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: true,
    prefix: 'edge:signup',
  }),
)

// Preferences save: 10 per minute per IP
export const preferencesLimit = failOpen(
  'prefs',
  new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: true,
    prefix: 'edge:prefs',
  }),
)

// Helper to extract IP from a request
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
