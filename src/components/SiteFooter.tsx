import Link from 'next/link'
import { signupHref } from '@/lib/site'
import HideOnPaths from '@/components/HideOnPaths'

const LINKS: { href: string; label: string }[] = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/why-edge', label: 'Why x9Lab' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/mlb/glossary', label: 'Glossary' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: signupHref('footer_signup'), label: 'Create a free account' },
]

// Rendered once from the root layout. Server component; HideOnPaths only decides visibility.
export default function SiteFooter() {
  return (
    <HideOnPaths prefixes={['/admin', '/dev', '/maintenance']}>
      <footer style={{ borderTop: '1px solid #e7e2d8', padding: '28px 16px 40px', textAlign: 'center' }}>
        <nav aria-label="Footer" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 20px' }}>
          {LINKS.map(l => (
            <Link key={l.label} href={l.href} style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', textDecoration: 'none' }}>
              {l.label}
            </Link>
          ))}
        </nav>
        <p style={{ margin: '14px 0 0', fontSize: 12, color: '#8a8275' }}>
          Built on public game data. Independent, not affiliated with MLB.
        </p>
      </footer>
    </HideOnPaths>
  )
}
