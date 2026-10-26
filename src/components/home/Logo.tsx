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

export function Headshot({ id, name, size = 40 }: { id: number; name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={headshotUrl(id, size * 2)} alt={name} width={size} height={size} style={{ width: size, height: size, minWidth: size, minHeight: size, maxWidth: 'none', aspectRatio: '1 / 1', borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', background: '#f1eee6', border: '1px solid #e7e2d8', flexShrink: 0, display: 'block' }} />
  )
}
