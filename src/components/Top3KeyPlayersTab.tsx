'use client'

/**
 * src/components/Top3KeyPlayersTab.tsx
 *
 * v5 — REDESIGN (first pass). The card is now the product, not a teaser for
 * the popup:
 *
 *   CARD   — rank, headshot, lean, then the FIVE things that make the
 *            matchup favour him, each with a micro-graphic (form sparkline,
 *            platoon / day-night split bars, hot-zone mini-board, pitch
 *            bars, spray-vs-defender field, percentile meters…). Those
 *            factors come from key-player-factors.ts, computed server-side
 *            and frozen into the snapshot for the postgame card.
 *   POPUP  — full-size factor tiles with the one-sentence "why", a zone
 *            board with hot-zone overlays (matchup lean / his xwOBA / the
 *            pitcher's location / swing-and-miss), a pitch-by-pitch
 *            breakdown that explains every pitch, and a Lab deep link.
 *   FINAL  — a report card on the card itself: 1–5 outcome rating, the
 *            recorded line, and whether the pregame read held up.
 *
 * Pro gating: free users see the first two factors in full and the titles of
 * the rest locked; the popup is Pro-only (LockedTeaser for free).
 */

import { useMemo, useState } from 'react'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import type { KeyPlayerCandidate, KeyPlayersSnapshot } from '@/lib/key-players'
import type { ZoneFitCell, PitchZoneFit, PitchTypeFitLine, BatterGameResult, PlateAppearanceResult } from '@/lib/series-matchup'
import type { PitcherGameResult } from '@/lib/pitcher-series-edge'
import type { MatchupFactor } from '@/lib/key-player-factors'
import { rateBatter, ratePitcher, type OutcomeRating } from '@/lib/key-player-rating'
import {
  pickDrivingPitch, bestBatterLine, buildBatterNarrative, buildPitcherNarrative, buildStarterSummarySentence,
  getZoneLabel, type RecentFormContext,
} from '@/lib/key-players-narrative'
import type { ParkFactor } from '@/lib/parks'
import { TiltBoard, CHASE_ALIGN } from '@/components/pitching-lab/ZoneGrid'
import DetailModal from '@/components/game-preview/DetailModal'
import LabFunnelLink from '@/components/game-preview/LabFunnelLink'
import FactorGraphic from '@/components/key-players/FactorVisuals'

const LG_BA = 0.245
type Lean = 'edge' | 'neutral' | 'tough'

// ─── Shared atoms ─────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-orange-600 font-semibold">§ {title}</p>
}

function SubHead({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-500 font-semibold">{children}</p>
      {hint && <p className="text-[9px] font-mono text-stone-300">{hint}</p>}
    </div>
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

function leanStyle(lean: Lean) {
  if (lean === 'edge') return { label: 'Slight edge', color: 'text-emerald-700', bg: 'bg-emerald-50/70', border: 'border-emerald-100', dot: 'bg-emerald-400' }
  if (lean === 'tough') return { label: 'Tough matchup', color: 'text-rose-700', bg: 'bg-rose-50/80', border: 'border-rose-200/70', dot: 'bg-rose-500' }
  return { label: 'Neutral matchup', color: 'text-stone-600', bg: 'bg-stone-50', border: 'border-stone-200/70', dot: 'bg-stone-400' }
}

function scoreLean(score: number): Lean {
  if (score > 0.03) return 'edge'
  if (score < -0.03) return 'tough'
  return 'neutral'
}

function fmtBa(ba: number): string {
  return ba.toFixed(3).replace(/^0/, '')
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
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

// ─── Types ────────────────────────────────────────────────────────────────

type MatchupOption = {
  key: string
  label: string
  batSide: string | null
  zoneCells: ZoneFitCell[]
  pitchZoneFit: PitchZoneFit[]
  pitchTypeFit: PitchTypeFitLine[]
  isLineup?: boolean
}

// JSONB shapes on a KeyPlayersSnapshot row.
type RawPerStarter = { pitcher_name: string; combined_score: number }
type RawMatchupOption = {
  key: string; label: string; bat_side: string | null
  zone_fit?: ZoneFitCell[]; pitch_zone_fit?: PitchZoneFit[]; pitch_type_fit?: PitchTypeFitLine[]
}

export type PostgameResults = Record<string, {
  batter: BatterGameResult
  pitcher: PitcherGameResult
  pbp: PlateAppearanceResult[] | null
}>

type CardData = {
  rank: number
  kind: 'batter' | 'pitcher'
  playerId: number
  playerName: string
  lean: Lean
  headline: string | null
  starterSummary: string | null
  perStarter: { pitcherName: string; lean: Lean }[]
  factors: MatchupFactor[]
  matchupOptions: MatchupOption[]
  focusKey: string | null
}

// ─── Combined lineup (pitcher popups) ─────────────────────────────────────
// A pitcher's per-batter options answer "how does he handle this hitter";
// this rolls them into one "whole lineup" view so the popup can show where the
// lineup as a whole is beaten. Pitcher-side numbers (usage, BA against, whiff)
// are the same for every hitter so they are just averaged; hitter-side numbers
// are pooled, weighted by each hitter's sample.

const LINEUP_KEY = 'lineup'
const LINEUP_MIN_AB = 8

function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null)
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function pooled(xs: { v: number | null; ab: number }[]): { v: number | null; ab: number } {
  const ok = xs.filter((x) => x.v != null && x.ab > 0)
  const ab = ok.reduce((sum, x) => sum + x.ab, 0)
  return { v: ab > 0 ? ok.reduce((sum, x) => sum + (x.v as number) * x.ab, 0) / ab : null, ab }
}

function buildLineupOption(options: MatchupOption[]): MatchupOption | null {
  if (options.length < 2) return null

  const zones = [...new Set(options.flatMap((o) => o.zoneCells.map((c) => c.zone)))]
  const zoneCells: ZoneFitCell[] = zones.map((zone) => {
    const cells = options.map((o) => o.zoneCells.find((c) => c.zone === zone)).filter((c): c is ZoneFitCell => !!c)
    return {
      zone,
      batter_xwoba: mean(cells.map((c) => c.batter_xwoba)),
      pitcher_ba_against: mean(cells.map((c) => c.pitcher_ba_against)),
      pitcher_whiff_pct: mean(cells.map((c) => c.pitcher_whiff_pct)),
      pitcher_usage_pct: mean(cells.map((c) => c.pitcher_usage_pct)),
      tilt: mean(cells.map((c) => c.tilt)) ?? 0,
    }
  })

  const pitchTypes = [...new Map(options.flatMap((o) => o.pitchZoneFit.map((p) => [p.pitch_type, p.pitch_name] as const))).entries()]
  const pitchZoneFit: PitchZoneFit[] = pitchTypes.map(([pitch_type, pitch_name]) => {
    const grids = options.map((o) => o.pitchZoneFit.find((p) => p.pitch_type === pitch_type)).filter((p): p is PitchZoneFit => !!p)
    const pitchZones = [...new Set(grids.flatMap((g) => g.cells.map((c) => c.zone)))]
    return {
      pitch_type, pitch_name,
      cells: pitchZones.map((zone) => {
        const cells = grids.map((g) => g.cells.find((c) => c.zone === zone)).filter((c): c is PitchZoneFit['cells'][number] => !!c)
        const vel = pooled(cells.map((c) => ({ v: c.batter_velocity_matched_ba, ab: c.batter_velocity_matched_ab })))
        const h2h = pooled(cells.map((c) => ({ v: c.batter_vs_this_pitcher_ba, ab: c.batter_vs_this_pitcher_ab })))
        return {
          zone,
          pitcher_ba_against: mean(cells.map((c) => c.pitcher_ba_against)),
          pitcher_whiff_pct: mean(cells.map((c) => c.pitcher_whiff_pct)),
          pitcher_usage_pct: mean(cells.map((c) => c.pitcher_usage_pct)),
          tilt: mean(cells.map((c) => c.tilt)) ?? 0,
          batter_velocity_matched_ba: vel.v,
          batter_velocity_matched_ab: vel.ab,
          batter_velocity_matched_low_sample: vel.ab < LINEUP_MIN_AB,
          batter_vs_this_pitcher_ba: h2h.v,
          batter_vs_this_pitcher_ab: h2h.ab,
        }
      }),
    }
  })

  const pitchTypeFit: PitchTypeFitLine[] = pitchTypes.map(([pitch_type]) => {
    const lines = options.map((o) => o.pitchTypeFit.find((l) => l.pitch_type === pitch_type)).filter((l): l is PitchTypeFitLine => !!l)
    const vel = pooled(lines.map((l) => ({ v: l.velocity_matched_ba, ab: l.velocity_matched_ab })))
    const season = pooled(lines.map((l) => ({ v: l.season_ba, ab: l.season_ab })))
    return {
      ...lines[0],
      velocity_matched_ba: vel.v,
      velocity_matched_ab: vel.ab,
      velocity_matched_pa: lines.reduce((sum, l) => sum + l.velocity_matched_pa, 0),
      velocity_matched_low_sample: vel.ab < LINEUP_MIN_AB,
      season_ba: season.v,
      season_ab: season.ab,
      season_pa: lines.reduce((sum, l) => sum + l.season_pa, 0),
    }
  })

  return { key: LINEUP_KEY, label: 'the lineup', batSide: null, zoneCells, pitchZoneFit, pitchTypeFit, isLineup: true }
}

// Zones are catcher-view, so "inside" flips with handedness — a lineup mixes both.
function zoneLabelFor(zone: string, option: MatchupOption): string {
  if (!option.isLineup) return getZoneLabel(zone, option.batSide)
  const r = getZoneLabel(zone, 'R'), l = getZoneLabel(zone, 'L')
  return r === l ? r : `${r} to righties · ${l} to lefties`
}

// ─── Factor rows (card) + tiles (popup) ───────────────────────────────────

function FactorRow({ f, locked }: { f: MatchupFactor; locked?: boolean }) {
  const against = f.direction === 'against'
  if (locked) {
    return (
      <li className="flex items-center gap-3 px-3 py-2 rounded-xl bg-stone-50 border border-dashed border-stone-200">
        <span className="w-[76px] flex justify-center text-stone-300 text-[15px]">⊕</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-sans font-semibold text-stone-500 truncate">{f.title}</p>
          <p className="text-[9px] font-mono uppercase tracking-wider text-amber-600">Pro · unlock the numbers</p>
        </div>
      </li>
    )
  }
  return (
    <li className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${against ? 'bg-rose-50/40 border-rose-100' : 'bg-white border-stone-150'}`}>
      <div className="w-[92px] min-h-[40px] flex items-center justify-center shrink-0">
        <FactorGraphic visual={f.visual} compact />
        {!f.visual && <span className={`w-2 h-2 rounded-full ${against ? 'bg-rose-400' : 'bg-emerald-400'}`} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[9px] font-mono uppercase tracking-[0.1em] font-semibold ${against ? 'text-rose-600' : 'text-emerald-700'}`}>
          {against ? 'Working against · ' : ''}{f.title}
        </p>
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-snug truncate">{f.stat}</p>
      </div>
    </li>
  )
}

function FactorTile({ f }: { f: MatchupFactor }) {
  const against = f.direction === 'against'
  return (
    <div className={`rounded-xl border p-3.5 ${against ? 'bg-rose-50/40 border-rose-100' : 'bg-white border-stone-200'}`}>
      <p className={`text-[9px] font-mono uppercase tracking-[0.1em] font-semibold mb-1 ${against ? 'text-rose-600' : 'text-emerald-700'}`}>
        {against ? 'Working against · ' : ''}{f.title}
      </p>
      <p className="text-[15px] font-sans font-bold text-stone-900 leading-snug">{f.stat}</p>
      {f.visual && <div className="my-3 flex justify-center"><FactorGraphic visual={f.visual} /></div>}
      <p className="text-[12px] font-sans text-stone-600 leading-relaxed">{f.detail}</p>
    </div>
  )
}

// ─── Postgame rating ──────────────────────────────────────────────────────

const VERDICT_STYLE = {
  called_it: { text: 'Called it', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  missed: { text: 'Missed', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  push: { text: 'Push', cls: 'bg-stone-50 text-stone-600 border-stone-200' },
} as const

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= n ? 'bg-orange-500' : 'bg-stone-200'}`} />
      ))}
    </span>
  )
}

function RatingStrip({ rating }: { rating: OutcomeRating | null }) {
  if (!rating) {
    return <p className="px-3.5 sm:px-4 pb-3 text-[11px] font-mono text-stone-400 italic">Result not available yet.</p>
  }
  const v = VERDICT_STYLE[rating.verdict]
  return (
    <div className="mx-3.5 sm:mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl bg-stone-50 border border-stone-200/80 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Stars n={rating.stars} />
          <span className="text-[12px] font-sans font-bold text-stone-900">{rating.label}</span>
        </div>
        <p className="text-[11px] font-mono text-stone-500 mt-1 truncate">{rating.line}</p>
      </div>
      <span className={`shrink-0 text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-1 rounded-md border ${v.cls}`}>{v.text}</span>
    </div>
  )
}

// ─── Zone board with hot-zone overlays ────────────────────────────────────

type OverlayMode = 'matchup' | 'xwoba' | 'usage' | 'whiff'

const OVERLAYS: { key: OverlayMode; label: string; legend: [string, string][] }[] = [
  { key: 'matchup', label: 'Matchup lean', legend: [['bg-emerald-200', 'Favours the key player'], ['bg-stone-200', 'Even'], ['bg-rose-200', 'Favours the other side']] },
  { key: 'xwoba', label: 'Hitter hot zones', legend: [['bg-sky-200', 'Cold'], ['bg-stone-100', 'Average'], ['bg-orange-300', 'Hot (xwOBA)']] },
  { key: 'usage', label: 'Pitcher location', legend: [['bg-orange-100', 'Rarely thrown'], ['bg-orange-300', 'Moderate'], ['bg-orange-500', 'Heavily used']] },
  { key: 'whiff', label: 'Swing & miss', legend: [['bg-stone-100', 'Low whiff'], ['bg-blue-300', 'Some'], ['bg-blue-500', 'High whiff']] },
]

function zoneToneClasses(lean: Lean) {
  if (lean === 'edge') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (lean === 'tough') return 'bg-rose-50 border-rose-200 text-rose-700'
  return 'bg-stone-100 border-stone-200 text-stone-500'
}

function overlayCell(mode: OverlayMode, c: ZoneFitCell, flip: boolean): { cls: string; main: string; sub: string } {
  if (mode === 'xwoba') {
    const v = c.batter_xwoba
    const cls = v == null ? 'bg-stone-50 border-stone-100 text-stone-300'
      : v >= 0.42 ? 'bg-orange-500 border-orange-500 text-white'
      : v >= 0.36 ? 'bg-orange-300 border-orange-300 text-stone-900'
      : v >= 0.30 ? 'bg-orange-100 border-orange-200 text-stone-700'
      : v >= 0.25 ? 'bg-stone-100 border-stone-200 text-stone-600'
      : 'bg-sky-200 border-sky-300 text-stone-800'
    return { cls, main: v != null ? fmtBa(v) : '—', sub: 'xwOBA' }
  }
  if (mode === 'usage') {
    const v = c.pitcher_usage_pct ?? 0
    const cls = v >= 12 ? 'bg-orange-500 border-orange-500 text-white' : v >= 8 ? 'bg-orange-300 border-orange-300 text-stone-900' : v >= 4 ? 'bg-orange-100 border-orange-200 text-stone-700' : 'bg-stone-100 border-stone-200 text-stone-500'
    return { cls, main: `${v}%`, sub: 'of pitches' }
  }
  if (mode === 'whiff') {
    const v = c.pitcher_whiff_pct
    const cls = v == null ? 'bg-stone-50 border-stone-100 text-stone-300'
      : v >= 32 ? 'bg-blue-500 border-blue-500 text-white'
      : v >= 25 ? 'bg-blue-300 border-blue-300 text-stone-900'
      : v >= 18 ? 'bg-blue-100 border-blue-200 text-stone-700'
      : 'bg-stone-100 border-stone-200 text-stone-500'
    return { cls, main: v != null ? `${v.toFixed(0)}%` : '—', sub: 'whiff' }
  }
  const lean = scoreLean(flip ? -c.tilt : c.tilt)
  return { cls: zoneToneClasses(lean), main: lean === 'edge' ? 'Edge' : lean === 'tough' ? 'Tough' : 'Even', sub: `${c.pitcher_usage_pct ?? 0}%` }
}

function ZoneBoardPanel({ option, flip, subjectSurname }: { option: MatchupOption; flip: boolean; subjectSurname: string }) {
  const [mode, setMode] = useState<OverlayMode>('matchup')
  const [activeZone, setActiveZone] = useState<string | null>(null)

  const hasZoneData = option.zoneCells.length > 0
  const byZone = new Map(option.zoneCells.map((c) => [c.zone, c]))
  const activeZonePitches = activeZone
    ? option.pitchZoneFit
        .map((p) => ({ pitch: p, cell: p.cells.find((c) => c.zone === activeZone) }))
        .filter((x): x is { pitch: PitchZoneFit; cell: NonNullable<typeof x.cell> } => !!x.cell && (x.cell.pitcher_usage_pct ?? 0) > 0)
        .sort((a, b) => (b.cell.pitcher_usage_pct ?? 0) - (a.cell.pitcher_usage_pct ?? 0))
    : []
  const overlay = OVERLAYS.find((o) => o.key === mode) ?? OVERLAYS[0]

  if (!hasZoneData) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-center">
        <p className="text-[12px] font-sans text-stone-400 italic leading-relaxed">
          No zone-level data yet for {flip ? option.label : subjectSurname} vs {flip ? subjectSurname : option.label}.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {OVERLAYS.map((o) => (
          <button key={o.key} type="button" onClick={() => setMode(o.key)}
            className={`text-[10px] font-mono uppercase tracking-wide px-2.5 py-1.5 rounded-lg border transition ${
              mode === o.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}>
            {o.label}
          </button>
        ))}
      </div>

      <TiltBoard
        renderZone={(zone, isChase) => {
          const cell = byZone.get(zone)
          if (!cell) return <div className="w-full h-full bg-stone-50/80 border border-stone-100 rounded-md" />
          const { cls, main, sub } = overlayCell(mode, cell, flip)
          const hasBreakdown = option.pitchZoneFit.some((p) => (p.cells.find((c) => c.zone === zone)?.pitcher_usage_pct ?? 0) > 0)
          const isActive = activeZone === zone
          return (
            <button
              type="button"
              onClick={() => hasBreakdown && setActiveZone(isActive ? null : zone)}
              className={`relative w-full h-full flex rounded-md border p-1.5 transition-all ${cls} ${
                isChase ? `flex-col ${CHASE_ALIGN[zone]}` : 'flex-col items-center justify-center text-center'
              } ${hasBreakdown ? 'cursor-pointer hover:brightness-95' : 'cursor-default opacity-70'} ${isActive ? 'ring-2 ring-orange-500' : ''}`}
            >
              <p className={`font-mono font-bold leading-tight ${isChase ? 'text-[9px]' : 'text-[11px]'}`}>{main}</p>
              <p className="font-mono opacity-60 text-[8px] mt-0.5">{sub}</p>
            </button>
          )
        }}
      />

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] font-mono text-stone-500">
        {overlay.legend.map(([bg, text]) => (
          <span key={text} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm inline-block ${bg}`} />{text}</span>
        ))}
      </div>
      <p className="text-[9px] font-mono text-stone-300 text-center">Tap any zone for the pitch-by-pitch numbers{option.batSide ? ` · ${option.batSide}HB view` : ''}</p>

      {activeZone && activeZonePitches.length > 0 && (
        <div className="bg-white border border-orange-200/70 rounded-xl p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-stone-100">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-orange-600 font-semibold">Zone {activeZone}</p>
              <p className="text-[10px] font-sans text-stone-500 italic mt-0.5">{zoneLabelFor(activeZone, option)}</p>
            </div>
            {byZone.get(activeZone)?.batter_xwoba != null && (
              <span className="text-[10px] font-mono text-stone-500 shrink-0">Hitter xwOBA here: <span className="font-bold text-stone-800">{fmtBa(byZone.get(activeZone)!.batter_xwoba as number)}</span></span>
            )}
          </div>
          {activeZonePitches.map(({ pitch, cell }) => {
            const fit = option.pitchTypeFit.find((f) => f.pitch_type === pitch.pitch_type)
            return (
              <div key={pitch.pitch_type} className="border-b border-stone-100 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[12px] font-sans font-bold text-stone-800">{pitch.pitch_name}</span>
                  {fit?.is_put_away_pitch && <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200/80">Put-away</span>}
                  <span className="text-[9px] font-mono text-stone-400 ml-auto">{cell.pitcher_usage_pct}% of his pitches</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="bg-stone-50 rounded-lg px-2 py-1.5">
                    <span className="text-stone-400 block mb-0.5">{flip ? subjectSurname : option.label}&apos;s {pitch.pitch_name.toLowerCase()} here, all hitters</span>
                    <span className="font-bold text-stone-700">{cell.pitcher_ba_against != null ? fmtBa(cell.pitcher_ba_against) : '—'} BA</span>
                    {cell.pitcher_whiff_pct != null && <span className="text-stone-400"> · {cell.pitcher_whiff_pct.toFixed(0)}% whiff</span>}
                  </div>
                  <div className="bg-stone-50 rounded-lg px-2 py-1.5">
                    <span className="text-stone-400 block mb-0.5">{cap(flip ? option.label : subjectSurname)} at similar velo{fit?.pitcher_avg_velo != null ? ` (~${fit.pitcher_avg_velo.toFixed(0)}mph)` : ''}</span>
                    {cell.batter_velocity_matched_low_sample || cell.batter_velocity_matched_ba == null
                      ? <span className="text-stone-400 italic">0 pitches seen</span>
                      : <span className="font-bold text-stone-700">{fmtBa(cell.batter_velocity_matched_ba)} BA <span className="text-stone-400">n={cell.batter_velocity_matched_ab}</span></span>}
                  </div>
                </div>
                <div className="bg-orange-50/50 border border-orange-100 rounded-lg px-2 py-1.5 mt-2 text-[10px] font-mono">
                  <span className="text-orange-700 block mb-0.5">{cap(flip ? option.label : subjectSurname)} vs {flip ? subjectSurname : option.label}, exactly</span>
                  {cell.batter_vs_this_pitcher_ab === 0 || cell.batter_vs_this_pitcher_ba == null
                    ? <span className="text-stone-400 italic">0 pitches seen — true head-to-head is rare at this level of detail</span>
                    : <span className="font-bold text-stone-700">{fmtBa(cell.batter_vs_this_pitcher_ba)} BA <span className="text-stone-400">n={cell.batter_vs_this_pitcher_ab}</span></span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Pitch-by-pitch breakdown — every pitch, and why ──────────────────────

function weighted(cells: { v: number | null; w: number }[]): number | null {
  const ok = cells.filter((c) => c.v != null && c.w > 0)
  const wsum = ok.reduce((s, c) => s + c.w, 0)
  return wsum > 0 ? ok.reduce((s, c) => s + (c.v as number) * c.w, 0) / wsum : null
}

function PitchBreakdown({ option, flip, subjectSurname }: { option: MatchupOption; flip: boolean; subjectSurname: string }) {
  const lines = [...option.pitchTypeFit].sort((a, b) => (b.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0))
  const [open, setOpen] = useState<string | null>(lines[0]?.pitch_type ?? null)
  if (lines.length === 0) return null

  const batterName = flip ? option.label : subjectSurname
  const pitcherName = flip ? subjectSurname : option.label

  return (
    <div className="space-y-1.5">
      {lines.map((l) => {
        // Pitch-type only: the hitter's full-season BA against this pitch, no
        // velocity band. Every pitch he's seen gets a number and a verdict;
        // a small sample is flagged in the text rather than hidden.
        const ok = l.season_ba != null && l.season_ab > 0
        const e = ok ? (l.season_ba as number) - LG_BA : 0
        const side: 'batter' | 'pitcher' | 'even' | 'thin' = !ok ? 'thin' : e >= 0.03 ? 'batter' : e <= -0.03 ? 'pitcher' : 'even'
        const good = flip ? side === 'pitcher' : side === 'batter'
        const bad = flip ? side === 'batter' : side === 'pitcher'
        const chip = side === 'thin' ? 'No data' : side === 'even' ? 'Even' : side === 'batter' ? 'Batter edge' : 'Pitcher edge'
        const chipCls = good ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : bad ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-stone-50 text-stone-500 border-stone-200'

        const pz = option.pitchZoneFit.find((p) => p.pitch_type === l.pitch_type)
        const cells = (pz?.cells ?? []).filter((c) => (c.pitcher_usage_pct ?? 0) > 0)
        const topZone = [...cells].sort((a, b) => (b.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0))[0]
        const paBa = weighted(cells.map((c) => ({ v: c.pitcher_ba_against, w: c.pitcher_usage_pct ?? 0 })))
        const paWhiff = weighted(cells.map((c) => ({ v: c.pitcher_whiff_pct, w: c.pitcher_usage_pct ?? 0 })))

        const parts: string[] = []
        parts.push(`${pitcherName} throws it ${Math.round(l.pitcher_usage_pct ?? 0)}% of the time${l.is_put_away_pitch ? ' — his put-away pitch' : ''}.`)
        parts.push(ok
          ? `${cap(batterName)} hits ${fmtBa(l.season_ba as number)} against it this season (${l.season_ab} AB) — ${e >= 0 ? `${Math.round(e * 1000)} points above` : `${Math.round(-e * 1000)} points below`} the ${fmtBa(LG_BA)} league mark${l.season_ab < 15 ? ', though that is a small sample' : ''}.`
          : `${cap(batterName)} hasn't seen this pitch this season.`)
        if (paBa != null) parts.push(`League-wide it allows ${fmtBa(paBa)}${paWhiff != null ? ` with a ${paWhiff.toFixed(0)}% whiff rate` : ''}.`)
        if (topZone) parts.push(`He lives ${zoneLabelFor(topZone.zone, option)} with it (${topZone.pitcher_usage_pct}% of his pitches).`)

        const isOpen = open === l.pitch_type
        return (
          <div key={l.pitch_type} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <button type="button" onClick={() => setOpen(isOpen ? null : l.pitch_type)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50/70 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-sans font-bold text-stone-900 truncate">{l.pitch_name}
                  {l.is_put_away_pitch && <span className="ml-1.5 text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200/80 align-middle">Put-away</span>}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 w-20 rounded-full bg-stone-100 overflow-hidden"><div className="h-full bg-orange-300" style={{ width: `${Math.min(100, (l.pitcher_usage_pct ?? 0) * 2)}%` }} /></div>
                  <span className="text-[9px] font-mono text-stone-400">{Math.round(l.pitcher_usage_pct ?? 0)}%</span>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold text-stone-700 shrink-0">{ok ? fmtBa(l.season_ba as number) : '—'}</span>
              <span className={`shrink-0 text-[9px] font-mono uppercase tracking-wider font-bold px-1.5 py-1 rounded-md border ${chipCls}`}>{chip}</span>
            </button>
            {isOpen && <p className="px-3 pb-3 -mt-0.5 text-[12px] font-sans text-stone-600 leading-relaxed">{parts.join(' ')}</p>}
          </div>
        )
      })}
      <p className="text-[9px] font-mono text-stone-300 pt-1">Number shown = {batterName}&apos;s season batting average against that pitch type.</p>
    </div>
  )
}

// ─── Matchup selector ─────────────────────────────────────────────────────

function MatchupSelector({ options, activeKey, onSelect }: { options: MatchupOption[]; activeKey: string; onSelect: (key: string) => void }) {
  if (options.length <= 1) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onSelect(o.key)}
          className={`shrink-0 text-[10px] font-mono uppercase tracking-wide px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition ${
            o.key === activeKey ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
          }`}>
          {o.isLineup ? 'Combined lineup' : `vs ${o.label}`}
        </button>
      ))}
    </div>
  )
}

// ─── Narrative box ────────────────────────────────────────────────────────

function WhyThisWorks({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="bg-orange-50/60 border border-orange-200/60 rounded-xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-orange-600 font-semibold mb-2">The read</p>
      <p className="text-[13px] font-sans text-stone-700 leading-relaxed">{text}</p>
    </div>
  )
}

// ─── Locked popup — free users ────────────────────────────────────────────

function LockedTeaser({ playerName, onClose }: { playerName: string; onClose: () => void }) {
  return (
    <DetailModal eyebrow="Key player breakdown" title={playerName} onClose={onClose}>
      <div className="bg-stone-900 rounded-xl p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">⊕ Full matchup breakdown is a Pro feature</p>
        <p className="text-[11px] text-stone-300 leading-relaxed">
          All five matchup factors with the numbers behind them, hot-zone overlays across all 13 real zones, a pitch-by-pitch breakdown of why each pitch does or doesn&apos;t work, and a direct link into Batting/Pitching Lab.
        </p>
        <a href="/pricing" className="block text-center text-[10.5px] font-bold px-3 py-2 bg-amber-300 text-stone-900 rounded-lg">Unlock full breakdown →</a>
      </div>
    </DetailModal>
  )
}

// ─── Full popup — Pro ─────────────────────────────────────────────────────

function KeyPlayerDetailModal({ data, isFinal, result, rating, onClose }: {
  data: CardData
  isFinal: boolean
  result: PostgameResults[string] | undefined
  rating: OutcomeRating | null
  onClose: () => void
}) {
  const isPitcher = data.kind === 'pitcher'
  const surname = lastName(data.playerName)
  const labHref = isPitcher ? `/mlb/pitching-lab/${data.playerId}/overlay` : `/mlb/batting-lab/${data.playerId}/hot-zones`
  // Pitchers get a "Combined lineup" view up front, ahead of each hitter.
  const lineup = useMemo(() => (isPitcher ? buildLineupOption(data.matchupOptions) : null), [isPitcher, data.matchupOptions])
  const options = useMemo(() => (lineup ? [lineup, ...data.matchupOptions] : data.matchupOptions), [lineup, data.matchupOptions])
  const [activeKey, setActiveKey] = useState(data.focusKey ?? options[0]?.key ?? '')
  const option = options.find((o) => o.key === activeKey) ?? options[0]
  const pbp = result?.pbp

  return (
    <DetailModal eyebrow={isPitcher ? 'Starting pitcher' : 'Key batter'} title={data.playerName} onClose={onClose} wide>
      <div className="space-y-6">
        {isFinal && <RatingStrip rating={rating} />}
        <WhyThisWorks text={data.headline} />

        {data.factors.length > 0 && (
          <section>
            <SubHead hint="Ranked by strength">Why the matchup favours him</SubHead>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {data.factors.map((f) => <FactorTile key={f.id + f.title} f={f} />)}
            </div>
          </section>
        )}

        {option && (
          <section className="space-y-3">
            <SubHead hint="Switch matchup">{isPitcher ? 'Against which hitter' : 'Against which starter'}</SubHead>
            <MatchupSelector options={options} activeKey={option.key} onSelect={setActiveKey} />

            <div className="pt-1">
              <SubHead>Where it happens</SubHead>
              <ZoneBoardPanel key={option.key} option={option} flip={isPitcher} subjectSurname={surname} />
            </div>

            <div className="pt-2">
              <SubHead hint="Tap a pitch">Pitch by pitch — and why</SubHead>
              <PitchBreakdown key={option.key} option={option} flip={isPitcher} subjectSurname={surname} />
            </div>
          </section>
        )}

        {isFinal && !isPitcher && result?.batter && (
          <section className="pt-3 border-t border-stone-100">
            <SubHead>What actually happened</SubHead>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="AB" value={result.batter.ab} />
              <StatBox label="H" value={result.batter.hits} />
              <StatBox label="HR" value={result.batter.home_runs} color={result.batter.home_runs > 0 ? 'text-emerald-600' : undefined} />
              <StatBox label="K" value={result.batter.strikeouts} />
            </div>
            {pbp && pbp.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {pbp.map((pa, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-white border border-stone-150">
                    <span className="text-[12px] font-sans font-bold text-stone-800">{pa.pitch_name ?? pa.pitch_type ?? 'Unknown'}{pa.velo != null ? <span className="text-stone-400 font-mono text-[10px] font-normal"> · {pa.velo.toFixed(0)}mph</span> : null}</span>
                    <span className={`text-[12px] font-mono font-semibold ${pa.is_hit ? 'text-emerald-600' : 'text-stone-500'}`}>{pa.event ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {isFinal && isPitcher && result?.pitcher && (
          <section className="pt-3 border-t border-stone-100">
            <SubHead>How he performed</SubHead>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="IP" value={result.pitcher.ip} />
              <StatBox label="ER" value={result.pitcher.er} />
              <StatBox label="K" value={result.pitcher.k} color="text-emerald-600" />
              <StatBox label="BB" value={result.pitcher.bb} />
            </div>
          </section>
        )}

        <div className="pt-3 border-t border-stone-100">
          <LabFunnelLink href={labHref} label={`See ${surname} in ${isPitcher ? 'Pitching' : 'Batting'} Lab — full hot-zone overlays`} isPro />
        </div>
      </div>
    </DetailModal>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────

const FREE_FACTORS_VISIBLE = 2

function KeyPlayerCard({ data, isFinal, isPro, result }: {
  data: CardData; isFinal: boolean; isPro: boolean; result: PostgameResults[string] | undefined
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const style = RANK_STYLES[data.rank] ?? RANK_STYLES[2]
  const lean = leanStyle(data.lean)
  const isPitcher = data.kind === 'pitcher'

  const rating: OutcomeRating | null = !isFinal || !result ? null
    : isPitcher
      ? (result.pitcher ? ratePitcher(result.pitcher, data.lean) : null)
      : (result.batter ? rateBatter(result.batter, data.lean) : null)

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${style.ring} transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]`}>
      <button type="button" onClick={() => setModalOpen(true)}
        className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-stone-50/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 focus-visible:ring-inset">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-mono font-bold shrink-0 ${style.badge}`}>{data.rank + 1}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={playerHeadshotUrl(data.playerId)} alt={data.playerName} className={`w-11 h-11 rounded-full object-cover bg-stone-100 shrink-0 ${style.avatarRing}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-sans font-bold text-stone-900 text-[15px] leading-tight truncate tracking-tight">{data.playerName}</span>
            {isPitcher && <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 border border-stone-200 shrink-0">SP</span>}
            {!isPro && <span className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 shrink-0">Pro</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-mono font-semibold ${lean.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${lean.dot}`} />{lean.label}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-orange-600 font-semibold shrink-0 hidden sm:inline">Breakdown ›</span>
      </button>

      {isFinal && <RatingStrip rating={rating} />}

      {data.factors.length > 0 ? (
        <div className="px-3 sm:px-3.5 pb-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-stone-400 mb-1.5 px-0.5">
            {isFinal ? 'The pregame read'
              : data.lean === 'tough' ? 'Signals in his favour despite a tough fit'
              : `${data.factors.filter((f) => f.direction === 'for').length || data.factors.length} things that favour him`}
          </p>
          <ul className="space-y-1.5">
            {data.factors.map((f, i) => <FactorRow key={f.id + f.title} f={f} locked={!isPro && i >= FREE_FACTORS_VISIBLE} />)}
          </ul>
        </div>
      ) : (
        data.headline && <p className="px-3.5 sm:px-4 pb-3 text-[12px] font-sans text-stone-600 leading-relaxed">{data.headline}</p>
      )}

      {!isPitcher && data.perStarter.length > 1 && (
        <div className="px-3.5 sm:px-4 pb-3.5 flex flex-wrap gap-1.5">
          {data.perStarter.map((p) => {
            const s = leanStyle(p.lean)
            return <span key={p.pitcherName} className={`text-[10px] font-mono px-2 py-1 rounded-md border ${s.bg} ${s.border} ${s.color}`}>vs {p.pitcherName}: {p.lean}</span>
          })}
        </div>
      )}

      {modalOpen && (
        isPro
          ? <KeyPlayerDetailModal data={data} isFinal={isFinal} result={result} rating={rating} onClose={() => setModalOpen(false)} />
          : <LockedTeaser playerName={data.playerName} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────

type PregameProps = {
  variant: 'pregame'
  candidates: (KeyPlayerCandidate & { factors?: MatchupFactor[] })[]
  teamName: string
  teamId: number
  formByPlayerId: Record<string, RecentFormContext>
  isPro: boolean
  park: ParkFactor | null
  dayNight?: 'day' | 'night' | null
}

type PostgameProps = {
  variant: 'postgame'
  snapshot: KeyPlayersSnapshot[]
  results: PostgameResults
  teamName: string
  teamId: number
  isPro: boolean
}

type Props = PregameProps | PostgameProps

export default function Top3KeyPlayersTab(props: Props) {
  const { teamName, teamId, isPro } = props
  const formByPlayerId = props.variant === 'pregame' ? (props.formByPlayerId ?? {}) : {}
  const park = props.variant === 'pregame' ? props.park : null

  const cards: CardData[] = props.variant === 'pregame'
    ? props.candidates.map((c, i): CardData => {
        if (c.kind === 'batter') {
          const topLine = bestBatterLine(c.batter)
          const drivingPitch = topLine ? pickDrivingPitch(topLine.pitch_type_fit, 'batter') : null
          const zone = topLine ? [...topLine.zone_fit].sort((a, b) => b.tilt - a.tilt)[0]?.zone ?? null : null
          const form = formByPlayerId[String(c.batter.player_id)] ?? null
          const headline = (topLine && drivingPitch && zone)
            ? buildBatterNarrative(c.batter.player_name, topLine.pitcher_name, zone, drivingPitch, form, c.batter.bat_side, topLine.pitch_type_fit, park)
            : null
          return {
            rank: i, kind: 'batter', playerId: c.batter.player_id, playerName: c.batter.player_name,
            lean: scoreLean(c.score), headline,
            starterSummary: buildStarterSummarySentence(c.batter),
            perStarter: c.batter.per_pitcher.map((p) => ({ pitcherName: p.pitcher_name, lean: scoreLean(p.zone_score + p.pitch_type_fit_score) })),
            factors: c.factors ?? [],
            matchupOptions: c.batter.per_pitcher.map((p) => ({
              key: String(p.pitcher_id), label: p.pitcher_name, batSide: c.batter.bat_side,
              zoneCells: p.zone_fit, pitchZoneFit: p.pitch_zone_fit, pitchTypeFit: p.pitch_type_fit,
            })),
            focusKey: topLine ? String(topLine.pitcher_id) : null,
          }
        }
        const tough = c.pitcher.toughest_matchup
        const drivingPitch = tough ? pickDrivingPitch(tough.pitch_type_fit, 'pitcher') : null
        const zone = tough ? [...tough.zone_fit].sort((a, b) => a.tilt - b.tilt)[0]?.zone ?? null : null
        const form = formByPlayerId[String(c.pitcher.pitcher_id)] ?? null
        const headline = (tough && drivingPitch && zone)
          ? buildPitcherNarrative(c.pitcher.pitcher_name, tough.batter_name, zone, drivingPitch, drivingPitch.pitcher_usage_pct ?? 0, form, tough.bat_side, park)
          : null
        return {
          rank: i, kind: 'pitcher', playerId: c.pitcher.pitcher_id, playerName: c.pitcher.pitcher_name,
          lean: scoreLean(c.score), headline, starterSummary: null, perStarter: [],
          factors: c.factors ?? [],
          matchupOptions: c.pitcher.per_batter.map((b) => ({
            key: String(b.batter_id), label: b.batter_name, batSide: b.bat_side,
            zoneCells: b.zone_fit, pitchZoneFit: b.pitch_zone_fit, pitchTypeFit: b.pitch_type_fit,
          })),
          focusKey: tough ? String(tough.batter_id) : null,
        }
      })
    : props.snapshot.map((s): CardData => ({
        rank: s.rank - 1, kind: s.player_type, playerId: s.player_id, playerName: s.player_name,
        lean: s.lean, headline: s.narrative,
        starterSummary: s.reason_summary.starter_summary ?? null,
        perStarter: (s.reason_summary.per_starter ?? []).map((p: RawPerStarter) => ({
          pitcherName: p.pitcher_name, lean: scoreLean(p.combined_score),
        })),
        // Snapshots frozen before the factor engine existed have none — the
        // card falls back to the narrative.
        factors: (s.reason_summary.factors ?? []) as MatchupFactor[],
        matchupOptions: (s.reason_summary.matchup_options ?? []).map((o: RawMatchupOption) => ({
          key: o.key, label: o.label, batSide: o.bat_side,
          zoneCells: o.zone_fit ?? [], pitchZoneFit: o.pitch_zone_fit ?? [], pitchTypeFit: o.pitch_type_fit ?? [],
        })),
        focusKey: s.reason_summary.focus_key ?? null,
      }))

  const results = props.variant === 'postgame' ? props.results : {}

  // Report-card tally for the header — how many of this team's calls held up.
  let called = 0, rated = 0
  if (props.variant === 'postgame') {
    for (const c of cards) {
      const r = results[String(c.playerId)]
      const rating = !r ? null : c.kind === 'pitcher' ? (r.pitcher ? ratePitcher(r.pitcher, c.lean) : null) : (r.batter ? rateBatter(r.batter, c.lean) : null)
      if (rating && rating.verdict !== 'push') { rated++; if (rating.verdict === 'called_it') called++ }
    }
  }

  return (
    <div className="border border-stone-200/80 bg-white rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teamLogoUrl(teamId)} alt={teamName} className="w-6 h-6 object-contain shrink-0" />
          <SectionLabel title={`Top 3 Key Players · ${teamName}`} />
        </div>
        {props.variant === 'postgame' && rated > 0 && (
          <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-md bg-stone-900 text-white shrink-0">{called}/{rated} called</span>
        )}
      </div>

      <div className="text-[11px] font-mono text-stone-400 mb-5 tracking-wide">
        {props.variant === 'postgame' ? "Final — here's how each read played out" : 'Confirmed starter + top lineup fits, ranked together'}
      </div>

      {cards.length === 0 ? (
        <div className="py-10 px-4 text-center">
          <p className="text-[15px] font-sans text-stone-400 italic leading-relaxed">
            {props.variant === 'postgame'
              ? 'No key players were logged for this game.'
              : 'Waiting on a confirmed starter and lineup — check back closer to first pitch.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <KeyPlayerCard key={`${c.kind}-${c.playerId}`} data={c} isFinal={props.variant === 'postgame'} isPro={isPro} result={results[String(c.playerId)]} />
          ))}
        </div>
      )}
    </div>
  )
}
