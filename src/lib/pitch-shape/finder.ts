// src/lib/pitch-shape/finder.ts
//
// "Find me a pitcher": lenses that surface pitchers whose shape and results disagree, or whose shape is strong but whose role or overall line keeps them quiet.
// Plain functions over the Shape Score board's rows (a structural subset, so it has no server imports). Everything describes what has happened, with the sample behind it; none of
// it is a forecast. A pitcher needs a Shape Score (a shape window with enough league pitches) to appear in any lens.

export type FinderRow = {
  pitcherId: number; name: string; teamAbbr: string; pitches: number
  score: number | null; gap: number | null; verdict: 'behind' | 'level' | 'ahead' | null
  overall: { pitches: number; runsPct: number | null; careerPitches?: number } | null
  /** his own sample on this pitch is under the usual minimum (shown, but noisy) */
  small?: boolean
  /** his own pitches on this one: the sample behind his gap */
  ownRaw?: { n: { rv: number } }
  /** his season line: ERA, xERA, FIP, innings pitched (pitcher_stats), null when we hold none */
  stats?: { era: number | null; xera: number | null; fip: number | null; ip: number | null; xeraPa?: number | null } | null
  /** All-Star or major selections, from the MLB Stats API; null when it could not be read */
  profile?: { allStars: number; major: boolean; debutYear: number | null } | null
}
export type LensId = 'any' | 'hidden' | 'quiet' | 'unexplained'
export const STRONG_SCORE = 70
export const WEAK_SCORE = 35
/** Fewer pitches than this across a season is a small role. */
export const SMALL_ROLE_PITCHES = 1100
/** Overall runs-allowed standing at or below this share of ranked pitchers is middling or worse. */
export const MIDDLING_PCT = 60

/** Pitches since 2024 at or above which a pitcher has been a full-time pitcher for the whole record we hold (about three full seasons). */
export const ESTABLISHED_PITCHES = 6500

/**
 * A household name, as far as the data can tell: an All-Star, Cy Young, MVP or All-MLB selection, or a full-time record across every season we hold. With no award history (the
 * MLB Stats API could not be read) only the workload test applies.
 */
export const isEstablished = (r: FinderRow): boolean =>
  !!(r.profile && (r.profile.allStars > 0 || r.profile.major)) || (r.overall?.careerPitches ?? 0) >= ESTABLISHED_PITCHES

/** A gap on few pitches is noisy, so lists order by the gap shrunk toward zero by the sample: n / (n + 150) of it (100 pitches count for 40%, 300 for 67%, 1,000 for 87%). */
export const reliability = (r: FinderRow): number => { const n = r.ownRaw?.n.rv; return n == null ? 1 : n / (n + 150) }
const weighted = (r: FinderRow) => (r.gap ?? 0) * reliability(r)

export type Lens = { id: LensId; label: string; blurb: string; test: (r: FinderRow) => boolean; sort: (a: FinderRow, b: FinderRow) => number }
export const LENSES: Lens[] = [
  { id: 'any', label: 'Anyone', blurb: 'Every pitcher with a Shape Score, highest first. Use the filters to narrow it.', test: r => r.score != null, sort: (a, b) => (b.score ?? 0) - (a.score ?? 0) },
  { id: 'hidden', label: 'Strong shape, results trail it', blurb: 'The shape has saved runs for league pitchers, his own results have not kept up. Most behind first, with small samples counted for less.',
    test: r => (r.score ?? 0) >= STRONG_SCORE && r.verdict === 'behind', sort: (a, b) => weighted(a) - weighted(b) },
  { id: 'quiet', label: 'Strong shape, quiet line', blurb: 'A strong shape on a pitcher with a small role or a middling overall line, so little has been said about it. Highest Shape Score first.',
    test: r => (r.score ?? 0) >= STRONG_SCORE && r.verdict !== 'ahead' && r.overall != null && (r.overall.pitches < SMALL_ROLE_PITCHES || (r.overall.runsPct != null && r.overall.runsPct <= MIDDLING_PCT)),
    sort: (a, b) => (b.score ?? 0) - (a.score ?? 0) },
  { id: 'unexplained', label: 'Results the shape does not explain', blurb: 'Good overall results on a weak shape: the shape has not produced this for league pitchers. Biggest gap first, with small samples counted for less.',
    test: r => r.score != null && r.score <= WEAK_SCORE && r.verdict === 'ahead' && r.overall != null && r.overall.runsPct != null && r.overall.runsPct >= MIDDLING_PCT, sort: (a, b) => weighted(b) - weighted(a) },
]

/** Number filters on his season line and Shape Score. A pitcher without the stat is left out whenever its filter is on. */
export type NumberFilters = {
  /** ERA at least this */ minEra?: number | null
  /** ERA at most this */ maxEra?: number | null
  /** xERA at most this */ maxXera?: number | null
  /** xERA at least this */ minXera?: number | null
  /** ERA minus xERA at least this: an ERA running well above what the contact quality he allowed would give */ minEraGap?: number | null
  /** Shape Score at least this */ minScore?: number | null
}
export const passesNumbers = (r: FinderRow, f: NumberFilters): boolean => {
  const era = r.stats?.era ?? null, xera = r.stats?.xera ?? null
  if (f.minEra != null && (era == null || era < f.minEra)) return false
  if (f.maxEra != null && (era == null || era > f.maxEra)) return false
  if (f.maxXera != null && (xera == null || xera > f.maxXera)) return false
  if (f.minXera != null && (xera == null || xera < f.minXera)) return false
  if (f.minEraGap != null && (era == null || xera == null || era - xera < f.minEraGap)) return false
  if (f.minScore != null && (r.score == null || r.score < f.minScore)) return false
  return true
}

/** A small seeded generator, so a shuffle is repeatable for one seed and different for the next. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs], rnd = seeded(seed)
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

export type FindOptions = NumberFilters & { limit?: number; /** keep All-Stars, award winners and full-time veterans (default: hide them) */ includeKnown?: boolean; /** keep pitchers whose own sample is under the usual minimum (default: keep them) */ includeSmall?: boolean; /** a number: show a random sample of the matches for that seed instead of the best first */ seed?: number | null }

export function findPitchers<T extends FinderRow>(rows: T[], id: LensId, opts: FindOptions | number = {}): T[] {
  const o: FindOptions = typeof opts === 'number' ? { limit: opts } : opts
  const lens = LENSES.find(l => l.id === id) ?? LENSES[0]
  const pool = rows.filter(r => lens.test(r) && (o.includeKnown || !isEstablished(r)) && (o.includeSmall !== false || !r.small) && passesNumbers(r, o))
  return (o.seed != null ? shuffled(pool, o.seed) : pool.sort(lens.sort)).slice(0, o.limit ?? 6)
}
