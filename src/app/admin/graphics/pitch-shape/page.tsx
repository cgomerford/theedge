// src/app/admin/graphics/pitch-shape/page.tsx
//
// Pitch Shape graphics for X: vs the league, why the results are or are not there, and what if he changed his pitch. Auth: src/proxy.ts already guards every /admin path.

import XMark from '@/components/XMark'
import ShapeGraphicsStudio from '@/components/pitch-shape/ShapeGraphicsStudio'
import { css } from '@/app/admin/admin-css'

export const dynamic = 'force-dynamic'

export default function PitchShapeGraphicsPage() {
  return (
    <main className="admin">
      <style>{css}</style>
      <div className="wrap">
        <div className="topbar">
          <div className="brand"><span className="mark">⊕</span> X9LAB <span className="sub">/ admin</span></div>
          <div className="topmeta"><a href="/admin/graphics" style={{ color: 'inherit' }}>← Graphic Blocks</a></div>
        </div>
        <section className="sec card">
          <div className="sechead">
            <span className="glyph"><XMark /></span>
            <h2>Pitch Shape graphics</h2>
            <span className="tag">PNG · 1200x675 / 1080x1350 · from the Pitch Shape Lab data</span>
          </div>
          <ShapeGraphicsStudio />
        </section>
      </div>
    </main>
  )
}
