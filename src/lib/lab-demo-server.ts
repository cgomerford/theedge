import 'server-only'
// Stored example data for the SERVER-rendered lab tabs (Swing, Contact, Outcomes, Platoon, Approach, Shape). Signed-out visitors
// get this snapshot of the sample players (src/data/lab-demo/server.json, recorded in development by
// /api/dev/lab-demo-snapshot); the database is not read for them. Signed-in members get the real call.
import snapshot from '@/data/lab-demo/server.json'
import { isSignedIn } from '@/lib/require-signup'

const SNAP = snapshot as Record<string, unknown>

/** The real data for members; the stored sample for signed-out visitors (null if the snapshot has not been recorded). */
export async function demoOr<T>(key: string, real: () => Promise<T>): Promise<T> {
  if (await isSignedIn()) return real()
  return (SNAP[key] ?? null) as T
}

export async function demoMode(): Promise<boolean> {
  return !(await isSignedIn())
}

/** The stored sample, whoever is looking (for the example shown to members who cannot open a tab). */
export function demoSnapshot<T>(key: string): T | null {
  return (SNAP[key] ?? null) as T | null
}
