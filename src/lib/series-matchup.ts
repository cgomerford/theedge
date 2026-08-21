/**
 * src/lib/series-matchup.ts
 *
 * "Top 3 For The Series" — ranks a team's projected lineup against every
 * CONFIRMED opposing starter still left in the current series.
 *
 * Two scoring components, both batter-facing (positive = batter edge):
 *   1. Zone score     — netTilt (pitcher-arsenal.ts), blended across all 9
 *                        zones, BA-against + whiff% vs the batter's hot zones.
 *                        Per-zone breakdown is exposed, not just the total.
 *   2. Pitch-type fit — batter's AVG against each pitch TYPE the pitcher
 *                        throws, VELOCITY-MATCHED to that specific pitcher
 *                        (his avg velo on that pitch, ±1mph), weighted by
 *                        usage, with extra weight on his put-away pitch.
 *
 * Career H2H (getBatterVsPitcher) is fetched and exposed IN FULL, but is
 * NOT part of series_score — 3-10 career AB is too noisy to rank on.
 * Shown as context only, never blended into the score or headline lean.
 *
 * ARCHITECTURE CHANGE from the previous revision: pitch-type fit no longer
 * reads the batter_pitch_type_splits table (which had two problems: no
 * confirmed season filter, and no velocity or zone granularity — just one
 * blended AVG per pitch type across every velocity and location a batter
 * has ever seen that pitch). Instead, we fetch each batter's raw per-pitch
 * Statcast log for the CURRENT season once (same proven CSV fetch/parse
 * pattern already live in /api/hot-zones/route.ts — same URL shape, same
 * field names: pitch_type, release_speed, zone, events) and compute every
 * split — pitch-type, velocity-band, and zone — directly from those rows,
 * on demand, matched to each specific pitcher we're comparing against.
 * One fetch per batter answers all three; no new unverified endpoint.
 *
 * Data sources:
 *   - lineups.ts              → getProjectedLineup (roster proxy)
 *   - pitcher-arsenal.ts      → getPitcherZoneArsenal, netTilt
 *   - hot-zones.ts            → getBatterHotZones
 *   - batter-stats.ts         → getBatterVsPitcher (career H2H, display-only)
 *   - pitch_arsenals table    → pitcher's per-pitch-type usage/velo/put-away%
 *   - Baseball Savant statcast_search/csv → batter's raw per-pitch log
 *     (season-scoped by the season param on the request — this is what
 *     fixes the "career, not season" bug from the previous revision)
 *
 * IMPORTANT (brand rule): series_score / zone_score / pitch_type_fit_score
 * are INTERNAL ranking numbers only. Public UI must translate this into
 * factor-count / plain language — never render the raw score.
 *
 * KNOWN LIMITATION: the raw pitch log is fetched fresh per request
 * (cached 1hr via Next's fetch revalidate). A batter with a very high
 * pitch count this season means a larger CSV to parse — fine at today's
 * scale, worth watching if this feature sees heavy traffic before a
 * proper cached/precomputed table is worth building.
 */

import { createAdminClient } from '@/lib/supabase'
import { cache } from 'react'
import { getProjectedLineup } from '@/lib/lineups'
import {
  getPitcherZoneArsenal,
  netTilt,
  LG_BA,
  type PitcherZoneArsenal,
  type ArsenalPitch,
} from '@/lib/pitcher-arsenal'
import { getBatterHotZones, type BatterHotZones } from '@/lib/hot-zones'
import { getBatterVsPitcher } from '@/lib/batter-stats'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

// Pitch-type fit tuning constants — kept separate and named so these are
// easy to retune once we have real accuracy data to check them against.
const MIN_VELOCITY_BAND_AB = 8       // below this, the velocity-matched split is too thin to trust// mph, either side — widened from 1.0 per George, trades some precision for far fewer "sample too thin" readsconst PUT_AWAY_USAGE_FLOOR_PCT = 5   // pitch must clear this usage% to be eligible as "the" put-away pitch
const PUT_AWAY_MULTIPLIER = 1.5      // extra weight when the batter's weak/strong pitch is the pitcher's out-pitch
const PITCH_TYPE_FIT_WEIGHT = 0.7    // trusted somewhat less than the zone score — smaller samples
const VELOCITY_BAND_TOLERANCE = 3.0  // mph, either side — widened from 1.0 per George, trades some precision for far fewer "sample too thin" reads
const PUT_AWAY_USAGE_FLOOR_PCT = 5   // pitch must clear this usage% to be eligible as "the" put-away pitch

export type SeriesGame = {
  gamePk: number
  gameDate: string          // YYYY-MM-DD
  pitcherId: number | null
  pitcherName: string | null
  confirmed: boolean        // false = TBD — excluded from scoring entirely
}

// Full career H2H line — display-only, never fed into series_score.
export type BatterVsPitcherFull = {
  avg: string
  obp: string
  slg: string
  ops: string
  ab: number
  hits: number
  home_runs: number
  strikeouts: number
}

// Per-zone breakdown for one batter-vs-pitcher matchup — the piece that
// was previously computed internally by batterZoneScore but never
// returned to the caller. Positive tilt = batter edge in that zone.
export type ZoneFitCell = {
  zone: string                  // '1'..'9'
  batter_xwoba: number | null
  pitcher_ba_against: number | null   // blended across pitcher's full arsenal in this zone
  pitcher_whiff_pct: number | null
  pitcher_usage_pct: number | null    // how often the pitcher throws to this zone at all
  tilt: number                        // positive = batter edge, negative = pitcher edge
}

// Per-pitch-type zone breakdown — the piece that was still missing after
// the last pass ("blended across the arsenal, not yet broken out per
// pitch"). Same tilt math as ZoneFitCell, but computed against ONE pitch
// type's zone data instead of blending across the pitcher's whole mix.
export type PitchZoneFitCell = {
  zone: string
  pitcher_ba_against: number | null
  pitcher_whiff_pct: number | null
  pitcher_usage_pct: number | null    // this pitch's usage in this zone, as % of the pitcher's TOTAL pitches
  tilt: number
  // Genuine pitch_type + zone + velocity-band triple filter, from the
  // BATTER's own raw log — see pitchTypeZoneFit's header comment for why
  // this exists separately from pitcher_ba_against (pitcher-wide) and
  // PitchTypeFitLine.velocity_matched_ba (all-zone).
  batter_velocity_matched_ba: number | null
  batter_velocity_matched_ab: number
  batter_velocity_matched_low_sample: boolean
  // Genuine head-to-head: THIS batter vs THIS exact pitcher, this pitch,
  // this zone. Expect near-zero AB most of the time — a batter rarely
  // sees one pitcher's one pitch type in one zone more than a couple
  // times a season. That's honest, not a bug — see UI label.
  batter_vs_this_pitcher_ba: number | null
  batter_vs_this_pitcher_ab: number
}
export type PitchZoneFit = {
  pitch_type: string
  pitch_name: string
  cells: PitchZoneFitCell[]           // 9 cells
}

export type PitchTypeFitLine = {
  pitch_type: string
  pitch_name: string
  pitcher_usage_pct: number | null
  pitcher_avg_velo: number | null
  is_put_away_pitch: boolean

  // Velocity-matched: batter's AVG against this exact pitch type, filtered
  // to pitches within pitcher_avg_velo ± VELOCITY_BAND_TOLERANCE. This is
  // what drives the score.
  velocity_matched_ba: number | null
  velocity_matched_ab: number       // denominator BA is actually computed from — compare directly against Savant's "AB" column
  velocity_matched_pa: number       // includes walks/HBP — NOT the BA denominator, shown for context only
  velocity_matched_low_sample: boolean   // ab < MIN_VELOCITY_BAND_PA — faded, excluded from score
  velocity_band_min: number | null       // for display: "at 96-98mph"
  velocity_band_max: number | null

  // Season-wide fallback context: batter's AVG against this pitch type at
  // ANY velocity this season. Shown alongside the velocity-matched number
  // for comparison, never used in scoring.
  season_ba: number | null
  season_ab: number
  season_pa: number
}

export type Top3BatterPitcherLine = {
  gamePk: number
  game_date: string
  pitcher_id: number
  pitcher_name: string
  zone_score: number                            // internal — positive = batter edge
  zone_fit: ZoneFitCell[]                        // per-zone breakdown, 9 cells, blended across full arsenal
  pitch_zone_fit: PitchZoneFit[]                 // per-pitch-type zone breakdown — one 9-cell grid per pitch
  pitch_type_fit_score: number                  // internal — positive = batter edge
  pitch_type_fit: PitchTypeFitLine[]
  h2h: BatterVsPitcherFull | null                // display-only, any sample size shown as-is
}

export type Top3Batter = {
  player_id: number
  player_name: string
  bat_side: string | null
  series_score: number                        // internal only, never render raw
  games_used: number
  per_pitcher: Top3BatterPitcherLine[]
}

export type SeriesTop3Result = {
  batters: Top3Batter[]                       // top 3, ranked descending
  series_games: SeriesGame[]                  // ALL games found (confirmed + TBD)
  confirmed_games_count: number
  lineup_source: 'confirmed' | 'projected_from_previous_game' | 'unavailable'
}

// ─── Series game discovery (forward-looking) ─────────────────────────────────

/**
 * Finds the remaining games in the current series between two teams —
 * today through +6 days (same schedule + hydrate=probablePitcher pattern
 * used in fantasy-two-start.ts / fantasy-ticker.ts) — filtered to games
 * that are exactly this matchup. Games without an announced probable
 * pitcher come back with confirmed: false and are excluded from scoring
 * upstream, never guessed at.
 */
export async function getSeriesGames(
  teamId: number,
  opposingTeamId: number,
): Promise<SeriesGame[]> {
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 6)

  const startStr = today.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  const url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${startStr}&endDate=${endStr}&hydrate=probablePitcher,team`

  let rawGames: any[] = []
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    for (const d of data.dates ?? []) {
      for (const g of d.games ?? []) rawGames.push(g)
    }
  } catch (e) {
    console.error('series-matchup: schedule fetch failed', e)
    return []
  }

  const result: SeriesGame[] = []

  for (const g of rawGames) {
    const homeId = g.teams?.home?.team?.id
    const awayId = g.teams?.away?.team?.id
    if (!homeId || !awayId) continue

    const teams = [homeId, awayId]
    if (!teams.includes(teamId) || !teams.includes(opposingTeamId)) continue

    const opposingIsHome = homeId === opposingTeamId
    const opposingSide = opposingIsHome ? g.teams?.home : g.teams?.away
    const probable = opposingSide?.probablePitcher

    result.push({
      gamePk: g.gamePk,
      gameDate: g.officialDate ?? (g.gameDate ?? '').split('T')[0],
      pitcherId: probable?.id ?? null,
      pitcherName: probable?.fullName ?? null,
      confirmed: !!probable?.id,
    })
  }

  result.sort((a, b) => a.gameDate.localeCompare(b.gameDate))
  return result
}


// Statcast's zone convention: 1-9 are the actual strike zone (3x3 grid).
// 11-14 are the four "chase" corners just outside it — up-in, up-away,
// down-in, down-away. Put-away sliders/curveballs often live out here,
// not in the 9-zone grid, so leaving these out means the model never sees
// a pitcher's actual chase weapon. NOTE: this only produces real data if
// pitcher_zone_arsenal / batter_hot_zones already store rows for these
// zones — if the Python aggregation scripts filter raw Statcast zone
// values down to 1-9 before writing to the DB, these will come back
// empty until that's fixed upstream. Worth confirming before trusting
// this in production.
export const ALL_ZONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14']

// ─── Zone-tilt scoring: one batter vs one pitcher's full arsenal ─────────────

/**
 * Computes netTilt for all 9 zones for a batter vs a pitcher's blended
 * arsenal — BA-against, whiff%, and pitch count summed across every pitch
 * type in that zone, weighted by usage. Returns BOTH the summed total
 * (drives the score) and the per-zone breakdown (drives the UI — this is
 * the "where is the zone data" gap from earlier, now exposed).
 *
 * netTilt's convention is pitcher-positive. This feature is batter-facing,
 * so the sign is flipped everywhere here: positive = BATTER has the edge.
 */
export function batterZoneFit(
  batterZones: BatterHotZones | undefined,
  arsenal: PitcherZoneArsenal | undefined,
): { total: number; cells: ZoneFitCell[] } {
  if (!batterZones || !arsenal) return { total: 0, cells: [] }

  let total = 0
  const cells: ZoneFitCell[] = []

  for (const zone of ALL_ZONES) {
    const hitterXwoba = batterZones.zones[zone]?.xwoba ?? null

    let baSum = 0
    let whiffSum = 0
    let whiffSwingSum = 0
    let pitchSum = 0
    for (const pitch of Object.values(arsenal.arsenal) as ArsenalPitch[]) {
      const cell = pitch.zones[zone]
      if (!cell) continue
      const w = cell.pitches
      if (typeof cell.ba_against === 'number') baSum += cell.ba_against * w
      if (typeof cell.whiff_pct === 'number' && cell.swings > 0) {
        whiffSum += cell.whiff_pct * cell.swings
        whiffSwingSum += cell.swings
      }
      pitchSum += w
    }
    const blendedBa = pitchSum > 0 ? baSum / pitchSum : null
    const blendedWhiff = whiffSwingSum > 0 ? whiffSum / whiffSwingSum : null
    const usagePct = arsenal.total_pitches > 0 ? (pitchSum / arsenal.total_pitches) * 100 : 0

    const tilt = -netTilt(hitterXwoba, blendedBa, usagePct, blendedWhiff)
    total += tilt

    cells.push({
      zone,
      batter_xwoba: hitterXwoba,
      pitcher_ba_against: blendedBa,
      pitcher_whiff_pct: blendedWhiff,
      pitcher_usage_pct: Math.round(usagePct * 10) / 10,
      tilt: Math.round(tilt * 100) / 100,
    })
  }

  return { total: Math.round(total * 100) / 100, cells }
}

/**
 * Per-pitch-type zone breakdown — same netTilt math as batterZoneFit, but
 * computed separately for each pitch the pitcher throws instead of
 * blending across his whole arsenal. Answers "where does HIS SLIDER
 * specifically attack this batter" rather than "where does he attack this
 * batter on average across everything he throws."
 *
 * pitcher_usage_pct here is this ONE pitch's share of the pitcher's total
 * pitches in this zone — not the pitch's overall usage rate — so it's
 * directly comparable to ZoneFitCell.pitcher_usage_pct.
 */
// replace:
/**
 * George's Savant cross-check (Aug 2026) found the zone drill-down's
 * "±2mph" number didn't match a genuinely zone-filtered Savant search —
 * because it WASN'T zone-filtered. It was PitchTypeFitLine's all-zone
 * velocity-matched BA, displayed next to a real zone-specific number as
 * if both answered the same question. This function now computes a real
 * pitch_type + zone + velocity-band triple filter from the batter's OWN
 * raw log, so pitcher_ba_against (pitcher-wide, zone-specific) and
 * batter_velocity_matched_ba (this batter, zone-specific, velocity-
 * matched) are both honestly what they claim to be. Expect most cells to
 * come back low-sample — that's correct at this level of filtering, not
 * a bug (matches what Savant's own equivalent search shows: tiny,
 * extreme-fraction samples once you slice this granularly).
 *
 * KEY-MATCHING CAVEAT: pitcherPitchTypeArsenal's pitch_type codes (from
 * the pitch_arsenals table) must match arsenal.arsenal's keys (from
 * PitcherZoneArsenal, a separate table via pitcher-arsenal.ts) for the
 * velocity lookup to work. If they don't match for a given pitch, that
 * cell's batter_velocity_matched fields come back null rather than
 * silently falling back to an unfiltered number — never fabricate.
 */
export function pitchTypeZoneFit(
  batterZones: BatterHotZones | undefined,
  arsenal: PitcherZoneArsenal | undefined,
  pitcherPitchTypeArsenal: PitcherPitchTypeArsenal[],
  batterRawLog: RawPitchRow[] | null,
  pitcherId: number,
): PitchZoneFit[] {
  if (!batterZones || !arsenal) return []

  const results: PitchZoneFit[] = []

  for (const [pitchKey, pitch] of Object.entries(arsenal.arsenal) as [string, ArsenalPitch][]) {
    const velo = pitcherPitchTypeArsenal.find((p) => p.pitch_type === pitchKey)?.avg_velocity ?? null
    const bandMin = typeof velo === 'number' ? velo - VELOCITY_BAND_TOLERANCE : null
    const bandMax = typeof velo === 'number' ? velo + VELOCITY_BAND_TOLERANCE : null

    const cells: PitchZoneFitCell[] = []
    for (const zone of ALL_ZONES) {
      const hitterXwoba = batterZones.zones[zone]?.xwoba ?? null
      const cell = pitch.zones[zone]
      const ba = cell?.ba_against ?? null
      const whiff = cell?.whiff_pct ?? null
      const usagePct = arsenal.total_pitches > 0 && cell ? (cell.pitches / arsenal.total_pitches) * 100 : 0

      const tilt = -netTilt(hitterXwoba, ba, usagePct, whiff)

      // Genuine triple filter: this pitch type, this exact zone, this
      // velocity band — from the batter's own raw log, not the
      // pitcher-wide zone-arsenal table used above.
      let batterVelocityMatchedBa: number | null = null
      let batterVelocityMatchedAb = 0
      let batterVelocityMatchedLowSample = true
      if (bandMin != null && bandMax != null && batterRawLog) {
        const matchedRows = batterRawLog.filter(
          (r) => r.pitch_type === pitchKey && r.zone === Number(zone) &&
            typeof r.release_speed === 'number' && r.release_speed >= bandMin! && r.release_speed <= bandMax!,
        )
          const split = computeBaFromRows(matchedRows)
        batterVelocityMatchedBa = split.ba
        batterVelocityMatchedAb = split.ab
        // Per George: at this level of filtering (pitch + zone + velocity
        // band), only flag it when there's literally nothing tracked —
        // don't hide a real n=1 or n=2 behind a "too thin" threshold like
        // the all-zone PitchTypeFitLine.velocity_matched_low_sample does.
        batterVelocityMatchedLowSample = split.ab === 0
      }
  let trueH2hBa: number | null = null
      let trueH2hAb = 0
      if (batterRawLog) {
        const h2hRows = batterRawLog.filter(
          (r) => r.pitch_type === pitchKey && r.zone === Number(zone) && r.pitcher_id === pitcherId,
        )
        const split = computeBaFromRows(h2hRows)
        trueH2hBa = split.ba
        trueH2hAb = split.ab
      }

      cells.push({
        zone,
        pitcher_ba_against: ba,
        pitcher_whiff_pct: whiff,
        pitcher_usage_pct: Math.round(usagePct * 10) / 10,
        tilt: Math.round(tilt * 100) / 100,
        batter_velocity_matched_ba: batterVelocityMatchedBa,
        batter_velocity_matched_ab: batterVelocityMatchedAb,
        batter_velocity_matched_low_sample: batterVelocityMatchedLowSample,
        batter_vs_this_pitcher_ba: trueH2hBa,
        batter_vs_this_pitcher_ab: trueH2hAb,
      })
    }
    results.push({
      pitch_type: pitchKey,
      pitch_name: (pitch as any).pitch_name ?? pitchKey,
      cells,
    })
  }

  results.sort((a, b) => {
    const totalA = a.cells.reduce((s, c) => s + (c.pitcher_usage_pct ?? 0), 0)
    const totalB = b.cells.reduce((s, c) => s + (c.pitcher_usage_pct ?? 0), 0)
    return totalB - totalA
  })

  return results
}

// ─── Batter's raw per-pitch log (Statcast, current season) ──────────────────

export type RawPitchRow = {
  pitch_type: string | null
  release_speed: number | null
  zone: number | null
  events: string | null   // non-null only on the pitch that ended the plate appearance
  pitcher_id: number | null   // the actual opposing pitcher on that pitch — enables true H2H filtering
}
const NON_AB_EVENTS = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'sac_fly_double_play', 'catcher_interf'])
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

/**
 * Fetches a batter's full raw per-pitch log for the CURRENT season from
 * Baseball Savant — same URL shape, headers, and CSV-parsing approach as
 * the already-proven /api/hot-zones/route.ts (which uses this exact
 * endpoint successfully today). Season is explicit in the request, which
 * is what fixes the "showing career, not season" bug from the previous
 * revision of this file.
 *
 * Returns null on fetch/parse failure — callers must treat null as
 * "unavailable," never fall back to a fabricated number.
 */
export const getBatterRawPitchLog = cache(async function getBatterRawPitchLog(batterId: number, season?: number): Promise<RawPitchRow[] | null> {
  const yr = season ?? new Date().getFullYear()
  const url = `https://baseballsavant.mlb.com/statcast_search/csv?player_id=${batterId}&player_type=batter&season=${yr}&type=batter&game_type=R&csv=true`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)',
        'Accept': 'text/csv,*/*',
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null

    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null

     const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/^\ufeff/, '').replace(/^"|"$/g, ''))
    const ptIdx = headers.indexOf('pitch_type')
    const speedIdx = headers.indexOf('release_speed')
    const zoneIdx = headers.indexOf('zone')
    const evtIdx = headers.indexOf('events')
    const pitcherIdx = headers.indexOf('pitcher')
    if (ptIdx === -1 || speedIdx === -1) return null

    const rows: RawPitchRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i])
      const speed = parseFloat(cells[speedIdx])
      const pitcherId = pitcherIdx >= 0 ? parseInt(cells[pitcherIdx]) : NaN
      rows.push({
        pitch_type: cells[ptIdx] || null,
        release_speed: isNaN(speed) ? null : speed,
        zone: zoneIdx >= 0 ? (parseInt(cells[zoneIdx]) || null) : null,
        events: evtIdx >= 0 ? (cells[evtIdx] || null) : null,
        pitcher_id: isNaN(pitcherId) ? null : pitcherId,
      })
    }
    return rows
 } catch (e) {
    console.error('series-matchup: getBatterRawPitchLog failed', e)
    return null
  }
})
/**
 * Computes AVG from a slice of raw pitch rows, using the same simplified
 * AB convention already used app-wide (fetch_pitcher_hot_zones.py counts
 * any row with a non-empty `events` field as an AB) — kept consistent so
 * this number reconciles with other BA-against/BA-for numbers on the site,
 * rather than introducing a subtly different, more "correct" denominator
 * that wouldn't match anything else displayed.
 */
export function computeBaFromRows(rows: RawPitchRow[]): { ba: number | null; ab: number; pa: number } {  let ab = 0
  let hits = 0
  let pa = 0
  for (const r of rows) {
    if (!r.events) continue
    pa++
    if (NON_AB_EVENTS.has(r.events)) continue
    ab++
    if (HIT_EVENTS.has(r.events)) hits++
  }
  return { ba: ab > 0 ? Math.round((hits / ab) * 1000) / 1000 : null, ab, pa }
}

// ─── Pitch-type fit: velocity-matched batter AVG vs this pitcher's mix ───────

export type PitcherPitchTypeArsenal = {
  pitch_type: string
  pitch_name: string | null
  percentage: number | null
  avg_velocity: number | null
  put_away_percent: number | null
}

/**
 * Pitcher's per-pitch-type mix from the pitch_arsenals table — the same
 * table Scout Report already queries on the game page.
 */
export async function getPitcherPitchTypeArsenal(pitcherId: number): Promise<PitcherPitchTypeArsenal[]> {  const supa = createAdminClient()
  const season = new Date().getFullYear()
  const { data, error } = await supa
    .from('pitch_arsenals')
    .select('pitch_type, pitch_name, percentage, avg_velocity, put_away_percent')
    .eq('player_id', pitcherId)
    .eq('season', season)

  if (error || !data) return []
  return data as PitcherPitchTypeArsenal[]
}

/**
 * Scores how well a batter's velocity-matched pitch-type splits line up
 * against a pitcher's arsenal, computed live from the batter's raw pitch
 * log. For each pitch type the pitcher throws:
 *   - Slice the batter's raw log to rows matching that pitch_type AND
 *     release_speed within pitcher_avg_velo ± VELOCITY_BAND_TOLERANCE.
 *   - If that slice has under MIN_VELOCITY_BAND_AB at-bats, fade it — too
 *     thin to trust, excluded from score, still shown marked low_sample
 *     with the season-wide number alongside for context.
 *   - Otherwise, batter's edge (velocity-matched AVG vs league-average) is
 *     weighted by pitch usage%, with PUT_AWAY_MULTIPLIER applied if it's
 *     the pitcher's identified put-away pitch.
 */
export function pitchTypeFitScore(
  pitcherArsenal: PitcherPitchTypeArsenal[],
  batterRawLog: RawPitchRow[] | null,
): { score: number; lines: PitchTypeFitLine[] } {
  if (pitcherArsenal.length === 0) return { score: 0, lines: [] }

  const putAwayCandidates = pitcherArsenal.filter(
    (p) => (p.percentage ?? 0) >= PUT_AWAY_USAGE_FLOOR_PCT && p.put_away_percent != null,
  )
  const putAwayPitch = putAwayCandidates.length > 0
    ? putAwayCandidates.reduce((a, b) => ((b.put_away_percent ?? 0) > (a.put_away_percent ?? 0) ? b : a))
    : null

  let total = 0
  const lines: PitchTypeFitLine[] = []

  for (const pitch of pitcherArsenal) {
    const isPutAway = putAwayPitch?.pitch_type === pitch.pitch_type
    const velo = pitch.avg_velocity

    const allTypeRows = (batterRawLog ?? []).filter((r) => r.pitch_type === pitch.pitch_type)
    const seasonSplit = computeBaFromRows(allTypeRows)

    let velocityMatchedRows: RawPitchRow[] = []
    let bandMin: number | null = null
    let bandMax: number | null = null
    if (typeof velo === 'number') {
      bandMin = velo - VELOCITY_BAND_TOLERANCE
      bandMax = velo + VELOCITY_BAND_TOLERANCE
      velocityMatchedRows = allTypeRows.filter(
        (r) => typeof r.release_speed === 'number' && r.release_speed >= bandMin! && r.release_speed <= bandMax!,
      )
    }
    const velocitySplit = computeBaFromRows(velocityMatchedRows)
    const lowSample = velocitySplit.ab < MIN_VELOCITY_BAND_AB

    lines.push({
      pitch_type: pitch.pitch_type,
      pitch_name: pitch.pitch_name ?? pitch.pitch_type,
      pitcher_usage_pct: pitch.percentage,
      pitcher_avg_velo: velo,
      is_put_away_pitch: isPutAway,
      velocity_matched_ba: velocitySplit.ba,
      velocity_matched_ab: velocitySplit.ab,
      velocity_matched_pa: velocitySplit.pa,
      velocity_matched_low_sample: lowSample,
      velocity_band_min: bandMin,
      velocity_band_max: bandMax,
      season_ba: seasonSplit.ba,
      season_ab: seasonSplit.ab,
      season_pa: seasonSplit.pa,
    })

    if (lowSample || velocitySplit.ba == null) continue

    const usageWeight = (pitch.percentage ?? 0) / 100
    const multiplier = isPutAway ? PUT_AWAY_MULTIPLIER : 1.0
    const batterEdge = (velocitySplit.ba - LG_BA) / LG_BA
    total += batterEdge * usageWeight * multiplier
  }

  return { score: Math.round(total * PITCH_TYPE_FIT_WEIGHT * 100) / 100, lines }
}

// ─── Pitch-by-pitch backtest (for completed series games) ────────────────────

export type PlateAppearanceResult = {
  pitch_type: string | null
  pitch_name: string | null
  velo: number | null
  zone: number | null
  event: string | null         // e.g. "Single", "Strikeout", "Walk", "Groundout"
  is_hit: boolean
  matched_flag: 'put_away_pitch' | 'strong_pitch' | 'weak_pitch' | null
}

/**
 * Cross-references a pitch type against the pre-game pitch_type_fit read —
 * now checking the velocity-matched AVG, matching what actually drives the
 * score, instead of the old season-blended number.
 */
function matchPitchTypeFlag(
  pitchType: string | null,
  pitchTypeFit: PitchTypeFitLine[],
): PlateAppearanceResult['matched_flag'] {
  if (!pitchType) return null
  const line = pitchTypeFit.find((l) => l.pitch_type === pitchType)
  if (!line) return null
  if (line.is_put_away_pitch) return 'put_away_pitch'
  if (line.velocity_matched_low_sample || line.velocity_matched_ba == null) return null
  if (line.velocity_matched_ba >= 0.280) return 'strong_pitch'
  if (line.velocity_matched_ba <= 0.220) return 'weak_pitch'
  return null
}

/**
 * Pulls every plate appearance between a specific batter and pitcher in a
 * specific completed game, via the live game feed's play-by-play data —
 * a genuinely new endpoint for this codebase (nothing else here uses
 * /feed/live), so the field paths below (playEvents[].details.type.code,
 * pitchData.startSpeed, pitchData.zone, result.event) are inferred from
 * MLB's standard GUMBO schema, NOT curl-verified against real data yet.
 * Curl-check this against one known completed game before trusting it.
 *
 * Returns null (not an empty array) if the fetch fails or the game feed
 * isn't structured as expected — empty state over guessing.
 */
export async function getBatterPitchByPitchResult(
  batterId: number,
  pitcherId: number,
  gamePk: number,
  pitchTypeFit: PitchTypeFitLine[],
): Promise<PlateAppearanceResult[] | null> {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`

  try {
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) return null
    const data = await res.json()
    const allPlays = data.liveData?.plays?.allPlays ?? []
    if (!Array.isArray(allPlays)) return null

    const results: PlateAppearanceResult[] = []

    for (const play of allPlays) {
      if (play.matchup?.batter?.id !== batterId) continue
      if (play.matchup?.pitcher?.id !== pitcherId) continue
      if (play.about?.isComplete === false) continue

      const pitchEvents = (play.playEvents ?? []).filter((e: any) => e.isPitch === true)
      const finalPitch = pitchEvents[pitchEvents.length - 1]
      if (!finalPitch) continue

      const pitchType = finalPitch.details?.type?.code ?? null
      const pitchName = finalPitch.details?.type?.description ?? null
      const velo = typeof finalPitch.pitchData?.startSpeed === 'number' ? finalPitch.pitchData.startSpeed : null
      const zone = typeof finalPitch.pitchData?.zone === 'number' ? finalPitch.pitchData.zone : null
      const event = play.result?.event ?? null
      const isHit = ['Single', 'Double', 'Triple', 'Home Run'].includes(event ?? '')

      results.push({
        pitch_type: pitchType,
        pitch_name: pitchName,
        velo,
        zone,
        event,
        is_hit: isHit,
        matched_flag: matchPitchTypeFlag(pitchType, pitchTypeFit),
      })
    }

    return results
  } catch (e) {
    console.error('series-matchup: getBatterPitchByPitchResult failed', e)
    return null
  }
}

// ─── Actual recorded stats (for completed series games) ──────────────────────

export type BatterGameResult = {
  gamePk: number
  ab: number
  hits: number
  home_runs: number
  rbi: number
  walks: number
  strikeouts: number
} | null // null = game not final yet, or no data found — never fabricated

/**
 * Looks up what a batter actually recorded in a specific game, via the same
 * gameLog endpoint pattern getPitcherRecentStarts uses (mlb.ts), filtered
 * to this gamePk. Returns null (not a zeroed stat line) if the game hasn't
 * gone final or the player didn't appear — empty state over fabricated data.
 */
export async function getBatterGameResult(
  playerId: number,
  gamePk: number,
  gameDate: string,
): Promise<BatterGameResult> {
  const season = new Date(gameDate).getFullYear()
  const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${season}`

  try {
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) return null
    const data = await res.json()
    const splits = data.stats?.[0]?.splits ?? []
    const match = splits.find((s: any) => s.game?.gamePk === gamePk)
    if (!match) return null

    const stat = match.stat ?? {}
    return {
      gamePk,
      ab: parseInt(stat.atBats ?? '0'),
      hits: parseInt(stat.hits ?? '0'),
      home_runs: parseInt(stat.homeRuns ?? '0'),
      rbi: parseInt(stat.rbi ?? '0'),
      walks: parseInt(stat.baseOnBalls ?? '0'),
      strikeouts: parseInt(stat.strikeOuts ?? '0'),
    }
  } catch (e) {
    console.error('series-matchup: getBatterGameResult failed', e)
    return null
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Ranks a team's projected lineup against every CONFIRMED starter left in
 * the series vs opposingTeamId. Each confirmed game contributes one score
 * per batter — zone score + velocity-matched pitch-type fit score (H2H is
 * fetched and attached in full but does NOT feed the score). A batter's
 * series_score is the average across confirmed games. Top 3.
 *
 * Empty state over thin data: if the lineup or every remaining starter is
 * still TBD, returns an empty batters array with series_games populated so
 * the UI can show an honest "waiting on confirmed starters" state.
 */
export async function getSeriesTop3(
  teamId: number,
  opposingTeamId: number,
  gameDate: string,
  currentGamePk?: number,
): Promise<SeriesTop3Result> {
  const [lineup, seriesGames] = await Promise.all([
    getProjectedLineup(teamId, gameDate, currentGamePk),
    getSeriesGames(teamId, opposingTeamId),
  ])

  const confirmedGames = seriesGames.filter((g) => g.confirmed && g.pitcherId)
  const uniquePitcherIds = Array.from(new Set(confirmedGames.map((g) => g.pitcherId as number)))

  if (lineup.batters.length === 0 || confirmedGames.length === 0) {
    return {
      batters: [],
      series_games: seriesGames,
      confirmed_games_count: confirmedGames.length,
      lineup_source: lineup.source,
    }
  }

  // Fetch each confirmed starter's zone arsenal + pitch-type arsenal once,
  // shared across every batter.
  const zoneArsenalByPitcher = new Map<number, PitcherZoneArsenal | undefined>()
  const pitchTypeArsenalByPitcher = new Map<number, PitcherPitchTypeArsenal[]>()
  await Promise.all(
    uniquePitcherIds.map(async (pid) => {
      const [zoneSplits, pitchTypeArsenal] = await Promise.all([
        getPitcherZoneArsenal(pid),
        getPitcherPitchTypeArsenal(pid),
      ])
      zoneArsenalByPitcher.set(pid, zoneSplits['all'])
      pitchTypeArsenalByPitcher.set(pid, pitchTypeArsenal)
    }),
  )

  const scored = await Promise.all(
    lineup.batters.map(async (batter): Promise<Top3Batter | null> => {
      // One raw pitch log fetch per batter, reused across every confirmed
      // pitcher below — not re-fetched per pitcher.
      const [hotZoneSplits, batterRawLog] = await Promise.all([
        getBatterHotZones(batter.player_id),
        getBatterRawPitchLog(batter.player_id),
      ])
      const batterZones = hotZoneSplits['all']

      const perGame = await Promise.all(
        confirmedGames.map(async (g) => {
          const pid = g.pitcherId as number
          const { total: zoneScore, cells: zoneFit } = batterZoneFit(batterZones, zoneArsenalByPitcher.get(pid))
          const pitchZoneFit = pitchTypeZoneFit(batterZones, zoneArsenalByPitcher.get(pid), pitchTypeArsenalByPitcher.get(pid) ?? [], batterRawLog, pid)          
          const { score: pitchTypeScore, lines: pitchTypeLines } = pitchTypeFitScore(
            pitchTypeArsenalByPitcher.get(pid) ?? [],
            batterRawLog,
          )

          // Career H2H — full line, display-only.
          let h2h: BatterVsPitcherFull | null = null
          const h2hData = await getBatterVsPitcher(batter.player_id, pid)
          if (h2hData && h2hData.ab > 0) {
            h2h = {
              avg: h2hData.avg,
              obp: h2hData.obp,
              slg: h2hData.slg,
              ops: h2hData.ops,
              ab: h2hData.ab,
              hits: h2hData.hits,
              home_runs: h2hData.home_runs,
              strikeouts: h2hData.strikeouts,
            }
          }

          const blended = zoneScore + pitchTypeScore

          return {
            line: {
              gamePk: g.gamePk,
              game_date: g.gameDate,
              pitcher_id: pid,
              pitcher_name: g.pitcherName ?? 'TBD',
              zone_score: zoneScore,
              zone_fit: zoneFit,
              pitch_zone_fit: pitchZoneFit,
              pitch_type_fit_score: pitchTypeScore,
              pitch_type_fit: pitchTypeLines,
              h2h,
            } as Top3BatterPitcherLine,
            blended,
          }
        }),
      )

      if (perGame.length === 0) return null

      const scoreSum = perGame.reduce((s, p) => s + p.blended, 0)

      return {
        player_id: batter.player_id,
        player_name: batter.player_name,
        bat_side: (batter as any).bat_side ?? null,
        series_score: Math.round((scoreSum / perGame.length) * 100) / 100,
        games_used: perGame.length,
        per_pitcher: perGame.map((p) => p.line),
      }
    }),
  )

  const batters = scored.filter((b): b is Top3Batter => b !== null)
  batters.sort((a, b) => b.series_score - a.series_score)

  return {
    batters: batters.slice(0, 3),
    series_games: seriesGames,
    confirmed_games_count: confirmedGames.length,
    lineup_source: lineup.source,
  }
}


// ─── Career-vs-pitch-type split (on-demand, NOT part of the main scoring
// loop) ─────────────────────────────────────────────────────────────────

// "Career" here means a rolling 3-season window (current + 2 prior), not
// full MLB history — a genuine scoping decision, not a data limitation.
// Full career would mean an unbounded number of season-CSV fetches per
// batter; 3 seasons is a defensible proxy and keeps this cheap enough to
// fetch on-demand (only when a user opens a pitch's detail, not on every
// page load for every batter × every pitch type).
const CAREER_SEASONS_LOOKBACK = 3

export type CareerPitchTypeSplit = {
  pitch_type: string
  career_ba: number | null
  career_ab: number
  seasons_included: number[]
}

export async function getBatterCareerPitchTypeSplit(
  batterId: number,
  pitchType: string,
): Promise<CareerPitchTypeSplit> {
  const currentYear = new Date().getFullYear()
  const seasons = Array.from({ length: CAREER_SEASONS_LOOKBACK }, (_, i) => currentYear - i)

  const logs = await Promise.all(seasons.map((s) => getBatterRawPitchLog(batterId, s)))
  const rows = logs.flatMap((log) => (log ?? []).filter((r) => r.pitch_type === pitchType))
  const { ba, ab } = computeBaFromRows(rows)

  return { pitch_type: pitchType, career_ba: ba, career_ab: ab, seasons_included: seasons }
}
