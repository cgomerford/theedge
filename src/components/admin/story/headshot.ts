// src/components/admin/story/headshot.ts
//
// The ONLY place the story touches img.mlbstatic.com. Same URL the old teaser
// built. Before an export every headshot is preloaded into a data URL so
// html-to-image never hits the network (or a CORS wall) mid-capture. A
// failed/blocked photo resolves to null and the NamePlate draws initials.

export function headshotUrl(playerId: number | null | undefined, width = 180): string | null {
  if (!playerId) return null
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_${width},d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${playerId}/headshot/silo/current`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function loadHeadshot(playerId: number, width = 180): Promise<string | null> {
  const url = headshotUrl(playerId, width)
  if (!url) return null
  try {
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    return await blobToDataUrl(blob)
  } catch (err) {
    console.warn(`[loadHeadshot] ${playerId} failed:`, err)
    return null
  }
}

export type PhotoMap = Record<number, string | null>

/** Module-level cache: rebuilds, toggles and game switches never refetch a loaded id. */
const CACHE = new Map<number, string | null>()

export function cachedPhotos(ids: number[]): PhotoMap {
  const out: PhotoMap = {}
  for (const id of ids) if (CACHE.has(id)) out[id] = CACHE.get(id) ?? null
  return out
}

/** Loads only the ids missing from the cache (small pool: the image CDN is happy with a handful at once). */
export async function preloadHeadshots(ids: number[], already: PhotoMap = {}): Promise<PhotoMap> {
  const out: PhotoMap = { ...already }
  const todo = [...new Set(ids)].filter(id => id && !CACHE.has(id))
  let i = 0
  const worker = async () => {
    while (i < todo.length) { const id = todo[i++]; CACHE.set(id, await loadHeadshot(id)) }
  }
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker))
  for (const id of ids) if (CACHE.has(id)) out[id] = CACHE.get(id) ?? null
  return out
}
