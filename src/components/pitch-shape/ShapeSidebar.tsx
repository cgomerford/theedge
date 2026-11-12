// src/components/pitch-shape/ShapeSidebar.tsx
//
// The Pitch Shape Lab's right-hand column: the two views (one pitch, or every pitch's map side by side) (the plain-language explainer is ShapeIntro). Server component, links only. Describes what pitches do; no prediction language.
import Link from 'next/link'
import { C } from '@/components/team/ui'

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }
const h: React.CSSProperties = { margin: '0 0 10px', fontSize: 15, fontWeight: 800, letterSpacing: '-0.005em' }

export default function ShapeSidebar({ view, hrefOne, hrefAll, hrefCompare }: { view: 'one' | 'all' | 'compare'; hrefOne: string; hrefAll: string; hrefCompare: string }) {
  const opt = (on: boolean): React.CSSProperties => ({ display: 'block', textDecoration: 'none', color: C.ink, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? '#FAF8F3' : '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8 })
  return (
    <aside aria-label="Views and help" className="psl-side">
      <div style={card}>
        <h2 style={h}>Choose a view</h2>
        <Link href={hrefOne} style={opt(view === 'one')} aria-current={view === 'one' ? 'true' : undefined}>
          <b style={{ fontSize: 14 }}>One pitch, up close</b>
          <span style={{ display: 'block', fontSize: 12.5, color: '#5b5347', marginTop: 2 }}>A large map for the pitch type you choose, with a readout of the swings and misses under your cursor.</span>
        </Link>
        <Link href={hrefAll} style={opt(view === 'all')} aria-current={view === 'all' ? 'true' : undefined}>
          <b style={{ fontSize: 14 }}>All pitch shape maps</b>
          <span style={{ display: 'block', fontSize: 12.5, color: '#5b5347', marginTop: 2 }}>Every pitch type side by side on the same colour scale, so you can see which pitches get the most misses.</span>
        </Link>
        <Link href={hrefCompare} style={opt(view === 'compare')} aria-current={view === 'compare' ? 'true' : undefined}>
          <b style={{ fontSize: 14 }}>Compare levels</b>
          <span style={{ display: 'block', fontSize: 12.5, color: '#5b5347', marginTop: 2 }}>One pitch type across MLB, Triple-A, the Florida State League and the rest, drawn on the same window so a shift in shape shows.</span>
        </Link>
      </div>
    </aside>
  )
}
