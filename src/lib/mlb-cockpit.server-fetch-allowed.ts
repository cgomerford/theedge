// Allowed render-path fetch (see scripts/checks/guard.sh check 5): small MLB Stats API lookups for the game page cockpit, cached 5 minutes by Next, 6 second timeout, null on failure.
const API = 'https://statsapi.mlb.com/api/v1'
export const REVALIDATE_SECONDS = 300

export async function mlb<T>(path: string, revalidate: number = REVALIDATE_SECONDS): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(6000), next: { revalidate } })
    return res.ok ? ((await res.json()) as T) : null
  } catch (e) {
    console.error('[game-cockpit] fetch failed:', path, e instanceof Error ? e.message : e)
    return null
  }
}

/** Same as mlb() but against the v1.1 API (game feed: linescore, boxscore, decisions, weather, officials). Cached 5 minutes. */
export async function mlb11<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1${path}`, { signal: AbortSignal.timeout(10000), next: { revalidate: REVALIDATE_SECONDS } })
    return res.ok ? ((await res.json()) as T) : null
  } catch (e) {
    console.error('[game-tabs] fetch failed:', path, e instanceof Error ? e.message : e)
    return null
  }
}
