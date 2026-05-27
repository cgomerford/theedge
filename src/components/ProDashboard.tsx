'use client'

import { useState } from 'react'

// ============================================================
// TYPES — all data passed in from the server page
// ============================================================
export type ProDashboardProps = {
  // Identity
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string

  // Edge score
  edgeScore: number
  predictedWinner: 'home' | 'away'
  confidenceTier: 'strong' | 'moderate' | 'slight' | 'tossup'

  // 8 components
  components: {
    starting_pitcher: number
    bullpen: number
    offense: number
    defense: number
    matchup: number
    park: number
    weather: number
    rest: number
  }

  // LLM text
  narrative?: string | null
  contrarian?: string | null

  // Pitcher stats
  awayPitcher?: {
    name: string
    era: string
    whip: string
    k_per_9: string
    wins?: number
    losses?: number
    last_3_era?: string | null
  } | null
  homePitcher?: {
    name: string
    era: string
    whip: string
    k_per_9: string
    wins?: number
    losses?: number
    last_3_era?: string | null
  } | null

  // Bullpen
  awayBullpen?: {
    era: number | null
    ip_yesterday: number | null
    closer_available: boolean | null
  } | null
  homeBullpen?: {
    era: number | null
    ip_yesterday: number | null
    closer_available: boolean | null
  } | null

  // Team form
  awayForm?: {
    last_10_wins: number
    last_10_losses: number
    runs_per_game: number
    run_diff: number
    streak?: string
    streak_type?: string
  } | null
  homeForm?: {
    last_10_wins: number
    last_10_losses: number
    runs_per_game: number
    run_diff: number
    streak?: string
    streak_type?: string
  } | null

  // Pro takeaways
  proTakeaways?: Array<{
    stat: string
    text: string
    edge: 'home' | 'away' | 'neutral'
  }> | null

  // Stories
  homeStories?: Array<{ stat: string; text: string }> | null
  awayStories?: Array<{ stat: string; text: string }> | null

  // Conditions
  weather?: {
    temp_f?: number
    wind_speed?: number
    wind_direction?: string
    conditions?: string
    precip_chance?: number
  } | null
  park?: {
    hr_factor?: number
    run_factor?: number
    is_dome?: boolean
    venue_name?: string
  } | null

  // Streamer pick (Pro fantasy feature)
  streamerPick?: {
    playerName: string
    reason: string
    stat: string
  } | null

  // Child slots for sub-components that stay server-rendered
  lineupSlot?: React.ReactNode
  arsenalSlot?: React.ReactNode
}

// ============================================================
// HELPERS
// ============================================================
const COMPONENT_LABELS: Record<string, string> = {
  starting_pitcher: 'SP',
  bullpen: 'Pen',
  offense: 'Off',
  defense: 'Def',
  matchup: 'MU',
  park: 'Park',
  weather: 'Wx',
  rest: 'Rest',
}

function fmt(v: number | null | undefined, decimals = 2): string {
  return v !== null && v !== undefined ? v.toFixed(decimals) : '–'
}

function fatigueLabel(ip: number | null | undefined): string {
  if (ip === null || ip === undefined) return '–'
  if (ip >= 5) return 'Gassed'
  if (ip >= 3) return 'Taxed'
  if (ip >= 1) return 'Used'
  return 'Fresh'
}

function fatigueColor(ip: number | null | undefined): string {
  if (ip === null || ip === undefined) return '#A3A3A3'
  if (ip >= 5) return '#DC2626'
  if (ip >= 3) return '#EA580C'
  return '#16A34A'
}

// ============================================================
// PANEL — reusable card container
// ============================================================
function Panel({
  title,
  badge,
  children,
  className = '',
}: {
  title: string
  badge?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white border border-[#1A1A1A]/10 rounded-lg overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-[#FAF8F3] border-b border-[#1A1A1A]/8">
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
          {title}
        </span>
        {badge && (
          <span className="text-[9px] font-mono text-[#A3A3A3]">{badge}</span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ============================================================
// STAT ROW — label / away / home
// ============================================================
function StatRow({
  label,
  away,
  home,
  highlight,
}: {
  label: string
  away: React.ReactNode
  home: React.ReactNode
  highlight?: 'away' | 'home' | null
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#1A1A1A]/6 last:border-0">
      <div className="w-16 text-[10px] font-mono text-[#A3A3A3] uppercase tracking-wider flex-shrink-0">
        {label}
      </div>
      <div
        className={`flex-1 text-right text-xs font-mono font-bold ${
          highlight === 'away' ? 'text-[#FF5722]' : 'text-[#1A1A1A]'
        }`}
      >
        {away}
      </div>
      <div className="w-px h-3 bg-[#1A1A1A]/15 flex-shrink-0" />
      <div
        className={`flex-1 text-left text-xs font-mono font-bold ${
          highlight === 'home' ? 'text-[#FF5722]' : 'text-[#1A1A1A]'
        }`}
      >
        {home}
      </div>
    </div>
  )
}

// ============================================================
// COMPONENT RADAR — compact 8-bar strip
// ============================================================
function ComponentStrip({
  components,
  homeAbbr,
  awayAbbr,
}: {
  components: ProDashboardProps['components']
  homeAbbr: string
  awayAbbr: string
}) {
  const entries = Object.entries(components) as [string, number][]

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const abs = Math.abs(value)
        const isHome = value >= 0
        const pct = Math.min(48, (abs / 50) * 48)
        const color = abs >= 15 ? '#FF5722' : abs >= 5 ? '#FFAA88' : '#D4D4D4'
        const label = COMPONENT_LABELS[key] ?? key

        return (
          <div key={key} className="flex items-center gap-2">
            <div className="w-7 text-[9px] font-mono text-[#A3A3A3] text-right flex-shrink-0">
              {label}
            </div>
            <div className="flex-1 relative h-4 bg-[#E5E5E5] rounded-sm">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#A3A3A3]/40" />
              {abs >= 0.5 && (
                <div
                  className="absolute top-0.5 bottom-0.5 rounded-sm"
                  style={{
                    backgroundColor: color,
                    width: `${pct}%`,
                    left: isHome ? '50%' : `${50 - pct}%`,
                  }}
                />
              )}
            </div>
            <div
              className="w-8 text-[10px] font-mono font-bold text-right flex-shrink-0"
              style={{ color: abs >= 5 ? '#FF5722' : '#A3A3A3' }}
            >
              {abs < 0.5 ? '±0' : `${value >= 0 ? '+' : ''}${Math.round(value)}`}
            </div>
          </div>
        )
      })}
      <div className="flex justify-between text-[8px] font-mono text-[#A3A3A3] pt-1 border-t border-[#1A1A1A]/8">
        <span>← {awayAbbr}</span>
        <span>{homeAbbr} →</span>
      </div>
    </div>
  )
}

// ============================================================
// MAIN DASHBOARD
// ============================================================
export default function ProDashboard(props: ProDashboardProps) {
  const [activeSection, setActiveSection] = useState<'overview' | 'lineups' | 'arsenal'>('overview')

  const {
    homeAbbr,
    awayAbbr,
    edgeScore,
    predictedWinner,
    confidenceTier,
    components,
    narrative,
    contrarian,
    awayPitcher,
    homePitcher,
    awayBullpen,
    homeBullpen,
    awayForm,
    homeForm,
    proTakeaways,
    homeStories,
    awayStories,
    weather,
    park,
    streamerPick,
    lineupSlot,
    arsenalSlot,
  } = props

  const winnerAbbr = predictedWinner === 'home' ? homeAbbr : awayAbbr
  const tierColors: Record<string, string> = {
    strong: '#FF5722',
    moderate: '#FFAA88',
    slight: '#FDE047',
    tossup: '#A3A3A3',
  }

  // Mini section switcher at top
  const sections = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'lineups' as const, label: 'Lineups' },
    { key: 'arsenal' as const, label: 'Arsenal' },
  ]

  return (
    <div>
      {/* Dashboard header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
            ⊕ Pro Dashboard
          </span>
        </div>
        {/* Sub-section switcher */}
        <div className="flex items-center gap-1 bg-[#1A1A1A]/6 rounded-md p-0.5">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-colors ${
                activeSection === s.key
                  ? 'bg-[#1A1A1A] text-[#FAF8F3]'
                  : 'text-[#A3A3A3] hover:text-[#1A1A1A]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW SECTION ──────────────────────────────────── */}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* PANEL 1: Edge Score + Component Strip */}
          <Panel title="Edge Indicator" badge={`${awayAbbr} @ ${homeAbbr}`}>
            {/* Score pill */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="text-4xl font-bold leading-none"
                style={{
                  fontFamily: 'Bebas Neue, sans-serif',
                  color: '#FDE047',
                }}
              >
                {edgeScore >= 0 ? '+' : ''}{Math.round(edgeScore)}
              </div>
              <div>
                <div className="text-xs font-bold text-[#1A1A1A]">{winnerAbbr} edge</div>
                <div
                  className="text-[9px] font-mono uppercase tracking-wider"
                  style={{ color: tierColors[confidenceTier] ?? '#A3A3A3' }}
                >
                  {confidenceTier}
                </div>
              </div>
            </div>
            <ComponentStrip
              components={components}
              homeAbbr={homeAbbr}
              awayAbbr={awayAbbr}
            />
          </Panel>

          {/* PANEL 2: Pitching matchup */}
          <Panel title="Starting Pitchers" badge="ERA · WHIP · K/9">
            <div className="mb-1">
              <div className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider mb-2">
                {awayAbbr} · Away
              </div>
              {awayPitcher ? (
                <div>
                  <div className="text-sm font-bold text-[#1A1A1A] mb-1.5">{awayPitcher.name}</div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[
                      { label: 'ERA', val: awayPitcher.era },
                      { label: 'WHIP', val: awayPitcher.whip },
                      { label: 'K/9', val: awayPitcher.k_per_9 },
                    ].map(({ label, val }) => (
                      <div key={label} className="text-center bg-[#FAF8F3] rounded py-1.5">
                        <div className="text-sm font-mono font-bold text-[#1A1A1A]">{val}</div>
                        <div className="text-[9px] font-mono text-[#A3A3A3] uppercase">{label}</div>
                      </div>
                    ))}
                  </div>
                  {awayPitcher.last_3_era && (
                    <div className="text-[10px] font-mono text-[#A3A3A3]">
                      L3 ERA:{' '}
                      <span className="text-[#1A1A1A] font-bold">{awayPitcher.last_3_era}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#A3A3A3] italic">TBD</div>
              )}
            </div>

            <div className="h-px bg-[#1A1A1A]/8 my-3" />

            <div>
              <div className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider mb-2">
                {homeAbbr} · Home
              </div>
              {homePitcher ? (
                <div>
                  <div className="text-sm font-bold text-[#1A1A1A] mb-1.5">{homePitcher.name}</div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[
                      { label: 'ERA', val: homePitcher.era },
                      { label: 'WHIP', val: homePitcher.whip },
                      { label: 'K/9', val: homePitcher.k_per_9 },
                    ].map(({ label, val }) => (
                      <div key={label} className="text-center bg-[#FAF8F3] rounded py-1.5">
                        <div className="text-sm font-mono font-bold text-[#1A1A1A]">{val}</div>
                        <div className="text-[9px] font-mono text-[#A3A3A3] uppercase">{label}</div>
                      </div>
                    ))}
                  </div>
                  {homePitcher.last_3_era && (
                    <div className="text-[10px] font-mono text-[#A3A3A3]">
                      L3 ERA:{' '}
                      <span className="text-[#1A1A1A] font-bold">{homePitcher.last_3_era}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#A3A3A3] italic">TBD</div>
              )}
            </div>
          </Panel>

          {/* PANEL 3: Bullpen + Form side-by-side */}
          <Panel title="Bullpen Status" badge="ERA (L30) · IP Yest.">
            <StatRow
              label="ERA"
              away={fmt(awayBullpen?.era)}
              home={fmt(homeBullpen?.era)}
              highlight={
                awayBullpen?.era && homeBullpen?.era
                  ? awayBullpen.era < homeBullpen.era ? 'away' : 'home'
                  : null
              }
            />
            <StatRow
              label="IP Yest"
              away={
                <span style={{ color: fatigueColor(awayBullpen?.ip_yesterday) }}>
                  {awayBullpen?.ip_yesterday != null
                    ? `${awayBullpen.ip_yesterday} IP`
                    : '–'}
                </span>
              }
              home={
                <span style={{ color: fatigueColor(homeBullpen?.ip_yesterday) }}>
                  {homeBullpen?.ip_yesterday != null
                    ? `${homeBullpen.ip_yesterday} IP`
                    : '–'}
                </span>
              }
            />
            <StatRow
              label="Fatigue"
              away={
                <span style={{ color: fatigueColor(awayBullpen?.ip_yesterday) }}>
                  {fatigueLabel(awayBullpen?.ip_yesterday)}
                </span>
              }
              home={
                <span style={{ color: fatigueColor(homeBullpen?.ip_yesterday) }}>
                  {fatigueLabel(homeBullpen?.ip_yesterday)}
                </span>
              }
            />
            <StatRow
              label="Closer"
              away={
                <span className={awayBullpen?.closer_available ? 'text-green-700' : 'text-red-600'}>
                  {awayBullpen?.closer_available === null || awayBullpen?.closer_available === undefined
                    ? '–'
                    : awayBullpen.closer_available ? '● Avail' : '○ Out'}
                </span>
              }
              home={
                <span className={homeBullpen?.closer_available ? 'text-green-700' : 'text-red-600'}>
                  {homeBullpen?.closer_available === null || homeBullpen?.closer_available === undefined
                    ? '–'
                    : homeBullpen.closer_available ? '● Avail' : '○ Out'}
                </span>
              }
            />
          </Panel>

          {/* PANEL 4: Team form */}
          <Panel title="Recent Form" badge="L10 · R/G · Diff">
            <StatRow
              label="L10"
              away={awayForm ? `${awayForm.last_10_wins}–${awayForm.last_10_losses}` : '–'}
              home={homeForm ? `${homeForm.last_10_wins}–${homeForm.last_10_losses}` : '–'}
              highlight={
                awayForm && homeForm
                  ? awayForm.last_10_wins > homeForm.last_10_wins ? 'away' : 'home'
                  : null
              }
            />
            <StatRow
              label="R/G"
              away={awayForm ? fmt(awayForm.runs_per_game, 1) : '–'}
              home={homeForm ? fmt(homeForm.runs_per_game, 1) : '–'}
              highlight={
                awayForm && homeForm
                  ? awayForm.runs_per_game > homeForm.runs_per_game ? 'away' : 'home'
                  : null
              }
            />
            <StatRow
              label="RDiff"
              away={
                awayForm
                  ? <span className={awayForm.run_diff >= 0 ? 'text-green-700' : 'text-red-600'}>
                      {awayForm.run_diff >= 0 ? '+' : ''}{awayForm.run_diff}
                    </span>
                  : '–'
              }
              home={
                homeForm
                  ? <span className={homeForm.run_diff >= 0 ? 'text-green-700' : 'text-red-600'}>
                      {homeForm.run_diff >= 0 ? '+' : ''}{homeForm.run_diff}
                    </span>
                  : '–'
              }
            />
            {(awayForm?.streak || homeForm?.streak) && (
              <StatRow
                label="Streak"
                away={
                  awayForm?.streak ? (
                    <span className={awayForm.streak_type === 'W' ? 'text-green-700' : 'text-red-600'}>
                      {awayForm.streak}
                    </span>
                  ) : '–'
                }
                home={
                  homeForm?.streak ? (
                    <span className={homeForm.streak_type === 'W' ? 'text-green-700' : 'text-red-600'}>
                      {homeForm.streak}
                    </span>
                  ) : '–'
                }
              />
            )}
          </Panel>

          {/* PANEL 5: The Read (narrative) */}
          {narrative && (
            <Panel title="The Read" className="md:col-span-2">
              <p
                className="text-sm text-[#1A1A1A] leading-relaxed"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {narrative}
              </p>
              {contrarian && (
                <div className="mt-3 pt-3 border-t border-[#1A1A1A]/8">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#A3A3A3] mr-2">
                    Bear case:
                  </span>
                  <span
                    className="text-xs text-[#1A1A1A]/70 italic"
                    style={{ fontFamily: 'Fraunces, serif' }}
                  >
                    {contrarian}
                  </span>
                </div>
              )}
            </Panel>
          )}

          {/* PANEL 6: Pro Takeaways */}
          {proTakeaways && proTakeaways.length > 0 && (
            <Panel title="Pro Takeaways" badge="Fantasy + DFS angles" className="md:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {proTakeaways.map((t, i) => (
                  <div
                    key={i}
                    className="bg-[#FAF8F3] border border-[#1A1A1A]/8 rounded-md p-2.5"
                  >
                    <div className="text-[9px] font-mono text-[#FF5722] uppercase tracking-wider mb-1">
                      {t.stat}
                    </div>
                    <div className="text-xs text-[#1A1A1A] leading-snug">{t.text}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* PANEL 7: Storylines — compact 2-col */}
          {(homeStories || awayStories) && (
            <Panel title="Storylines" className="md:col-span-2">
              <div className="grid grid-cols-2 gap-3">
                {/* Away */}
                <div>
                  <div className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider mb-2">
                    {awayAbbr} angles
                  </div>
                  {awayStories?.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex gap-2 mb-2 last:mb-0">
                      <span className="text-[9px] font-mono font-bold text-[#FF5722] bg-[#FF5722]/8 px-1.5 py-0.5 rounded flex-shrink-0 h-fit mt-0.5">
                        {s.stat}
                      </span>
                      <span className="text-xs text-[#1A1A1A] leading-snug">{s.text}</span>
                    </div>
                  ))}
                </div>
                {/* Home */}
                <div>
                  <div className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider mb-2">
                    {homeAbbr} angles
                  </div>
                  {homeStories?.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex gap-2 mb-2 last:mb-0">
                      <span className="text-[9px] font-mono font-bold text-[#FF5722] bg-[#FF5722]/8 px-1.5 py-0.5 rounded flex-shrink-0 h-fit mt-0.5">
                        {s.stat}
                      </span>
                      <span className="text-xs text-[#1A1A1A] leading-snug">{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          {/* PANEL 8: Conditions */}
          {(weather || park) && (
            <Panel title="Conditions" badge={park?.venue_name ?? ''}>
              {weather && (
                <>
                  <StatRow
                    label="Temp"
                    away={weather.temp_f != null ? `${weather.temp_f}°F` : '–'}
                    home={weather.temp_f != null ? `${Math.round((weather.temp_f - 32) * 5 / 9)}°C` : '–'}
                  />
                  <StatRow
                    label="Wind"
                    away={weather.wind_speed != null ? `${weather.wind_speed} mph` : '–'}
                    home={weather.wind_direction ?? '–'}
                  />
                  {weather.precip_chance != null && (
                    <StatRow
                      label="Rain"
                      away={`${weather.precip_chance}%`}
                      home={weather.precip_chance > 20 ? '⚠ Check delay risk' : 'Low risk'}
                    />
                  )}
                </>
              )}
              {park && (
                <>
                  <StatRow
                    label="HR Fac"
                    away={fmt(park.hr_factor)}
                    home={park.is_dome ? 'Dome' : 'Open air'}
                  />
                  <StatRow
                    label="Run Fac"
                    away={fmt(park.run_factor)}
                    home={
                      park.hr_factor != null
                        ? park.hr_factor > 1.05 ? 'Hitter-friendly'
                        : park.hr_factor < 0.95 ? 'Pitcher-friendly'
                        : 'Neutral'
                        : '–'
                    }
                  />
                </>
              )}
            </Panel>
          )}

          {/* PANEL 9: Streamer Pick */}
          {streamerPick && (
            <Panel title="Streamer Pick" badge="⊕ Fantasy">
              <div className="text-sm font-bold text-[#1A1A1A] mb-1">{streamerPick.playerName}</div>
              <div className="text-[9px] font-mono text-[#FF5722] mb-2">{streamerPick.stat}</div>
              <p className="text-xs text-[#1A1A1A]/80 leading-snug">{streamerPick.reason}</p>
            </Panel>
          )}
        </div>
      )}

      {/* ── LINEUPS SECTION ───────────────────────────────────── */}
      {activeSection === 'lineups' && (
        <div>{lineupSlot}</div>
      )}

      {/* ── ARSENAL SECTION ───────────────────────────────────── */}
      {activeSection === 'arsenal' && (
        <div>{arsenalSlot}</div>
      )}
    </div>
  )
}
