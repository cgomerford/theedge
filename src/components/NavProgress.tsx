'use client'

// src/components/NavProgress.tsx
// Slim orange progress bar at the top of the page during navigation.
// Add <NavProgress /> once in your root layout.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function NavProgress() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    setProgress(0)

    // Fast initial jump
    const t1 = setTimeout(() => setProgress(30), 20)
    // Mid crawl
    const t2 = setTimeout(() => setProgress(70), 150)
    // Complete and fade out
    const t3 = setTimeout(() => setProgress(100), 300)
    const t4 = setTimeout(() => setVisible(false), 550)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [pathname])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        height: '2px',
        width: `${progress}%`,
        background: '#FF5722',
        transition: progress === 0
          ? 'none'
          : progress === 100
            ? 'width 0.15s ease, opacity 0.2s ease 0.3s'
            : 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: progress === 100 ? 0 : 1,
        pointerEvents: 'none',
      }}
    />
  )
}
