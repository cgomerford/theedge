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

const COMPONENT_META: Record<keyof EdgeComponents, { label: string; subtitle: string; pro_teaser: string }> = {
  starting_pitcher: { 
    label: 'Starting Pitcher', 
    subtitle: 'XFIP- ADJUSTED',
    pro_teaser: 'Pitch arsenal · last 5 starts · hot zone alignment',
  },
  bullpen: { 
    label: 'Bullpen', 
    subtitle: 'WPA/LI + AVAILABILITY',
    pro_teaser: 'Availability tracker · pitch counts L3 · leverage rankings',
  },
  offense: { 
    label: 'Offense', 
    subtitle: 'WRC+ LAST 30 DAYS',
    pro_teaser: 'L30 OPS deltas · hot/cold batters · vs LHP/RHP splits',
  },
  defense: { 
    label: 'Defense', 
    subtitle: 'OAA + DRS COMBINED',
    pro_teaser: 'DRS leaders · OAA by position · error trends',
  },
  matchup: { 
    label: 'Matchup', 
    subtitle: 'PITCHER ARSENAL VS LINEUP',
    pro_teaser: 'BvP records · vulnerability zones · lineup hot zones',
  },
  park: { 
    label: 'Park Factor', 
    subtitle: '3-YR HR + RUN FACTOR',
    pro_teaser: '30-day trends · wind impact · HR factor by handedness',
  },
  weather: { 
    label: 'Weather', 
    subtitle: 'WIND + TEMP IMPACT',
    pro_teaser: 'Hour-by-hour · wind direction · dome adjustments',
  },
  rest: { 
    label: 'Rest & Travel', 
    subtitle: 'BULLPEN USAGE + DAYS',
    pro_teaser: 'Travel miles · time zones crossed · L7 days game log',
  },
}

// First two components are free, rest are Pro
const FREE_COMPONENTS: (keyof EdgeComponents)[] = ['starting_pitcher', 'bullpen']

// ============================================================
// SUMMARY STATEMENT GENERATOR
// ============================================================
function generateSummary(
  components: EdgeComponents,
  confidence: 'strong' | 'moderate' | 'slight' | 'tossup',
  winnerName: string
): string {
  if (confidence === 'tossup') {
    return 'Effectively a coin flip — components cancel out.'
  }

  const tierWord = {
    strong: 'Significant',
    moderate: 'Moderate',
    slight: 'Slight',
  }[confidence]

  // Find top 2-3 contributing components (absolute value)
  const sorted = COMPONENT_ORDER
    .map(key => ({
      key,
      value: components[key],
      abs: Math.abs(components[key]),
    }))
    .filter(c => c.abs >= 3) // ignore near-zero contributions
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 3)

  if (sorted.length === 0) {
    return `${tierWord} edge to ${winnerName}.`
  }

  const labels = sorted.map(c => COMPONENT_META[c.key].label.toLowerCase())
  
  if (labels.length === 1) {
    return `${tierWord} statistical advantage on ${labels[0]}.`
  }
  if (labels.length === 2) {
    return `${tierWord} statistical advantage across ${labels[0]} and ${labels[1]}.`
  }
  return `${tierWord} statistical advantage across ${labels[0]}, ${labels[1]}, and ${labels[2]}.`
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function EdgeIndicator(props: EdgeIndicatorProps) {
  const isPro = props.is_pro ?? false
  const winnerName = props.predicted_winner === 'home' ? props.home_team : props.away_team
  const homeAbbr = props.home_team_abbr ?? props.home_team.slice(0, 3).toUpperCase()
  const awayAbbr = props.away_team_abbr ?? props.away_team.slice(0, 3).toUpperCase()

  // Overall winner (used in hero panel)
  const winnerAbbr = props.predicted_winner === 'home' ? homeAbbr : awayAbbr
  const loserAbbr = props.predicted_winner === 'home' ? awayAbbr : homeAbbr

  // Use LLM-generated summary if available, otherwise fall back to template
  const summary = props.llm_summary 
    || generateSummary(props.components, props.confidence_tier, winnerName)

  // Position marker on -100 to +100 slider (0% = far left, 100% = far right)
  // Negative = away/left, positive = home/right. Map to mockup direction.
  const sliderPosition = 50 + (props.edge_score / 2) // -100→0%, 0→50%, +100→100%
  const sliderPositionClamped = Math.max(2, Math.min(98, sliderPosition))

  return (
    <div className="my-6">
      {/* ========== HERO PANEL (BLACK) ========== */}
      <div className="bg-[#1A1A1A] text-[#FAF8F3] rounded-t-lg p-6 md:p-8">
        {/* Header label */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-[#FF5722] text-sm font-mono uppercase tracking-wider">⊕</span>
            <span className="text-[#FF5722] text-sm font-mono uppercase tracking-wider font-bold">
              The Edge Indicator · V2
            </span>
          </div>
          <div className="flex items-center gap-3">
            {props.lineups_confirmed ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-[#16A34A]">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Lineups confirmed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-[#A3A3A3]">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Lineups pending
              </span>
            )}
          </div>
        </div>

        {/* Score + Winner */}
        <div className="flex items-start gap-6 mb-6">
          <div
            className="text-7xl md:text-8xl font-bold leading-none"
            style={{ color: '#FDE047', fontFamily: 'Bebas Neue, sans-serif' }}
          >
            {props.edge_score >= 0 ? '+' : ''}{Math.round(Math.abs(props.edge_score))}
          </div>
          <div className="flex-1 pt-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#A3A3A3] mb-1">
              — Edge Favors
            </div>
            {props.confidence_tier === 'tossup' ? (
              <div
                className="text-3xl md:text-4xl font-bold leading-tight"
                style={{ color: '#A3A3A3', fontFamily: 'Bebas Neue, sans-serif' }}
              >
                Even Matchup
              </div>
            ) : (
              <div
                className="text-3xl md:text-4xl font-bold leading-tight"
                style={{ color: '#FDE047', fontFamily: 'Bebas Neue, sans-serif' }}
              >
                {winnerName}
              </div>
            )}
            <div className="text-sm md:text-base italic text-[#FAF8F3]/80 mt-2 leading-snug">
              "{summary}"
            </div>
          </div>
        </div>

        {/* Slider */}
        <div className="mt-8">
          <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider mb-2 text-[#A3A3A3]">
            <span>← Strong {loserAbbr}</span>
            <span>Even</span>
            <span className="text-[#FDE047]">{props.edge_score >= 0 ? '+' : ''}{Math.round(props.edge_score)}</span>
            <span>Strong {winnerAbbr} →</span>
          </div>
          <div className="relative h-2 rounded-full overflow-visible" style={{
            background: 'linear-gradient(90deg, #DC2626 0%, #1A1A1A 50%, #FDE047 100%)',
          }}>
            {/* Position marker */}
            <div
              className="absolute top-1/2 w-0.5 h-5 bg-[#FAF8F3] -translate-y-1/2 -translate-x-1/2"
              style={{ left: `${sliderPositionClamped}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono mt-2 text-[#A3A3A3]">
            <span>-100</span>
            <span>0</span>
            <span>+100</span>
          </div>
        </div>
      </div>

      {/* ========== COMPONENTS SECTION (CREAM) ========== */}
      <div className="bg-[#FAF8F3] border-x border-b border-[#1A1A1A]/10 rounded-b-lg p-6 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-2">
            — The Eight Components
          </div>
          <h3 className="text-2xl md:text-3xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Fraunces, serif' }}>
            What's <em className="text-[#FF5722]">moving</em> the score.
          </h3>
        </div>

        {/* Component list */}
        <div className="space-y-4">
          {COMPONENT_ORDER.map((key, index) => {
            const value = props.components[key]
            const meta = COMPONENT_META[key]
            const contextTag = props.context_tags?.[key]
            const isFree = FREE_COMPONENTS.includes(key)
            const showLocked = !isFree && !isPro
            const isFirstLocked = key === COMPONENT_ORDER[FREE_COMPONENTS.length]

            // Build drilldown content for this component
            let drilldownContent: React.ReactNode = null
            
            if (key === 'starting_pitcher' && props.drilldown?.away_pitcher && props.drilldown?.home_pitcher) {
              const ap = props.drilldown.away_pitcher
              const hp = props.drilldown.home_pitcher
              drilldownContent = (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-mono uppercase text-stone-500 mb-1">Away · {ap.name}</div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] font-mono uppercase text-stone-500">ERA</div>
                        <div className="font-mono font-bold text-stone-900">{ap.era}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase text-stone-500">WHIP</div>
                        <div className="font-mono font-bold text-stone-900">{ap.whip}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase text-stone-500">K/9</div>
                        <div className="font-mono font-bold text-stone-900">{ap.k_per_9}</div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-stone-300/40">
                    <div className="text-xs font-mono uppercase text-stone-500 mb-1">Home · {hp.name}</div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] font-mono uppercase text-stone-500">ERA</div>
                        <div className="font-mono font-bold text-stone-900">{hp.era}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase text-stone-500">WHIP</div>
                        <div className="font-mono font-bold text-stone-900">{hp.whip}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase text-stone-500">K/9</div>
                        <div className="font-mono font-bold text-stone-900">{hp.k_per_9}</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-stone-600 italic pt-2 border-t border-stone-300/40">
                    Click pitcher names to see arsenal · last 5 starts · hot zones (Pro)
                  </p>
                </div>
              )
            }
            
            if (key === 'bullpen' && props.drilldown?.away_form && props.drilldown?.home_form) {
              const af = props.drilldown.away_form
              const hf = props.drilldown.home_form

              const availabilityDot = (available: boolean | null | undefined) => {
                if (available === null || available === undefined) return '–'
                return available ? '●' : '○'
              }

              const fatigueLabel = (ip: number | null | undefined) => {
                if (ip === null || ip === undefined) return '–'
                if (ip >= 5) return 'Gassed'
                if (ip >= 3) return 'Taxed'
                if (ip >= 1) return 'Used'
                return 'Fresh'
              }

              const fatigueColor = (ip: number | null | undefined) => {
                if (ip === null || ip === undefined) return 'text-stone-400'
                if (ip >= 5) return 'text-red-600 font-bold'
                if (ip >= 3) return 'text-orange-500'
                return 'text-green-700'
              }

              drilldownContent = (
                <div className="space-y-4">
                  {/* Header row */}
                  <div className="grid grid-cols-3 gap-3 text-[10px] font-mono uppercase text-stone-400 border-b border-stone-300/40 pb-2">
                    <div></div>
                    <div className="text-center">{props.away_team_abbr ?? props.away_team.slice(0,3).toUpperCase()}</div>
                    <div className="text-center">{props.home_team_abbr ?? props.home_team.slice(0,3).toUpperCase()}</div>
                  </div>

                  {/* ERA row */}
                  <div className="grid grid-cols-3 gap-3 text-sm items-center">
                    <div className="text-[10px] font-mono uppercase text-stone-500">ERA</div>
                    <div className="text-center font-mono font-bold text-stone-900">
                      {af.bullpen_era?.toFixed(2) ?? '–'}
                    </div>
                    <div className="text-center font-mono font-bold text-stone-900">
                      {hf.bullpen_era?.toFixed(2) ?? '–'}
                    </div>
                  </div>

                  {/* Yesterday row */}
                  <div className="grid grid-cols-3 gap-3 text-sm items-center">
                    <div className="text-[10px] font-mono uppercase text-stone-500">Yesterday</div>
                    <div className={`text-center font-mono text-sm ${fatigueColor(af.bullpen_ip_yesterday)}`}>
                      {af.bullpen_ip_yesterday !== null && af.bullpen_ip_yesterday !== undefined
                        ? `${af.bullpen_ip_yesterday} IP · ${fatigueLabel(af.bullpen_ip_yesterday)}`
                        : '–'
                      }
                    </div>
                    <div className={`text-center font-mono text-sm ${fatigueColor(hf.bullpen_ip_yesterday)}`}>
                      {hf.bullpen_ip_yesterday !== null && hf.bullpen_ip_yesterday !== undefined
                        ? `${hf.bullpen_ip_yesterday} IP · ${fatigueLabel(hf.bullpen_ip_yesterday)}`
                        : '–'
                      }
                    </div>
                  </div>

                  {/* Availability row */}
                  {(af.closer_available !== undefined || hf.closer_available !== undefined) && (
                    <div className="border-t border-stone-300/40 pt-3 space-y-2">
                      <div className="text-[10px] font-mono uppercase text-stone-400 mb-2">Key Arms Available</div>
                      {[
                        { label: 'Closer', away: af.closer_available, home: hf.closer_available },
                        { label: 'Setup 1', away: af.setup1_available, home: hf.setup1_available },
                        { label: 'Setup 2', away: af.setup2_available, home: hf.setup2_available },
                      ].map(row => (
                        <div key={row.label} className="grid grid-cols-3 gap-3 text-sm items-center">
                          <div className="text-[10px] font-mono uppercase text-stone-500">{row.label}</div>
                          <div className={`text-center font-mono text-base ${row.away ? 'text-green-700' : 'text-red-500'}`}>
                            {availabilityDot(row.away)}
                          </div>
                          <div className={`text-center font-mono text-base ${row.home ? 'text-green-700' : 'text-red-500'}`}>
                            {availabilityDot(row.home)}
                          </div>
                        </div>
                      ))}
                      <div className="text-[10px] font-mono text-stone-400 pt-1">
                        ● Available · ○ Unavailable
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={key}>
                {/* Free tier divider */}
                {isFirstLocked && (
                  <div className="flex items-center gap-3 my-6 opacity-80">
                    <div className="flex-1 h-px bg-[#FF5722]/30" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#FF5722] font-bold">
                      ⊕ Free Tier Ends Here
                    </span>
                    <div className="flex-1 h-px bg-[#FF5722]/30" />
                  </div>
                )}

                <ComponentRow
                  number={index + 1}
                  label={meta.label}
                  subtitle={meta.subtitle}
                  value={value}
                  homeAbbr={homeAbbr}
                  awayAbbr={awayAbbr}
                  contextTag={contextTag}
                  locked={showLocked}
                  proTeaser={meta.pro_teaser}
                  drilldownData={drilldownContent}
                />
              </div>
            )
          })}
        </div>

        {/* ========== THE READ (LLM Narrative) ========== */}
    {props.llm_narrative && (
  props.is_pro ? (
    <div className="mt-8 pt-6 border-t border-[#1A1A1A]/10">
      <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-3">
        — The Read
      </div>
      <p className="text-base text-[#1A1A1A] leading-relaxed" style={{ fontFamily: 'Fraunces, serif' }}>
        {props.llm_narrative}
      </p>
    </div>
  ) : (
    <div className="mt-8 pt-6 border-t border-[#1A1A1A]/10">
      <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-3">
        — The Read · <span className="text-[#1A1A1A]/40">⊕ Pro</span>
      </div>
      <div className="bg-[#1A1A1A]/[0.03] p-5 border border-dashed border-[#1A1A1A]/20">
        <p className="text-sm text-[#1A1A1A]/50 leading-relaxed mb-3" style={{ fontFamily: 'Fraunces, serif' }}>
          The full smart-friend analysis — pitching, bullpen, form, and the tactical angle — unlocks with Pro.
        </p>
        <a href="/pricing" className="inline-block bg-[#1A1A1A] text-[#FDE047] px-4 py-2 text-[10px] font-mono uppercase tracking-wider hover:bg-[#FF5722] hover:text-white transition">
          See Pro pricing →
        </a>
      </div>
    </div>
  )
)}

        {/* Footer */}
        {!isPro ? (
          <div className="mt-8 pt-6 border-t border-[#1A1A1A]/10">
            <div className="bg-[#1A1A1A] text-[#FAF8F3] rounded p-5 mb-4 shadow-xl border border-[#1A1A1A]">
              <div className="text-[#FDE047] text-xs font-mono uppercase tracking-wider mb-2">
                ⊕ Pro Tier · £6/mo · £60/yr
              </div>
              <h4 className="text-xl font-bold mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
                Unlock all 8 components.
              </h4>
              <p className="text-sm text-[#FAF8F3]/80 mb-4 leading-relaxed">
                Full smart-friend narrative. Pitch arsenal charts. Batter hot zones. Bullpen fatigue tracker. The Streamer Pick for fantasy.
              </p>
              <a 
                href="/pricing" 
                className="inline-block bg-[#FDE047] text-[#1A1A1A] font-bold px-5 py-2.5 text-sm uppercase tracking-wider hover:bg-[#FAF8F3] transition"
              >
                Get notified when Pro launches June 1 →
              </a>
            </div>
            <div className="text-[10px] font-mono uppercase text-[#4A4A4A] text-center">
              Updated {formatTimeAgo(props.updated_at)} &middot; Information only · No betting advice
            </div>
          </div>
        ) : (
          <div className="mt-8 pt-4 border-t border-[#1A1A1A]/10">
            <div className="text-[10px] font-mono uppercase text-[#4A4A4A] text-center">
              Updated {formatTimeAgo(props.updated_at)} &middot; Information only · No betting advice
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// COMPONENT ROW (one row per of the 8 factors)
// ============================================================
type ComponentRowProps = {
  number: number
  label: string
  subtitle: string
  value: number
  homeAbbr: string
  awayAbbr: string
  contextTag?: string
  locked: boolean
  proTeaser?: string
  drilldownData?: React.ReactNode
}

function ComponentRow({
  number,
  label,
  subtitle,
  value,
  homeAbbr,
  awayAbbr,
  contextTag,
  locked,
  proTeaser,
  drilldownData,
}: ComponentRowProps) {
  const [expanded, setExpanded] = useState(false)
  
  // ===== LOCKED STATE UI =====
  if (locked) {
    return (
      <div className="group grid grid-cols-12 gap-3 items-center opacity-75 hover:opacity-100 transition-opacity cursor-pointer">
        {/* Number */}
        <div className="col-span-1 text-[#FF5722]/50 font-mono text-sm">
          {number}
        </div>

        {/* Label + subtitle */}
        <div className="col-span-3">
          <div className="font-bold text-[#1A1A1A] text-sm flex items-center gap-1 group-hover:text-[#FF5722] transition-colors">
            {label}
          </div>
          <div className="text-[10px] font-mono uppercase text-[#4A4A4A] tracking-wider">
            {subtitle}
          </div>
        </div>

        {/* Locked Area (replaces Bar + Value + Context) */}
        <div className="col-span-8 flex items-center justify-between bg-[#1A1A1A]/5 rounded px-4 py-2 border border-[#1A1A1A]/10 border-dashed group-hover:border-[#FF5722]/30 group-hover:bg-[#FF5722]/5 transition-all">
          <div className="flex items-center gap-2 overflow-hidden">
            <svg className="w-3.5 h-3.5 text-[#FF5722] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-mono text-[#1A1A1A]/60 italic tracking-tight truncate">
              {proTeaser}
            </span>
          </div>
          <span className="ml-2 flex-shrink-0 text-[9px] font-bold tracking-widest uppercase bg-[#FF5722]/10 text-[#FF5722] px-2.5 py-0.5 rounded">
            Pro
          </span>
        </div>
      </div>
    )
  }

  // ===== UNLOCKED STATE UI =====
  const absValue = Math.abs(value)
  const isHomeFavored = value >= 0
  const labelToShow = isHomeFavored ? homeAbbr : awayAbbr

  // Bar color based on magnitude
  const barColor = absValue >= 15
    ? '#FF5722'  // strong: solid orange
    : absValue >= 5
      ? '#FFAA88'  // moderate: salmon
      : '#D4D4D4'  // tossup: gray

  // Bar width as % of half (since bar is centered at 0)
  const barWidthPct = Math.min(50, (absValue / 50) * 50)

  // Display value styling
  const valueColor = absValue >= 5 ? '#FF5722' : '#A3A3A3'
  const displayValue = absValue < 0.5 ? '±0' : `+${Math.round(absValue)}`

  const hasDrilldown = drilldownData !== undefined && drilldownData !== null

  return (
    <div>
      <div 
        className={`grid grid-cols-12 gap-3 items-center ${hasDrilldown ? 'cursor-pointer hover:bg-stone-100 rounded transition' : ''}`}
        onClick={hasDrilldown ? () => setExpanded(!expanded) : undefined}
      >
        {/* Number */}
        <div className="col-span-1 text-[#FF5722] font-mono text-sm">
          {number}
        </div>

        {/* Label + subtitle */}
        <div className="col-span-3">
          <div className="font-bold text-[#1A1A1A] text-sm flex items-center gap-1">
            {label}
            {hasDrilldown && (
              <svg 
                className={`w-3 h-3 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="text-[10px] font-mono uppercase text-[#4A4A4A] tracking-wider">
            {subtitle}
          </div>
        </div>

        {/* Bar */}
        <div className="col-span-5 relative h-7 bg-[#E5E5E5] rounded">
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#A3A3A3]/40" />
          {absValue >= 0.5 && (
            <div
              className="absolute top-0 bottom-0 rounded flex items-center justify-center transition-all duration-500 ease-out"
              style={{
                backgroundColor: barColor,
                width: `${barWidthPct}%`,
                left: isHomeFavored ? '50%' : `${50 - barWidthPct}%`,
              }}
            >
              <span className="text-[10px] font-mono uppercase font-bold text-white tracking-wider">
                {labelToShow}
              </span>
            </div>
          )}
        </div>

        {/* Score value */}
        <div
          className="col-span-1 text-right font-bold text-base"
          style={{ color: valueColor }}
        >
          {displayValue}
        </div>

        {/* Right: context tag */}
        <div className="col-span-2 text-right">
          {contextTag ? (
            <span className="text-[10px] font-mono uppercase text-[#4A4A4A] tracking-wider leading-tight block">
              {contextTag}
            </span>
          ) : null}
        </div>
      </div>

      {/* Drill-down content */}
      {hasDrilldown && expanded && drilldownData && (
        <div className="ml-12 mt-3 mb-2 bg-[#F5F1E8] border border-[#FF5722]/20 rounded p-4 shadow-sm">
          {drilldownData}
        </div>
      )}
    </div>
  )
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
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
}