'use client'

import { usePathname } from 'next/navigation'

// Renders its (server-rendered) children everywhere except under the given path prefixes.
export default function HideOnPaths({ prefixes, children }: { prefixes: string[]; children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  if (prefixes.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  return <>{children}</>
}
