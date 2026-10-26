// The sample players behind the lab previews. A visitor who cannot open a lab tab sees the REAL tab, working, on one of these two
// players, labelled "Example only: this is <sample>'s data, not <player>'s". Their lab data is public on purpose: the data APIs let
// anyone read these two ids (see lib/deep-look.ts), everyone else's stays behind the account and the daily look.
// Client-safe (no server imports).
import type { DeepLookFeature } from '@/lib/deep-look-types'

export const SAMPLE_BATTER = { id: 592450, name: 'Aaron Judge' }
export const SAMPLE_PITCHER = { id: 543037, name: 'Gerrit Cole' }

export function isSampleEntity(feature: DeepLookFeature, entityId: string): boolean {
  const id = String(entityId)
  if (feature === 'batting_lab') return id === String(SAMPLE_BATTER.id)
  if (feature === 'pitching_lab' || feature === 'pitch_shape') return id === String(SAMPLE_PITCHER.id)
  if (feature === 'player_trends') return id === String(SAMPLE_BATTER.id) || id === String(SAMPLE_PITCHER.id)
  return false
}
