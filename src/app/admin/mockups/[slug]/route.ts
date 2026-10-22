// src/app/admin/mockups/[slug]/route.ts
//
// Serves one static mockup from /mockups as-is. Behind admin basic-auth
// (src/proxy.ts covers /admin). The slug is restricted to a safe pattern so
// it can never reach outside the mockups folder.

import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]+$/i.test(slug)) return new Response('Not found', { status: 404 })
  try {
    const html = fs.readFileSync(path.join(process.cwd(), 'mockups', `${slug}.html`), 'utf8')
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
    })
  } catch (e) {
    console.error('[mockupRoute] could not read mockup:', slug, (e as Error).message)
    return new Response('Not found', { status: 404 })
  }
}
