// src/components/admin/story-v5/validate.ts
//
// Fail loudly: buildPreviewData collects every problem it finds and throws one PreviewDataError, so a render never draws a blank
// and George sees the whole list at once.

export class PreviewDataError extends Error {
  constructor(public problems: string[]) {
    super(`Preview data is incomplete (${problems.length}):\n- ${problems.join('\n- ')}`)
    this.name = 'PreviewDataError'
  }
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Every shown player must be on the club's current active roster. */
export function checkRoster(label: string, who: { id: number; name: string }[], roster: Set<number>, problems: string[]): void {
  if (!roster.size) { problems.push(`${label}: active roster could not be read`); return }
  for (const p of who) if (!roster.has(p.id)) problems.push(`${label}: ${p.name} (${p.id}) is not on the active roster`)
}

/** HEAD-check every image URL. A failed or non-200 image is a problem. */
export async function checkImages(urls: string[], problems: string[], fetcher: typeof fetch = fetch): Promise<void> {
  const unique = [...new Set(urls)]
  const MAX = 6
  for (let i = 0; i < unique.length; i += MAX) {
    await Promise.all(unique.slice(i, i + MAX).map(async u => {
      try {
        const r = await fetcher(u, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(8000) })
        if (!r.ok) problems.push(`image did not load (HTTP ${r.status}): ${u}`)
      } catch (e) { problems.push(`image did not load (${(e as Error).message}): ${u}`) }
    }))
  }
}
