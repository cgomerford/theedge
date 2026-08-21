'use client'

/**
 * src/components/Top3KeyPlayersTab.tsx
 *
 * v3 CHANGES (per George's feedback on the zone drill-down):
 *   - FIXED: previously only ever showed the FIRST confirmed starter
 *     (batter cards) or the single toughest_matchup batter (pitcher
 *     cards), even though Top3Batter.per_pitcher and Top3Pitcher.per_batter
 *     already carry the full arrays. Added a horizontal matchup selector
 *     so every confirmed starter / every projected lineup batter is
 *     reachable, without stacking them all vertically.
 *   - REMOVED the Savant "Verify" links — George confirmed these were
 *     only ever for his own sanity-checking, not end-user facing.
 *   - Zone labels are currently NEUTRAL POSITIONAL PLACEHOLDERS (High/
 *     Middle/Low × Left/Middle/Right), NOT batter-relative "inside/
 *     outside" wording. Getting the in/out mapping wrong would mislabel
 *     every zone shown to a user — worse than a generic label. Real
 *     labels pending confirmation of fetch_pitcher_hot_zones.py's
 *     ZONE_LABELS (see getZoneLabel() below for the exact swap-in point).
 */

import { useState, useEffect } from 'react'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import type { KeyPlayerCandidate } from '@/lib/key-players'
import type { KeyPlayersSnapshot } from '@/lib/key-players'
import type { ZoneFitCell, PitchZoneFit, PitchTypeFitLine, BatterGameResult, PlateAppearanceResult } from '@/lib/series-matchup'
import type { PitcherGameResult } from '@/lib/pitcher-series-edge'
import { pickDrivingPitch, buildBatterNarrative, buildPitcherNarrative, buildStarterSummarySentence, getZoneLabel, type RecentFormContext } from '@/lib/key-players-narrative'
// ─── Zone labels — NEUTRAL PLACEHOLDER, see file header ──────────────────
// TODO: swap this for real batter-relative in/out wording once
// fetch_pitcher_hot_zones.py's ZONE_LABELS is confirmed. Do NOT guess the
// in/out mapping here — a wrong guess mislabels every zone shown to users.


// ─── Shared UI atoms ──────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-orange-600 font-semibold">§ {title}</p>
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white/80 border border-stone-150 rounded-xl px-2.5 py-2.5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className={`text-[15px] font-mono font-bold leading-none tracking-tight ${color ?? 'text-stone-900'}`}>{value}</div>
      <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1.5">{label}</div>
    </div>
  )
}

function leanStyle(lean: 'edge' | 'neutral' | 'tough') {
  if (lean === 'edge') return { label: 'Slight edge', color: 'text-emerald-700', bg: 'bg-emerald-50/70', border: 'border-emerald-100', dot: 'bg-emerald-400' }
  if (lean === 'tough') return { label: 'Tough matchup', color: 'text-rose-700', bg: 'bg-rose-50/80', border: 'border-rose-200/70', dot: 'bg-rose-500' }
  return { label: 'Neutral matchup', color: 'text-stone-600', bg: 'bg-stone-50', border: 'border-stone-200/70', dot: 'bg-stone-400' }
}

function scoreLean(score: number): 'edge' | 'neutral' | 'tough' {
  if (score > 0.03) return 'edge'
  if (score < -0.03) return 'tough'
  return 'neutral'
}

function fmtBa(ba: number): string {
  return ba.toFixed(3).replace(/^0/, '')
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] ?? fullName
}

const RANK_STYLES = [
  { badge: 'bg-orange-500 text-white shadow-sm shadow-orange-200', ring: 'ring-1 ring-orange-200/80', avatarRing: 'ring-2 ring-orange-400/60 ring-offset-2 ring-offset-white' },
  { badge: 'bg-stone-700 text-white', ring: 'ring-1 ring-stone-200/80', avatarRing: 'ring-2 ring-stone-300/70 ring-offset-2 ring-offset-white' },
  { badge: 'bg-stone-400 text-white', ring: 'ring-1 ring-stone-200/60', avatarRing: 'ring-2 ring-stone-200/80 ring-offset-2 ring-offset-white' },
]

const ZONE_GRID = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

// ─── Matchup option — one confirmed starter (batter card) or one
// projected lineup batter (pitcher card) ──────────────────────────────

type MatchupOption = {
  key: string
  label: string
  batSide: string | null
  zoneCells: ZoneFitCell[]
  pitchZoneFit: PitchZoneFit[]
  pitchTypeFit: PitchTypeFitLine[]
}

// ─── Per-starter breakdown — always visible, not gated behind expand ─────

function StarterBreakdown({ summary, perStarter }: {
  summary: string | null
  perStarter: { pitcherName: string; lean: 'edge' | 'neutral' | 'tough' }[]
}) {
  if (!summary && perStarter.length === 0) return null
  return (
    <div className="px-3.5 sm:px-4 pb-3 space-y-2">
      {summary && <p className="text-[12px] font-serif text-stone-600 italic leading-relaxed">{summary}</p>}
      {perStarter.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {perStarter.map((p) => {
            const style = leanStyle(p.lean)
            return (
              <span key={p.pitcherName} className={`text-[10px] font-mono px-2 py-1 rounded-md border ${style.bg} ${style.border} ${style.color}`}>
                vs {p.pitcherName}: {p.lean}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Matchup selector — horizontal pill row, scrolls instead of stacking
// vertically. Same pattern for both card types (confirmed starters for
// batters, projected lineup for pitchers). ────────────────────────────

function MatchupSelector({ options, activeKey, onSelect }: {
  options: MatchupOption[]
  activeKey: string
  onSelect: (key: string) => void
}) {
  if (options.length <= 1) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onSelect(o.key)}
          className={`shrink-0 text-[10px] font-mono uppercase tracking-wide px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition ${
            o.key === activeKey ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
          }`}
        >
          vs {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Zone matchup grid — now takes ONE matchup option at a time, plus the
// selector that switches which one is active ──────────────────────────

function ZoneMatchupGrid({ options, flip = false, subjectSurname }: { options: MatchupOption[]; flip?: boolean; subjectSurname: string }) {
  const [activeOptionKey, setActiveOptionKey] = useState(options[0]?.key ?? '')
  const [activeZone, setActiveZone] = useState<string | null>(null)

  const activeOption = options.find((o) => o.key === activeOptionKey) ?? options[0]
  if (!activeOption) return null

  // Some pitchers/batters genuinely have no zone data yet (thin sample,
  // just called up, etc.) — show that honestly instead of the grid
  // silently vanishing, which looked like a broken card rather than a
  // "no data" state.
  const hasZoneData = activeOption.zoneCells.length > 0

  const byZone = new Map(activeOption.zoneCells.map((c) => [c.zone, c]))
  const activeZonePitches = activeZone
    ? activeOption.pitchZoneFit
        .map((p) => ({ pitch: p, cell: p.cells.find((c) => c.zone === activeZone) }))
        .filter((x): x is { pitch: PitchZoneFit; cell: NonNullable<typeof x.cell> } => !!x.cell && (x.cell.pitcher_usage_pct ?? 0) > 0)
        .sort((a, b) => (b.cell.pitcher_usage_pct ?? 0) - (a.cell.pitcher_usage_pct ?? 0))
    : []

  return (
    <div className="space-y-2">
      <MatchupSelector
        options={options}
        activeKey={activeOption.key}
        onSelect={(key) => { setActiveOptionKey(key); setActiveZone(null) }}
      />

      {!hasZoneData ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-center">
          <p className="text-[12px] font-serif text-stone-400 italic leading-relaxed">
            No zone-level data yet for {flip ? activeOption.label : subjectSurname} vs {flip ? subjectSurname : activeOption.label}
            {options.length > 1 ? ' — try another matchup above.' : '.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium">
              Zone-by-zone{activeOption.batSide ? ` · ${activeOption.batSide}HB` : ''}
            </p>
            <p className="text-[9px] font-mono text-stone-300">Tap a zone to see why</p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {ZONE_GRID.flat().map((zone) => {
              const cell = byZone.get(zone)
              if (!cell) return <div key={zone} className="bg-stone-50/80 border border-stone-100 rounded-xl p-2.5 min-h-[64px]" />
              const tilt = flip ? -cell.tilt : cell.tilt
              const lean = scoreLean(tilt)
              const style = leanStyle(lean)
              const hasBreakdown = activeOption.pitchZoneFit.some((p) => (p.cells.find((c) => c.zone === zone)?.pitcher_usage_pct ?? 0) > 0)
              const isActive = activeZone === zone
              return (
                <button key={zone} type="button"
                  onClick={() => hasBreakdown && setActiveZone(isActive ? null : zone)}
                  className={`relative rounded-xl border p-2.5 min-h-[64px] text-left transition-all ${style.bg} ${style.border} ${hasBreakdown ? 'cursor-pointer hover:brightness-95' : 'cursor-default opacity-70'} ${isActive ? 'ring-2 ring-orange-400' : ''}`}
                >
                  <span className="absolute top-1.5 left-2 text-[9px] font-mono text-stone-300/90 font-medium">{zone}</span>
                  {hasBreakdown && <span className="absolute top-1.5 right-2 text-[8px] font-mono text-orange-500">●</span>}
                  <div className="mt-3">
                    <p className={`text-[10px] font-mono font-semibold leading-tight ${style.color}`}>{style.label}</p>
                    <p className="text-[9px] font-mono text-stone-400 mt-1">{cell.pitcher_usage_pct ?? 0}% usage</p>
                  </div>
                </button>
              )
            })}
          </div>

          {activeZone && activeZonePitches.length > 0 && (() => {
            const zoneCell = byZone.get(activeZone)
            return (
              <div className="mt-3 bg-white border border-orange-200/70 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-orange-600 font-semibold">Zone {activeZone}</p>
                    <p className="text-[10px] font-serif text-stone-500 italic mt-0.5">{getZoneLabel(activeZone, activeOption.batSide)}</p>
                    <p className="text-[9px] font-mono text-stone-400 mt-1">The lean above is blended across everything he throws here — each pitch below is broken out separately.</p>
                  </div>
                  {zoneCell?.batter_xwoba != null && (
                    <span className="text-[10px] font-mono text-stone-500 shrink-0">Batter xwOBA: <span className="font-bold text-stone-800">{fmtBa(zoneCell.batter_xwoba)}</span></span>
                  )}
                </div>

                {activeZonePitches.map(({ pitch, cell }) => {
                  const matchedTypeFit = activeOption.pitchTypeFit.find((f) => f.pitch_type === pitch.pitch_type)
                  return (
                    <div key={pitch.pitch_type} className="border-b border-stone-100 last:border-0 pb-3 last:pb-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[12px] font-serif font-bold text-stone-800">{pitch.pitch_name}</span>
                        {matchedTypeFit?.is_put_away_pitch && (
                          <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200/80 shrink-0">Put-away</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="bg-stone-50 rounded-lg px-2 py-1.5">
                          <span className="text-stone-400 block mb-0.5">
                            {flip ? subjectSurname : activeOption.label}'s {pitch.pitch_name.toLowerCase()} here, all batters
                          </span>
                          <span className="font-bold text-stone-700">{cell.pitcher_ba_against != null ? fmtBa(cell.pitcher_ba_against) : '—'} BA</span>
                          {cell.pitcher_whiff_pct != null && <span className="text-stone-400"> · {cell.pitcher_whiff_pct.toFixed(0)}% whiff</span>}
                        </div>
                        <div className="bg-stone-50 rounded-lg px-2 py-1.5">
                          <span className="text-stone-400 block mb-0.5">
                            {flip ? activeOption.label : subjectSurname} vs similar velo, any pitcher{matchedTypeFit?.pitcher_avg_velo != null ? ` (~${matchedTypeFit.pitcher_avg_velo.toFixed(1)}mph)` : ''}
                          </span>
                          {cell.batter_velocity_matched_low_sample || cell.batter_velocity_matched_ba == null ? (
                            <span className="text-stone-400 italic">0 pitches seen</span>
                          ) : (
                            <span className="font-bold text-stone-700">{fmtBa(cell.batter_velocity_matched_ba)} BA <span className="text-stone-400">n={cell.batter_velocity_matched_ab}</span></span>
                          )}
                        </div>
                      </div>

                      <div className="bg-orange-50/50 border border-orange-100 rounded-lg px-2 py-1.5 mt-2">
                        <span className="text-[10px] font-mono text-orange-700 block mb-0.5">
                          {flip ? activeOption.label : subjectSurname} vs {flip ? subjectSurname : activeOption.label}, exactly
                        </span>
                        {cell.batter_vs_this_pitcher_ab === 0 || cell.batter_vs_this_pitcher_ba == null ? (
                          <span className="text-[10px] font-mono text-stone-400 italic">0 pitches seen — true head-to-head is rare at this level of detail</span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-stone-700">{fmtBa(cell.batter_vs_this_pitcher_ba)} BA <span className="text-stone-400">n={cell.batter_vs_this_pitcher_ab}</span></span>
                        )}
                      </div>

                      {matchedTypeFit?.season_ba != null && (
                        <p className="text-[9px] font-mono text-stone-400 mt-1.5">
                          This year: <span className="text-stone-600 font-bold">{fmtBa(matchedTypeFit.season_ba)}</span> ({matchedTypeFit.season_ab} AB)
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

// ─── Narrative box ────────────────────────────────────────────────────────

function WhyThisWorks({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="bg-orange-50/60 border border-orange-200/60 rounded-xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-orange-600 font-semibold mb-2">Why this matchup works</p>
      <p className="text-[13px] font-serif text-stone-700 leading-relaxed">{text}</p>
    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────

type CardData = {
  rank: number
  kind: 'batter' | 'pitcher'
  playerId: number
  playerName: string
  teamAbbr: string
  lean: 'edge' | 'neutral' | 'tough'
  headline: string | null
  starterSummary: string | null
  perStarter: { pitcherName: string; lean: 'edge' | 'neutral' | 'tough' }[]
  matchupOptions: MatchupOption[]
  gamePk: number
  gameDate: string
  opposingPitcherId?: number
}

function KeyPlayerCard({ data, isFinal }: { data: CardData; isFinal: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [batterResult, setBatterResult] = useState<BatterGameResult>(null)
  const [pitcherResult, setPitcherResult] = useState<PitcherGameResult>(null)
  const [pbp, setPbp] = useState<PlateAppearanceResult[] | null | undefined>(undefined)
  const style = RANK_STYLES[data.rank] ?? RANK_STYLES[2]
  const lean = leanStyle(data.lean)
  const isPitcher = data.kind === 'pitcher'

  useEffect(() => {
    if (!expanded || !isFinal) return
    let cancelled = false

    if (isPitcher) {
      fetch(`/api/pitcher-game-result?playerId=${data.playerId}&gamePk=${data.gamePk}&gameDate=${data.gameDate}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => { if (!cancelled) setPitcherResult(r) })
        .catch(() => { if (!cancelled) setPitcherResult(null) })
    } else {
      fetch(`/api/batter-game-result?playerId=${data.playerId}&gamePk=${data.gamePk}&gameDate=${data.gameDate}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => {
          if (cancelled) return
          setBatterResult(r)
          if (r && data.opposingPitcherId) {
            const qs = new URLSearchParams({
              batterId: String(data.playerId), pitcherId: String(data.opposingPitcherId),
              gamePk: String(data.gamePk), pitchTypeFit: '[]',
            })
            fetch(`/api/batter-pitch-by-pitch?${qs.toString()}`)
              .then((r2) => (r2.ok ? r2.json() : null))
              .then((r2) => { if (!cancelled) setPbp(r2) })
              .catch(() => { if (!cancelled) setPbp(null) })
          }
        })
        .catch(() => { if (!cancelled) setBatterResult(null) })
    }
    return () => { cancelled = true }
  }, [expanded, isFinal, isPitcher, data.playerId, data.gamePk, data.gameDate, data.opposingPitcherId])

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${style.ring} transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]`}>
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-stone-50/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 focus-visible:ring-inset"
        aria-expanded={expanded}>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-mono font-bold shrink-0 ${style.badge}`}>{data.rank + 1}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={playerHeadshotUrl(data.playerId)} alt={data.playerName} className={`w-11 h-11 rounded-full object-cover bg-stone-100 shrink-0 ${style.avatarRing}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-stone-900 text-[15px] leading-tight truncate tracking-tight">{data.playerName}</span>
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 border border-stone-200 shrink-0">
              {isPitcher ? `SP · ${data.teamAbbr}` : data.teamAbbr}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-mono font-semibold ${lean.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${lean.dot}`} />{lean.label}
            </span>
          </div>
        </div>
        <Chevron open={expanded} />
      </button>

      {!isPitcher && <StarterBreakdown summary={data.starterSummary} perStarter={data.perStarter} />}

      {expanded && (
        <div className="border-t border-stone-100/80 p-3.5 sm:p-4 space-y-4 bg-[#FAF8F3]">
          {data.matchupOptions.length > 0 && (
            <ZoneMatchupGrid options={data.matchupOptions} flip={isPitcher} subjectSurname={lastName(data.playerName)} />
          )}

          <WhyThisWorks text={data.headline} />

          {isFinal && isPitcher && pitcherResult && (
            <div className="pt-3 border-t border-stone-100">
              <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium mb-2">How he performed</p>
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="IP" value={pitcherResult.ip} />
                <StatBox label="ER" value={pitcherResult.er} />
                <StatBox label="K" value={pitcherResult.k} color="text-emerald-600" />
                <StatBox label="BB" value={pitcherResult.bb} />
              </div>
            </div>
          )}

          {isFinal && !isPitcher && batterResult && (
            <div className="pt-3 border-t border-stone-100">
              <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium mb-2">What actually happened</p>
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="AB" value={batterResult.ab} />
                <StatBox label="H" value={batterResult.hits} />
                <StatBox label="HR" value={batterResult.home_runs} color={batterResult.home_runs > 0 ? 'text-emerald-600' : undefined} />
                <StatBox label="K" value={batterResult.strikeouts} />
              </div>
              {pbp && pbp.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {pbp.map((pa, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-white border border-stone-150">
                      <span className="text-[12px] font-serif font-bold text-stone-800">{pa.pitch_name ?? pa.pitch_type ?? 'Unknown'}</span>
                      <span className={`text-[12px] font-mono font-semibold ${pa.is_hit ? 'text-emerald-600' : 'text-stone-500'}`}>{pa.event ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isFinal && ((isPitcher && !pitcherResult) || (!isPitcher && !batterResult)) && (
            <p className="text-[11px] font-mono text-stone-400 italic">Loading result…</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────

type PregameProps = {
  variant: 'pregame'
  candidates: KeyPlayerCandidate[]
  teamName: string
  teamId: number
  formByPlayerId: Record<string, RecentFormContext>
}

type PostgameProps = {
  variant: 'postgame'
  snapshot: KeyPlayersSnapshot[]
  teamName: string
  teamId: number
}

type Props = PregameProps | PostgameProps

export default function Top3KeyPlayersTab(props: Props) {
  const { teamName, teamId } = props
  const formByPlayerId = props.variant === 'pregame' ? (props.formByPlayerId ?? {}) : {}

  const cards: CardData[] = props.variant === 'pregame'
    ? props.candidates.map((c, i): CardData => {
        if (c.kind === 'batter') {
          const topLine = c.batter.per_pitcher[0] ?? null
          const drivingPitch = topLine ? pickDrivingPitch(topLine.pitch_type_fit) : null
          const zone = topLine ? [...topLine.zone_fit].sort((a, b) => b.tilt - a.tilt)[0]?.zone ?? null : null
          const form = formByPlayerId[String(c.batter.player_id)] ?? null
          const headline = (topLine && drivingPitch && zone)
            ? buildBatterNarrative(c.batter.player_name, topLine.pitcher_name, zone, drivingPitch, form, c.batter.bat_side)
            : null
          const perStarter = c.batter.per_pitcher.map((p) => ({
            pitcherName: p.pitcher_name,
            lean: scoreLean(p.zone_score + p.pitch_type_fit_score),
          }))

          return {
            rank: i, kind: 'batter', playerId: c.batter.player_id, playerName: c.batter.player_name,
            teamAbbr: '', lean: scoreLean(c.score), headline,
            starterSummary: buildStarterSummarySentence(c.batter), perStarter,
            matchupOptions: c.batter.per_pitcher.map((p) => ({
              key: String(p.pitcher_id), label: p.pitcher_name, batSide: c.batter.bat_side,
              zoneCells: p.zone_fit, pitchZoneFit: p.pitch_zone_fit, pitchTypeFit: p.pitch_type_fit,
            })),
            gamePk: topLine?.gamePk ?? 0, gameDate: topLine?.game_date ?? '',
            opposingPitcherId: topLine?.pitcher_id,
          }
        }
        const tough = c.pitcher.toughest_matchup
        const drivingPitch = tough ? pickDrivingPitch(tough.pitch_type_fit) : null
        const zone = tough ? [...tough.zone_fit].sort((a, b) => a.tilt - b.tilt)[0]?.zone ?? null : null
        const form = formByPlayerId[String(c.pitcher.pitcher_id)] ?? null
        const headline = (tough && drivingPitch && zone)
          ? buildPitcherNarrative(c.pitcher.pitcher_name, tough.batter_name, zone, drivingPitch, drivingPitch.pitcher_usage_pct ?? 0, form, tough.bat_side)
          : null

        return {
          rank: i, kind: 'pitcher', playerId: c.pitcher.pitcher_id, playerName: c.pitcher.pitcher_name,
          teamAbbr: '', lean: scoreLean(c.score), headline,
          starterSummary: null, perStarter: [],
          matchupOptions: c.pitcher.per_batter.map((b) => ({
            key: String(b.batter_id), label: b.batter_name, batSide: b.bat_side,
            zoneCells: b.zone_fit, pitchZoneFit: b.pitch_zone_fit, pitchTypeFit: b.pitch_type_fit,
          })),
          gamePk: c.pitcher.gamePk, gameDate: c.pitcher.game_date,
        }
      })
    : props.snapshot.map((s): CardData => ({
        rank: s.rank - 1, kind: s.player_type, playerId: s.player_id, playerName: s.player_name,
        teamAbbr: '', lean: s.lean, headline: s.narrative,
        starterSummary: s.reason_summary.starter_summary ?? null,
        perStarter: (s.reason_summary.per_starter ?? []).map((p: any) => ({
          pitcherName: p.pitcher_name, lean: scoreLean(p.combined_score),
        })),
        matchupOptions: (s.reason_summary.matchup_options ?? []).map((o: any) => ({
          key: o.key, label: o.label, batSide: o.bat_side,
          zoneCells: o.zone_fit ?? [], pitchZoneFit: o.pitch_zone_fit ?? [], pitchTypeFit: o.pitch_type_fit ?? [],
        })),
        gamePk: 0, gameDate: '',
      }))

  return (
    <div className="border border-stone-200/80 bg-white rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teamLogoUrl(teamId)} alt={teamName} className="w-6 h-6 object-contain shrink-0" />
          <SectionLabel title={`Top 3 Key Players · ${teamName}`} />
        </div>
      </div>

      <div className="text-[11px] font-mono text-stone-400 mb-5 tracking-wide">
        {props.variant === 'postgame' ? "Final — here's how each read played out" : 'Confirmed starter + top lineup fits, ranked together'}
      </div>

      {cards.length === 0 ? (
        <div className="py-10 px-4 text-center">
          <p className="text-[15px] font-serif text-stone-400 italic leading-relaxed">
            Waiting on a confirmed starter and lineup — check back closer to first pitch.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <KeyPlayerCard key={`${c.kind}-${c.playerId}`} data={c} isFinal={props.variant === 'postgame'} />
          ))}
        </div>
      )}
    </div>
  ) 
}