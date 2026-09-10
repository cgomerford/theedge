// src/lib/mlb-fetch-limiter.ts
//
// Caps concurrent in-flight requests to statsapi.mlb.com across the whole
// process. Added 2026-09-08 — after removing two slow-but-pacing fetches
// (Savant raw pitch log, getBatterVsPitcher) from the game page, the
// remaining statsapi.mlb.com calls started firing in a much tighter burst
// and page loads got WORSE (31s -> 55-59s), with 20-35 consecutive
// ECONNRESET/ConnectTimeoutError failures per load. This throttles any
// caller that opts in to at most MAX_CONCURRENT simultaneous requests to
// this host, queuing the rest rather than firing them all at once.
//
// Not a global fetch patch — deliberately opt-in per call site, since
// swapping every fetch() in the codebase at once is riskier than rolling
// it out to the highest-fan-out call sites first (starting with
// streaks.ts, since it's the one currently failing loudest).

const MAX_CONCURRENT = 6
let active = 0
const queue: (() => void)[] = []

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return
  }
  await new Promise<void>((resolve) => queue.push(resolve))
  active++
}

function release(): void {
  active--
  const next = queue.shift()
  if (next) next()
}

export async function throttledMlbFetch(url: string, init?: RequestInit): Promise<Response> {
  await acquire()
  try {
    return await fetch(url, init)
  } finally {
    release()
  }
}