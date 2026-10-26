import { headshotUrl } from '@/lib/mlb-assets'
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

// Round player photo. The league's photo has the head close to the top edge, so a plain circle crop cuts the cap off:
// the picture is kept anchored to its top, scaled down and lowered a little, on the photo's own grey, so the whole head shows.
export function Headshot({ id, name, size = 40 }: { id: number; name: string; size?: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, minWidth: size, minHeight: size, borderRadius: '50%', overflow: 'hidden', background: '#a9abae', border: '1px solid #e7e2d8', flexShrink: 0, boxSizing: 'border-box', lineHeight: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={headshotUrl(id, size * 2)} alt={name} width={size} height={size} style={{ width: '100%', height: '100%', maxWidth: 'none', objectFit: 'cover', objectPosition: 'center top', transform: 'translateY(16%) scale(0.78)', transformOrigin: 'center top', display: 'block' }} />
    </span>
  )
}
