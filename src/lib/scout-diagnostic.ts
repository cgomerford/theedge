// src/lib/scout-diagnostic.ts
//
// Diagnostic utility for the Scout report data pipeline.
//
// Purpose: when a pitch shows values that don't match Baseball Savant's website,
// this function dumps the raw CSV row alongside the mapped `ArsenalPitch` so you
// can see exactly where a value drifted (wrong player_id → wrong arsenal, missing
// header → null pass-through, unit mismatch, etc.).
//
// Usage (server-side, ad-hoc):
//
//   import { diagnosePitcher } from '@/lib/scout-diagnostic'
//   const report = await diagnosePitcher(694973, 2026) // Zack Wheeler
//   console.log(JSON.stringify(report, null, 2))
//
// The function makes NO caching assumptions — it fetches Savant fresh each call
// so you're guaranteed to see what's coming down the wire right now.

import type { ArsenalPitch, PitcherForScout } from '@/lib/scout'
import { normPct } from '@/lib/scout'
import { fetchSavantArsenalStats, savantRowToArsenalPitch } from '@/lib/savant'

// ─── Types ────────────────────────────────────────────────────────────

export type FieldTrace = {
  csvHeader: string        // header we expected in the CSV
  csvRawValue: unknown     // exact value from the parsed CSV row (before any coercion)
  mappedField: string      // which field on ArsenalPitch it lands in
  mappedValue: number | null
  afterNormPct: number | null  // what scout.ts sees after normPct
  suspicion: string | null  // null if healthy; otherwise a short reason
}

export type PitchDiagnostic = {
  pitch_type: string
  pitch_name: string
  usage_pct_raw_csv: number | null       // what the CSV said before we touched it
  usage_pct_mapped: number | null        // what ArsenalPitch.percentage holds
  fields: FieldTrace[]
  /** Any values that look suspicious (out of expected ranges). */
  warnings: string[]
}

export type PitcherDiagnostic = {
  requestedPlayerId: number
  requestedYear: number
  csvRowCount: number
  arsenalPitchCount: number
  identityCheck: {
    playerIdMatches: boolean
    playerNameFromCsv: string | null
    warning: string | null
  }
  pitches: PitchDiagnostic[]
  /**
   * Bug candidates ordered by likelihood. If this list is empty, the data
   * pipeline looks healthy — the bug is elsewhere (LLM prompt, UI formatting,
   * threshold logic in scout.ts).
   */
  bugCandidates: string[]
}

// ─── Field map: CSV header → ArsenalPitch field ──────────────────────
//
// Kept as data (not code) so you can inspect it. If the CSV headers change,
// you edit this map, not the diagnostic logic.
const FIELD_MAP: Array<{
  csvHeader: string
  mappedField: keyof ArsenalPitch
  expectedRange: [number, number] | null   // for the mapped value
  isPercent: boolean                        // true → run through normPct
}> = [
  { csvHeader: 'pitch_usage',       mappedField: 'percentage',        expectedRange: [0, 100],   isPercent: true  },
  { csvHeader: 'avg_speed',         mappedField: 'avg_velocity',      expectedRange: [65, 105],  isPercent: false },
  { csvHeader: 'whiff_percent',     mappedField: 'whiff_percent',     expectedRange: [0, 60],    isPercent: true  },
  { csvHeader: 'put_away',          mappedField: 'put_away_percent',  expectedRange: [0, 60],    isPercent: true  },
  { csvHeader: 'est_woba',          mappedField: 'est_woba',          expectedRange: [0.100, 0.500], isPercent: false },
  { csvHeader: 'hard_hit_percent',  mappedField: 'hard_hit_percent',  expectedRange: [0, 65],    isPercent: true  },
  { csvHeader: 'ba',                mappedField: 'ba_against',        expectedRange: [0.100, 0.500], isPercent: false },
]

function looksSuspicious(
  raw: unknown,
  mapped: number | null,
  expected: [number, number] | null,
  isPercent: boolean,
): string | null {
  if (raw == null || raw === '') return 'CSV value is empty — header may have changed or Savant returned no data'
  if (mapped == null) return 'Value became null after mapping — coercion failed'
  if (!expected) return null
  const [lo, hi] = expected
  if (mapped < lo || mapped > hi) {
    // Common case: percent value stored as decimal (e.g. 0.166 where we want 16.6)
    if (isPercent && mapped >= 0 && mapped <= 1 && lo >= 5) {
      return `Value ${mapped} looks like a decimal but expected whole-number percent (${lo}–${hi}). Likely a normPct() bypass upstream.`
    }
    // Common case: decimal stored as percent (e.g. 28.7 where we want 0.287)
    if (!isPercent && mapped > hi * 10) {
      return `Value ${mapped} is ~100× expected (${lo}–${hi}). Something upstream multiplied a decimal by 100.`
    }
    return `Value ${mapped} is outside expected range ${lo}–${hi}`
  }
  return null
}

/**
 * Diagnose a single pitcher's arsenal data.
 *
 * @param playerId  MLBAM player_id (the one Savant uses). If the arsenal you
 *                  see doesn't match this pitcher's real arsenal, you probably
 *                  have the wrong ID — check what's flowing into
 *                  `hydrateMatchupPitchersFromSavant`.
 * @param year      Season year (typically the current MLB season)
 */
export async function diagnosePitcher(
  playerId: number,
  year: number,
): Promise<PitcherDiagnostic> {
  const csvRows = await fetchSavantArsenalStats(playerId, year)

  const bugCandidates: string[] = []

  // Identity check
  const playerNameFromCsv =
    (csvRows[0] as unknown as { player_name?: string } | undefined)?.player_name ?? null
  const csvPlayerId =
    (csvRows[0] as unknown as { player_id?: number | string } | undefined)?.player_id
  const identityMatches = csvPlayerId != null && Number(csvPlayerId) === playerId

  if (csvRows.length === 0) {
    bugCandidates.push(
      `No CSV rows returned for player_id ${playerId}. Likely causes: (1) wrong ID (not MLBAM), (2) Savant endpoint URL changed, (3) player has no pitches in ${year}.`,
    )
  }

  if (!identityMatches && csvRows.length > 0) {
    bugCandidates.push(
      `CSV returned player_id ${csvPlayerId} but you asked for ${playerId}. Savant returned wrong pitcher — check the URL and parameter binding in fetchSavantArsenalStats.`,
    )
  }

  const pitches: PitchDiagnostic[] = csvRows.map(csvRow => {
    const arsenalPitch = savantRowToArsenalPitch(csvRow as any)

    const fields: FieldTrace[] = FIELD_MAP.map(fm => {
      const csvRawValue = (csvRow as Record<string, unknown>)[fm.csvHeader] ?? null
      const mappedValue = (arsenalPitch as unknown as Record<string, number | null>)[fm.mappedField as string] ?? null
      const afterNormPct = fm.isPercent ? normPct(mappedValue) : mappedValue
      const suspicion = looksSuspicious(csvRawValue, mappedValue, fm.expectedRange, fm.isPercent)
      return {
        csvHeader: fm.csvHeader,
        csvRawValue,
        mappedField: fm.mappedField as string,
        mappedValue,
        afterNormPct,
        suspicion,
      }
    })

    const warnings: string[] = fields
      .filter(f => f.suspicion)
      .map(f => `${f.mappedField}: ${f.suspicion}`)

    return {
      pitch_type: arsenalPitch.pitch_type,
      pitch_name: arsenalPitch.pitch_name,
      usage_pct_raw_csv: (csvRow as Record<string, unknown>).pitch_usage as number | null,
      usage_pct_mapped: arsenalPitch.percentage,
      fields,
      warnings,
    }
  })

  // Global bug candidates surfaced from per-pitch warnings
  const nullUsageCount = pitches.filter(p => p.usage_pct_mapped == null).length
  if (nullUsageCount > 0 && nullUsageCount === pitches.length) {
    bugCandidates.push(
      `All ${pitches.length} pitches have null usage. The CSV column "pitch_usage" may have been renamed by Savant. Check the CSV headers in the browser Network tab and update FIELD_MAP.`,
    )
  }

  const decimalPercents = pitches.flatMap(p =>
    p.fields.filter(f => {
      const isPct = FIELD_MAP.find(m => m.csvHeader === f.csvHeader)?.isPercent
      return isPct && f.mappedValue != null && f.mappedValue > 0 && f.mappedValue <= 1
    }).map(f => `${p.pitch_name} · ${f.mappedField} = ${f.mappedValue}`),
  )
  if (decimalPercents.length > 0) {
    bugCandidates.push(
      `${decimalPercents.length} percent field(s) look like decimals (0-1 range). normPct() would correct these downstream, but if a caller reads the raw ArsenalPitch value it will look "100× too small". Fields: ${decimalPercents.slice(0, 5).join(', ')}${decimalPercents.length > 5 ? ` … +${decimalPercents.length - 5} more` : ''}`,
    )
  }

  const oversizedWoba = pitches.flatMap(p =>
    p.fields.filter(f => f.mappedField === 'est_woba' && f.mappedValue != null && f.mappedValue > 1)
      .map(f => `${p.pitch_name} · est_woba = ${f.mappedValue}`),
  )
  if (oversizedWoba.length > 0) {
    bugCandidates.push(
      `est_woba > 1 detected — should be a decimal like 0.287. Something multiplied it by 100. Fields: ${oversizedWoba.join(', ')}`,
    )
  }

  return {
    requestedPlayerId: playerId,
    requestedYear: year,
    csvRowCount: csvRows.length,
    arsenalPitchCount: pitches.length,
    identityCheck: {
      playerIdMatches: identityMatches,
      playerNameFromCsv,
      warning: identityMatches
        ? null
        : csvPlayerId == null
          ? 'CSV row has no player_id field — cannot verify identity'
          : `CSV returned different player_id (${csvPlayerId}) than requested (${playerId})`,
    },
    pitches,
    bugCandidates,
  }
}

/**
 * Even smaller helper: given a fully-hydrated `PitcherForScout`, compare its
 * arsenal against a fresh Savant fetch and report any drift. Useful when the
 * bug is upstream of savant.ts — e.g. a stale in-memory object that never
 * got refreshed, or a caller that passes a hand-constructed pitcher for tests.
 */
export async function diagnoseHydratedPitcher(
  pitcher: PitcherForScout,
  year: number,
): Promise<{
  pitcherName: string
  requestedPlayerId: number | null
  drift: Array<{
    pitch_type: string
    field: keyof ArsenalPitch
    inHydrated: number | null
    inFreshFetch: number | null
    delta: number | null
  }>
  missingInHydrated: string[]
  extraInHydrated: string[]
}> {
  if (pitcher.player_id == null) {
    return {
      pitcherName: pitcher.player_name,
      requestedPlayerId: null,
      drift: [],
      missingInHydrated: ['pitcher has no player_id — cannot compare against Savant'],
      extraInHydrated: [],
    }
  }

  const freshCsv = await fetchSavantArsenalStats(pitcher.player_id, year)
  const freshArsenal = freshCsv.map(r => savantRowToArsenalPitch(r as any))

  const drift: Array<{
    pitch_type: string
    field: keyof ArsenalPitch
    inHydrated: number | null
    inFreshFetch: number | null
    delta: number | null
  }> = []

  const hydratedByType = new Map(pitcher.arsenal.map(p => [p.pitch_type, p]))
  const freshByType = new Map(freshArsenal.map(p => [p.pitch_type, p]))

  const fieldsToCompare: (keyof ArsenalPitch)[] = [
    'percentage', 'avg_velocity', 'whiff_percent', 'put_away_percent',
    'est_woba', 'hard_hit_percent', 'ba_against',
  ]

  for (const [type, freshPitch] of freshByType) {
    const hydrated = hydratedByType.get(type)
    if (!hydrated) continue
    for (const f of fieldsToCompare) {
      const a = hydrated[f] as number | null
      const b = freshPitch[f] as number | null
      if (a == null && b == null) continue
      if (a == null || b == null || Math.abs(a - b) > 0.01) {
        drift.push({
          pitch_type: type,
          field: f,
          inHydrated: a,
          inFreshFetch: b,
          delta: a != null && b != null ? Number((a - b).toFixed(4)) : null,
        })
      }
    }
  }

  const missingInHydrated = [...freshByType.keys()].filter(k => !hydratedByType.has(k))
  const extraInHydrated = [...hydratedByType.keys()].filter(k => !freshByType.has(k))

  return {
    pitcherName: pitcher.player_name,
    requestedPlayerId: pitcher.player_id,
    drift,
    missingInHydrated,
    extraInHydrated,
  }
} 