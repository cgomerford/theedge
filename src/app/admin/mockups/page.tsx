// src/app/admin/mockups/page.tsx
//
// Index of the static HTML mockups in /mockups. Per CLAUDE.md we mock up a
// page in HTML and get it approved before building the React version.
// Lives under /admin so it sits behind the admin basic-auth in src/proxy.ts.
// Drop a new .html into /mockups and it appears here — no code change needed.
// Local dev only for now: /mockups is not bundled into the Vercel build.

import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'

export const metadata = { title: 'Mockups - x9Lab', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function listMockups(): { slug: string; title: string }[] {
  try {
    const dir = path.join(process.cwd(), 'mockups')
    return fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.html'))
      .sort()
      .map(f => {
        const html = fs.readFileSync(path.join(dir, f), 'utf8')
        const m = html.match(/<title>([^<]*)<\/title>/i)
        const slug = f.replace(/\.html$/, '')
        return { slug, title: m ? m[1].trim() : slug }
      })
  } catch (e) {
    console.error('[listMockups] could not read /mockups:', (e as Error).message)
    return []
  }
}

export default function MockupsHome() {
  const items = listMockups()
  return (
    <main style={{ background: C.cream, minHeight: '100vh', padding: '40px 24px 80px', fontFamily: SANS }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ fontSize: 11, color: C.orange, letterSpacing: '.16em' }}>⊕ MOCKUPS</div>
        <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.02em', margin: '6px 0 8px', color: C.ink }}>Mockups, before they&apos;re built.</h1>
        <p style={{ fontSize: 15, color: '#5b5347', maxWidth: 640, lineHeight: 1.5, margin: '0 0 28px' }}>
          Static HTML mockups with sample data, from the <code>mockups/</code> folder. Approve the look here, then it gets built as a real page.
        </p>
        {items.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: 24, color: C.mute }}>No mockups found.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {items.map(m => (
              <Link key={m.slug} href={`/admin/mockups/${m.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, height: '100%' }}>
                  <div style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>Mockup</div>
                  <div style={{ fontWeight: 800, fontSize: 20, margin: '6px 0', color: C.ink }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: C.faint }}>mockups/{m.slug}.html</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
