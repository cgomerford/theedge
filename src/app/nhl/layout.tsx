import type { Metadata } from 'next'

// /nhl is a gated, noindex private prototype (see src/lib/maintenance-gates.ts
// and public/robots.txt). This metadata is a second layer -- even if the
// maintenance gate were ever lifted by mistake, search engines are still told
// not to index anything under here. No nav link points here from the main site.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function NhlLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
