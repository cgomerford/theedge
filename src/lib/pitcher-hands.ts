// src/lib/pitcher-hands.ts
//
// Batch lookup of throwing hand for a set of pitcher IDs — needed for
// vs LHP/RHP splits, since neither PitchRecord nor BattedBallRecord
// carries pitchHand. One fetch per distinct pitcherId a batter faced,
// run concurrently, cached hard since a pitcher's hand never changes.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export async function fetchPitcherHands(pitcherIds: number[]): Promise<Map<number, 'L' | 'R'>> {
  const unique = Array.from(new Set(pitcherIds))
  const hands = new Map<number, 'L' | 'R'>()

  await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await fetch(`${MLB_API}/people/${id}`, { next: { revalidate: 86400 } }) // 24h — hand never changes
        if (!res.ok) return
        const data = await res.json()
        const code = data.people?.[0]?.pitchHand?.code
        if (code === 'L' || code === 'R') hands.set(id, code)
      } catch {
        // skip silently — that pitcher's ABs just won't count toward either split
      }
    })
  )

  return hands
}