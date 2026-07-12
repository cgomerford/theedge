'use client'

// src/components/PageTransition.tsx
// Smooth fade+slide transition on route change.
// Wrap the main content of any page in <PageTransition>.

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const prevPath = useRef(pathname)

  useEffect(() => {
    if (pathname !== prevPath.current) {
      // New route — reset and animate in
      setVisible(false)
      prevPath.current = pathname
      const t = setTimeout(() => setVisible(true), 20)
      return () => clearTimeout(t)
    } else {
      // First mount
      const t = setTimeout(() => setVisible(true), 20)
      return () => clearTimeout(t)
    }
  }, [pathname])

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
      }}
    >
      {children}
    </div>
  )
}
