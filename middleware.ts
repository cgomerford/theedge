// middleware.ts  (project root — same level as next.config.ts)
//
// Basic-auth guard for the entire /admin tree (dashboard + stat-card tool).
// Zero dependencies, runs on the edge, no login UI to build.
//
// Set these in Vercel env (Project Settings -> Environment Variables) and in
// .env.local for dev:
//   ADMIN_USER=george
//   ADMIN_PASSWORD=<something long and random>
//
// ⚠️ If you ALREADY have a middleware.ts, do NOT overwrite it — merge the
//    matcher and the auth check into your existing file instead.
//
// REVISION NOTE (2026-06-24): initial build.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER
  const pass = process.env.ADMIN_PASSWORD

  if (!user || !pass) {
    return new NextResponse('Admin auth is not configured (set ADMIN_USER / ADMIN_PASSWORD).', {
      status: 500,
    })
  }

  const header = req.headers.get('authorization')
  if (header) {
    const [scheme, encoded] = header.split(' ')
    if (scheme === 'Basic' && encoded) {
      const [u, p] = atob(encoded).split(':')
      if (u === user && p === pass) {
        return NextResponse.next()
      }
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="The Edge Admin", charset="UTF-8"' },
  })
}

export const config = {
  matcher: ['/admin/:path*'],
}
