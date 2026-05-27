'use client'

import { useState } from 'react'

// ============================================================
// TYPES
// ============================================================
type EdgeComponents = {
  starting_pitcher: number
  bullpen: number
  offense: number
  defense: number
  matchup: number
  park: number
  weather: number
  rest: number
}

export type EdgeIndicatorProps = {
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: EdgeComponents
  home_team: string
  away_team: string
  components_raw?: any
  home_team_abbr?: string
  away_team_abbr?: string
  updated_at: string
  lineups_confirmed?: boolean
  is_pro?: boolean
  context_tags?: Partial<Record<keyof EdgeComponents, string>>
  llm_summary?: string | null
  llm_narrative?: string | null
  // Pro-only narrative variant
  llm_narrative_pro?: string | null
  // Pro-only structured takeaways
  pro_takeaways?: Array<{ stat: string; text: string; edge: 'home' | 'away' | 'neutral' }> | null
  drilldown?: {
    away_pitcher?: { name: string; era: string; whip: string; k_per_9: string } | null
    home_pitcher?: { name: string; era: string; whip: string; k_per_9: string } | null
    away_form?: {
      last_10_wins: number
      last_10_losses: number
      bullpen_era: number | null
      bullpen_ip_yesterday: number | null
      bullpen_wpa_li?: number | null
      closer_available?: boolean | null
      setup1_available?: boolean | null
      setup2_available?: boolean | null
    } | null
    home_form?: {
      last_10_wins: number
      last_10_losses: number
      bullpen_era: number | null
      bullpen_ip_yesterday: number | null
      bullpen_wpa_li?: number | null
      closer_available?: boolean | null
      setup1_available?: boolean | null
      setup2_available?: boolean | null
    } | null
  }
}

// ============================================================
// COMPONENT ORDER + METADATA
// ============================================================
const COMPONENT_ORDER: (keyof EdgeComponents)[] = [
  'starting_pitcher',
  'bullpen',
  'offense',
  'defense',
  'matchup',
  'park',
  'weather',
  'rest',
]

const COMPONENT_META: Record<
  keyof EdgeComponents,
  { label: string; subtitle: string; weight: string; pro_teaser: string }
> = {
  starting_pitcher: {
    label: 'Starting Pitcher',
    subtitle: 'xFIP- adjusted',
    weight: '25%',
    pro_teaser: 'Pitch arsenal · last 5 starts · hot zone alignment',
  },
  bullpen: {
    label: 'Bullpen',
    subtitle: 'WPA/LI + availability',
    weight: '15%',
    pro_teaser: 'Availability tracker · pitch counts L3 · leverage rankings',
  },
  offense: {
    label: 'Offense',
    subtitle: 'wRC+ last 30 days',
    weight: '12%',
    pro_teaser: 'L30 OPS deltas · hot/cold batters · vs LHP/RHP splits',
  },
  defense: {
    label: 'Defense',
    subtitle: 'OAA + DRS combined',
    weight: '8%',
    pro_teaser: 'DRS leaders · OAA by position · error trends',
  },
  matchup: {
    label: 'Matchup',
    subtitle: 'Pitcher arsenal vs lineup',
    weight: '10%',
    pro_teaser: 'BvP records · vulnerability zones · lineup hot zones',
  },
  park: {
    label: 'Park Factor',
    subtitle: '3-yr HR + run factor',
    weight: '8%',
    pro_teaser: '30-day trends · wind impact · HR factor by handedness',
  },
  weather: {
    label: 'Weather',
    subtitle: 'Wind + temp impact',
    weight: '5%',
    pro_teaser: 'Hour-by-hour · wind direction · dome adjustments',
  },
  rest: {
    label: 'Rest & Travel',
    subtitle: 'Bullpen usage + days rest',
    weight: '3%',
    pro_teaser: 'Travel miles · time zones crossed · L7 days game log',
  },
}

// First two components are visible on free tier
const FREE_COMPONENTS: (keyof EdgeComponents)[] = ['starting_pitcher', 'bullpen']

// ============================================================
// SUMMARY FALLBACK (if no LLM summary)
// ============================================================
function generateSummary(
  components: EdgeComponents,
  confidence: 'strong' | 'moderate' | 'slight' | 'tossup',
  winnerName: string
): string {
  if (confidence === 'tossup') return 'Effectively a coin flip — components cancel out.'

  const tierWord = { strong: 'Significant', moderate: 'Moderate', slight: 'Slight' }[confidence]

  const sorted = COMPONENT_ORDER.map((key) => ({
    key,
    abs: Math.abs(components[key]),
  }))
    .filter((c) => c.abs >= 3)
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 3)

  if (sorted.length === 0) return `${tierWord} edge to ${winnerName}.`

  const labels = sorted.map((c) => COMPONENT_META[c.key].label.toLowerCase())
  if (labels.length === 1) return `${tierWord} statistical advantage on ${labels[0]}.`
  if (labels.length === 2)
    return `${tierWord} statistical advantage across ${labels[0]} and ${labels[1]}.`
  return `${tierWord} statistical advantage across ${labels[0]}, ${labels[1]}, and ${labels[2]}.`
}

// ============================================================
// HELPERS
// ============================================================
function formatTimeAgo(timestamp: string): string {
  const updated = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - updated.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}hr ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function availabilityDot(val: boolean | null | undefined): string {
  if (val === null || val === undefined) return '–'
  return val ? '●' : '○'
}

function fatigueLabel(ip: number | null | undefined): string {
  if (ip === null || ip === undefined) return '–'
  if (ip >= 5) return 'Gassed'
  if (ip >= 3) return 'Taxed'
  if (ip >= 1) return 'Used'
  return 'Fresh'
}

function fatigueColorClass(ip: number | null | undefined): string {
  if (ip === null || ip === undefined) return 'text-[#A3A3A3]'
  if (ip >= 5) return 'text-red-600 font-bold'
  if (ip >= 3) return 'text-orange-500'
  return 'text-green-700'
}

// ============================================================
// MINI BAR — horizontal bar centered at zero
// ============================================================
function ComponentBar({ value }: { value: number }) {
  const absValue = Math.abs(value)
  const isHome = value >= 0
  const barWidthPct = Math.min(50, (absValue / 50) * 50)
  const barColor = absValue >= 15 ? '#FF5722' : absValue >= 5 ? '#FFAA88' : '#D4D4D4'

  return (
    <div className="relative h-6 bg-[#E5E5E5] rounded flex-1">
      {/* Center line */}
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#A3A3A3]/40" />
      {absValue >= 0.5 && (
        <div
          className="absolute top-0 bottom-0 rounded transition-all duration-500 ease-out"
          style={{
            backgroundColor: barColor,
            width: `${barWidthPct}%`,
            left: isHome ? '50%' : `${50 - barWidthPct}%`,
          }}
        />
      )}
    </div>
  )
}

// ============================================================
// FACTOR CARD — one cell in the dropdown grid
// ============================================================
function FactorCard({
  label,
  awayValue,
  homeValue,
  edge,
  awayAbbr,
  homeAbbr,
}: {
  label: string
  awayValue: React.ReactNode
  homeValue: React.ReactNode
  edge?: string
  awayAbbr?: string
  homeAbbr?: string
}) {
  return (
    <div className="bg-white border border-[#1A1A1A]/10 rounded-lg p-3">
      <div className="text-[9px] font-mono uppercase tracking-wider text-[#A3A3A3] mb-2">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs text-[#1A1A1A]">
          {awayAbbr && (
            <span className="text-[9px] font-mono text-[#A3A3A3] mr-1">{awayAbbr}</span>
          )}
          {awayValue}
        </div>
        <div className="text-[10px] font-mono text-[#A3A3A3]">vs</div>
        <div className="text-xs text-[#1A1A1A]">
          {homeValue}
          {homeAbbr && (
            <span className="text-[9px] font-mono text-[#A3A3A3] ml-1">{homeAbbr}</span>
          )}
        </div>
      </div>
      {edge && (
        <div className="text-[9px] font-mono text-[#FF5722] mt-1.5 leading-tight">{edge}</div>
      )}
    </div>
  )
}

// ============================================================
// DROPDOWN CONTENT — per-component factor grids
// ============================================================
function DropdownContent({
  componentKey,
  props,
  homeAbbr,
  awayAbbr,
  isPro,
}: {
  componentKey: keyof EdgeComponents
  props: EdgeIndicatorProps
  homeAbbr: string
  awayAbbr: string
  isPro: boolean
}) {
  const raw = props.components_raw
  const dd = props.drilldown
  const meta = COMPONENT_META[componentKey]

  // Pro teaser shown at bottom of each locked-data section
  const ProTeaser = () => (
    <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-[#FF5722]/5 border border-dashed border-[#FF5722]/25 rounded-md">
      <span className="text-[#FF5722] text-[10px] font-mono">⊕</span>
      <span className="text-[10px] font-mono text-[#FF5722]/70">{meta.pro_teaser}</span>
    </div>
  )

  // ── STARTING PITCHER ──────────────────────────────────────
  if (componentKey === 'starting_pitcher') {
    const ap = dd?.away_pitcher
    const hp = dd?.home_pitcher
    const rawAP = raw?.away_pitcher
    const rawHP = raw?.home_pitcher

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FactorCard
            label="xFIP-"
            awayValue={
              <span className="font-mono font-bold">
                {rawAP?.xfip_minus ?? '–'}
              </span>
            }
            homeValue={
              <span className="font-mono font-bold text-[#FF5722]">
                {rawHP?.xfip_minus ?? '–'}
              </span>
            }
            awayAbbr={awayAbbr}
            homeAbbr={homeAbbr}
            edge={
              rawAP?.xfip_minus && rawHP?.xfip_minus
                ? `${Math.abs(rawAP.xfip_minus - rawHP.xfip_minus).toFixed(0)} pt gap`
                : undefined
            }
          />
          <FactorCard
            label="ERA (season)"
            awayValue={<span className="font-mono font-bold">{ap?.era ?? '–'}</span>}
            homeValue={<span className="font-mono font-bold">{hp?.era ?? '–'}</span>}
          />
          <FactorCard
            label="K/9"
            awayValue={<span className="font-mono font-bold">{ap?.k_per_9 ?? '–'}</span>}
            homeValue={<span className="font-mono font-bold">{hp?.k_per_9 ?? '–'}</span>}
          />
          <FactorCard
            label="WHIP"
            awayValue={<span className="font-mono font-bold">{ap?.whip ?? '–'}</span>}
            homeValue={<span className="font-mono font-bold">{hp?.whip ?? '–'}</span>}
          />
          {(rawAP?.last_3_era !== undefined || rawHP?.last_3_era !== undefined) && (
            <FactorCard
              label="Last 3 starts ERA"
              awayValue={
                <span className="font-mono font-bold">
                  {rawAP?.last_3_era ?? '–'}
                </span>
              }
              homeValue={
                <span className="font-mono font-bold">
                  {rawHP?.last_3_era ?? '–'}
                </span>
              }
            />
          )}
          {(rawAP?.innings_pitched !== undefined || rawHP?.innings_pitched !== undefined) && (
            <FactorCard
              label="IP (season)"
              awayValue={<span className="font-mono font-bold">{rawAP?.innings_pitched ?? '–'}</span>}
              homeValue={<span className="font-mono font-bold">{rawHP?.innings_pitched ?? '–'}</span>}
            />
          )}
        </div>
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // ── BULLPEN ───────────────────────────────────────────────
  if (componentKey === 'bullpen') {
    const af = dd?.away_form
    const hf = dd?.home_form

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FactorCard
            label="Bullpen ERA (L30)"
            awayValue={
              <span className="font-mono font-bold">
                {af?.bullpen_era?.toFixed(2) ?? '–'}
              </span>
            }
            homeValue={
              <span className="font-mono font-bold">
                {hf?.bullpen_era?.toFixed(2) ?? '–'}
              </span>
            }
            awayAbbr={awayAbbr}
            homeAbbr={homeAbbr}
          />
          <FactorCard
            label="IP yesterday"
            awayValue={
              <span className={`font-mono font-bold ${fatigueColorClass(af?.bullpen_ip_yesterday)}`}>
                {af?.bullpen_ip_yesterday !== null && af?.bullpen_ip_yesterday !== undefined
                  ? `${af.bullpen_ip_yesterday} IP`
                  : '–'}
              </span>
            }
            homeValue={
              <span className={`font-mono font-bold ${fatigueColorClass(hf?.bullpen_ip_yesterday)}`}>
                {hf?.bullpen_ip_yesterday !== null && hf?.bullpen_ip_yesterday !== undefined
                  ? `${hf.bullpen_ip_yesterday} IP`
                  : '–'}
              </span>
            }
            edge={
              af?.bullpen_ip_yesterday !== undefined && hf?.bullpen_ip_yesterday !== undefined
                ? `${fatigueLabel(af?.bullpen_ip_yesterday)} vs ${fatigueLabel(hf?.bullpen_ip_yesterday)}`
                : undefined
            }
          />

          {/* Closer availability */}
          {(af?.closer_available !== undefined || hf?.closer_available !== undefined) && (
            <FactorCard
              label="Closer available"
              awayValue={
                <span
                  className={`font-mono font-bold text-base ${
                    af?.closer_available ? 'text-green-700' : 'text-red-500'
                  }`}
                >
                  {availabilityDot(af?.closer_available)}
                </span>
              }
              homeValue={
                <span
                  className={`font-mono font-bold text-base ${
                    hf?.closer_available ? 'text-green-700' : 'text-red-500'
                  }`}
                >
                  {availabilityDot(hf?.closer_available)}
                </span>
              }
            />
          )}

          {/* Setup arm availability */}
          {(af?.setup1_available !== undefined || hf?.setup1_available !== undefined) && (
            <FactorCard
              label="Setup arms"
              awayValue={
                <span className="font-mono text-xs">
                  {availabilityDot(af?.setup1_available)} {availabilityDot(af?.setup2_available)}
                </span>
              }
              homeValue={
                <span className="font-mono text-xs">
                  {availabilityDot(hf?.setup1_available)} {availabilityDot(hf?.setup2_available)}
                </span>
              }
            />
          )}

          {/* WPA/LI */}
          {(af?.bullpen_wpa_li !== undefined || hf?.bullpen_wpa_li !== undefined) && (
            <FactorCard
              label="WPA/LI"
              awayValue={
                <span className="font-mono font-bold">
                  {af?.bullpen_wpa_li?.toFixed(2) ?? '–'}
                </span>
              }
              homeValue={
                <span className="font-mono font-bold">
                  {hf?.bullpen_wpa_li?.toFixed(2) ?? '–'}
                </span>
              }
            />
          )}
        </div>
        <div className="text-[9px] font-mono text-[#A3A3A3] pt-0.5">
          ● Available · ○ Unavailable
        </div>
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // ── OFFENSE ───────────────────────────────────────────────
  if (componentKey === 'offense') {
    const af = dd?.away_form
    const hf = dd?.home_form
    const awayT = raw?.away_team
    const homeT = raw?.home_team

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FactorCard
            label="wRC+ (L30)"
            awayValue={<span className="font-mono font-bold">{awayT?.wrc_plus_l30 ?? '–'}</span>}
            homeValue={<span className="font-mono font-bold">{homeT?.wrc_plus_l30 ?? '–'}</span>}
            awayAbbr={awayAbbr}
            homeAbbr={homeAbbr}
            edge="100 = league avg, higher = better"
          />
          <FactorCard
            label="L10 record"
            awayValue={
              <span className="font-mono font-bold">
                {af ? `${af.last_10_wins}-${af.last_10_losses}` : '–'}
              </span>
            }
            homeValue={
              <span className="font-mono font-bold">
                {hf ? `${hf.last_10_wins}-${hf.last_10_losses}` : '–'}
              </span>
            }
          />
          {(awayT?.runs_per_game_l30 !== undefined || homeT?.runs_per_game_l30 !== undefined) && (
            <FactorCard
              label="R/game (L30)"
              awayValue={<span className="font-mono font-bold">{awayT?.runs_per_game_l30?.toFixed(1) ?? '–'}</span>}
              homeValue={<span className="font-mono font-bold">{homeT?.runs_per_game_l30?.toFixed(1) ?? '–'}</span>}
            />
          )}
          {(awayT?.ops_l30 !== undefined || homeT?.ops_l30 !== undefined) && (
            <FactorCard
              label="OPS (L30)"
              awayValue={<span className="font-mono font-bold">{awayT?.ops_l30?.toFixed(3) ?? '–'}</span>}
              homeValue={<span className="font-mono font-bold">{homeT?.ops_l30?.toFixed(3) ?? '–'}</span>}
            />
          )}
        </div>
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // ── DEFENSE ───────────────────────────────────────────────
  if (componentKey === 'defense') {
    const awayT = raw?.away_team
    const homeT = raw?.home_team

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FactorCard
            label="OAA rank"
            awayValue={<span className="font-mono font-bold">{awayT?.oaa_rank ? `#${awayT.oaa_rank}` : '–'}</span>}
            homeValue={<span className="font-mono font-bold">{homeT?.oaa_rank ? `#${homeT.oaa_rank}` : '–'}</span>}
            awayAbbr={awayAbbr}
            homeAbbr={homeAbbr}
          />
          <FactorCard
            label="DRS (season)"
            awayValue={
              <span className="font-mono font-bold">
                {awayT?.drs !== undefined ? (awayT.drs >= 0 ? `+${awayT.drs}` : `${awayT.drs}`) : '–'}
              </span>
            }
            homeValue={
              <span className="font-mono font-bold">
                {homeT?.drs !== undefined ? (homeT.drs >= 0 ? `+${homeT.drs}` : `${homeT.drs}`) : '–'}
              </span>
            }
          />
        </div>
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // ── MATCHUP ───────────────────────────────────────────────
  if (componentKey === 'matchup') {
    const rawAP = raw?.away_pitcher
    const rawHP = raw?.home_pitcher
    const awayT = raw?.away_team
    const homeT = raw?.home_team

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(rawAP?.primary_pitch_whiff_pct !== undefined || rawHP?.primary_pitch_whiff_pct !== undefined) && (
            <FactorCard
              label="Primary pitch whiff%"
              awayValue={
                <span className="font-mono font-bold">
                  {rawAP?.primary_pitch_whiff_pct !== undefined
                    ? `${(rawAP.primary_pitch_whiff_pct * 100).toFixed(0)}%`
                    : '–'}
                </span>
              }
              homeValue={
                <span className="font-mono font-bold">
                  {rawHP?.primary_pitch_whiff_pct !== undefined
                    ? `${(rawHP.primary_pitch_whiff_pct * 100).toFixed(0)}%`
                    : '–'}
                </span>
              }
              awayAbbr={awayAbbr}
              homeAbbr={homeAbbr}
            />
          )}
          {(awayT?.k_rate_vs_rp !== undefined || homeT?.k_rate_vs_rp !== undefined) && (
            <FactorCard
              label={`Lineup K% vs ${raw?.home_pitcher?.throws === 'L' ? 'LHP' : 'RHP'}`}
              awayValue={
                <span className="font-mono font-bold">
                  {awayT?.k_rate_vs_rp !== undefined
                    ? `${(awayT.k_rate_vs_rp * 100).toFixed(1)}%`
                    : '–'}
                </span>
              }
              homeValue={
                <span className="font-mono font-bold">
                  {homeT?.k_rate_vs_rp !== undefined
                    ? `${(homeT.k_rate_vs_rp * 100).toFixed(1)}%`
                    : '–'}
                </span>
              }
            />
          )}
        </div>
        {/* Always show Pro teaser for matchup — most data is Pro-gated */}
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // ── PARK FACTOR ───────────────────────────────────────────
  if (componentKey === 'park') {
    const park = raw?.park

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FactorCard
            label="HR factor (3yr)"
            awayValue={<span className="font-mono font-bold">{park?.hr_factor?.toFixed(2) ?? '–'}</span>}
            homeValue={<span />}
            edge={
              park?.hr_factor !== undefined
                ? park.hr_factor > 1.05
                  ? 'Hitter-friendly park'
                  : park.hr_factor < 0.95
                  ? 'Pitcher-friendly park'
                  : 'Neutral park'
                : undefined
            }
          />
          <FactorCard
            label="Run factor (3yr)"
            awayValue={<span className="font-mono font-bold">{park?.run_factor?.toFixed(2) ?? '–'}</span>}
            homeValue={<span />}
          />
          <FactorCard
            label="Is dome"
            awayValue={
              <span className="font-mono font-bold">
                {park?.is_dome === true ? 'Yes — weather immune' : 'No — open air'}
              </span>
            }
            homeValue={<span />}
          />
          {park?.factor_rhb !== undefined && (
            <FactorCard
              label="HR factor (RHB)"
              awayValue={<span className="font-mono font-bold">{park.factor_rhb?.toFixed(2) ?? '–'}</span>}
              homeValue={<span />}
            />
          )}
        </div>
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // ── WEATHER ───────────────────────────────────────────────
  if (componentKey === 'weather') {
    const weather = raw?.weather

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FactorCard
            label="Wind"
            awayValue={
              <span className="font-mono font-bold">
                {weather?.wind_speed !== undefined
                  ? `${weather.wind_speed} mph`
                  : '–'}
              </span>
            }
            homeValue={
              <span className="font-mono text-xs text-[#A3A3A3]">
                {weather?.wind_direction ?? ''}
              </span>
            }
          />
          <FactorCard
            label="Temperature"
            awayValue={
              <span className="font-mono font-bold">
                {weather?.temp_f !== undefined
                  ? `${weather.temp_f}°F / ${Math.round((weather.temp_f - 32) * 5 / 9)}°C`
                  : '–'}
              </span>
            }
            homeValue={<span />}
          />
          <FactorCard
            label="Precipitation"
            awayValue={
              <span className="font-mono font-bold">
                {weather?.precip_chance !== undefined
                  ? `${weather.precip_chance}% chance`
                  : '–'}
              </span>
            }
            homeValue={<span />}
          />
          {weather?.humidity !== undefined && (
            <FactorCard
              label="Humidity"
              awayValue={<span className="font-mono font-bold">{weather.humidity}%</span>}
              homeValue={<span />}
            />
          )}
        </div>
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // ── REST & TRAVEL ─────────────────────────────────────────
  if (componentKey === 'rest') {
    const restData = raw?.rest

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FactorCard
            label="Days rest"
            awayValue={
              <span className="font-mono font-bold">
                {restData?.away_days_rest !== undefined ? `${restData.away_days_rest}d` : '–'}
              </span>
            }
            homeValue={
              <span className="font-mono font-bold">
                {restData?.home_days_rest !== undefined ? `${restData.home_days_rest}d` : '–'}
              </span>
            }
            awayAbbr={awayAbbr}
            homeAbbr={homeAbbr}
          />
          <FactorCard
            label="Travel"
            awayValue={
              <span className="font-mono font-bold text-xs">
                {restData?.away_travel_note ?? 'No travel data'}
              </span>
            }
            homeValue={
              <span className="font-mono text-xs text-[#A3A3A3]">
                Home
              </span>
            }
          />
          {(restData?.away_games_l7 !== undefined || restData?.home_games_l7 !== undefined) && (
            <FactorCard
              label="Games (L7 days)"
              awayValue={<span className="font-mono font-bold">{restData?.away_games_l7 ?? '–'}</span>}
              homeValue={<span className="font-mono font-bold">{restData?.home_games_l7 ?? '–'}</span>}
            />
          )}
        </div>
        {!isPro && <ProTeaser />}
      </div>
    )
  }

  // Fallback: shouldn't reach here
  return null
}

// ============================================================
// COMPONENT ROW — one of the 8 factors
// ============================================================
type ComponentRowProps = {
  componentKey: keyof EdgeComponents
  index: number
  value: number
  homeAbbr: string
  awayAbbr: string
  locked: boolean
  proTeaser: string
  edgeIndicatorProps: EdgeIndicatorProps
  isPro: boolean
}

function ComponentRow({
  componentKey,
  index,
  value,
  homeAbbr,
  awayAbbr,
  locked,
  proTeaser,
  edgeIndicatorProps,
  isPro,
}: ComponentRowProps) {
  const [expanded, setExpanded] = useState(false)
  const meta = COMPONENT_META[componentKey]
  const absValue = Math.abs(value)
  const valueColor = absValue >= 5 ? '#FF5722' : '#A3A3A3'
  const displayValue = absValue < 0.5 ? '±0' : `${value >= 0 ? '+' : ''}${Math.round(value)}`

  if (locked) {
    return (
      <div className="group flex items-center gap-3 py-3 opacity-60 cursor-default">
        <div className="w-6 text-[10px] font-mono text-[#FF5722]/40 text-right flex-shrink-0">
          {String(index + 1).padStart(2, '0')}
        </div>
        <div className="w-32 flex-shrink-0">
          <div className="text-sm font-medium text-[#1A1A1A]">{meta.label}</div>
          <div className="text-[9px] font-mono uppercase text-[#A3A3A3] tracking-wider mt-0.5">
            {meta.subtitle}
          </div>
        </div>
        <div className="flex-1 flex items-center gap-2 bg-[#1A1A1A]/5 rounded px-3 py-2 border border-dashed border-[#1A1A1A]/15">
          <svg className="w-3 h-3 text-[#FF5722] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-[10px] font-mono text-[#1A1A1A]/50 italic truncate">{proTeaser}</span>
          <span className="ml-auto flex-shrink-0 text-[9px] font-bold tracking-widest uppercase bg-[#FF5722]/10 text-[#FF5722] px-2 py-0.5 rounded">
            Pro
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-[#1A1A1A]/8 last:border-0">
      {/* Header row — always clickable */}
      <div
        className="flex items-center gap-3 py-3 cursor-pointer hover:bg-[#1A1A1A]/[0.02] rounded transition-colors -mx-1 px-1"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-6 text-[10px] font-mono text-[#FF5722] text-right flex-shrink-0">
          {String(index + 1).padStart(2, '0')}
        </div>
        <div className="w-32 flex-shrink-0">
          <div className="text-sm font-medium text-[#1A1A1A]">{meta.label}</div>
          <div className="text-[9px] font-mono uppercase text-[#A3A3A3] tracking-wider mt-0.5">
            {meta.subtitle}
          </div>
        </div>
        <ComponentBar value={value} />
        <div className="w-10 text-right font-bold text-sm flex-shrink-0" style={{ color: valueColor }}>
          {displayValue}
        </div>
        {/* Chevron */}
        <div className="flex-shrink-0 w-4 h-4 text-[#A3A3A3] flex items-center justify-center">
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 12 12"
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {expanded && (
        <div className="bg-[#F5F1E8] -mx-4 px-4 py-4 border-t border-[#1A1A1A]/8 mb-1">
          <DropdownContent
            componentKey={componentKey}
            props={edgeIndicatorProps}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            isPro={isPro}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================
// TAB TYPE
// ============================================================
type Tab = 'components' | 'read' | 'record'

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function EdgeIndicator(props: EdgeIndicatorProps) {
  const [activeTab, setActiveTab] = useState<Tab>('components')
  const isPro = props.is_pro ?? false

  const winnerName = props.predicted_winner === 'home' ? props.home_team : props.away_team
  const homeAbbr = props.home_team_abbr ?? props.home_team.slice(0, 3).toUpperCase()
  const awayAbbr = props.away_team_abbr ?? props.away_team.slice(0, 3).toUpperCase()
  const winnerAbbr = props.predicted_winner === 'home' ? homeAbbr : awayAbbr

  const summary = props.llm_summary ?? generateSummary(props.components, props.confidence_tier, winnerName)

  // Slider: map -100→+100 to 0%→100%
  const sliderPosition = 50 + props.edge_score / 2
  const sliderPositionClamped = Math.max(2, Math.min(98, sliderPosition))

  const tabs: { key: Tab; label: string }[] = [
    { key: 'components', label: 'Components' },
    { key: 'read', label: 'The Read' },
    { key: 'record', label: 'Track Record' },
  ]

  return (
    <div className="my-6 rounded-lg overflow-hidden border border-[#1A1A1A]/10">
      {/* =====================================================
          HERO PANEL (BLACK)
          ===================================================== */}
      <div className="bg-[#1A1A1A] text-[#FAF8F3] p-6 md:p-8">
        {/* Top label row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-[#FF5722] text-[11px] font-mono font-bold uppercase tracking-widest">
              ⊕ The Edge Indicator · V3
            </span>
          </div>
          <div className="flex items-center gap-3">
            {props.lineups_confirmed ? (
              <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-[#FDE047] border border-[#FDE047]/40 bg-[#FDE047]/10 px-2.5 py-1 rounded">
                ✓ Lineups Confirmed
              </span>
            ) : (
              <span className="text-[9px] font-mono text-[#A3A3A3] tracking-wider uppercase">
                Projected Lineups
              </span>
            )}
          </div>
        </div>

        {/* Matchup + score */}
        <div className="flex items-center justify-between mb-5">
          {/* Away team */}
          <div className="flex-1 text-center">
            <div
              className="text-5xl md:text-6xl font-bold leading-none tracking-tight"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              {awayAbbr}
            </div>
            <div className="text-[10px] font-mono text-[#A3A3A3] tracking-wider mt-1">
              {props.away_team}
            </div>
          </div>

          {/* Score */}
          <div className="text-center px-4">
            <div
              className="text-5xl md:text-6xl font-bold leading-none tracking-tight"
              style={{
                fontFamily: 'Bebas Neue, sans-serif',
                color: '#FDE047',
              }}
            >
              {props.edge_score >= 0 ? '+' : ''}
              {Math.round(props.edge_score)}
            </div>
            <div className="text-[9px] font-mono text-[#A3A3A3] tracking-widest uppercase mt-1">
              {winnerAbbr} edge
            </div>
          </div>

          {/* Home team */}
          <div className="flex-1 text-center">
            <div
              className="text-5xl md:text-6xl font-bold leading-none tracking-tight"
              style={{
                fontFamily: 'Bebas Neue, sans-serif',
                color: props.predicted_winner === 'home' ? '#FDE047' : '#FAF8F3',
              }}
            >
              {homeAbbr}
            </div>
            <div className="text-[10px] font-mono text-[#A3A3A3] tracking-wider mt-1">
              {props.home_team}
            </div>
          </div>
        </div>

        {/* Slider */}
        <div className="mb-4">
          <div className="relative h-1.5 bg-white/10 rounded-full">
            {/* Fill from center toward winner */}
            <div
              className="absolute top-0 bottom-0 bg-[#FF5722] rounded-full"
              style={
                props.predicted_winner === 'home'
                  ? { left: '50%', right: `${100 - sliderPositionClamped}%` }
                  : { left: `${sliderPositionClamped}%`, right: '50%' }
              }
            />
            {/* Marker dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#FDE047] rounded-full shadow"
              style={{ left: `${sliderPositionClamped}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-[#A3A3A3] mt-2 tracking-wider">
            <span>{awayAbbr} edge</span>
            <span>Neutral</span>
            <span>{homeAbbr} edge</span>
          </div>
        </div>

        {/* Summary line */}
        <p
          className="text-sm text-[#FAF8F3]/80 leading-relaxed border-t border-white/10 pt-4"
          style={{ fontFamily: 'Fraunces, serif' }}
        >
          {summary}
        </p>
      </div>

      {/* =====================================================
          TAB BAR
          ===================================================== */}
      <div className="flex bg-[#FAF8F3] border-b border-[#1A1A1A]/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab.key
                ? 'text-[#FF5722] border-b-2 border-[#FF5722] -mb-px'
                : 'text-[#A3A3A3] hover:text-[#1A1A1A]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =====================================================
          TAB: COMPONENTS
          ===================================================== */}
      {activeTab === 'components' && (
        <div className="bg-[#FAF8F3]">
          <div className="px-4 pt-3 pb-1">
            <div className="text-[9px] font-mono uppercase text-[#A3A3A3] tracking-widest mb-3">
              — Eight Components · Click any row to expand factors
            </div>
          </div>

          <div className="px-4">
            {COMPONENT_ORDER.map((key, index) => {
              const isFree = FREE_COMPONENTS.includes(key)
              const showLocked = !isFree && !isPro
              const isFirstLocked = key === COMPONENT_ORDER[FREE_COMPONENTS.length]

              return (
                <div key={key}>
                  {/* Free tier divider */}
                  {isFirstLocked && !isPro && (
                    <div className="flex items-center gap-3 my-4 opacity-80">
                      <div className="flex-1 h-px bg-[#FF5722]/25" />
                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#FF5722]/80 font-bold">
                        ⊕ Free tier ends here
                      </span>
                      <div className="flex-1 h-px bg-[#FF5722]/25" />
                    </div>
                  )}
                  <ComponentRow
                    componentKey={key}
                    index={index}
                    value={props.components[key]}
                    homeAbbr={homeAbbr}
                    awayAbbr={awayAbbr}
                    locked={showLocked}
                    proTeaser={COMPONENT_META[key].pro_teaser}
                    edgeIndicatorProps={props}
                    isPro={isPro}
                  />
                </div>
              )
            })}
          </div>

          {/* Weight legend */}
          <div className="px-4 py-3 border-t border-[#1A1A1A]/8 mt-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {COMPONENT_ORDER.map((key) => (
                <span key={key} className="text-[9px] font-mono text-[#A3A3A3]">
                  {COMPONENT_META[key].label.split(' ')[0]} {COMPONENT_META[key].weight}
                </span>
              ))}
            </div>
          </div>

          {/* Pro upsell (free users) */}
          {!isPro && (
            <div className="mx-4 mb-4 bg-[#1A1A1A] text-[#FAF8F3] rounded-lg p-5">
              <div className="text-[#FDE047] text-[10px] font-mono uppercase tracking-widest mb-2">
                ⊕ Pro Tier · £4/mo · £40/yr · Founding 100
              </div>
              <p className="text-base font-bold mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
                Unlock all 8 components.
              </p>
              <p className="text-xs text-[#FAF8F3]/70 mb-4 leading-relaxed">
                Full smart-friend narrative. All component factors. Bullpen fatigue tracker. Fantasy takeaways.
              </p>
              <a
                href="/pricing"
                className="inline-block bg-[#FDE047] text-[#1A1A1A] font-bold text-xs uppercase tracking-wider px-5 py-2.5 hover:bg-[#FAF8F3] transition-colors"
              >
                Get notified when Pro launches June 1 →
              </a>
            </div>
          )}

          {/* Footer timestamp */}
          <div className="px-4 pb-4 text-[9px] font-mono uppercase text-[#A3A3A3] text-center tracking-wider">
            Updated {formatTimeAgo(props.updated_at)} · Information only · No betting advice
          </div>
        </div>
      )}

      {/* =====================================================
          TAB: THE READ
          ===================================================== */}
      {activeTab === 'read' && (
        <div className="bg-[#FAF8F3]">
          {isPro ? (
            /* PRO: full narrative */
            <div className="p-6 space-y-6">
              <div>
                <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-wider mb-3">
                  — The Read
                </div>
                <p className="text-base text-[#1A1A1A] leading-relaxed" style={{ fontFamily: 'Fraunces, serif' }}>
                  {props.llm_narrative_pro ?? props.llm_narrative}
                </p>
              </div>

              {/* Pro takeaways */}
              {props.pro_takeaways && props.pro_takeaways.length > 0 && (
                <div>
                  <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-wider mb-3">
                    — Pro Takeaways
                  </div>
                  <div className="space-y-2">
                    {props.pro_takeaways.map((t, i) => (
                      <div key={i} className="bg-[#F5F1E8] border border-[#1A1A1A]/8 rounded-lg p-3">
                        <div className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider mb-1">
                          {t.stat}
                        </div>
                        <div className="text-sm text-[#1A1A1A]">{t.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* FREE: teaser + paywall */
            <div className="p-6">
              <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-wider mb-3">
                — The Read · <span className="text-[#1A1A1A]/30">⊕ Pro</span>
              </div>
              {/* Show blurred first sentence if we have the narrative */}
              {props.llm_narrative && (
                <p
                  className="text-sm text-[#1A1A1A]/40 leading-relaxed mb-4 select-none"
                  style={{ fontFamily: 'Fraunces, serif', filter: 'blur(3px)' }}
                >
                  {props.llm_narrative.slice(0, 160)}...
                </p>
              )}
              <div className="bg-[#1A1A1A]/[0.03] border border-dashed border-[#1A1A1A]/15 rounded-lg p-5">
                <p className="text-sm text-[#1A1A1A]/60 mb-3" style={{ fontFamily: 'Fraunces, serif' }}>
                  The full smart-friend analysis — pitching, bullpen, form, and the tactical angle — unlocks with Pro.
                </p>
                <a
                  href="/pricing"
                  className="inline-block bg-[#1A1A1A] text-[#FDE047] font-bold text-xs uppercase tracking-wider px-4 py-2 hover:bg-[#FF5722] hover:text-white transition-colors"
                >
                  See Pro pricing →
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================
          TAB: TRACK RECORD
          ===================================================== */}
      {activeTab === 'record' && (
        <div className="bg-[#FAF8F3] p-6">
          <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-wider mb-4">
            — Track Record
          </div>
          <p className="text-sm text-[#1A1A1A]/60 leading-relaxed" style={{ fontFamily: 'Fraunces, serif' }}>
            Full prediction history with win/loss accuracy is on our public Track Record page. We grade every call and hide nothing.
          </p>
          <a
            href="/track-record"
            className="inline-block mt-4 text-[#FF5722] text-xs font-mono uppercase tracking-wider underline underline-offset-4 hover:text-[#1A1A1A] transition-colors"
          >
            View full track record →
          </a>
        </div>
      )}
    </div>
  )
}
