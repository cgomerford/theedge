// src/lib/graphics/images.ts
//
// Client-side image preloading for the studio. Each image is fetched once, turned into a data URL
// (so html-to-image never makes a network request during export) and cached for the session.
// The blocks themselves never call this; they only read the resulting map.

import { headshot, teamLogo } from '@/components/team/ui'
import { X9_MARK_URL } from './constants'
import { teamId } from './teams'
import type { GraphicImages } from './types'

const CACHE = new Map<string, string | null>()

function urlFor(key: string): string | null {
  if (key === 'x9') return X9_MARK_URL
  if (key.startsWith('team:')) { const id = teamId(key.slice(5)); return id ? teamLogo(id) : null }
  if (key.startsWith('player:')) { const id = Number(key.slice(7)); return id ? headshot(id, 240) : null }
  return null
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function load(key: string): Promise<string | null> {
  const url = urlFor(key)
  if (!url) return null
  try {
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(10000) })
    if (!res.ok) { console.warn(`[loadGraphicImage] ${key} HTTP ${res.status}`); return null }
    const blob = await res.blob()
    return blob.type.startsWith('image/') ? await toDataUrl(blob) : null
  } catch (err) {
    console.warn(`[loadGraphicImage] ${key} failed:`, err)
    return null
  }
}

/** Loads whatever is missing from the cache and returns the images that loaded. */
export async function loadGraphicImages(keys: string[]): Promise<GraphicImages> {
  const todo = keys.filter(k => !CACHE.has(k))
  await Promise.all(todo.map(async k => { CACHE.set(k, await load(k)) }))
  const out: GraphicImages = {}
  for (const k of keys) { const v = CACHE.get(k); if (v) out[k] = v }
  return out
}
