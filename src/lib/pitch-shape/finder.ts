// src/lib/pitch-shape/finder.ts
//
// "Find me a pitcher": lenses that surface pitchers whose shape and results disagree, or whose shape is strong but whose role or overall line keeps them quiet.
// Plain functions over the Shape Score board's rows (a structural subset, so it has no server imports). Everything describes what has happened, with the sample behind it; none of
// it is a forecast. A pitcher needs a Shape Score (a shape window with enough league pitches) to appear in any lens.

export type FinderRow = {
  pitcherId: number; name: string; teamAbbr: string; pitches: number
  score: number | null; gap: number | null; verdict: 'behind' | 'level' | 'ahead' | null
  overall: { pitches: number; runsPct: number | null } | null
}
export type LensId = 'hidden' | 'quiet' | 'unexplained'
export const STRONG_SCORE = 70
export const WEAK_SCORE = 35
/** Fewer pitches than this across a season is a small role. */
export const SMALL_ROLE_PITCHES = 1100
/** Overall runs-allowed standing at or below this share of ranked pitchers is middling or worse. */
export const MIDDLING_PCT = 60

export type Lens = { id: LensId; label: string; blurb: string; test: (r: FinderRow) => boolean; sort: (a: FinderRow, b: FinderRow) => number }
export const LENSES: Lens[] = [
  { id: 'hidden', label: 'Strong shape, results trail it', blurb: 'The shape has saved runs for league pitchers, his own results have not kept up. Most behind first.',
    test: r => (r.score ?? 0) >= STRONG_SCORE && r.verdict === 'behind', sort: (a, b) => (a.gap ?? 0) - (b.gap ?? 0) },
  { id: 'quiet', label: 'Strong shape, quiet line', blurb: 'A strong shape on a pitcher with a small role or a middling overall line, so little has been said about it. Highest Shape Score first.',
    test: r => (r.score ?? 0) >= STRONG_SCORE && r.verdict !== 'ahead' && r.overall != null && (r.overall.pitches < SMALL_ROLE_PITCHES || (r.overall.runsPct != null && r.overall.runsPct <= MIDDLING_PCT)),
    sort: (a, b) => (b.score ?? 0) - (a.score ?? 0) },
  { id: 'unexplained', label: 'Results the shape does not explain', blurb: 'Good overall results on a weak shape: the shape has not produced this for league pitchers. Biggest gap first.',
    test: r => r.score != null && r.score <= WEAK_SCORE && r.verdict === 'ahead' && r.overall != null && r.overall.runsPct != null && r.overall.runsPct >= MIDDLING_PCT, sort: (a, b) => (b.gap ?? 0) - (a.gap ?? 0) },
]

export function findPitchers<T extends FinderRow>(rows: T[], id: LensId, limit = 6): T[] {
  const lens = LENSES.find(l => l.id === id) ?? LENSES[0]
  return rows.filter(lens.test).sort(lens.sort).slice(0, limit)
}
