'use client'

// src/components/pitch-shape/PlayerPhoto.tsx
//
// A player's picture that tries each address in headshotChain() in turn: if one has no photo it is a 404, the next is tried, and only when every address fails is a neutral silhouette drawn.
// That is how minor-league prospects get their picture (many have no cutout but do have the standard headshot or the MiLB photo) instead of MLB's grey default. The picture is keyed by player,
// so choosing another pitcher starts the chain again.

import { useState } from 'react'
import { C } from '@/components/team/ui'
import { headshotChain } from '@/lib/mlb-assets'

function Photo({ id, size, minor, round }: { id: number; size: number; minor: boolean; round: boolean }) {
  const chain = headshotChain(id, size * 2, minor)
  const [i, setI] = useState(0)
  const box: React.CSSProperties = { width: size, height: size, flex: 'none', borderRadius: round ? '50%' : 0, background: C.soft }
  if (i >= chain.length) {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="No photo available" style={{ ...box, display: 'block' }}>
        <circle cx="20" cy="15" r="7" fill="#c9c2b3" /><path d="M5 40c1-10 8-15 15-15s14 5 15 15z" fill="#c9c2b3" />
      </svg>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={chain[i]} src={chain[i]} alt="" width={size} height={size} loading="lazy" onError={() => setI(n => n + 1)} data-no-export="" style={{ ...box, objectFit: 'contain', objectPosition: 'center bottom' }} />
  )
}

export default function PlayerPhoto({ id, size = 40, minor = false, round = true }: { id: number; size?: number; /** a minor-league or exhibition player: try the standard headshot and the MiLB photo before the cutout */ minor?: boolean; round?: boolean }) {
  return <Photo key={id} id={id} size={size} minor={minor} round={round} />
}
