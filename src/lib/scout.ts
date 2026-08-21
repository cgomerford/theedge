// src/lib/scout.ts
//
// THE SCOUT REPORT — pure selector, v7 (per-team balancing).
//
// v7 change: per-team targets. Each team gets 3 pitching, 5 batting (was 6 combined),
// 3 bullpen edges. If a section is short of target, we pad from the pool of
// candidates the builder considered but rejected — we never fabricate.
//
// Arsenal numbers (usage, whiff, put-away, xwOBA, velo, hard-hit) must be
// hydrated from Baseball Savant via src/lib/savant.ts before calling
// buildScoutReport:
//
//   const { homePitcher, awayPitcher } = await hydrateMatchupPitchersFromSavant(
//     inputs.homePitcher, inputs.awayPitcher, 2026
//   )
//   const report = buildScoutReport({ ...inputs, homePitcher, awayPitcher })

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

export type ScoutSection = 'pitching' | 'batting' | 'offense' | 'bullpen' | 'moves' | 'situation'
export type ScoutLean = 'home' | 'away' | 'neutral'

export type ScoutExpandKind =
  | 'arsenal-radar'
  | 'pitch-detail'       // renders as clean spider now; modal for deep dive
  | 'count-state-bars'
  | 'arsenal-mini'
  | 'first-pitch-mini'
  | 'tto-bars'
  | 'workload-bars'
  | 'transaction-card'
  | 'weather-vector'
  | 'park-factor'
  | 'lineup-arsenal'
  | null

export type ScoutExpand = {
  kind: ScoutExpandKind
  data: unknown
}

export type ScoutRow = {
  id: string
  section: ScoutSection
  subsection?: string
  line: string
  highlight?: string
  lean: ScoutLean
  leanLabel: string
  sampleTag: string
  weight: number
  subsectionPlayerId?: number | null
  expand?: ScoutExpand
}

export type ScoutReport = {
  rows: ScoutRow[]
  targetCount: number
  actualCount: number
  bySection: Record<ScoutSection, ScoutRow[]>
  degradedNote: string | null
  previewStrip: { pitching?: ScoutRow; batting?: ScoutRow; bullpen?: ScoutRow }
  keyEdges: ScoutRow[]
}

// ─── Arsenal pitch ────────────────────────────────────────────────────────────

export type ArsenalPitch = {
  pitch_type: string
  pitch_name: string
  percentage: number | null
  count: number | null   // raw season pitch count for this pitch type — real sample-size gate, not a % proxy
  avg_velocity: number | null
  whiff_percent: number | null
  put_away_percent: number | null
  est_woba: number | null
  hard_hit_percent: number | null
  ba_against: number | null
}

// ─── Arsenal radar payload ────────────────────────────────────────────────────
export type ArsenalRadarPayload = {
  pitcherName: string
  pitches: {
    name: string
    code: string
    whiffScore: number
    contactScore: number
    velocityScore: number
    putawayScore: number
    xwobaScore: number
    whiff_pct: number | null
    ba_against: number | null
    avg_velocity: number | null
    put_away_pct: number | null
    est_woba: number | null
    usage_pct: number | null
  }[]
}

// ─── Single-pitch detail (spider + modal) ────────────────────────────────────
export type PitchDetailPayload = {
  pitcherName: string
  pitch: {
    name: string
    code: string
    whiffScore: number
    putawayScore: number
    xwobaScore: number
    contactScore: number
    velocityScore: number
    whiff_pct: number | null
    put_away_pct: number | null
    est_woba: number | null
    ba_against: number | null
    avg_velocity: number | null
    usage_pct: number | null
    hard_hit_pct: number | null
  }
}

// ─── Hot streak player ────────────────────────────────────────────────────────

export type HotStreakPlayer = {
  player_id: number
  player_name: string
  team_abbr: string
  player_type: 'batter' | 'pitcher'
  signal: 'heating' | 'cooling'
  signal_quality?: 'validated' | 'trending'
  metric?: 'ops' | 'avg' | 'slg' | 'era'
  current_value: number
  extreme_value: number
  magnitude: number
  recentGameLog?: number[]
  avg?: number
  rbi?: number
  runs?: number
  walks?: number
  games?: number
}
// ─── Pitcher ──────────────────────────────────────────────────────────────────

export type PitcherForScout = {
  player_id: number | null
  player_name: string
  throws: 'L' | 'R' | null
  era: number | null
  fip: number | null
  l3_era: number | null
  whip: number | null
  k_per_9: number | null
  bb_per_9: number | null
  first_pitch_strike_pct: number | null
  first_pitch_mix: Record<string, { name: string; pct: number }> | null
  two_strike_mix: Record<string, { name: string; all_pct: number; two_strike_pct: number; delta: number }> | null
  tto1_woba: number | null
  tto2_woba: number | null
  tto3_woba: number | null
  tto1_pa: number | null
  tto2_pa: number | null
  tto3_pa: number | null
  arsenal: ArsenalPitch[]
  season_pitches_thrown?: number | null
  formSignal?: 'heating' | 'cooling' | null
  formCurrentEra?: number | null
  formExtremeEra?: number | null
}

// ─── Team stats ───────────────────────────────────────────────────────────────

export type TeamStatsForScout = {
  team_abbr: string
  team_name: string
  runs_per_game_l30: number | null
  ops_l30: number | null
  iso: number | null
  k_pct: number | null
  bb_pct: number | null
  xwoba: number | null
  hard_hit_pct: number | null
  chase_pct_vs_rhp?: number | null
  chase_pct_vs_lhp?: number | null
  chase_pct_rank_mlb?: number | null
  first_pitch_swing_pct?: number | null
  first_pitch_swing_rank_mlb?: number | null
  two_strike_k_pct?: number | null
  two_strike_whiff_vs_breaking?: number | null
  hotStreaks?: HotStreakPlayer[]
}

// ─── Bullpen ──────────────────────────────────────────────────────────────────

export type BullpenForScout = {
  team_abbr: string
  team_name: string
  innings_yesterday: number | null
  ip_last_3: number | null
  closer_available: boolean | null
  setup1_available: boolean | null
  setup2_available: boolean | null
  bullpen_era: number | null
  depth_arm_l3_era?: number | null
  depth_arm_name?: string | null
}

// ─── Other inputs ─────────────────────────────────────────────────────────────

export type TransactionForScout = {
  player_name: string
  category: string
  type_code: string
  description: string
  transaction_date: string
  il_days?: number | null
  injury_reason?: string | null
  affects_tonight: boolean
}

export type SeriesForScout = {
  seriesGameNumber: number | null
  seriesTotalGames: number | null
  standing?: string | null
  homeDayAfterNight?: boolean | null
  awayDayAfterNight?: boolean | null
}

export type WeatherForScout = {
  temp_f: number | null
  wind_mph: number | null
  wind_direction: number | null
  wind_direction_text: string | null
  precipitation_chance: number | null
  conditions: string | null
}

export type ParkForScout = {
  venue_name: string
  hr_factor?: number | null
  doubles_factor?: number | null
  runs_factor?: number | null
} | null

// ─── Lineup vs. pitch-type splits (Zone Clash) ─────────────────────────────────
//
// Sourced from batter_pitch_type_splits (scripts/fetch_batter_pitch_splits.py,
// which pulls Baseball Savant's Pitch Arsenal Stats leaderboard, batter mode)
// joined against game_lineups (src/app/api/cron/lineup-refresh/route.ts).
// Both fields verified via curl 2026-08-12 — see script header comments.

export type BatterPitchSplitForScout = {
  pitch_type: string
  pitch_name: string | null
  pa: number | null
  ba: number | null
  whiff_percent: number | null
  est_woba: number | null
  hard_hit_percent: number | null
}

export type LineupBatterForScout = {
  player_id: number
  player_name: string
  batting_order: number // 1-9, from game_lineups (array index + 1 at write time)
  splits: BatterPitchSplitForScout[]
}

export type LineupArsenalPayload = {
  pitcherName: string
  pitchType: string
  pitchName: string
  pitchUsage: number | null
  lineupBlendedBa: number | null
  lineupBlendedWhiff: number | null
  lineupBlendedWoba: number | null
  totalPa: number
  batters: {
    name: string
    battingOrder: number
    pa: number
    ba: number | null
    whiff_percent: number | null
    est_woba: number | null
  }[]
}

export type ScoutInputs = {
  homeAbbr: string
  awayAbbr: string
  homeTeamName: string
  awayTeamName: string
  homePitcher: PitcherForScout | null
  awayPitcher: PitcherForScout | null
  homeTeamStats: TeamStatsForScout | null
  awayTeamStats: TeamStatsForScout | null
  homeBullpen: BullpenForScout | null
  awayBullpen: BullpenForScout | null
  transactions: TransactionForScout[]
  weather: WeatherForScout | null
  park: ParkForScout
  series: SeriesForScout | null
  // Zone Clash — optional so callers that haven't wired lineup/split fetching
  // yet degrade gracefully (buildLineupArsenalRows returns [] on null/empty,
  // same empty-state-beats-fabrication rule as everything else in this file).
  // homeLineup = home team's batters (faces awayPitcher).
  // awayLineup = away team's batters (faces homePitcher).
homeLineup?: LineupBatterForScout[] | null
  awayLineup?: LineupBatterForScout[] | null
}

// ─── Per-team targets ────────────────────────────────────────────────────────
const PER_TEAM_TARGETS = {
  pitching: 3,
  batting: 5,
  bullpen: 3,
} as const

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────
export function normPct(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null
  const pct = v > 1.5 ? v : v * 100
  // A valid percentage can never exceed 100 — if converting produces more
  // than that, the raw value's scale (fraction vs. already-a-percent) was
  // ambiguous or the source row is bad data (e.g. a corrupted row in
  // pitch_arsenals). Treat it as unusable rather than display an
  // impossible number like "106%" — and since every "usable"/selection
  // filter in this file also runs through normPct, a bad row now drops
  // out of consideration entirely instead of getting picked as the
  // pitcher's "primary weapon."
  if (pct > 100.5) return null
  return pct
}

function fmtAvg(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  const s = v.toFixed(3)
  return s.startsWith('0.') ? s.slice(1) : s
}

function formatMlbIP(ip: number): string {
  const whole = Math.floor(ip)
  const outs = Math.round((ip - whole) * 3)
  if (outs === 3) return `${whole + 1} IP`
  if (outs === 0) return `${whole} IP`
  return `${whole}.${outs} IP`
}

function ord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function pitchesTag(pitcher: PitcherForScout): string {
  if (pitcher.season_pitches_thrown != null && pitcher.season_pitches_thrown > 0) {
    return `n=${pitcher.season_pitches_thrown.toLocaleString()} · Baseball Savant`
  }
  return 'Baseball Savant · season'
}

function ownLean(ownAbbr: string, homeAbbr: string): ScoutLean {
  return ownAbbr === homeAbbr ? 'home' : 'away'
}

// ─── Arsenal dedup guard ───────────────────────────────────────────────
// FIX (Aug 2026): the scout report was occasionally showing impossible
// usage numbers like "106%". Root cause: normPct() below assumes any value
// <=1.5 is a fraction (multiplies by 100) and anything above is already a
// percent. That heuristic can't tell the difference between a genuinely
// corrupted value and a legitimate one — so if `pitcher.arsenal` ever
// contains two rows for the same pitch_type (a duplicate row from the
// pitch_arsenals query, a bad join, whatever the upstream cause), and
// something combines their percentages into a fraction between 1.0 and
// 1.5 (e.g. two ~0.53 rows becoming 1.06), normPct confidently multiplies
// it into "106%" — a wrong number presented with total confidence.
//
// This dedupes pitcher.arsenal by pitch_type BEFORE any of the row
// builders touch it, keeping whichever duplicate has the higher raw
// `count` (the more complete/reliable sample) and discarding the other.
// This protects the report regardless of where the actual duplication
// originates (I don't have visibility into the pitch_arsenals ingestion
// pipeline to confirm the exact source) — if you want to find the root
// cause rather than just guard against it, check whether that pitcher's
// changeup appears as one row or two directly in the pitch_arsenals table.
function dedupeArsenal(arsenal: ArsenalPitch[]): ArsenalPitch[] {
  const byType = new Map<string, ArsenalPitch>()
  for (const p of arsenal) {
    const existing = byType.get(p.pitch_type)
    if (!existing || (p.count ?? 0) > (existing.count ?? 0)) {
      byType.set(p.pitch_type, p)
    }
  }
  return [...byType.values()]
}

// Usage% is a proxy for sample size, not the real thing — season_pitches_thrown
// is currently always null coming out of page.tsx, so this is the only guard
// available. 8% of a thin-usage reliever's season can be a handful of pitches;
// 15% is still imperfect but meaningfully reduces small-sample put-away claims
// until a raw pitch-count column is wired through.
// Real sample-size gate now that `count` (raw season pitches of this type)
// is wired through — 25 is a reasonable floor for a put-away% claim to mean
// anything; below that a couple of lucky/unlucky at-bats swing the number wildly.
const MIN_PUTAWAY_PITCH_COUNT = 25

function pickPutawayPitch(arsenal: ArsenalPitch[]): ArsenalPitch | null {
  if (!arsenal || arsenal.length === 0) return null
  const eligible = arsenal.filter(p => p.put_away_percent != null && (p.count ?? 0) >= MIN_PUTAWAY_PITCH_COUNT)
  if (eligible.length === 0) return null
  return eligible.sort((a, b) => (b.put_away_percent ?? 0) - (a.put_away_percent ?? 0))[0]
}
function scoreMetric(v: number | null, lo: number, hi: number, invert = false): number {
  if (v == null) return 50
  const pct = Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  return Math.round((invert ? 1 - pct : pct) * 100)
}

function scorePitch(p: ArsenalPitch) {
  const whiff = normPct(p.whiff_percent)
  const putaway = normPct(p.put_away_percent)
  const pct = normPct(p.percentage)
  const hard = normPct(p.hard_hit_percent)
  return {
    name: p.pitch_name,
    code: p.pitch_type,
    whiffScore:    scoreMetric(whiff, 5, 55),
    putawayScore:  scoreMetric(putaway, 10, 55),
    xwobaScore:    scoreMetric(p.est_woba, 0.150, 0.400, true),
    contactScore:  scoreMetric(p.ba_against, 0.150, 0.350, true),
    velocityScore: scoreMetric(p.avg_velocity, 72, 100),
    whiff_pct:     whiff,
    put_away_pct:  putaway,
    est_woba:      p.est_woba,
    ba_against:    p.ba_against,
    avg_velocity:  p.avg_velocity,
    usage_pct:     pct,
    hard_hit_pct:  hard,
  }
}

function buildPitchDetail(pitcher: PitcherForScout, pitch: ArsenalPitch): PitchDetailPayload {
  return {
    pitcherName: pitcher.player_name,
    pitch: scorePitch(pitch),
  }
}

function buildArsenalRadar(pitcher: PitcherForScout): ArsenalRadarPayload | null {
  const top = pitcher.arsenal
    .filter(p => (normPct(p.percentage) ?? 0) >= 6)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
    .slice(0, 5)
  if (top.length < 2) return null

  return {
    pitcherName: pitcher.player_name,
    pitches: top.map(p => {
      const s = scorePitch(p)
      return {
        name: s.name,
        code: s.code,
        whiffScore: s.whiffScore,
        contactScore: s.contactScore,
        velocityScore: s.velocityScore,
        putawayScore: s.putawayScore,
        xwobaScore: s.xwobaScore,
        whiff_pct: s.whiff_pct,
        ba_against: s.ba_against,
        avg_velocity: s.avg_velocity,
        put_away_pct: s.put_away_pct,
        est_woba: s.est_woba,
        usage_pct: s.usage_pct,
      }
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 1 · PITCHING  (deep arsenal + matchup + form)
// ─────────────────────────────────────────────────────────────────────
//
// v7: builders now emit ALL candidate rows (no per-pitcher slice cap).
// Downstream selectPerTeamSection() picks the top N (default 3) and
// records the rest as pad candidates so we can fill short sections.

function buildPitcherRows(
  pitcher: PitcherForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
  oppTeam: TeamStatsForScout | null,
): ScoutRow[] {
  if (!pitcher) return []
  // Dedupe the arsenal before anything downstream touches it — see the
  // dedupeArsenal() doc comment above for why. Everything below in this
  // function reads from this deduped copy, not the raw prop.
  pitcher = { ...pitcher, arsenal: dedupeArsenal(pitcher.arsenal) }

  const rows: ScoutRow[] = []
  const sub = `${pitcher.player_name} · ${ownAbbr} · ${pitcher.throws ?? 'R'}HP`
  const pid = pitcher.player_id
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg: ScoutLean = leanPos === 'home' ? 'away' : 'home'

  // ── 1. Arsenal radar + primary weapon ─────────────────────────────────
  const radarPayload = buildArsenalRadar(pitcher)
  if (radarPayload) {
    const usable = [...pitcher.arsenal].filter(p => (normPct(p.percentage) ?? 0) >= 6)
    const primary =
      usable
        .filter(p => (normPct(p.percentage) ?? 0) >= 12)
        .sort((a, b) => (normPct(b.percentage) ?? 0) - (normPct(a.percentage) ?? 0))[0]
      ?? usable.sort((a, b) => (normPct(b.percentage) ?? 0) - (normPct(a.percentage) ?? 0))[0]

    const bestName = primary?.pitch_name?.toLowerCase() ?? 'primary pitch'
    const whiff = normPct(primary?.whiff_percent)
    const xwoba = primary?.est_woba != null ? fmtAvg(primary.est_woba) : null
    const velo = primary?.avg_velocity != null ? `${primary.avg_velocity.toFixed(1)} mph` : null
    const usage = normPct(primary?.percentage)
    const nPitches = usable.length

    rows.push({
      id: `pitching-${pid}-arsenal-radar`,
      section: 'pitching',
      subsection: sub,
      subsectionPlayerId: pid,
      line: `Primary weapon: the ${bestName}${usage != null ? ` (${usage.toFixed(0)}%)` : ''}${whiff != null ? ` — ${whiff.toFixed(1)}% whiff` : ''}${xwoba ? `, ${xwoba} xwOBA` : ''}${velo ? `, ${velo}` : ''}. ${nPitches} pitches in the mix.`,
      highlight: bestName,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: `${nPitches} pitch types · ${pitchesTag(pitcher)}`,
      weight: 100,
      expand: { kind: 'arsenal-radar', data: radarPayload },
    })
  }

  // ── 2. Putaway / two-strike signature ────────────────────────────────
  const putaway = pickPutawayPitch(pitcher.arsenal)
  if (putaway && putaway.put_away_percent != null) {
    const puPct = normPct(putaway.put_away_percent) ?? putaway.put_away_percent
    const xwoba = putaway.est_woba != null ? fmtAvg(putaway.est_woba) : null
    const whiff = normPct(putaway.whiff_percent)
    const usage = normPct(putaway.percentage)
    const puLabel = Number.isInteger(puPct) ? `${puPct}` : puPct.toFixed(1)
    rows.push({
      id: `pitching-${pid}-putaway-${putaway.pitch_type}`,
      section: 'pitching',
      subsection: sub,
      subsectionPlayerId: pid,
      line: `Put-away: ${putaway.pitch_name.toLowerCase()} — ${puLabel}% put-away${usage != null ? ` (${usage.toFixed(1)}% usage)` : ''}${xwoba ? `, ${xwoba} xwOBA` : ''}${whiff != null ? `, ${whiff.toFixed(1)}% whiff` : ''}.`,
      highlight: `${puLabel}% put-away`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: xwoba ? `${xwoba} xwOBA · Baseball Savant` : pitchesTag(pitcher),
      weight: 96,
      expand: {
        kind: 'pitch-detail',
        data: buildPitchDetail(pitcher, putaway),
      },
    })
  }

  // ── 3. Per-pitch deep signals ─────────────────────────────────────────
 const pitchRows = pitcher.arsenal
    .filter(p => {
      const whiff = normPct(p.whiff_percent)
      const xwoba = p.est_woba
      return (p.count ?? 0) >= 25 && (whiff != null || xwoba != null)
    })
    .sort((a, b) => (normPct(b.whiff_percent) ?? 0) - (normPct(a.whiff_percent) ?? 0))

  for (const p of pitchRows) {
    if (putaway && p.pitch_type === putaway.pitch_type) continue

    const whiff = normPct(p.whiff_percent)
    const xwoba = p.est_woba != null ? fmtAvg(p.est_woba) : null
    const velo = p.avg_velocity != null ? `${p.avg_velocity.toFixed(1)} mph` : null
    const pct = normPct(p.percentage) ?? 0
    const hard = normPct(p.hard_hit_percent)
    const isEliteWhiff = whiff != null && whiff >= 34
    const isWeakContact = p.est_woba != null && p.est_woba <= 0.265
    const isHardHitSuppress = hard != null && hard <= 28

    let line: string
    let lean: ScoutLean = leanPos
    let leanLabel = `${ownAbbr} +`
    let weight = 62
    let highlight: string | undefined

    if (isEliteWhiff && isWeakContact) {
      line = `${p.pitch_name}: ${whiff!.toFixed(1)}% whiff, ${xwoba} xwOBA${velo ? `, ${velo}` : ''}${pct ? ` (${pct.toFixed(1)}% usage)` : ''}.`
      weight = 90
      highlight = `${whiff!.toFixed(1)}% whiff`
    } else if (isEliteWhiff) {
      line = `${p.pitch_name}: ${whiff!.toFixed(1)}% whiff${velo ? ` at ${velo}` : ''}${pct ? ` (${pct.toFixed(1)}% usage)` : ''}.`
      weight = 84
      highlight = `${whiff!.toFixed(1)}% whiff`
    } else if (isWeakContact) {
      line = `${p.pitch_name}: ${xwoba} xwOBA${hard != null ? `, ${hard.toFixed(1)}% hard-hit` : ''}${velo ? `, ${velo}` : ''}${pct ? ` (${pct.toFixed(1)}% usage)` : ''}.`
      weight = 78
      highlight = xwoba ?? undefined
    } else if (isHardHitSuppress && whiff != null) {
      line = `${p.pitch_name}: ${whiff.toFixed(1)}% whiff, ${hard!.toFixed(1)}% hard-hit${velo ? `, ${velo}` : ''} (${pct.toFixed(1)}% usage).`
      weight = 70
      highlight = `${hard!.toFixed(1)}% hard-hit`
    } else if (whiff != null) {
      line = `${p.pitch_name}: ${whiff.toFixed(1)}% whiff${velo ? `, ${velo}` : ''}${xwoba ? `, ${xwoba} xwOBA` : ''} (${pct.toFixed(1)}% usage).`
      lean = 'neutral'
      leanLabel = 'watch'
      weight = 55
      highlight = `${whiff.toFixed(1)}% whiff`
    } else {
      continue
    }

    rows.push({
      id: `pitching-${pid}-pitch-${p.pitch_type}`,
      section: 'pitching',
      subsection: sub,
      subsectionPlayerId: pid,
      line,
      highlight,
      lean,
      leanLabel,
      sampleTag: `${pct.toFixed(0)}% usage · Baseball Savant`,
      weight,
      expand: {
        kind: 'pitch-detail',
        data: buildPitchDetail(pitcher, p),
      },
    })
  }

  // ── 4. Two-strike mix shift ───────────────────────────────────────────
  if (pitcher.two_strike_mix) {
    const entries = Object.entries(pitcher.two_strike_mix)
    const signature = entries
      .filter(([, v]) => v.two_strike_pct >= 38 && v.delta >= 6)
      .sort((a, b) => b[1].two_strike_pct - a[1].two_strike_pct)[0]
    if (signature) {
      const [, v] = signature
      const pct = Math.round(v.two_strike_pct)
      rows.push({
        id: `pitching-${pid}-two-strike-${signature[0]}`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `Two-strike: ${v.name.toLowerCase()} ${pct}% of the time (up ${Math.round(v.delta)} pts from ${Math.round(v.all_pct)}% overall).`,
        highlight: `${v.name.toLowerCase()} ${pct}%`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: pitchesTag(pitcher),
        weight: 91,
        expand: {
          kind: 'count-state-bars',
          data: { mix: pitcher.two_strike_mix, focus: signature[0], pitcherName: pitcher.player_name },
        },
      })
    }
  }

  // ── 5. First-pitch strike rate + mix ──────────────────────────────────
  const fpsRaw = normPct(pitcher.first_pitch_strike_pct)
  if (fpsRaw != null) {
    const fps = Math.round(fpsRaw)
    let line: string
    let lean: ScoutLean = 'neutral'
    let leanLabel = 'watch'
    let weight = 48
    if (fps >= 66) {
      line = `First-pitch strike ${fps}% (league ~60%). Gets ahead early.`
      lean = leanPos; leanLabel = `${ownAbbr} +`; weight = 82
    } else if (fps <= 54) {
      line = `First-pitch strike ${fps}% — below league average (~60%). Hitters can take early.`
      lean = leanNeg; leanLabel = `${oppAbbr} +`; weight = 76
    } else {
      line = `First-pitch strike ${fps}% — near league average.`
    }
    rows.push({
      id: `pitching-${pid}-fps`,
      section: 'pitching',
      subsection: sub,
      subsectionPlayerId: pid,
      line,
      highlight: `${fps}%`,
      lean,
      leanLabel,
      sampleTag: fps >= 66 || fps <= 54 ? 'extreme · league ~60%' : 'league ~60%',
      weight,
      expand: pitcher.first_pitch_mix
        ? { kind: 'first-pitch-mini', data: { mix: pitcher.first_pitch_mix, strikeRate: fps, pitcherName: pitcher.player_name } }
        : undefined,
    })
  }

// ── 6. Times through the order ────────────────────────────────────────
  if (pitcher.tto1_woba != null && pitcher.tto3_woba != null) {
    const delta = pitcher.tto3_woba - pitcher.tto1_woba
    if (delta >= 0.045) {
      rows.push({
        id: `pitching-${pid}-tto3`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `3rd time through: ${fmtAvg(pitcher.tto3_woba)} wOBA allowed (vs ${fmtAvg(pitcher.tto1_woba)} 1st). Δ +${delta.toFixed(3)} — earlier hook window.`,
        highlight: `${fmtAvg(pitcher.tto3_woba)} wOBA`,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: pitcher.tto3_pa != null ? `n=${pitcher.tto3_pa} PA · TTO3` : 'season TTO',
        weight: 80,
        expand: {
          kind: 'tto-bars',
          data: {
            tto1_woba: pitcher.tto1_woba, tto2_woba: pitcher.tto2_woba, tto3_woba: pitcher.tto3_woba,
            tto1_pa: pitcher.tto1_pa, tto2_pa: pitcher.tto2_pa, tto3_pa: pitcher.tto3_pa,
            pitcherName: pitcher.player_name,
          },
        },
      })
    } else if (delta <= -0.030) {
      rows.push({
        id: `pitching-${pid}-tto3-strong`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `Holds through the order: ${fmtAvg(pitcher.tto3_woba)} wOBA 3rd time (vs ${fmtAvg(pitcher.tto1_woba)} 1st). Can work deeper.`,
        highlight: `${fmtAvg(pitcher.tto3_woba)} wOBA`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: pitcher.tto3_pa != null ? `n=${pitcher.tto3_pa} PA` : 'season TTO',
        weight: 72,
        expand: {
          kind: 'tto-bars',
          data: {
            tto1_woba: pitcher.tto1_woba, tto2_woba: pitcher.tto2_woba, tto3_woba: pitcher.tto3_woba,
            tto1_pa: pitcher.tto1_pa, tto2_pa: pitcher.tto2_pa, tto3_pa: pitcher.tto3_pa,
            pitcherName: pitcher.player_name,
          },
        },
      })
    }
  }

  // ── 7. Form / recent ERA trend ────────────────────────────────────────
  if (pitcher.formSignal && pitcher.formCurrentEra != null && pitcher.formExtremeEra != null) {
    const cur = pitcher.formCurrentEra.toFixed(2)
    const ext = pitcher.formExtremeEra.toFixed(2)
    if (pitcher.formSignal === 'cooling') {
      rows.push({
        id: `pitching-${pid}-form-cooling`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `Rolling ERA up to ${cur} (from ${ext}). Form cooling.`,
        highlight: cur,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: 'rolling ERA · recent starts',
        weight: 78,
      })
    } else {
      rows.push({
        id: `pitching-${pid}-form-heating`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `Rolling ERA down to ${cur} (from ${ext}). Form improving.`,
        highlight: cur,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'rolling ERA · recent starts',
        weight: 80,
      })
    }
  } else if (pitcher.l3_era != null && pitcher.era != null) {
    const delta = pitcher.l3_era - pitcher.era
    if (Math.abs(delta) >= 1.00) {
      if (delta > 0) {
        rows.push({
          id: `pitching-${pid}-l3-cold`,
          section: 'pitching',
          subsection: sub,
          subsectionPlayerId: pid,
          line: `L3 ERA ${pitcher.l3_era.toFixed(2)} vs season ${pitcher.era.toFixed(2)}. Recent results softer.`,
          highlight: pitcher.l3_era.toFixed(2),
          lean: leanNeg,
          leanLabel: `${oppAbbr} +`,
          sampleTag: 'L3 starts vs season',
          weight: 68,
        })
      } else {
        rows.push({
          id: `pitching-${pid}-l3-hot`,
          section: 'pitching',
          subsection: sub,
          subsectionPlayerId: pid,
          line: `L3 ERA ${pitcher.l3_era.toFixed(2)} — below season ${pitcher.era.toFixed(2)}. Strong stretch.`,
          highlight: pitcher.l3_era.toFixed(2),
          lean: leanPos,
          leanLabel: `${ownAbbr} +`,
          sampleTag: 'L3 starts vs season',
          weight: 70,
        })
      }
    }
  }

  // ── 8. ERA vs FIP gap ─────────────────────────────────────────────────
  if (pitcher.era != null && pitcher.fip != null) {
    const gap = pitcher.era - pitcher.fip
    if (Math.abs(gap) >= 0.55) {
      if (gap >= 0.55) {
        rows.push({
          id: `pitching-${pid}-era-fip-gap`,
          section: 'pitching',
          subsection: sub,
          subsectionPlayerId: pid,
          line: `ERA ${pitcher.era.toFixed(2)} is ${gap.toFixed(2)} above FIP (${pitcher.fip.toFixed(2)}). Peripherals better than results.`,
          highlight: `${gap.toFixed(2)} above FIP`,
          lean: leanPos,
          leanLabel: `${ownAbbr} +`,
          sampleTag: 'ERA vs FIP · season',
          weight: 74,
        })
      } else {
        rows.push({
          id: `pitching-${pid}-era-fip-gap`,
          section: 'pitching',
          subsection: sub,
          subsectionPlayerId: pid,
          line: `ERA ${pitcher.era.toFixed(2)} is ${Math.abs(gap).toFixed(2)} below FIP (${pitcher.fip.toFixed(2)}). Results ahead of peripherals.`,
          highlight: 'below FIP',
          lean: leanNeg,
          leanLabel: `${oppAbbr} +`,
          sampleTag: 'ERA vs FIP · season',
          weight: 70,
        })
      }
    }
  }

  // ── 9. K/9, BB/9, WHIP extremes ───────────────────────────────────────
  if (pitcher.k_per_9 != null) {
    const k9 = pitcher.k_per_9
    if (k9 >= 10.0) {
      rows.push({
        id: `pitching-${pid}-k9`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `${k9.toFixed(1)} K/9 — high swing-and-miss rate.`,
        highlight: `${k9.toFixed(1)} K/9`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'K/9 · season',
        weight: 77,
      })
    } else if (k9 <= 6.8) {
      rows.push({
        id: `pitching-${pid}-k9-low`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `${k9.toFixed(1)} K/9 — contact manager more than pure miss.`,
        highlight: `${k9.toFixed(1)} K/9`,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: 'K/9 · season',
        weight: 64,
      })
    }
  }

  if (pitcher.bb_per_9 != null) {
    const bb9 = pitcher.bb_per_9
    if (bb9 >= 3.8) {
      rows.push({
        id: `pitching-${pid}-bb9`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `${bb9.toFixed(1)} BB/9 — elevated walk rate.`,
        highlight: `${bb9.toFixed(1)} BB/9`,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: 'BB/9 · season',
        weight: 73,
      })
    } else if (bb9 <= 2.0) {
      rows.push({
        id: `pitching-${pid}-bb9-low`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `${bb9.toFixed(1)} BB/9 — tight control.`,
        highlight: `${bb9.toFixed(1)} BB/9`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'BB/9 · season',
        weight: 68,
      })
    }
  }

  if (pitcher.whip != null) {
    const whip = pitcher.whip
    if (whip <= 1.05) {
      rows.push({
        id: `pitching-${pid}-whip`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `WHIP ${whip.toFixed(2)} — keeps the bases empty.`,
        highlight: `${whip.toFixed(2)} WHIP`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'WHIP · season',
        weight: 72,
      })
    } else if (whip >= 1.40) {
      rows.push({
        id: `pitching-${pid}-whip-high`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `WHIP ${whip.toFixed(2)} — allows traffic.`,
        highlight: `${whip.toFixed(2)} WHIP`,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: 'WHIP · season',
        weight: 70,
      })
    }
  }

  // ── 10. Matchup cross-references vs opposing lineup ───────────────────
  if (oppTeam) {
    const throws = pitcher.throws ?? 'R'
    const chase = normPct(throws === 'L' ? oppTeam.chase_pct_vs_lhp : oppTeam.chase_pct_vs_rhp)
    const putawayP = pickPutawayPitch(pitcher.arsenal)
    if (chase != null && putawayP && (chase >= 32 || (oppTeam.chase_pct_rank_mlb != null && oppTeam.chase_pct_rank_mlb >= 22))) {
      const pu = Math.round(normPct(putawayP.put_away_percent) ?? 0)
      rows.push({
        id: `pitching-${pid}-matchup-chase`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `${oppTeam.team_name} chase ${Math.round(chase)}% vs ${throws}HP${oppTeam.chase_pct_rank_mlb ? ` (${ord(oppTeam.chase_pct_rank_mlb)} MLB)` : ''}. ${putawayP.pitch_name} (${pu}% put-away) matches up.`,
        highlight: `${Math.round(chase)}% chase`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'matchup · chase vs put-away',
        weight: 93,
      })
    }

    const teamK = normPct(oppTeam.k_pct)
    if (teamK != null && pitcher.k_per_9 != null && teamK >= 24 && pitcher.k_per_9 >= 9.0) {
      rows.push({
        id: `pitching-${pid}-matchup-k`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `${oppTeam.team_name} K ${Math.round(teamK)}%; pitcher at ${pitcher.k_per_9.toFixed(1)} K/9. Elevated K environment.`,
        highlight: `${pitcher.k_per_9.toFixed(1)} K/9`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'matchup · K% vs K/9',
        weight: 86,
      })
    }

    const fpSwing = normPct(oppTeam.first_pitch_swing_pct)
    const fps = normPct(pitcher.first_pitch_strike_pct)
    if (fpSwing != null && fps != null && fpSwing >= 32 && fps >= 63) {
      rows.push({
        id: `pitching-${pid}-matchup-first-pitch`,
        section: 'pitching',
        subsection: sub,
        subsectionPlayerId: pid,
        line: `${oppTeam.team_name} swing ${Math.round(fpSwing)}% first pitch; starter throws strikes ${Math.round(fps)}%. Early-count contact likely.`,
        highlight: `${Math.round(fpSwing)}%`,
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'matchup · 1st-pitch aggression',
        weight: 75,
      })
    }
  }

  // Return ALL candidates, weight-sorted. Selection happens downstream.
  return rows.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  ZONE CLASH — lineup vs. opposing pitcher's specific arsenal
// ─────────────────────────────────────────────────────────────────────
//
// Closes the gap documented in model.md Component 5: "have pitcher
// arsenal, missing lineup vulnerability." Joins the pitcher's real
// weapons (>=12% usage — same "primary pitch" bar buildPitcherRows
// already uses) against each lineup batter's actual BA/whiff/xwOBA vs
// that specific pitch type.
//
// Two outputs from one pass:
//   1. A single blended headline row — usage-weighted-by-PA across the
//      whole lineup for whichever pitch shows the most extreme edge
//      (either direction) vs. league-average xwOBA. One row, same
//      "most game-relevant single fact" principle as buildHeadlineRead
//      in narrative.ts — we don't dump every pitch's blend into the
//      report, just the one that matters most tonight.
//   2. Per-batter drill-down data (top 4 in the order, gated at
//      MIN_PA_DRILLDOWN) carried in the row's `expand` payload for the
//      UI to render as individual lines — not separate ScoutRows, to
//      avoid one team's lineup depth crowding out the 5-row batting
//      section cap with near-duplicate pitch-type facts.
//
// Runs off the probable/predicted starter's season arsenal — does NOT
// require lineups_confirmed. Confirmed by George: fine to show this
// pre-confirmation, same as the rest of the pitching arsenal analysis.

const ZONE_CLASH_MIN_USAGE = 12       // % — matches "primary pitch" bar elsewhere in this file
const ZONE_CLASH_MIN_PA_BLEND = 8     // per-batter PA floor to count toward the lineup blend
const ZONE_CLASH_MIN_PA_DRILLDOWN = 15 // higher bar for citing one specific batter by name
const LEAGUE_AVG_XWOBA_PITCH = 0.315  // same constant used in edge.ts / compute_regression_watch.py — keep in sync
const ZONE_CLASH_XWOBA_THRESHOLD = 0.028 // minimum deviation from league avg to be worth surfacing

type PitchBlend = {
  pitch_type: string
  pitch_name: string
  usage: number | null
  blendedBa: number | null
  blendedWhiff: number | null
  blendedWoba: number | null
  totalPa: number
  batters: LineupArsenalPayload['batters']
}

function buildLineupArsenalRows(
  lineup: LineupBatterForScout[] | null | undefined,
  pitcher: PitcherForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
): ScoutRow[] {
  if (!lineup || lineup.length === 0 || !pitcher) return []

  const leanPos = ownLean(ownAbbr, homeAbbr) // "own" here = the batting team
  const leanNeg: ScoutLean = leanPos === 'home' ? 'away' : 'home'

  const arsenal = dedupeArsenal(pitcher.arsenal)
  const realWeapons = arsenal.filter(p => (normPct(p.percentage) ?? 0) >= ZONE_CLASH_MIN_USAGE)
  if (realWeapons.length === 0) return []

  const blends: PitchBlend[] = []

  for (const pitch of realWeapons) {
    let sumBaWeighted = 0, sumBaPa = 0
    let sumWhiffWeighted = 0, sumWhiffPa = 0
    let sumWobaWeighted = 0, sumWobaPa = 0
    let totalPa = 0
    const batterLines: LineupArsenalPayload['batters'] = []

    for (const batter of lineup) {
      const split = batter.splits.find(s => s.pitch_type === pitch.pitch_type)
      if (!split || split.pa == null || split.pa < ZONE_CLASH_MIN_PA_BLEND) continue

      totalPa += split.pa
      if (split.ba != null) { sumBaWeighted += split.ba * split.pa; sumBaPa += split.pa }
      if (split.whiff_percent != null) { sumWhiffWeighted += split.whiff_percent * split.pa; sumWhiffPa += split.pa }
      if (split.est_woba != null) { sumWobaWeighted += split.est_woba * split.pa; sumWobaPa += split.pa }

      // Drill-down: only the top 4 in the order, only with a real individual sample.
      if (batter.batting_order <= 4 && split.pa >= ZONE_CLASH_MIN_PA_DRILLDOWN) {
        batterLines.push({
          name: batter.player_name,
          battingOrder: batter.batting_order,
          pa: split.pa,
          ba: split.ba,
          whiff_percent: split.whiff_percent,
          est_woba: split.est_woba,
        })
      }
    }

    if (totalPa === 0) continue

    blends.push({
      pitch_type: pitch.pitch_type,
      pitch_name: pitch.pitch_name,
      usage: normPct(pitch.percentage),
      blendedBa: sumBaPa > 0 ? sumBaWeighted / sumBaPa : null,
      blendedWhiff: sumWhiffPa > 0 ? sumWhiffWeighted / sumWhiffPa : null,
      blendedWoba: sumWobaPa > 0 ? sumWobaWeighted / sumWobaPa : null,
      totalPa,
      batters: batterLines.sort((a, b) => a.battingOrder - b.battingOrder),
    })
  }

  if (blends.length === 0) return []

  // Pick the single most extreme pitch by deviation from league-average
  // xwOBA — one headline fact, not one row per pitch type.
  const scored = blends
    .filter(b => b.blendedWoba != null)
    .map(b => ({ b, diff: (b.blendedWoba as number) - LEAGUE_AVG_XWOBA_PITCH }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  const top = scored[0]
  if (!top || Math.abs(top.diff) < ZONE_CLASH_XWOBA_THRESHOLD) return []

  const { b: blend, diff } = top
  const crushing = diff > 0
  const wobaStr = fmtAvg(blend.blendedWoba as number)
  const baStr = blend.blendedBa != null ? fmtAvg(blend.blendedBa) : null
  const whiffStr = blend.blendedWhiff != null ? blend.blendedWhiff.toFixed(1) : null
  const pitchLabel = (blend.pitch_name ?? blend.pitch_type).toLowerCase()

  const line = crushing
    ? `Lineup mashes the ${pitchLabel}: ${wobaStr} xwOBA${baStr ? `, ${baStr} AVG` : ''}${whiffStr ? `, ${whiffStr}% whiff` : ''} across ${blend.totalPa} PA — and ${pitcher.player_name} throws it ${blend.usage != null ? `${blend.usage.toFixed(0)}%` : 'often'} of the time.`
    : `Lineup struggles vs the ${pitchLabel}: ${wobaStr} xwOBA${baStr ? `, ${baStr} AVG` : ''}${whiffStr ? `, ${whiffStr}% whiff` : ''} across ${blend.totalPa} PA — a real weapon for ${pitcher.player_name}.`

  const payload: LineupArsenalPayload = {
    pitcherName: pitcher.player_name,
    pitchType: blend.pitch_type,
    pitchName: blend.pitch_name ?? blend.pitch_type,
    pitchUsage: blend.usage,
    lineupBlendedBa: blend.blendedBa,
    lineupBlendedWhiff: blend.blendedWhiff,
    lineupBlendedWoba: blend.blendedWoba,
    totalPa: blend.totalPa,
    batters: blend.batters,
  }

  return [{
    id: `batting-${ownAbbr}-zone-clash-${blend.pitch_type}`,
    section: 'batting',
    subsection: `vs ${pitcher.player_name}'s ${pitchLabel}`,
    line,
    highlight: wobaStr,
    lean: crushing ? leanPos : leanNeg,
    leanLabel: crushing ? `${ownAbbr} +` : `${oppAbbr} +`,
    sampleTag: `n=${blend.totalPa} PA · Baseball Savant`,
    weight: crushing ? 94 : 90,
    expand: { kind: 'lineup-arsenal', data: payload },
  }]
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 2 · BATTING — return all candidates
// ─────────────────────────────────────────────────────────────────────

function buildTeamBattingRows(
  team: TeamStatsForScout | null,
  opposingPitcher: PitcherForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
): ScoutRow[] {
  if (!team) return []
  const rows: ScoutRow[] = []
  const throws = opposingPitcher?.throws ?? 'R'
  const sub = `${team.team_name} vs ${throws}HP`
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg: ScoutLean = leanPos === 'home' ? 'away' : 'home'

  const chase = normPct(throws === 'L' ? team.chase_pct_vs_lhp : team.chase_pct_vs_rhp)
  if (chase != null) {
    const rank = team.chase_pct_rank_mlb
    const chasePct = Math.round(chase)
    const isDisciplined = rank != null && rank <= 8
    const isChasey = rank != null && rank >= 23
    if (isChasey || isDisciplined) {
      const putawayNote = opposingPitcher
        ? (() => {
            const pu = pickPutawayPitch(opposingPitcher.arsenal)
            return pu ? ` Put-away (${pu.pitch_name.toLowerCase()}) matches up.` : ''
          })()
        : ''
      rows.push({
        id: `batting-${ownAbbr}-chase`,
        section: 'batting',
        subsection: sub,
        line: isChasey
          ? `Chase ${chasePct}% vs ${throws}HP${rank ? ` (${ord(rank)}-worst MLB)` : ''}.${putawayNote}`
          : `Chase ${chasePct}% vs ${throws}HP${rank ? ` (${ord(rank)}-best MLB)` : ''} — disciplined.`,
        highlight: `chase ${chasePct}%`,
        lean: isChasey ? leanNeg : leanPos,
        leanLabel: isChasey ? `${oppAbbr} +` : `${ownAbbr} +`,
        sampleTag: rank != null ? `MLB rank ${rank}/30` : 'season plate discipline',
        weight: isChasey ? 92 : 84,
      })
    } else {
      // Even non-extreme chase can pad if we need a 5th row
      rows.push({
        id: `batting-${ownAbbr}-chase-mid`,
        section: 'batting',
        subsection: sub,
        line: `Chase ${chasePct}% vs ${throws}HP — mid-pack discipline.`,
        highlight: `${chasePct}%`,
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: rank != null ? `MLB rank ${rank}/30` : 'season',
        weight: 42,
      })
    }
  }

  const fpSwing = normPct(team.first_pitch_swing_pct)
  if (fpSwing != null) {
    const rank = team.first_pitch_swing_rank_mlb
    const pct = Math.round(fpSwing)
    const isAggressive = rank != null && rank <= 6
    const isPatient = rank != null && rank >= 25
    if (isAggressive || isPatient) {
      const oppFps = normPct(opposingPitcher?.first_pitch_strike_pct)
      const collisionNote =
        isAggressive && oppFps != null && oppFps >= 62
          ? ` Starter FPS ${Math.round(oppFps)}% — early contact likely.`
          : ''
      rows.push({
        id: `batting-${ownAbbr}-first-pitch-swing`,
        section: 'batting',
        subsection: sub,
        line: isAggressive
          ? `First-pitch swing ${pct}%${rank ? ` (${ord(rank)}-highest MLB)` : ''}.${collisionNote}`
          : `First-pitch swing ${pct}%${rank ? ` (${ord(rank)}-most patient MLB)` : ''} — takes early.`,
        highlight: `${pct}%`,
        lean: isAggressive ? 'neutral' : leanPos,
        leanLabel: isAggressive ? 'watch' : `${ownAbbr} +`,
        sampleTag: rank != null ? `MLB rank ${rank}/30` : 'season',
        weight: 78,
      })
    } else {
      rows.push({
        id: `batting-${ownAbbr}-first-pitch-swing-mid`,
        section: 'batting',
        subsection: sub,
        line: `First-pitch swing ${pct}% — around league average.`,
        highlight: `${pct}%`,
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'season',
        weight: 40,
      })
    }
  }

  const twoK = normPct(team.two_strike_k_pct)
  if (twoK != null) {
    if (twoK >= 45) {
      rows.push({
        id: `batting-${ownAbbr}-two-strike-k`,
        section: 'batting',
        subsection: sub,
        line: `Two-strike K rate ${Math.round(twoK)}% (league ~40%). Vulnerable once behind.`,
        highlight: `${Math.round(twoK)}%`,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: '2-strike · Baseball Savant',
        weight: 80,
      })
    } else if (twoK <= 35) {
      rows.push({
        id: `batting-${ownAbbr}-two-strike-k-low`,
        section: 'batting',
        subsection: sub,
        line: `Two-strike K rate ${Math.round(twoK)}% — makes contact with two strikes.`,
        highlight: `${Math.round(twoK)}%`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: '2-strike · Baseball Savant',
        weight: 72,
      })
    } else {
      rows.push({
        id: `batting-${ownAbbr}-two-strike-k-mid`,
        section: 'batting',
        subsection: sub,
        line: `Two-strike K rate ${Math.round(twoK)}% — near league average.`,
        highlight: `${Math.round(twoK)}%`,
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: '2-strike',
        weight: 38,
      })
    }
  }

  const brWhiff = normPct(team.two_strike_whiff_vs_breaking)
  if (brWhiff != null && brWhiff >= 38) {
    rows.push({
      id: `batting-${ownAbbr}-breaking-whiff`,
      section: 'batting',
      subsection: sub,
      line: `Two-strike whiff vs breaking: ${Math.round(brWhiff)}%. Breaking balls play up.`,
      highlight: `${Math.round(brWhiff)}%`,
      lean: leanNeg,
      leanLabel: `${oppAbbr} +`,
      sampleTag: '2K vs breaking · Baseball Savant',
      weight: 76,
    })
  }

  // Team-level offense signals live here too as batting-context rows (so a team
  // with thin batting-tendency data can still hit 5 signals with real offense facts).
  const ops = team.ops_l30
  if (ops != null) {
    const val = fmtAvg(ops)
    if (ops >= 0.785) {
      rows.push({
        id: `batting-${ownAbbr}-ops-hot`,
        section: 'batting',
        subsection: sub,
        line: `L30 OPS ${val} — lineup clicking.`,
        highlight: val,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'L30 OPS',
        weight: 74,
      })
    } else if (ops <= 0.675) {
      rows.push({
        id: `batting-${ownAbbr}-ops-cold`,
        section: 'batting',
        subsection: sub,
        line: `L30 OPS ${val} — lineup cooled.`,
        highlight: val,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: 'L30 OPS',
        weight: 70,
      })
    } else {
      rows.push({
        id: `batting-${ownAbbr}-ops-mid`,
        section: 'batting',
        subsection: sub,
        line: `L30 OPS ${val}.`,
        highlight: val,
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'L30 OPS',
        weight: 35,
      })
    }
  }

  const hard = normPct(team.hard_hit_pct)
  if (hard != null) {
    if (hard >= 42) {
      rows.push({
        id: `batting-${ownAbbr}-hardhit`,
        section: 'batting',
        subsection: sub,
        line: `Hard-hit rate ${Math.round(hard)}% — hard contact group.`,
        highlight: `${Math.round(hard)}%`,
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'hard-hit% · Baseball Savant',
        weight: 68,
      })
    } else if (hard <= 32) {
      rows.push({
        id: `batting-${ownAbbr}-hardhit-low`,
        section: 'batting',
        subsection: sub,
        line: `Hard-hit rate ${Math.round(hard)}% — softer contact.`,
        highlight: `${Math.round(hard)}%`,
        lean: leanNeg,
        leanLabel: `${oppAbbr} +`,
        sampleTag: 'hard-hit% · Baseball Savant',
        weight: 62,
      })
    } else {
      rows.push({
        id: `batting-${ownAbbr}-hardhit-mid`,
        section: 'batting',
        subsection: sub,
        line: `Hard-hit rate ${Math.round(hard)}% — average contact quality.`,
        highlight: `${Math.round(hard)}%`,
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'hard-hit%',
        weight: 34,
      })
    }
  }

  // Streaks — batter hot/cold
  if (team.hotStreaks && team.hotStreaks.length > 0) {
    const batters = team.hotStreaks.filter(s => s.player_type === 'batter').slice(0, 3)
    for (const streak of batters) {
      const heating = streak.signal === 'heating'
      const opsVal = streak.current_value.toFixed(3)
      const extVal = streak.extreme_value.toFixed(3)
      let streakContext = ''
      if (streak.recentGameLog && streak.recentGameLog.length >= 5) {
        const good = streak.recentGameLog.filter(v => v >= 0.800).length
        const bad = streak.recentGameLog.filter(v => v <= 0.550).length
        if (heating && good >= 4) {
          streakContext = ` — ${good} of the last ${streak.recentGameLog.length} games at .800+ OPS`
        } else if (!heating && bad >= 4) {
          streakContext = ` — ${bad} of the last ${streak.recentGameLog.length} games at .550 or below`
        }
      }
      rows.push({
        id: `batting-${ownAbbr}-streak-${streak.player_id}`,
        section: 'batting',
        subsection: sub,
        line: heating
          ? `${streak.player_name} heating — rolling OPS ${opsVal} (from ${extVal})${streakContext}.`
          : `${streak.player_name} cooling — rolling OPS ${opsVal} (from ${extVal})${streakContext}.`,
        highlight: opsVal,
        lean: heating ? leanPos : leanNeg,
        leanLabel: heating ? `${ownAbbr} +` : `${oppAbbr} +`,
        sampleTag: 'rolling OPS · L15',
        weight: heating ? 88 : 74,
      })
    }
  }

  return rows.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 3 · OFFENSE (team-level, still returned globally for context)
// ─────────────────────────────────────────────────────────────────────
//
// v7: with batting section absorbing OPS/hard-hit as extra rows,
// the offense pool is now the "spillover" — runs/xwOBA/ISO/K/BB rate
// facts that also apply. Kept small; used only if the game needs
// more color at the top level.

function buildTeamOffenseRows(
  team: TeamStatsForScout | null,
  ownAbbr: string,
  oppAbbr: string,
  homeAbbr: string,
): ScoutRow[] {
  if (!team) return []
  const out: ScoutRow[] = []
  const sub = team.team_name
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg: ScoutLean = leanPos === 'home' ? 'away' : 'home'

  const rpg = team.runs_per_game_l30
  if (rpg != null) {
    const hot = rpg >= 5.3
    const cold = rpg <= 3.7
    out.push({
      id: `offense-${ownAbbr}-rpg`,
      section: 'offense',
      subsection: sub,
      line: hot
        ? `L30: ${rpg.toFixed(1)} runs/game — productive.`
        : cold
          ? `L30: ${rpg.toFixed(1)} runs/game — offense quiet.`
          : `L30: ${rpg.toFixed(1)} runs/game.`,
      highlight: `${rpg.toFixed(1)} runs`,
      lean: hot ? leanPos : cold ? leanNeg : 'neutral',
      leanLabel: hot ? `${ownAbbr} +` : cold ? `${oppAbbr} +` : 'watch',
      sampleTag: 'L30 runs/game',
      weight: hot || cold ? 84 : 42,
    })
  }

  const xwoba = team.xwoba
  if (xwoba != null && (xwoba >= 0.340 || xwoba <= 0.295)) {
    const strong = xwoba >= 0.340
    const val = fmtAvg(xwoba)
    out.push({
      id: `offense-${ownAbbr}-xwoba`,
      section: 'offense',
      subsection: sub,
      line: strong
        ? `xwOBA ${val} — elite contact quality.`
        : `xwOBA ${val} — soft contact quality.`,
      highlight: val,
      lean: strong ? leanPos : leanNeg,
      leanLabel: strong ? `${ownAbbr} +` : `${oppAbbr} +`,
      sampleTag: 'xwOBA · Baseball Savant',
      weight: 70,
    })
  }

  const iso = team.iso
  if (iso != null && (iso >= 0.180 || iso <= 0.120)) {
    const power = iso >= 0.180
    out.push({
      id: `offense-${ownAbbr}-iso`,
      section: 'offense',
      subsection: sub,
      line: power
        ? `ISO ${fmtAvg(iso)} — real power.`
        : `ISO ${fmtAvg(iso)} — limited extra-base thump.`,
      highlight: fmtAvg(iso),
      lean: power ? leanPos : leanNeg,
      leanLabel: power ? `${ownAbbr} +` : `${oppAbbr} +`,
      sampleTag: 'ISO · season',
      weight: 66,
    })
  }

  return out.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 4 · BULLPEN
// ─────────────────────────────────────────────────────────────────────

function buildBullpenTeamRows(
  pen: BullpenForScout | null,
  ownAbbr: string,
  homeAbbr: string,
): ScoutRow[] {
  if (!pen) return []
  const rows: ScoutRow[] = []
  const sub = `${pen.team_name} bullpen`
  const leanPos = ownLean(ownAbbr, homeAbbr)
  const leanNeg: ScoutLean = leanPos === 'home' ? 'away' : 'home'

  if (pen.innings_yesterday != null) {
    const ipy = pen.innings_yesterday
    const heavy = ipy >= 4.0
    const light = ipy <= 1.5
    let line: string
    let lean: ScoutLean = 'neutral'
    let leanLabel = 'watch'
    let weight = 38

    if (heavy) {
      line = `Pen: ${formatMlbIP(ipy)} yesterday — taxed. Top arms may sit early.`
      lean = leanNeg
      leanLabel = `${ownAbbr} —`
      weight = 88
    } else if (light) {
      line = `Pen: ${formatMlbIP(ipy)} yesterday — fully rested.`
      lean = leanPos
      leanLabel = `${ownAbbr} +`
      weight = 66
    } else {
      line = `Pen: ${formatMlbIP(ipy)} yesterday — normal workload.`
    }
    rows.push({
      id: `bullpen-${ownAbbr}-yesterday`,
      section: 'bullpen',
      subsection: sub,
      line,
      highlight: formatMlbIP(ipy),
      lean,
      leanLabel,
      sampleTag: 'yesterday IP',
      weight,
      expand: {
        kind: 'workload-bars',
        data: { innings_yesterday: pen.innings_yesterday, ip_last_3: pen.ip_last_3 },
      },
    })
  }

  if (pen.ip_last_3 != null) {
    const ip3 = pen.ip_last_3
    const heavy3 = ip3 >= 10
    if (heavy3) {
      rows.push({
        id: `bullpen-${ownAbbr}-l3-heavy`,
        section: 'bullpen',
        subsection: sub,
        line: `L3: ${formatMlbIP(ip3)} — pen taxed this series.`,
        highlight: formatMlbIP(ip3),
        lean: leanNeg,
        leanLabel: `${ownAbbr} —`,
        sampleTag: 'L3 days IP',
        weight: 76,
        expand: {
          kind: 'workload-bars',
          data: { innings_yesterday: pen.innings_yesterday, ip_last_3: pen.ip_last_3 },
        },
      })
    } else if (ip3 <= 5) {
      rows.push({
        id: `bullpen-${ownAbbr}-l3-fresh`,
        section: 'bullpen',
        subsection: sub,
        line: `L3: ${formatMlbIP(ip3)} — fully rested rotation of arms.`,
        highlight: formatMlbIP(ip3),
        lean: leanPos,
        leanLabel: `${ownAbbr} +`,
        sampleTag: 'L3 days IP',
        weight: 55,
        expand: {
          kind: 'workload-bars',
          data: { innings_yesterday: pen.innings_yesterday, ip_last_3: pen.ip_last_3 },
        },
      })
    } else {
      rows.push({
        id: `bullpen-${ownAbbr}-l3-mid`,
        section: 'bullpen',
        subsection: sub,
        line: `L3: ${formatMlbIP(ip3)} — normal series workload.`,
        highlight: formatMlbIP(ip3),
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'L3 days IP',
        weight: 32,
        expand: {
          kind: 'workload-bars',
          data: { innings_yesterday: pen.innings_yesterday, ip_last_3: pen.ip_last_3 },
        },
      })
    }
  }

  const closer = pen.closer_available
  const s1 = pen.setup1_available
  const s2 = pen.setup2_available

  if (closer === false || s1 === false || s2 === false) {
    const missing = [
      closer === false ? 'closer' : null,
      s1 === false ? 'setup 1' : null,
      s2 === false ? 'setup 2' : null,
    ].filter(Boolean).join(', ')
    rows.push({
      id: `bullpen-${ownAbbr}-unavailable`,
      section: 'bullpen',
      subsection: sub,
      line: `Unavailable tonight: ${missing}.`,
      lean: leanNeg,
      leanLabel: `${ownAbbr} —`,
      sampleTag: 'availability',
      weight: 85,
    })
  } else if (closer === true && s1 === true && s2 === true) {
    rows.push({
      id: `bullpen-${ownAbbr}-full-ladder`,
      section: 'bullpen',
      subsection: sub,
      line: `Full ladder available — closer, setup 1 & 2 green.`,
      lean: leanPos,
      leanLabel: `${ownAbbr} +`,
      sampleTag: 'availability',
      weight: 58,
    })
  }

  if (pen.bullpen_era != null) {
    const era = pen.bullpen_era
    const elite = era <= 3.15
    const poor = era >= 4.55
    if (elite || poor) {
      rows.push({
        id: `bullpen-${ownAbbr}-era`,
        section: 'bullpen',
        subsection: sub,
        line: elite
          ? `Bullpen ERA ${era.toFixed(2)} — reliable unit.`
          : `Bullpen ERA ${era.toFixed(2)} — below average.`,
        highlight: era.toFixed(2),
        lean: elite ? leanPos : leanNeg,
        leanLabel: elite ? `${ownAbbr} +` : `${ownAbbr} —`,
        sampleTag: 'season bullpen ERA',
        weight: elite ? 68 : 74,
      })
    } else {
      rows.push({
        id: `bullpen-${ownAbbr}-era-mid`,
        section: 'bullpen',
        subsection: sub,
        line: `Bullpen ERA ${era.toFixed(2)} — around league average.`,
        highlight: era.toFixed(2),
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'season bullpen ERA',
        weight: 30,
      })
    }
  }

  if (pen.depth_arm_l3_era != null && pen.depth_arm_l3_era >= 5.8) {
    const name = pen.depth_arm_name ?? 'First depth arm'
    rows.push({
      id: `bullpen-${ownAbbr}-depth`,
      section: 'bullpen',
      subsection: sub,
      line: `${name}: ${pen.depth_arm_l3_era.toFixed(2)} ERA last 3 outings — watch if starter exits early.`,
      highlight: `${pen.depth_arm_l3_era.toFixed(2)} ERA`,
      lean: leanNeg,
      leanLabel: `${ownAbbr} —`,
      sampleTag: 'L3 outings · depth',
      weight: 84,
    })
  }

  return rows.sort((a, b) => b.weight - a.weight)
}

// ─────────────────────────────────────────────────────────────────────
//  Per-team selectors — pick target N, but never fabricate.
// ─────────────────────────────────────────────────────────────────────

/**
 * Pick top `target` rows for a team's section. If fewer than target
 * qualifying rows exist, return what we have — no padding with junk.
 * The `strongThreshold` marks the boundary between "real signal" and
 * "context filler"; both are real facts, but we prefer real signals first.
 */
function selectPerTeamSection(candidates: ScoutRow[], target: number): ScoutRow[] {
  const sorted = [...candidates].sort((a, b) => b.weight - a.weight)
  return sorted.slice(0, target)
}

function buildPitchingRows(inputs: ScoutInputs): {
  awayRows: ScoutRow[]
  homeRows: ScoutRow[]
} {
  const awayAll = buildPitcherRows(inputs.awayPitcher, inputs.awayAbbr, inputs.homeAbbr, inputs.homeAbbr, inputs.homeTeamStats)
  const homeAll = buildPitcherRows(inputs.homePitcher, inputs.homeAbbr, inputs.awayAbbr, inputs.homeAbbr, inputs.awayTeamStats)
  return {
    awayRows: selectPerTeamSection(awayAll, PER_TEAM_TARGETS.pitching),
    homeRows: selectPerTeamSection(homeAll, PER_TEAM_TARGETS.pitching),
  }
}

function buildBattingRows(inputs: ScoutInputs): {
  awayRows: ScoutRow[]
  homeRows: ScoutRow[]
} {
  const awayCore = buildTeamBattingRows(inputs.awayTeamStats, inputs.homePitcher, inputs.awayAbbr, inputs.homeAbbr, inputs.homeAbbr)
  const homeCore = buildTeamBattingRows(inputs.homeTeamStats, inputs.awayPitcher, inputs.homeAbbr, inputs.awayAbbr, inputs.homeAbbr)

  // Zone Clash — away lineup faces homePitcher, home lineup faces awayPitcher.
  // Returns [] cleanly if lineup/split data isn't wired for this game yet.
  const awayZoneClash = buildLineupArsenalRows(inputs.awayLineup, inputs.homePitcher, inputs.awayAbbr, inputs.homeAbbr, inputs.homeAbbr)
  const homeZoneClash = buildLineupArsenalRows(inputs.homeLineup, inputs.awayPitcher, inputs.homeAbbr, inputs.awayAbbr, inputs.homeAbbr)

  const awayCombined = [...awayCore, ...awayZoneClash]
  const homeCombined = [...homeCore, ...homeZoneClash]

  // If a team is short of 5, pull from that team's offense pool as pad.
  const padAway = () => {
    if (awayCombined.length >= PER_TEAM_TARGETS.batting) return []
    const offense = buildTeamOffenseRows(inputs.awayTeamStats, inputs.awayAbbr, inputs.homeAbbr, inputs.homeAbbr)
    return offense
      .map(r => ({ ...r, section: 'batting' as ScoutSection, id: `pad-${r.id}` }))
      .slice(0, PER_TEAM_TARGETS.batting - awayCombined.length)
  }
  const padHome = () => {
    if (homeCombined.length >= PER_TEAM_TARGETS.batting) return []
    const offense = buildTeamOffenseRows(inputs.homeTeamStats, inputs.homeAbbr, inputs.awayAbbr, inputs.homeAbbr)
    return offense
      .map(r => ({ ...r, section: 'batting' as ScoutSection, id: `pad-${r.id}` }))
      .slice(0, PER_TEAM_TARGETS.batting - homeCombined.length)
  }

  const awayFull = [...awayCombined, ...padAway()].sort((a, b) => b.weight - a.weight)
  const homeFull = [...homeCombined, ...padHome()].sort((a, b) => b.weight - a.weight)

  return {
    awayRows: selectPerTeamSection(awayFull, PER_TEAM_TARGETS.batting),
    homeRows: selectPerTeamSection(homeFull, PER_TEAM_TARGETS.batting),
  }
}

function buildBullpenRows(inputs: ScoutInputs): {
  awayRows: ScoutRow[]
  homeRows: ScoutRow[]
} {
  const awayAll = buildBullpenTeamRows(inputs.awayBullpen, inputs.awayAbbr, inputs.homeAbbr)
  const homeAll = buildBullpenTeamRows(inputs.homeBullpen, inputs.homeAbbr, inputs.homeAbbr)
  return {
    awayRows: selectPerTeamSection(awayAll, PER_TEAM_TARGETS.bullpen),
    homeRows: selectPerTeamSection(homeAll, PER_TEAM_TARGETS.bullpen),
  }
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 5 · ROSTER MOVES
// ─────────────────────────────────────────────────────────────────────

function buildMoveRows(inputs: ScoutInputs): ScoutRow[] {
  if (!inputs.transactions || inputs.transactions.length === 0) return []
  return inputs.transactions
    .filter(t => t.affects_tonight)
    .map(t => {
      let weight = 0
      const c = (t.category || '').toLowerCase()
      const desc = t.description || ''
      if (c.includes('activ') || /activat/i.test(desc)) weight = 88
      else if (c.includes('scratch') || /scratch/i.test(desc) || /day-to-day/i.test(desc)) weight = 86
      else if (c.includes('injur') || /placed on/i.test(desc) || t.il_days != null) weight = 80
      else if (c.includes('recall') || /recall/i.test(desc) || /selected/i.test(desc)) weight = 65
      else if (c.includes('trade') || /trade/i.test(desc)) weight = 92
      else weight = 35
      return { t, weight }
    })
    .filter(x => x.weight >= 60)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ t, weight }, i) => ({
      id: `moves-${i}-${t.player_name.replace(/\s+/g, '-')}`,
      section: 'moves' as const,
      line: t.description,
      lean: 'neutral' as ScoutLean,
      leanLabel: 'watch',
      sampleTag: 'last 72h',
      weight,
      expand: {
        kind: 'transaction-card' as const,
        data: t,
      },
    }))
}

// ─────────────────────────────────────────────────────────────────────
//  SECTION 6 · SITUATION
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
//  SECTION 6 · SITUATION
// ─────────────────────────────────────────────────────────────────────
function buildSituationRows(inputs: ScoutInputs): ScoutRow[] {
  const rows: ScoutRow[] = []
  if (inputs.park) {
    const hr = inputs.park.hr_factor
    const dbl = inputs.park.doubles_factor
    const runs = inputs.park.runs_factor
    if (hr != null || dbl != null || runs != null) {
      const parts: string[] = []
      if (hr != null) parts.push(`${hr.toFixed(2)} HR`)
      if (dbl != null) parts.push(`${dbl.toFixed(2)} 2B`)
      if (runs != null) parts.push(`${runs.toFixed(2)} runs`)
      let flavor = ''
      if (hr != null && hr >= 1.10) flavor = ' Strongly rewards launch angle and pull-side power.'
      else if (hr != null && hr <= 0.90) flavor = ' Suppresses home-run power; contact and doubles become more valuable.'
      else if (runs != null && runs >= 1.08) flavor = ' Overall run environment is elevated.'
      else if (runs != null && runs <= 0.92) flavor = ' Run-suppressing park — every run carries extra weight.'
      rows.push({
        id: 'situation-park',
        section: 'situation',
        line: `${inputs.park.venue_name} park factors: ${parts.join(' · ')}.${flavor}`,
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'multi-year park factors',
        weight: 62,
        expand: { kind: 'park-factor', data: inputs.park },
      })
    }
  }

  if (inputs.weather) {
    const w = inputs.weather
    const meaningful =
      (w.wind_mph != null && w.wind_mph >= 8) ||
      (w.precipitation_chance != null && w.precipitation_chance >= 35) ||
      (w.temp_f != null && (w.temp_f <= 52 || w.temp_f >= 92))
    if (meaningful) {
      const parts: string[] = []
      if (w.wind_mph != null && w.wind_mph >= 8) {
        parts.push(`${w.wind_direction_text ?? 'Wind'} ${w.wind_mph} mph`)
      }
      if (w.temp_f != null) parts.push(`${w.temp_f}°F`)
      if (w.precipitation_chance != null && w.precipitation_chance >= 35) {
        parts.push(`${w.precipitation_chance}% precip chance`)
      }
      if (w.conditions) parts.push(w.conditions)
      let flavor = ''
      if ((w.wind_mph ?? 0) >= 10 && /out to/i.test(w.wind_direction_text ?? '')) {
        flavor = ' Pull-side power weather — fly balls carry.'
      } else if ((w.wind_mph ?? 0) >= 10 && /in from/i.test(w.wind_direction_text ?? '')) {
        flavor = ' Wind knocks fly balls down; contact and ground-ball outcomes gain value.'
      } else if ((w.temp_f ?? 70) <= 52) {
        flavor = ' Cold air typically suppresses carry.'
      } else if ((w.temp_f ?? 70) >= 92) {
        flavor = ' Hot conditions can aid carry and fatigue pitchers faster.'
      }
      rows.push({
        id: 'situation-weather',
        section: 'situation',
        line: `${parts.join(' · ')}.${flavor}`.trim(),
        lean: 'neutral',
        leanLabel: 'watch',
        sampleTag: 'gametime conditions',
        weight: 64,
        expand: { kind: 'weather-vector', data: w },
      })
    }
  }

  if (inputs.series && inputs.series.seriesGameNumber != null && inputs.series.seriesTotalGames != null) {
    const parts: string[] = [`Game ${inputs.series.seriesGameNumber} of ${inputs.series.seriesTotalGames}`]
    if (inputs.series.standing) parts.push(inputs.series.standing)
    let dayAfter = ''
    let lean: ScoutLean = 'neutral'
    let leanLabel = 'watch'
    if (inputs.series.awayDayAfterNight) {
      dayAfter = ` Day-after-night turnaround for ${inputs.awayAbbr} — potential fatigue edge to the home side.`
      lean = 'home'
      leanLabel = `${inputs.homeAbbr} +`
    } else if (inputs.series.homeDayAfterNight) {
      dayAfter = ` Day-after-night turnaround for ${inputs.homeAbbr} — potential fatigue edge to the visitors.`
      lean = 'away'
      leanLabel = `${inputs.awayAbbr} +`
    }
    rows.push({
      id: 'situation-series',
      section: 'situation',
      line: `${parts.join(' · ')}.${dayAfter}`,
      lean,
      leanLabel,
      sampleTag: 'series context',
      weight: 68,
    })
  }

  return rows.sort((a, b) => b.weight - a.weight).slice(0, 4)
}

// ─────────────────────────────────────────────────────────────────────
//  ASSEMBLE
// ─────────────────────────────────────────────────────────────────────

const SECTION_ORDER: ScoutSection[] = ['pitching', 'batting', 'offense', 'bullpen', 'moves', 'situation']

export function buildScoutReport(inputs: ScoutInputs): ScoutReport {
  const pitching = buildPitchingRows(inputs)
  const batting  = buildBattingRows(inputs)
  const bullpen  = buildBullpenRows(inputs)

  const bySection: Record<ScoutSection, ScoutRow[]> = {
    pitching:  [...pitching.awayRows, ...pitching.homeRows],
    batting:   [...batting.awayRows, ...batting.homeRows],
    offense:   [], // absorbed into batting via pad path; kept for type completeness
    bullpen:   [...bullpen.awayRows, ...bullpen.homeRows],
    moves:     buildMoveRows(inputs),
    situation: buildSituationRows(inputs),
  }

  const rows: ScoutRow[] = SECTION_ORDER.flatMap(sec => bySection[sec])
  const actual = rows.length

  // Degraded note reflects target vs delivered per team.
  const shortfalls: string[] = []
  if (pitching.awayRows.length < PER_TEAM_TARGETS.pitching)
    shortfalls.push(`${inputs.awayAbbr} pitching ${pitching.awayRows.length}/${PER_TEAM_TARGETS.pitching}`)
  if (pitching.homeRows.length < PER_TEAM_TARGETS.pitching)
    shortfalls.push(`${inputs.homeAbbr} pitching ${pitching.homeRows.length}/${PER_TEAM_TARGETS.pitching}`)
  if (batting.awayRows.length < PER_TEAM_TARGETS.batting)
    shortfalls.push(`${inputs.awayAbbr} batting ${batting.awayRows.length}/${PER_TEAM_TARGETS.batting}`)
  if (batting.homeRows.length < PER_TEAM_TARGETS.batting)
    shortfalls.push(`${inputs.homeAbbr} batting ${batting.homeRows.length}/${PER_TEAM_TARGETS.batting}`)
  if (bullpen.awayRows.length < PER_TEAM_TARGETS.bullpen)
    shortfalls.push(`${inputs.awayAbbr} bullpen ${bullpen.awayRows.length}/${PER_TEAM_TARGETS.bullpen}`)
  if (bullpen.homeRows.length < PER_TEAM_TARGETS.bullpen)
    shortfalls.push(`${inputs.homeAbbr} bullpen ${bullpen.homeRows.length}/${PER_TEAM_TARGETS.bullpen}`)

  const degradedNote = shortfalls.length > 0 ? shortfalls.join(' · ') : null

  const pickTop = (sec: ScoutSection) =>
    [...bySection[sec]].sort((a, b) => b.weight - a.weight)[0]

  const keyEdges = [...rows]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)

  return {
    rows,
    targetCount: (PER_TEAM_TARGETS.pitching + PER_TEAM_TARGETS.batting + PER_TEAM_TARGETS.bullpen) * 2,
    actualCount: actual,
    bySection,
    degradedNote,
    previewStrip: {
      pitching: pickTop('pitching'),
      batting: pickTop('batting'),
      bullpen: pickTop('bullpen'),
    },
    keyEdges,
  }
}