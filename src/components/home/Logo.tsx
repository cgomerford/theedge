import { headshotCutoutUrl } from '@/lib/mlb-assets'
import { teamLogoUrl } from '@/lib/mlb'
import TeamChip from '@/components/ui/TeamChip'

// Team logo + abbreviation, and round player headshot, for the homepage. The text chip always sits beside the logo.
export function TeamMark({ id, abbr, size = 24 }: { id: number; abbr: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogoUrl(id)} alt="" width={size} height={size} style={{ objectFit: 'contain', flexShrink: 0 }} />
      <TeamChip abbr={abbr} />
    </span>
  )
}

// Floating player portrait: the league's transparent cut-out (head and shoulders, no background, no frame), so the head is never
// cropped. It sits on the page with nothing around it. Falls back to nothing if the picture is missing.
export function Headshot({ id, name, size = 40 }: { id: number; name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={headshotCutoutUrl(id)} alt={name} width={size} height={size} style={{ width: size, height: size, minWidth: size, maxWidth: 'none', objectFit: 'contain', objectPosition: 'center bottom', flexShrink: 0, display: 'block' }} />
  )
}
