// src/lib/admin-dashboard.ts
//
// ADMIN DASHBOARD DATA LAYER
//
// Powers /admin/dashboard. Three jobs:
//   1. getDailyPerformance(date)  — yesterday's graded scoreboard (internal, honest)
//   2. getTodaysReads(date)       — today's slate ranked by lean strength
//   3. buildSnips(...)            — copy-ready X drafts, public-safe voice
//
// Everything reuses the SAME edge_predictions columns that track-record.ts
// already reads, plus the LLM-written story_lead/summary as snip source text
// (already banned-word filtered upstream in narrative.ts).
//
// Sign convention (matches edge.ts / matchup-tilt.ts):
//   positive edge_score / component value = HOME edge, negative = AWAY edge.
//
// REVISION NOTE (2026-06-24): initial build.

import { createAdminClient } from '@/lib/supabase'
import { getFactorBracketStats } from '@/lib/track-record'

const supa = createAdminClient()

// 8-factor keys + labels — mirror track-record.ts so labels stay in sync.
const COMPONENT_KEYS = [
  'starting_pitcher', 'bullpen', 'offense', 'matchup',
  'park', 'weather', 'defense', 'rest',
] as const

const COMPONENT_LABELS: Record<string, string> = {
  starting_pitcher: 'starting pitching',
  bullpen: 'the bullpen edge',
  offense: 'the offence',
  matchup: 'the pitch matchup',
  park: 'the park factor',
  weather: 'tonight\u2019s weather',
  defense: 'the defence',
  rest: 'rest \u0026 travel',
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type DailyPerformance = {
  date: string
  wins: number
  losses: number
  graded: number
  tossups: number
  alignment_percent: number | null
  strong_hit: number
  strong_total: number
  avg_factors_on_wins: number | null   // avg factor-count (out of 8) on winning reads — no score number
  best: { matchup: string; factor_count: number; detail: string } | null
  worst: { matchup: string; factor_count: number; detail: string } | null
}

export type TodaysRead = {
  game_pk: number
  matchup: string
  lean_team: string
  other_team: string
  abs_edge: number
  raw_edge: number
  dominant_factor: string
  factor_count: number   // how many of the 8 factors lean toward lean_team — public-safe, no score number
  lineups_confirmed: boolean
  confidence_tier: string
  story_lead: string | null
  summary: string | null
  near_split: boolean
}

export type Snip = { id: string; title: string; why: string; body: string; footnote: string }
export type SnipBundle = {
  eotd: Snip | null
  sotd: Snip | null
  track: Snip
  ammo: string[]
}

// ─── Date helper (US Eastern — matches the slate's frame) ─────────────────────

export function etDate(offsetDays = 0): string {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setDate(et.getDate() + offsetDays)
  const y = et.getFullYear()
  const m = String(et.getMonth() + 1).padStart(2, '0')
  const d = String(et.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dominantFactor(components: Record<string, any> | null): string {
  if (!components) return 'the overall read'
  let bestKey: typeof COMPONENT_KEYS[number] = COMPONENT_KEYS[0]
  let bestAbs = -1
  for (const key of COMPONENT_KEYS) {
    const abs = Math.abs(Number(components[key] ?? 0))
    if (abs > bestAbs) { bestAbs = abs; bestKey = key }
  }
  return COMPONENT_LABELS[bestKey] ?? 'the overall read'
}

function leanCount(components: Record<string, any> | null): number {
  if (!components) return 0
  let home = 0, away = 0
  for (const key of COMPONENT_KEYS) {
    const v = Number(components[key] ?? 0)
    if (v > 5) home++
    else if (v < -5) away++
  }
  return Math.max(home, away)
}

function scoreLine(homeScore: number | null, awayScore: number | null): string {
  if (homeScore == null || awayScore == null) return ''
  const hi = Math.max(homeScore, awayScore)
  const lo = Math.min(homeScore, awayScore)
  return `final ${hi}\u2013${lo}`
}

// ─── 1. Daily performance (internal scoreboard) ───────────────────────────────

export async function getDailyPerformance(date = etDate(-1)): Promise<DailyPerformance> {
  const empty: DailyPerformance = {
    date, wins: 0, losses: 0, graded: 0, tossups: 0, alignment_percent: null,
    strong_hit: 0, strong_total: 0, avg_factors_on_wins: null, best: null, worst: null,
  }

  const { data, error } = await supa
    .from('edge_predictions')
    .select('home_team, away_team, predicted_winner, confidence_tier, components, was_correct, actual_winner, home_score, away_score')
    .eq('game_date', date)
    .not('graded_at', 'is', null)

  if (error || !data) return empty

  const graded = data.filter(d => d.was_correct !== null)
  const wins = graded.filter(d => d.was_correct === true)
  const losses = graded.filter(d => d.was_correct === false)
  const tossups = data.filter(d => d.confidence_tier === 'tossup').length
  const strong = graded.filter(d => d.confidence_tier === 'strong')

  const winFactors = wins.map(d => leanCount(d.components))
  const avgFactorsOnWins = winFactors.length
    ? winFactors.reduce((a, b) => a + b, 0) / winFactors.length
    : null

  const label = (d: any) => `${d.away_team ?? 'AWY'} @ ${d.home_team ?? 'HOM'}`

  const best = [...wins].sort(
    (a, b) => leanCount(b.components) - leanCount(a.components),
  )[0]
  const worst = [...losses].sort(
    (a, b) => leanCount(b.components) - leanCount(a.components),
  )[0]

  return {
    date,
    wins: wins.length,
    losses: losses.length,
    graded: graded.length,
    tossups,
    alignment_percent: graded.length ? (wins.length / graded.length) * 100 : null,
    strong_hit: strong.filter(d => d.was_correct === true).length,
    strong_total: strong.length,
    avg_factors_on_wins: avgFactorsOnWins,
    best: best ? {
      matchup: label(best),
      factor_count: leanCount(best.components),
      detail: scoreLine(best.home_score, best.away_score),
    } : null,
    worst: worst ? {
      matchup: label(worst),
      factor_count: leanCount(worst.components),
      detail: scoreLine(worst.home_score, worst.away_score),
    } : null,
  }
}

// ─── 2. Today's reads (ranked by lean strength) ────────────────────────────────

export async function getTodaysReads(date = etDate(0)): Promise<TodaysRead[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('game_pk, home_team, away_team, edge_score, predicted_winner, confidence_tier, components, lineups_confirmed, story_lead, summary')
    .eq('game_date', date)

  if (error || !data) return []

  return data
    .map(d => {
      const raw = Number(d.edge_score ?? 0)
      const isHome = d.predicted_winner === 'home'
      const factors = leanCount(d.components)
      return {
        game_pk: d.game_pk,
        matchup: `${d.away_team ?? 'AWY'} @ ${d.home_team ?? 'HOM'}`,
        lean_team: isHome ? (d.home_team ?? 'HOM') : (d.away_team ?? 'AWY'),
        other_team: isHome ? (d.away_team ?? 'AWY') : (d.home_team ?? 'HOM'),
        abs_edge: Math.abs(raw),
        raw_edge: raw,
        dominant_factor: dominantFactor(d.components),
        factor_count: factors,
        lineups_confirmed: !!d.lineups_confirmed,
        confidence_tier: d.confidence_tier ?? 'tossup',
        story_lead: d.story_lead ?? null,
        summary: d.summary ?? null,
        near_split: factors <= 4,
      } as TodaysRead
    })
    .sort((a, b) => b.factor_count - a.factor_count)
}

// ─── 3. Snip builders (public-safe X drafts) ───────────────────────────────────

export async function buildSnips(
  reads: TodaysRead[],
  perf: DailyPerformance,
): Promise<SnipBundle> {
  const top = reads.find(r => !r.near_split) ?? reads[0] ?? null

  // Edge of the Day — anchor post, link stays out of the body.
  // No raw Edge Score number anywhere — we show "N of 8 factors lean"
  // instead, which is observable and explainable, never a model output.
  const eotd: Snip | null = top ? {
    id: 'eotd',
    title: '\u2295 Edge of the Day',
    why: 'anchor post \u00b7 08:00 UK window',
    body:
`\u2295 THE EDGE OF THE DAY

${top.factor_count} of 8 factors lean toward ${top.lean_team} tonight against ${top.other_team}.

${top.story_lead?.trim() || top.summary?.trim() || `The biggest tilt is ${top.dominant_factor}.`}

Not a tip \u2014 just where the eight factors point.`,
    footnote: 'No score, no link in the post. Drop edgereportdaily.com in your FIRST REPLY \u2014 in-post links cut reach 50\u201390%.',
  } : null

  // Stat of the Day — a real underlying data factor (xFIP, CSW%, bullpen IP,
  // wRC+, etc.), never the Edge Score itself. The score is our internal
  // model output, not a stat we post publicly.
  const sotd: Snip | null = top ? {
    id: 'sotd',
    title: '\u2295 Stat of the Day',
    why: 'single number \u00b7 high dwell + bookmarks',
    body:
`[verify: the one underlying number, e.g. CSW%, xFIP, bullpen innings]

That's the data point behind today's strongest lean \u2014 ${top.factor_count} of 8 factors favour ${top.lean_team} over ${top.other_team}. Mostly ${top.dominant_factor}.

[verify: one line of plain-English context]`,
    footnote: 'Bracket = fill from real data. Lead with a factor stat (xFIP, CSW%, wRC+...) \u2014 never the Edge Score itself.',
  } : null

  // Track Record — real factor-bracket stat, neutral framing.
  const brackets = await getFactorBracketStats().catch(() => [])
  const strongest = brackets.find(b => b.alignment_percent != null && b.games >= 20)
  const track: Snip = strongest ? {
    id: 'track',
    title: '\u00a7 Track Record',
    why: 'weekly \u00b7 transparency builds trust',
    body:
`\u00a7 THE RECEIPTS

When ${strongest.min_factors}\u2013${strongest.max_factors} of our 8 factors lean one way, the outcome has followed ${Math.round(strongest.alignment_percent as number)}% of the time (n=${strongest.games}).

We log every read \u2014 the hits and the misses.`,
    footnote: 'Neutral "alignment" framing \u2014 never "we called it." Link to /track-record goes in the FIRST REPLY.',
  } : {
    id: 'track',
    title: '\u00a7 Track Record',
    why: 'weekly \u00b7 transparency builds trust',
    body:
`\u00a7 THE RECEIPTS

Yesterday, [verify]/${perf.graded} reads aligned with the outcome.

We log every read \u2014 the hits and the misses.`,
    footnote: 'Sample still building \u2014 fill from /track-record. Link goes in the FIRST REPLY.',
  }

  // Reply ammo — the sharp LLM hooks from the top reads, one per line.
  const ammo = reads
    .filter(r => r.story_lead && r.story_lead.trim().length > 0)
    .slice(0, 4)
    .map(r => r.story_lead!.trim())

  return { eotd, sotd, track, ammo }
}