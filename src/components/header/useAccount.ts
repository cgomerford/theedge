'use client'

// One small client hook for the header, the MLB strips and the mobile menu: who is looking, resolved from the uncached
// /api/auth/status route so the pages around it stay static/ISR. Fetched once per page load and shared in memory.
// While loading, callers render the signed-out footprint with controls invisible (no layout shift, no wrong-state flash).
import { useEffect, useState } from 'react'

export type Account =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'free' | 'pro'; initials: string; label: string }

let cached: Account | null = null
let inflight: Promise<Account> | null = null

function load(): Promise<Account> {
  if (cached) return Promise.resolve(cached)
  inflight ??= fetch('/api/auth/status', { cache: 'no-store' })
    .then(r => r.json() as Promise<{ authenticated?: boolean; is_pro?: boolean; initials?: string; label?: string }>)
    .then((j): Account => (j.authenticated
      ? { state: j.is_pro ? 'pro' : 'free', initials: j.initials ?? '?', label: j.label ?? '' }
      : { state: 'signed-out' }))
    .catch((): Account => ({ state: 'signed-out' }))
    .then(a => { cached = a; return a })
  return inflight
}

/** Forget the cached answer (after sign in or sign out). */
export function resetAccount() { cached = null; inflight = null }

export function useAccount(): Account {
  const [acct, setAcct] = useState<Account>(cached ?? { state: 'loading' })
  useEffect(() => {
    let off = false
    load().then(a => { if (!off) setAcct(a) })
    return () => { off = true }
  }, [])
  return acct
}
