import { isSignedIn } from '@/lib/require-signup'
import { SAMPLE_BATTER, SAMPLE_PITCHER } from '@/lib/lab-sample'

// Server pages in the labs that read a player's data: signed-out visitors get the sample player's instead, so the player they
// asked for is never loaded for them (the layout shows it as a labelled example).
export async function labBatterId(requested: number): Promise<number> {
  return (await isSignedIn()) ? requested : SAMPLE_BATTER.id
}
export async function labPitcherId(requested: number): Promise<number> {
  return (await isSignedIn()) ? requested : SAMPLE_PITCHER.id
}
