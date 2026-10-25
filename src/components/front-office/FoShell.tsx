// Page chrome for every Front Office page: site header, title block, section nav.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { C, MONO, SANS, DISPLAY } from '@/components/team/ui'

const NAV = [
  { href: '/mlb/front-office', label: 'Front Office' },
  { href: '/mlb/front-office/pitching', label: 'Pitching desk' },
  { href: '/mlb/front-office/blueprint', label: 'Roster Blueprint' },
  { href: '/mlb/front-office/ledger', label: 'The Ledger' },
  { href: '/mlb/front-office/radar', label: 'Breakout Radar' },
  { href: '/mlb/front-office/decisions', label: 'Swing Decisions' },
]

export default function FoShell({ active, title, kicker, children, wide = false }: { active: string; title: string; kicker: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="tp-root" style={{ background: C.cream, minHeight: '100vh', fontFamily: SANS, color: C.ink }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .tp-root b,.tp-root strong,.tp-root h1,.tp-root h2,.tp-root h3{font-family:var(--font-redhat),system-ui,sans-serif !important;font-variant-numeric:tabular-nums}
        .fo-nav{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
        .fo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .fo-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media (max-width:900px){.fo-grid{grid-template-columns:repeat(2,1fr)}.fo-two{grid-template-columns:1fr}}
        @media (max-width:560px){.fo-bp-row{grid-template-columns:1fr !important}}
      ` }} />
      <SiteHeader />
      <div style={{ maxWidth: wide ? 1760 : 1240, margin: '0 auto', padding: '28px 24px 80px' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.orange, letterSpacing: '.16em', textTransform: 'uppercase' }}>⊕ {kicker}</div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(34px, 5.6vw, 52px)', letterSpacing: '-.02em', lineHeight: 1, margin: '8px 0 18px' }}>{title}</h1>
        <nav className="fo-nav x9-desk-sticky" aria-label="Front Office tools" style={{ position: 'sticky', top: 0, zIndex: 20, background: C.cream, padding: '10px 0', margin: '0 0 8px', borderBottom: `1px solid ${C.line}` }}>
          {NAV.map(n => (
            <Link key={n.href} href={n.href} style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: 4, textDecoration: 'none', background: active === n.href ? C.ink : '#fff', color: active === n.href ? C.cream : C.ink, border: `1px solid ${active === n.href ? C.ink : C.line}` }}>{n.label}</Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  )
}
