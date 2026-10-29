// src/lib/admin-auth.ts
//
// Guards the admin's own API routes. src/proxy.ts only protects pages under /admin (its matcher skips /api), so a route like
// /api/admin/articles needs its own check. The proxy sets an httpOnly cookie when someone passes the /admin password prompt; the routes
// accept that cookie (or the same Basic credentials). The cookie holds a hash of the credentials, never the password itself.
// Web Crypto only, so it runs in the proxy and in route handlers.

import type { NextRequest } from 'next/server'

export const ADMIN_COOKIE = 'x9_admin'

export async function adminToken(user: string, pass: string): Promise<string> {
  const data = new TextEncoder().encode(`x9admin:${user}:${pass}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** True when the request carries the admin cookie or valid Basic credentials. Fails closed if admin auth is not configured. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const user = process.env.ADMIN_USER
  const pass = process.env.ADMIN_PASSWORD
  if (!user || !pass) return false
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value
  if (cookie && cookie === (await adminToken(user, pass))) return true
  const header = req.headers.get('authorization')
  if (header) {
    const [scheme, encoded] = header.split(' ')
    if (scheme === 'Basic' && encoded) {
      const [u, p] = atob(encoded).split(':')
      if (u === user && p === pass) return true
    }
  }
  return false
}
