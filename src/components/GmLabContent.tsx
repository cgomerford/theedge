'use client'

// src/components/GmLabContent.tsx
// The GM Lab — a pre-game roster intelligence briefing.
// Four sections: IL Board, Roster Moves, Bullpen Decision Tree, Starter Intel.
// Nothing here duplicates The Read, Teams, or the Edge factors.

import { playerHeadshotUrl } from '@/lib/mlb'

type Transaction = {
  transaction_id: number
  player_id: number
  player_name: string
  category: string
  type_code: string
  il_days: number | null
  injury_reason: string | null
  description: string
  transaction_date: string
  from_team_id: number | null
  from_team_name: string | null
  from_affiliate_level: string | null
  to_team_id: number | null
  to_team_name: string | null
  to_affiliate_level: string | null
  is_milb_move: boolean
}

type PitcherStats = {
  era?: number | null
  fip?: number | null
  k_per_9?: number | null
  bb_per_9?: number | null
  whip?: number | null
  l3_era?: number | null
  l3_k_per_9?: number | null
  vs_lhb_baa?: number | null
  vs_rhb_baa?: number | null
  home_era?: number | null
  away_era?: number | null
  days_rest?: number | null
  season_ip_pace?: number | null
  gb_rate?: number | null
  player_name?: string | null
  throws?: string | null
}

type TeamData = {
  bullpen_era?: number | null
  bullpen_k_per_9?: number | null
  bullpen_hr_per_9?: number | null
  bullpen_innings_yesterday?: number | null
  bullpen_ip_last_3?: number | null
  closer_available?: boolean | null
  setup1_available?: boolean | null
  setup2_available?: boolean | null
  day_after_night?: boolean | null
  runs_per_game_l30?: number | null
  ops_l30?: number | null
  iso?: number | null
  k_pct?: number | null
  bb_pct?: number | null
  oaa?: number | null
  errors_per_game_l30?: number | null
}

type GmLabContentProps = {
  // Teams
  awayTeamName: string
  homeTeamName: string
  awayAbbr: string
  homeAbbr: string
  awayTeamId: number
  homeTeamId: number
  awayPrimaryColor: string
  homePrimaryColor: string

  // Pitchers
  awayPitcherName: string | null
  homePitcherName: string | null
  awayPitcherId: number | null
  homePitcherId: number | null
  awayPitcherStats: PitcherStats | null
  homePitcherStats: PitcherStats | null

  // Team data (from components_raw)
  awayTeamData: TeamData | null
  homeTeamData: TeamData | null

  // Transactions
  awayTransactions: Transaction[]
  homeTransactions: Transaction[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Converts decimal IP (6.333...) back to baseball notation (6.1)
function formatIP(ip: number): string {
  const full = Math.floor(ip)
  const thirds = Math.round((ip - full) * 3)
  return `${full}.${thirds}`
}
function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function ilBadgeColor(days: number | null): { bg: string; text: string } {
  if (!days || days <= 10) return { bg: 'rgba(220,38,38,0.10)', text: '#DC2626' }
  if (days <= 15) return { bg: 'rgba(217,119,6,0.10)', text: '#D97706' }
  return { bg: 'rgba(37,99,235,0.10)', text: '#2563EB' }
}

function categoryConfig(category: string): { label: string; bg: string; text: string; icon: string } {
  switch (category) {
    case 'CALLUP':     return { label: 'Called Up',  bg: 'rgba(21,128,61,0.10)',   text: '#15803D', icon: '↑' }
    case 'OPTION':     return { label: 'Optioned',   bg: 'rgba(120,113,108,0.10)', text: '#78716C', icon: '↓' }
    case 'DFA':        return { label: 'DFA',        bg: 'rgba(220,38,38,0.10)',   text: '#DC2626', icon: '✕' }
    case 'TRADE':      return { label: 'Trade',      bg: 'rgba(139,92,246,0.10)',  text: '#7C3AED', icon: '⇄' }
    case 'SIGNING':    return { label: 'Signed',     bg: 'rgba(37,99,235,0.10)',   text: '#2563EB', icon: '+' }
    case 'RELEASE':    return { label: 'Released',   bg: 'rgba(220,38,38,0.10)',   text: '#DC2626', icon: '✕' }
    case 'SUSPENSION': return { label: 'Suspended',  bg: 'rgba(220,38,38,0.10)',   text: '#DC2626', icon: '!' }
    case 'ACTIVATION': return { label: 'Activated',  bg: 'rgba(21,128,61,0.10)',   text: '#15803D', icon: '✓' }
    default:           return { label: category,     bg: 'rgba(120,113,108,0.10)', text: '#78716C', icon: '·' }
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
      § {children}
    </h3>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-5 py-8 text-center text-stone-400 font-serif italic text-sm">
      {message}
    </div>
  )
}

// ── IL Board ─────────────────────────────────────────────────────────────────

function ILBoard({
  transactions,
  teamName,
  abbr,
  primaryColor,
}: {
  transactions: Transaction[]
  teamName: string
  abbr: string
  primaryColor: string
}) {
  const ilPlayers = transactions.filter(t => t.category === 'IL')
  const activatedIds = new Set(
    transactions.filter(t => t.category === 'ACTIVATION').map(t => t.player_id)
  )
  const activeIL = ilPlayers.filter(t => !activatedIds.has(t.player_id))

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between"
        style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.04) 0%, transparent 100%)' }}>
        <span className="font-serif font-semibold text-stone-900">{abbr} — Injured List</span>
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: activeIL.length > 0 ? 'rgba(220,38,38,0.10)' : 'rgba(21,128,61,0.10)', color: activeIL.length > 0 ? '#DC2626' : '#15803D' }}>
          {activeIL.length} {activeIL.length === 1 ? 'player' : 'players'}
        </span>
      </div>

      {activeIL.length === 0 ? (
        <EmptyState message="No active IL placements in last 30 days" />
      ) : (
        <div className="divide-y divide-stone-50">
          {activeIL.slice(0, 6).map(t => {
            const badge = ilBadgeColor(t.il_days)
            const age = daysAgo(t.transaction_date)
            return (
              <div key={t.transaction_id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-serif font-semibold text-stone-900 text-sm">{t.player_name}</span>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ background: badge.bg, color: badge.text }}>
                      {t.il_days ? `${t.il_days}-day IL` : 'IL'}
                    </span>
                  </div>
                  {t.injury_reason && (
                    <div className="text-xs font-serif text-stone-500 mt-0.5 italic">{t.injury_reason}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[10px] text-stone-400">
                    {age === 0 ? 'Today' : age === 1 ? 'Yesterday' : `${age}d ago`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Roster Moves Feed ─────────────────────────────────────────────────────────

function RosterMoves({
  transactions,
  abbr,
}: {
  transactions: Transaction[]
  abbr: string
}) {
  const moves = transactions.filter(t =>
    ['CALLUP', 'OPTION', 'DFA', 'TRADE', 'RELEASE', 'SIGNING', 'ACTIVATION'].includes(t.category)
  ).slice(0, 8)

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100">
        <span className="font-serif font-semibold text-stone-900">{abbr} — Roster Moves (14 days)</span>
      </div>

      {moves.length === 0 ? (
        <EmptyState message="No significant roster moves in last 14 days" />
      ) : (
        <div className="divide-y divide-stone-50">
          {moves.map(t => {
            const cfg = categoryConfig(t.category)
            const age = daysAgo(t.transaction_date)

            // Build a clean one-line summary
       let summary = ''
if (t.category === 'CALLUP') {
  const level = t.from_affiliate_level ? ` (${t.from_affiliate_level})` : ''
  summary = `Called up from ${t.from_team_name ?? 'MiLB'}${level}`
} else if (t.category === 'OPTION') {
  const level = t.to_affiliate_level ? ` (${t.to_affiliate_level})` : ''
  summary = `Optioned to ${t.to_team_name ?? 'MiLB'}${level}`
            } else if (t.category === 'ACTIVATION') {
              summary = 'Activated from IL'
            } else if (t.category === 'DFA') {
              summary = 'Designated for assignment'
            } else if (t.category === 'TRADE') {
              summary = t.from_team_name
                ? `Acquired from ${t.from_team_name}`
                : `Traded to ${t.to_team_name ?? 'unknown'}`
            } else if (t.category === 'RELEASE') {
              summary = 'Released'
            } else if (t.category === 'SIGNING') {
              summary = 'Signed'
            }

            return (
              <div key={t.transaction_id} className="px-5 py-3 flex items-center gap-3">
                <span className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ background: cfg.bg, color: cfg.text }}>
                  {cfg.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-serif text-sm font-semibold text-stone-900">{t.player_name}</span>
                  <span className="font-mono text-[10px] ml-2 uppercase tracking-wider"
                    style={{ color: cfg.text }}>{cfg.label}</span>
                  {summary && (
                    <div className="text-xs text-stone-400 font-mono mt-0.5">{summary}</div>
                  )}
                </div>
                <div className="font-mono text-[10px] text-stone-300 shrink-0">
                  {age === 0 ? 'Today' : age === 1 ? 'Yesterday' : `${age}d ago`}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Bullpen Decision Tree ─────────────────────────────────────────────────────

function BullpenDecisionTree({
  teamData,
  abbr,
  primaryColor,
}: {
  teamData: TeamData | null
  abbr: string
  primaryColor: string
}) {
  if (!teamData) return null

  const ip3 = teamData.bullpen_ip_last_3 ?? 0
  const ipYest = teamData.bullpen_innings_yesterday ?? 0
  const fatigueLevel = ip3 >= 15 ? 'heavy' : ip3 >= 10 ? 'moderate' : 'fresh'
  const fatigueColor = fatigueLevel === 'heavy' ? '#DC2626' : fatigueLevel === 'moderate' ? '#D97706' : '#15803D'

  // Build decision scenarios
  const scenarios: { inning: string; situation: string; answer: string; risk: 'low' | 'medium' | 'high' }[] = []

  // 7th inning
  if (teamData.setup2_available === false) {
    scenarios.push({ inning: '7th', situation: 'Setup 2 unavailable — middle relief only', answer: 'Depth arm', risk: 'medium' })
  } else {
    scenarios.push({ inning: '7th', situation: 'Standard bridge inning', answer: 'Setup 2', risk: 'low' })
  }

  // 8th inning
  if (teamData.setup1_available === false) {
    scenarios.push({ inning: '8th', situation: 'Primary setup unavailable — used last night', answer: 'Next available', risk: 'high' })
  } else if (ip3 >= 15) {
    scenarios.push({ inning: '8th', situation: 'Setup available but pen heavily taxed (3d)', answer: 'Setup 1 — watch count', risk: 'medium' })
  } else {
    scenarios.push({ inning: '8th', situation: 'Setup available and rested', answer: 'Setup 1', risk: 'low' })
  }

  // 9th / save
  if (teamData.closer_available === false) {
    scenarios.push({ inning: '9th', situation: 'Closer unavailable — used recently', answer: 'Setup covers', risk: 'high' })
  } else if (ipYest >= 5) {
    scenarios.push({ inning: '9th', situation: 'Closer available but pen burned last night', answer: 'Closer — limited', risk: 'medium' })
  } else {
    scenarios.push({ inning: '9th', situation: 'Closer fresh and available', answer: 'Closer', risk: 'low' })
  }

  // Extra innings risk
  if (ip3 >= 12) {
    scenarios.push({ inning: 'X', situation: 'Extra innings — pen taxed across 3 days', answer: 'Long man only', risk: 'high' })
  }

  const riskColor = (r: 'low' | 'medium' | 'high') =>
    r === 'high' ? '#DC2626' : r === 'medium' ? '#D97706' : '#15803D'
  const riskBg = (r: 'low' | 'medium' | 'high') =>
    r === 'high' ? 'rgba(220,38,38,0.08)' : r === 'medium' ? 'rgba(217,119,6,0.08)' : 'rgba(21,128,61,0.08)'

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Header with fatigue indicator */}
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="flex items-center justify-between mb-3">
          <span className="font-serif font-semibold text-stone-900">{abbr} — Late-Inning Decision Tree</span>
          <span className="font-mono text-[10px] font-bold px-2.5 py-1 rounded-full capitalize"
            style={{ background: `${fatigueColor}18`, color: fatigueColor }}>
            Pen: {fatigueLevel}
          </span>
        </div>
        {/* 3-day IP load bar */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider w-16 shrink-0">3-Day IP</span>
          <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${Math.min((ip3 / 18) * 100, 100)}%`, background: fatigueColor }} />
          </div>
          <span className="font-mono text-xs font-bold text-stone-700 w-12 text-right">{formatIP(ip3)} IP</span>
        </div>
      </div>

      {/* Scenario rows */}
      <div className="divide-y divide-stone-50">
        {scenarios.map((s, i) => (
          <div key={i} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-5 py-3"
            style={{ background: s.risk === 'high' ? 'rgba(220,38,38,0.02)' : 'transparent' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
              style={{ background: s.inning === 'X' ? '#1A1A1A' : '#F4F0E8', color: s.inning === 'X' ? '#FAF8F3' : '#1A1A1A', fontFamily: "'Bebas Neue', sans-serif", fontSize: '16px' }}>
              {s.inning}
            </div>
            <div>
              <div className="text-xs font-serif text-stone-600 leading-snug">{s.situation}</div>
            </div>
            <div className="text-right shrink-0">
              <span className="font-mono text-[10px] font-bold px-2 py-1 rounded"
                style={{ background: riskBg(s.risk), color: riskColor(s.risk) }}>
                → {s.answer}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Day-after-night flag */}
      {teamData.day_after_night && (
        <div className="px-5 py-3 border-t border-stone-100 flex items-center gap-2"
          style={{ background: 'rgba(217,119,6,0.04)' }}>
          <span className="text-amber-500 font-bold text-sm">⚠</span>
          <span className="font-mono text-[10px] text-amber-600 font-bold uppercase tracking-wider">
            Day game after night game — fatigue compounds
          </span>
        </div>
      )}
    </div>
  )
}

// ── Starter Intel ─────────────────────────────────────────────────────────────

function StarterIntel({
  pitcherName,
  pitcherId,
  stats,
  label,
  teamAbbr,
  primaryColor,
}: {
  pitcherName: string | null
  pitcherId: number | null
  stats: PitcherStats | null
  label: string
  teamAbbr: string
  primaryColor: string
}) {
  if (!pitcherName || !stats) return null

  const isImproving = stats.l3_era != null && stats.era != null && stats.l3_era < stats.era - 0.3
  const isDeclining = stats.l3_era != null && stats.era != null && stats.l3_era > stats.era + 0.5
  const trend = isImproving ? { label: '↑ Trending up', color: '#15803D' }
    : isDeclining ? { label: '↓ Watch for regression', color: '#DC2626' }
    : { label: '→ Consistent', color: '#78716C' }

  // Platoon vulnerability — does he have a significant split?
  const lhbBaa = stats.vs_lhb_baa ?? 0
  const rhbBaa = stats.vs_rhb_baa ?? 0
  const platoonGap = Math.abs(lhbBaa - rhbBaa)
  const vulnHanded = platoonGap > 0.030
    ? lhbBaa > rhbBaa ? 'LHB' : 'RHB'
    : null

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="flex items-center gap-3">
          {pitcherId && (
            <img src={playerHeadshotUrl(pitcherId)} alt=""
              className="w-12 h-12 rounded-full object-cover border-2 border-stone-100 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-serif font-semibold text-stone-900 leading-tight">{pitcherName}</div>
            <div className="text-[10px] font-mono text-stone-400 uppercase tracking-wider mt-0.5">
              {teamAbbr} · {label}
            </div>
          </div>
          <span className="font-mono text-[10px] font-bold shrink-0" style={{ color: trend.color }}>
            {trend.label}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">

        {/* Key number trio */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'ERA', value: stats.era?.toFixed(2), sub: `L3: ${stats.l3_era?.toFixed(2) ?? '–'}`, danger: (stats.era ?? 0) > 4.5 },
            { label: 'FIP', value: stats.fip?.toFixed(2), sub: 'Def-ind.', danger: (stats.fip ?? 0) > 4.5 },
            { label: 'K/9', value: stats.k_per_9?.toFixed(1), sub: `BB/9: ${stats.bb_per_9?.toFixed(1) ?? '–'}`, danger: false },
          ].map(s => (
            <div key={s.label} className="bg-stone-50 rounded-xl px-3 py-3 text-center">
              <div className="font-bold leading-none mb-1"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '28px', color: s.danger ? '#DC2626' : '#1A1A1A' }}>
                {s.value ?? '–'}
              </div>
              <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">{s.label}</div>
              <div className="text-[9px] font-mono text-stone-300 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Platoon splits */}
        <div>
          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Platoon Splits (BAA against)</span>
            {vulnHanded && (
              <span className="font-bold text-red-500">⚠ {vulnHanded} vulnerable</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'vs LHB', value: stats.vs_lhb_baa, isVuln: vulnHanded === 'LHB' },
              { label: 'vs RHB', value: stats.vs_rhb_baa, isVuln: vulnHanded === 'RHB' },
            ].map(s => (
              <div key={s.label} className="rounded-lg px-3 py-2.5 text-center"
                style={{ background: s.isVuln ? 'rgba(220,38,38,0.06)' : '#F9F7F3' }}>
                <div className="font-mono text-base font-bold"
                  style={{ color: s.isVuln ? '#DC2626' : (s.value ?? 1) < 0.220 ? '#15803D' : '#1A1A1A' }}>
                  {s.value != null ? `.${Math.round(s.value * 1000).toString().padStart(3, '0')}` : '–'}
                </div>
                <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Home / Away split */}
        <div>
          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-2">Home / Away ERA</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-stone-50 rounded-lg px-3 py-2 text-center">
              <div className="font-mono text-sm font-bold text-stone-900">{stats.home_era?.toFixed(2) ?? '–'}</div>
              <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5">Home</div>
            </div>
            <div className="bg-stone-50 rounded-lg px-3 py-2 text-center">
              <div className="font-mono text-sm font-bold text-stone-900">{stats.away_era?.toFixed(2) ?? '–'}</div>
              <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5">Away</div>
            </div>
            <div className="bg-stone-50 rounded-lg px-3 py-2 text-center">
              <div className={`font-mono text-sm font-bold ${(stats.days_rest ?? 5) <= 3 ? 'text-red-500' : (stats.days_rest ?? 5) >= 7 ? 'text-amber-500' : 'text-stone-900'}`}>
                {stats.days_rest ?? '–'}d
              </div>
              <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5">Rest</div>
            </div>
          </div>
        </div>

        {/* Season workload warning */}
        {stats.season_ip_pace != null && stats.season_ip_pace > 185 && (
          <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
              style={{
                background: stats.season_ip_pace > 210 ? 'rgba(220,38,38,0.10)' : 'rgba(217,119,6,0.10)',
                color: stats.season_ip_pace > 210 ? '#DC2626' : '#D97706'
              }}>
              {stats.season_ip_pace.toFixed(0)} IP pace
              {stats.season_ip_pace > 210 ? ' — workload watch' : ' — moderate load'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function GmLabContent({
    
  awayTeamName, homeTeamName,
  awayAbbr, homeAbbr,
  awayTeamId, homeTeamId,
  awayPrimaryColor, homePrimaryColor,
  awayPitcherName, homePitcherName,
  awayPitcherId, homePitcherId,
  awayPitcherStats, homePitcherStats,
  awayTeamData, homeTeamData,
  awayTransactions, homeTransactions,
  
}: GmLabContentProps) {


  return (
    <div className="space-y-10">

      {/* ── SECTION 1: IL BOARD ── */}
      <section>
        <SectionLabel>IL Board — Who's Missing Tonight</SectionLabel>
        <div className="grid md:grid-cols-2 gap-4">
          <ILBoard
            transactions={awayTransactions}
            teamName={awayTeamName}
            abbr={awayAbbr}
            primaryColor={awayPrimaryColor}
          />
          <ILBoard
            transactions={homeTransactions}
            teamName={homeTeamName}
            abbr={homeAbbr}
            primaryColor={homePrimaryColor}
          />
        </div>
      </section>

      {/* ── SECTION 2: ROSTER MOVES ── */}
      <section>
        <SectionLabel>Roster Intelligence — Last 14 Days</SectionLabel>
        <p className="text-xs font-serif italic text-stone-400 mb-4 -mt-2">
          Callups, options, trades, DFAs — the moves that reshape tonight's roster.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <RosterMoves transactions={awayTransactions} abbr={awayAbbr} />
          <RosterMoves transactions={homeTransactions} abbr={homeAbbr} />
        </div>
      </section>

      {/* ── SECTION 3: BULLPEN DECISION TREE ── */}
      <section>
        <SectionLabel>Bullpen Decision Tree</SectionLabel>
        <p className="text-xs font-serif italic text-stone-400 mb-4 -mt-2">
          Not just who's available — when they'll be used and what changes if the game gets close.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <BullpenDecisionTree
            teamData={awayTeamData}
            abbr={awayAbbr}
            primaryColor={awayPrimaryColor}
          />
          <BullpenDecisionTree
            teamData={homeTeamData}
            abbr={homeAbbr}
            primaryColor={homePrimaryColor}
          />
        </div>
      </section>

      {/* ── SECTION 4: STARTER INTEL ── */}
      <section>
        <SectionLabel>Starter Intelligence</SectionLabel>
        <p className="text-xs font-serif italic text-stone-400 mb-4 -mt-2">
          Platoon vulnerability, home/away splits, workload — what the pitching matchup really means.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <StarterIntel
            pitcherName={awayPitcherName}
            pitcherId={awayPitcherId}
            stats={awayPitcherStats}
            label="Away Starter"
            teamAbbr={awayAbbr}
            primaryColor={awayPrimaryColor}
          />
          <StarterIntel
            pitcherName={homePitcherName}
            pitcherId={homePitcherId}
            stats={homePitcherStats}
            label="Home Starter"
            teamAbbr={homeAbbr}
            primaryColor={homePrimaryColor}
          />
        </div>
      </section>

    </div>
  )
}