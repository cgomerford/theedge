// src/components/sequencing-lab/PitchDot.tsx
//
// The small round pitch marker used on the Second Look page and the Game Plan Card (the approved mockup's four colours; every other type uses the site's pitch colour).
// `ring` outlines the dot (a swing and miss on the Second Look table). Server- and client-safe.

import { pitchColor } from '@/lib/lab/pitch-meta'

const MOCK: Record<string, string> = { FF: '#FF5722', SL: '#1D5FD1', CH: '#FDE047', SI: '#1A1A1A' }
export const dotColor = (t: string) => MOCK[t] ?? pitchColor(t)
const light = (c: string) => c.toLowerCase() === '#fde047'

export default function PitchDot({ t, size = 22, ring = false, title }: { t: string; size?: number; ring?: boolean; title?: string }) {
  const c = dotColor(t)
  return (
    <span title={title ?? t} aria-label={title ?? t} style={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: '50%', background: c, color: light(c) ? '#1A1A1A' : '#fff', border: light(c) ? '1.5px solid #1A1A1A' : 'none', fontSize: Math.max(8, Math.round(size * 0.4)), fontWeight: 800, letterSpacing: '-0.02em', flex: 'none', boxShadow: ring ? '0 0 0 2px #FAF8F3, 0 0 0 4px #1A1A1A' : undefined, margin: ring ? '0 3px' : undefined }}>{t}</span>
  )
}
