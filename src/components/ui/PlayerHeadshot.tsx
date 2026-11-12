'use client'

// src/components/ui/PlayerHeadshot.tsx
//
// The floating cut-out portrait used in page headers. It tries each address in headshotChain() in turn (the transparent cut-out, the standard headshot, the MiLB photo): an address with no
// photo is a 404, so the next is tried, and only when every one fails is a neutral silhouette drawn. The old single address carried MLB's grey default image, so any player without a
// cut-out (most minor leaguers) showed a stranger's silhouette even though the MiLB photo exists.
import { useEffect, useRef, useState } from 'react'
import { headshotChain } from '@/lib/mlb-assets'

export default function PlayerHeadshot({ id, name, size = 40 }: { id: number; name: string; size?: number }) {
  return <Photo key={id} id={id} name={name} size={size} />
}

function Photo({ id, name, size }: { id: number; name: string; size: number }) {
  const chain = headshotChain(id, size * 2)
  const [i, setI] = useState(0)
  const ref = useRef<HTMLImageElement>(null)
  // A server-rendered picture can fail before React is listening for its error event; catch that on mount so the next address is still tried.
  useEffect(() => { const el = ref.current; if (el && el.complete && el.naturalWidth === 0) setI(n => n + 1) }, [i])
  const box: React.CSSProperties = { width: size, height: size, minWidth: size, maxWidth: 'none', flexShrink: 0, display: 'block' }
  if (i >= chain.length) {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`No photo available for ${name}`} style={box}>
        <circle cx="20" cy="15" r="7" fill="#d9d3c5" /><path d="M5 40c1-10 8-15 15-15s14 5 15 15z" fill="#d9d3c5" />
      </svg>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} key={chain[i]} src={chain[i]} alt={name} width={size} height={size} onError={() => setI(n => n + 1)} style={{ ...box, objectFit: 'contain', objectPosition: 'center bottom' }} />
  )
}
