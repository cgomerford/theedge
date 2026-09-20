'use client'

// src/components/scout/Headshot.tsx
//
// Player headshot that falls back to the club's logo when MLB has no photo (most
// minor leaguers). An SSR'd <img> can fail before React hydrates and miss its
// onError, so on mount we also check whether the image already finished loading
// with no pixels.

import { useEffect, useRef, useState } from 'react'

export default function Headshot({ src, fallback, size = 30, dim = false }: { src: string; fallback: string; size?: number; dim?: boolean }) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.complete && el.naturalWidth === 0) setFailed(true)
  }, [])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref} src={failed ? fallback : src} alt="" loading="lazy" width={size} height={size} onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-full bg-white shrink-0 border border-white ${failed ? 'object-contain p-1' : 'object-cover'} ${dim ? 'grayscale opacity-70' : ''}`}
    />
  )
}
