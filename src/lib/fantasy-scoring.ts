/**
 * src/lib/fantasy-scoring.ts
 *
 * Standard H2H / DFS point formulas applied to REAL counting stats.
 * These are the published default scoring settings for each platform —
 * not custom league scoring (that's a Pro follow-up). ESPN quality-start
 * points are omitted: the MLB Stats API season pitching split has no
 * qualityStarts field, and we don't invent one from IP/ER.
 */

export type ScoringPlatform = 'ESPN' | 'Yahoo' | 'Sleeper' | 'CBS' | 'DraftKings'

export type HittingCounting = {
  singles: number
  doubles: number
  triples: number
  hr: number
  r: number
  rbi: number
  bb: number
  k: number
  sb: number
  hbp: number
  cs: number
}

export type PitchingCounting = {
  ip: number
  k: number
  er: number
  bb: number
  h: number
  w: number
  sv: number
  hld: number
}

export type ScoreBreakdown = {
  label: string
  value: number
  contribution: number
}

export type PointsScore = {
  platform: ScoringPlatform
  points: number
  breakdown: ScoreBreakdown[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Baseball IP string "85.2" = 85 innings + 2 outs, not 85.2 decimal. */
export function parseInningsPitched(raw: unknown): number {
  if (raw == null || raw === '') return NaN
  const s = String(raw).trim()
  if (s === '') return NaN
  const [wholeStr, fracStr] = s.split('.')
  const whole = Number(wholeStr)
  if (!Number.isFinite(whole)) return NaN
  if (fracStr == null || fracStr === '') return whole
  if (fracStr === '0') return whole
  if (fracStr === '1') return whole + 1 / 3
  if (fracStr === '2') return whole + 2 / 3
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export function numOrNaN(raw: unknown): number {
  if (raw == null || raw === '') return NaN
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : NaN
}

export function singlesFromHits(
  hits: number,
  doubles: number,
  triples: number,
  hr: number,
): number {
  const s = hits - doubles - triples - hr
  return s > 0 ? s : 0
}

const HITTING: Record<ScoringPlatform, Record<keyof HittingCounting, number>> = {
  ESPN:       { singles: 1, doubles: 2, triples: 3, hr: 4, r: 1, rbi: 1, bb: 1, k: -1, sb: 1,  hbp: 1, cs: 0 },
  Yahoo:      { singles: 1, doubles: 2, triples: 3, hr: 4, r: 1, rbi: 1, bb: 1, k: -1, sb: 2,  hbp: 1, cs: -1 },
  Sleeper:    { singles: 1, doubles: 2, triples: 3, hr: 4, r: 1, rbi: 1, bb: 1, k: -1, sb: 2,  hbp: 1, cs: -1 },
  CBS:        { singles: 1, doubles: 2, triples: 3, hr: 4, r: 1, rbi: 1, bb: 1, k: -0.5, sb: 2, hbp: 1, cs: -1 },
  DraftKings: { singles: 3, doubles: 5, triples: 8, hr: 10, r: 2, rbi: 2, bb: 2, k: 0, sb: 5, hbp: 2, cs: 0 },
}

const PITCHING: Record<ScoringPlatform, Partial<Record<keyof PitchingCounting, number>>> = {
  ESPN:       { ip: 3,    k: 1, er: -1, bb: -1, h: -1,   w: 5, sv: 5, hld: 2 },
  Yahoo:      { ip: 2.25, k: 1, er: -2, bb: -0.6, h: -0.6, w: 4, sv: 5, hld: 0 },
  Sleeper:    { ip: 2.25, k: 1, er: -2, bb: -1, h: -1,   w: 5, sv: 5, hld: 2 },
  CBS:        { ip: 3,    k: 0.5, er: -1, bb: -1, h: -0.5, w: 7, sv: 5, hld: 0 },
  DraftKings: { ip: 2.25, k: 2, er: -2, bb: -0.6, h: -0.6, w: 4, sv: 0, hld: 0 },
}

const HIT_LABELS: { key: keyof HittingCounting; label: string }[] = [
  { key: 'singles', label: '1B' },
  { key: 'doubles', label: '2B' },
  { key: 'triples', label: '3B' },
  { key: 'hr', label: 'HR' },
  { key: 'r', label: 'R' },
  { key: 'rbi', label: 'RBI' },
  { key: 'bb', label: 'BB' },
  { key: 'k', label: 'K' },
  { key: 'sb', label: 'SB' },
  { key: 'hbp', label: 'HBP' },
  { key: 'cs', label: 'CS' },
]

const PITCH_LABELS: { key: keyof PitchingCounting; label: string }[] = [
  { key: 'ip', label: 'IP' },
  { key: 'k', label: 'K' },
  { key: 'w', label: 'W' },
  { key: 'er', label: 'ER' },
  { key: 'h', label: 'H' },
  { key: 'bb', label: 'BB' },
  { key: 'sv', label: 'SV' },
  { key: 'hld', label: 'HLD' },
]

export function scoreHitting(platform: ScoringPlatform, line: HittingCounting): PointsScore {
  const weights = HITTING[platform]
  const breakdown: ScoreBreakdown[] = []
  for (const { key, label } of HIT_LABELS) {
    const w = weights[key]
    if (!w) continue
    const value = line[key]
    if (!Number.isFinite(value) || value === 0) continue
    breakdown.push({ label, value: round1(value), contribution: round1(value * w) })
  }
  return {
    platform,
    points: round1(breakdown.reduce((s, b) => s + b.contribution, 0)),
    breakdown,
  }
}

export function scorePitching(platform: ScoringPlatform, line: PitchingCounting): PointsScore {
  const weights = PITCHING[platform]
  const breakdown: ScoreBreakdown[] = []
  for (const { key, label } of PITCH_LABELS) {
    const w = weights[key]
    if (w == null || w === 0) continue
    const value = line[key]
    if (!Number.isFinite(value) || value === 0) continue
    breakdown.push({ label, value: round1(value), contribution: round1(value * w) })
  }
  return {
    platform,
    points: round1(breakdown.reduce((s, b) => s + b.contribution, 0)),
    breakdown,
  }
}

export function scaleHitting(line: HittingCounting, factor: number): HittingCounting {
  return {
    singles: line.singles * factor,
    doubles: line.doubles * factor,
    triples: line.triples * factor,
    hr: line.hr * factor,
    r: line.r * factor,
    rbi: line.rbi * factor,
    bb: line.bb * factor,
    k: line.k * factor,
    sb: line.sb * factor,
    hbp: line.hbp * factor,
    cs: line.cs * factor,
  }
}

export function scalePitching(line: PitchingCounting, factor: number): PitchingCounting {
  return {
    ip: line.ip * factor,
    k: line.k * factor,
    er: line.er * factor,
    bb: line.bb * factor,
    h: line.h * factor,
    w: line.w * factor,
    sv: line.sv * factor,
    hld: line.hld * factor,
  }
}
