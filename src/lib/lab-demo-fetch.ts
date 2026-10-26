// Stored example data for the lab previews. The preview tabs are the real client components, but they never touch the database:
// while a DemoFrame is on screen, window.fetch answers any /api/ call that carries a sample player id (lib/lab-sample.ts) from a JSON
// file kept in the repo (src/data/lab-demo/*.json), recorded once from the sample players. Anything else passes through untouched.
// RECORD mode (development only: NEXT_PUBLIC_LAB_DEMO_RECORD=1) lets those calls reach the network once and saves each answer.
import { SAMPLE_BATTER, SAMPLE_PITCHER } from '@/lib/lab-sample'

export type Fixtures = Record<string, unknown>

const IDS = [String(SAMPLE_BATTER.id), String(SAMPLE_PITCHER.id)]
const RECORD = process.env.NEXT_PUBLIC_LAB_DEMO_RECORD === '1'

/** Same URL, with the sample ids replaced by :id and the query sorted, so fixtures do not depend on param order. */
export function demoKey(url: string): string {
  const u = new URL(url, 'http://x')
  const path = u.pathname.split('/').map(s => (IDS.includes(s) ? ':id' : s)).join('/')
  const q = [...u.searchParams.entries()].map(([k, v]) => `${k}=${IDS.includes(v) ? ':id' : v}`).sort().join('&')
  return q ? `${path}?${q}` : path
}

let depth = 0
let original: typeof window.fetch | null = null

export function installDemoFetch(lab: 'batting' | 'pitching'): () => void {
  if (typeof window === 'undefined') return () => {}
  const fixtures: Promise<Fixtures> = (lab === 'batting' ? import('@/data/lab-demo/batting.json') : import('@/data/lab-demo/pitching.json')).then(m => (m.default ?? m) as Fixtures)
  if (depth === 0) original = window.fetch.bind(window)
  depth++
  const orig = original!
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('/api/')) return orig(input, init)
    const key = demoKey(url)
    const fx = await fixtures
    if (key in fx) return new Response(JSON.stringify(fx[key]), { status: 200, headers: { 'content-type': 'application/json' } })
    if (!key.includes(':id')) return orig(input, init)
    if (RECORD) {
      const res = await orig(input, init)
      if (res.ok) {
        const body = await res.clone().json().catch(() => undefined)
        if (body !== undefined) void orig('/api/dev/lab-demo-record', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lab, key, body }) })
      }
      return res
    }
    return new Response('{}', { status: 404 })   // not recorded: show the component's own empty state, never live data
  }
  return () => {
    depth = Math.max(0, depth - 1)
    if (depth === 0 && original) { window.fetch = original; original = null }
  }
}
