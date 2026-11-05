// src/lib/content-ingest-auth.ts
//
// Who is calling the content calendar's upload routes without the admin password: one of the three content assistants, each with its own bearer token.
//   CONTENT_TOKEN_MLB_ANALYSIS   -> source 'mlb_analysis'
//   CONTENT_TOKEN_X              -> source 'x'
//   CONTENT_TOKEN_YOUTUBE        -> source 'youtube'
// A source whose variable is unset (or shorter than 20 characters) is switched off. Tokens are compared as SHA-256 digests in constant time, every one on every
// call, so neither the match nor which source it was shows in the timing. A token is never logged or returned. Web Crypto only.

import type { NextRequest } from 'next/server'
import type { Source } from '@/lib/content-plan-core'

const VARS: [Source, string][] = [['mlb_analysis', 'CONTENT_TOKEN_MLB_ANALYSIS'], ['x', 'CONTENT_TOKEN_X'], ['youtube', 'CONTENT_TOKEN_YOUTUBE']]
export const MIN_TOKEN = 20

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}
function same(a: Uint8Array, b: Uint8Array): boolean {
  let d = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return d === 0
}

/** The source this request's bearer token belongs to, or null. */
export async function ingestSource(req: NextRequest): Promise<Source | null> {
  const header = req.headers.get('authorization') ?? ''
  const m = header.match(/^Bearer\s+(\S+)$/i)
  if (!m) return null
  const given = await digest(m[1])
  let found: Source | null = null
  for (const [source, name] of VARS) {
    const secret = process.env[name]
    if (!secret || secret.length < MIN_TOKEN) continue
    if (same(given, await digest(secret)) && !found) found = source
  }
  return found
}
