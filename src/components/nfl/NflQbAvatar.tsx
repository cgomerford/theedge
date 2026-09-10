// src/components/nfl/NflQbAvatar.tsx
//
// Clean fallback for missing/broken headshots — team-colored circle
// with initials, rather than a blank circle or a broken image icon.
// onError catches URLs that resolve but 404 or return a generic
// placeholder graphic, not just genuinely-null headshotUrl.

'use client'

import { useState } from 'react'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function NflQbAvatar({
  headshotUrl, playerName, teamColor, size = 36, ringColor,
}: {
  headshotUrl: string | null
  playerName: string
  teamColor: string | null
  size?: number
  ringColor?: string | null
}) {
  const [errored, setErrored] = useState(false)
  const showImage = headshotUrl && !errored
  const bg = teamColor ?? '#78716C'

  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        border: ringColor ? `2px solid ${ringColor}` : 'none', boxSizing: 'border-box',
        background: showImage ? '#F0EBE0' : bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {showImage ? (
        <img
          src={headshotUrl}
          alt=""
          width={size} height={size}
          style={{ objectFit: 'cover', display: 'block', width: '100%', height: '100%' }}
          onError={() => setErrored(true)}
        />
      ) : (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: size * 0.36, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
          {initials(playerName)}
        </span>
      )}
    </div>
  )
}