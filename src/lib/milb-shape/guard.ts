// src/lib/milb-shape/guard.ts
//
// The importer's write guard: it prints the Supabase target it would write to and refuses unless the project ref was passed explicitly (--confirm-project=<ref>) and
// equals the ref in the URL it is about to use. A dry run needs none of this and never connects.

export const EXPECTED_PROJECT_REF = 'cmrxfykadwvyhvmgcdnj'   // "theedge", UNVERIFIED: shown for comparison only, never used as a default

export function projectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const m = host.match(/^([a-z0-9]{20})\.supabase\.(?:co|in)$/)
    return m ? m[1] : null
  } catch { return null }
}

export class WriteRefusedError extends Error {}

/** Throws WriteRefusedError unless `confirm` equals the project ref in `url`. Returns the ref on success. */
export function assertWriteTarget(url: string | undefined, confirm: string | undefined): { url: string; ref: string; matchesExpected: boolean } {
  const ref = projectRefFromUrl(url)
  if (!url || !ref) throw new WriteRefusedError(`[guard] the Supabase URL is missing or is not a <ref>.supabase.co address (${url ?? 'not set'}); refusing to write`)
  if (!confirm) throw new WriteRefusedError(`[guard] refusing to write: pass --confirm-project=${ref} to confirm this is the project you mean (target ${url})`)
  if (confirm !== ref) throw new WriteRefusedError(`[guard] --confirm-project=${confirm} does not match the target project ref ${ref} (${url}); refusing to write`)
  return { url, ref, matchesExpected: ref === EXPECTED_PROJECT_REF }
}
