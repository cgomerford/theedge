// src/lib/player-draft.ts
//
// Draft round/pick isn't available via /people/{id} hydration — confirmed
// 2026-07-15, draftYear is a top-level person field but nothing else is.
// Round/pick/school live in the full draft-class endpoint instead, keyed
// by year, searched by person.id. Cached hard since draft history never
// changes once published.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export interface DraftPickDetail {
  year: number
  round: string
  pickNumber: number
  overallPick: number
  school: string | null
  team: string | null // populated once confirmed present on the payload
}

export async function getDraftPickDetail(
  playerId: number,
  draftYear: number | null,
): Promise<DraftPickDetail | null> {
  if (!draftYear) return null

  try {
    const res = await fetch(`${MLB_API}/draft/${draftYear}?sportId=1`, {
      next: { revalidate: 86400 }, // draft history is immutable — cache a full day
    })
    if (!res.ok) return null
    const json = await res.json()
    const rounds = json?.drafts?.rounds ?? []

    for (const round of rounds) {
      for (const pick of round.picks ?? []) {
        if (pick.person?.id === playerId) {
          return {
            year: draftYear,
            round: pick.pickRound ?? '—',
            pickNumber: pick.pickNumber ?? pick.roundPickNumber ?? 0,
            overallPick: pick.displayPickNumber ?? pick.pickNumber ?? 0,
            school: pick.school?.name ?? null,
            team: pick.team?.name ?? null, // TODO: confirm exact field once full dump is seen
          }
        }
      }
    }
    return null
  } catch (err) {
    console.error('[getDraftPickDetail]', err)
    return null
  }
}