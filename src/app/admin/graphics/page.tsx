// src/app/admin/graphics/page.tsx
//
// Reusable graphic blocks for X posts. Auth: src/proxy.ts already guards every /admin path.

import XMark from '@/components/XMark'
import GraphicsStudio from '@/components/graphics/GraphicsStudio'
import { css } from '@/app/admin/admin-css'

export const dynamic = 'force-dynamic'

export default function GraphicsPage() {
  return (
    <main className="admin">
      <style>{css}</style>
      <div className="wrap">
        <div className="topbar">
          <div className="brand"><span className="mark">⊕</span> X9LAB <span className="sub">/ admin</span></div>
          <div className="topmeta"><a href="/admin" style={{ color: 'inherit' }}>← Admin home</a></div>
        </div>
        <section className="sec card">
          <div className="sechead">
            <span className="glyph"><XMark /></span>
            <h2>Graphic Blocks</h2>
            <span className="tag">PNG · 1200x675 / 1080x1350 · type or paste the numbers</span>
          </div>
          <GraphicsStudio />
        </section>
      </div>
    </main>
  )
}
