'use client'

/**
 * src/components/fantasy/PlayerHeadshot.tsx
 *
 * Isolated client component for the onError fallback — img onError is an
 * event handler and can't be passed as a prop from a server component
 * (Next 16 RSC boundary). Anything rendering a headshot with a fallback
 * inside a server component should use this instead of a raw <img>.
 */

import { playerHeadshotUrl } from '@/lib/mlb'

export default function PlayerHeadshot({
  playerId,
  size = 60,
  className = '',
}: {
  playerId: number
  size?: number
  className?: string
}) {
  return (
    <img
      src={playerHeadshotUrl(playerId, size)}
      alt=""
      className={className}
      onError={(e) => { e.currentTarget.style.display = 'none' }}
    />
  )
}