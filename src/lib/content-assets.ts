// src/lib/content-assets.ts
//
// Rules for images on the content calendar. The files live in the PRIVATE `content-assets` bucket at <item id>/<uuid>.<ext> and are only ever shown through
// signed links the server makes (one hour). Nothing here talks to storage; the asset route does.

import { ASSET_ROLES, type Asset } from '@/lib/content-plan-core'

export const ASSET_BUCKET = 'content-assets'
export const MAX_ASSET_BYTES = 8 * 1024 * 1024
export const SIGNED_SECONDS = 3600
export const TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const
export type ImageKind = keyof typeof TYPES

/** The real type of an image from its first bytes (PNG, JPEG or WebP), whatever the upload claims. null for anything else, a GIF included. */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}
export const cleanRole = (x: unknown): Asset['role'] => (ASSET_ROLES.includes(x as Asset['role']) ? (x as Asset['role']) : 'other')
export const tidyLabel = (x: unknown, fallback: string) => (typeof x === 'string' && x.trim() ? x : fallback).replace(/\s+/g, ' ').trim().slice(0, 80)
/** An asset path is <item id>/<uuid>.<png|jpg|webp>: nothing else is ever read, signed or deleted. */
export const isAssetPath = (itemId: string, p: unknown): p is string => typeof p === 'string' && p.startsWith(`${itemId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/i.test(p)
