// Player headshots and club logos for the Pitching Desk, using the existing helpers in team/ui.tsx
// (headshot() / teamLogo(), MLB's image CDN). Plain <img>, no hooks: works in server and client components.
// The headshot URL carries MLB's own generic-silhouette default, so a missing photo still shows a neutral head.
// data-no-export keeps the images out of PNG exports: they are cross-origin, and html-to-image can fail on those.

import { C, headshot, teamLogo } from '@/components/team/ui'

export function Headshot({ id, size = 32, ring }: { id: number; size?: number; ring?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={headshot(id, size * 2)} alt="" width={size} height={size} loading="lazy" data-no-export=""
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: C.soft, flexShrink: 0, boxShadow: ring ? `0 0 0 2px ${ring}` : `0 0 0 1px ${C.line}` }} />
  )
}

/** Club logo on a white disc, so it stays legible on any team-coloured banner. */
export function TeamBadge({ id, size = 44, disc = true }: { id: number; size?: number; disc?: boolean }) {
  return (
    <span data-no-export="" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: '50%', background: disc ? '#fff' : 'transparent', flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogo(id)} alt="" width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} loading="lazy" style={{ width: size * 0.7, height: size * 0.7, objectFit: 'contain' }} />
    </span>
  )
}
