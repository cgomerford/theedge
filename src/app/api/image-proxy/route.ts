// src/app/api/image-proxy/route.ts
//
// Fetches an external image server-side and returns it as a base64 data
// URI. Exists specifically so html-to-image's PNG export can inline
// cross-origin images (headshots from img.mlbstatic.com) without hitting
// browser CORS restrictions — html-to-image inlines <img> tags via its
// own browser-side fetch(), which is blocked if the remote host doesn't
// send permissive CORS headers, silently producing a blank export instead
// of a visible error. Server-to-server fetch has no such restriction.
//
// Allowlisted hosts only — this must never become an open proxy.

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = ['img.mlbstatic.com', 'www.mlbstatic.com']

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  let parsed: URL
  try { parsed = new URL(url) } catch { return NextResponse.json({ error: 'invalid url' }, { status: 400 }) }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 })
  }

  try {
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ error: 'upstream fetch failed' }, { status: 502 })
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const buffer = Buffer.from(await res.arrayBuffer())
    return NextResponse.json({ dataUri: `data:${contentType};base64,${buffer.toString('base64')}` })
  } catch (err) {
    console.error('[image-proxy]', err)
    return NextResponse.json({ error: 'proxy failed' }, { status: 500 })
  }
}