// src/components/ScoutExpandCharts.tsx
//
// v7 changes:
//  - PitchDetailChart split into two:
//      * PitchSpiderExpand — the clean spider that renders inside an expanded row
//        (spider only, no rank rows), with a "Full detail" button that opens a modal.
//      * PitchDetailModal — the deep popup: bigger spider, ranked metrics with raw
//        values, hard-hit, usage, velocity. Portal, dismiss on Esc / backdrop.
//  - ScoutExpandChart accepts an `onOpenModal` callback; the parent (ScoutReportTab)
//    manages the single global modal.

'use client'

import { useEffect, useState } from 'react'
import type { ScoutExpand, ArsenalPitch, ArsenalRadarPayload, PitchDetailPayload } from '@/lib/scout'
import { normPct } from '@/lib/scout'

// ─── Pitch color palette ──────────────────────────────────────────────
const PITCH_COLOR: Record<string, string> = {
  FF: '#dc2626', SI: '#ea580c', FC: '#d97706',
  SL: '#7c3aed', ST: '#9333ea', SV: '#1d4ed8',
  CU: '#2563eb', KC: '#0891b2',
  CH: '#059669', FS: '#65a30d', FO: '#65a30d', SC: '#16a34a',
  KN: '#a16207', EP: '#92400e',
}
const pitchColorFor = (code: string) => PITCH_COLOR[code] ?? '#78716c'

function fmtAvg(v: number | null): string {
  if (v == null) return '—'
  const s = v.toFixed(3)
  return s.startsWith('0.') ? s.slice(1) : s
}

// ═══════════════════════════════════════════════════════════════════════
//  1 · Count-state bars
// ═══════════════════════════════════════════════════════════════════════
type CountStateMix = Record<string, { name: string; all_pct: number; two_strike_pct: number; delta: number }>

export function CountStateBarsChart({ mix, focus }: {
  mix: CountStateMix
  focus: string | null
  pitcherName: string
}) {
  if (!mix) return null
  const entries = Object.entries(mix)
    .filter(([, v]) => v.all_pct >= 3 || v.two_strike_pct >= 3)
    .sort((a, b) => b[1].two_strike_pct - a[1].two_strike_pct)
    .slice(0, 5)

  return (
    <div className="space-y-2.5">
      <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold">
        All counts → Two-strike
      </p>
      {entries.map(([code, v]) => {
        const isFocus = code === focus
        const color = pitchColorFor(code)
        return (
          <div
            key={code}
            className={`rounded-xl px-3.5 py-2.5 ${isFocus ? 'bg-orange-50 border border-orange-200' : 'bg-stone-50'}`}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="font-serif text-[15px] font-semibold text-stone-900 truncate">{v.name}</span>
                {isFocus && (
                  <span className="font-mono text-[8px] font-bold uppercase tracking-wider bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded shrink-0">
                    signature
                  </span>
                )}
              </div>
              <span className={`font-mono text-[13px] font-bold tabular-nums ${v.delta >= 8 ? 'text-orange-600' : 'text-stone-500'}`}>
                {v.delta >= 0 ? '+' : ''}{Math.round(v.delta)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5">
                <span className="font-mono text-[8px] text-stone-400 w-6">ALL</span>
                <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-stone-400" style={{ width: `${Math.min(v.all_pct, 100)}%` }} />
                </div>
                <span className="font-mono text-[11px] font-bold text-stone-500 w-8 text-right tabular-nums">{Math.round(v.all_pct)}%</span>
              </div>
              <div className="flex-1 flex items-center gap-1.5">
                <span className="font-mono text-[8px] font-bold text-stone-700 w-6">2K</span>
                <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(v.two_strike_pct, 100)}%`, background: color }} />
                </div>
                <span className="font-mono text-[13px] font-bold text-stone-900 w-8 text-right tabular-nums">{Math.round(v.two_strike_pct)}%</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  2 · First-pitch mini
// ═══════════════════════════════════════════════════════════════════════
type FirstPitchMix = Record<string, { name: string; pct: number }>

export function FirstPitchMiniChart({ mix, strikeRate }: {
  mix: FirstPitchMix | null
  strikeRate: number
  pitcherName: string
}) {
  const sr = Math.round(strikeRate)
  const isElite = sr >= 66
  const isWeak = sr <= 54
  const tone = isElite ? 'text-emerald-600' : isWeak ? 'text-orange-600' : 'text-stone-800'
  const bg = isElite ? 'bg-emerald-50' : isWeak ? 'bg-orange-50' : 'bg-stone-50'
  const mixEntries = mix ? Object.entries(mix).sort((a, b) => b[1].pct - a[1].pct).slice(0, 5) : []

  return (
    <div className="flex gap-5 items-stretch flex-wrap">
      <div className={`rounded-xl px-5 py-4 text-center shrink-0 ${bg} border ${isElite ? 'border-emerald-100' : isWeak ? 'border-orange-100' : 'border-stone-100'}`}>
        <div className={`font-bold leading-none ${tone}`} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '3.25rem' }}>
          {sr}<span className="text-2xl">%</span>
        </div>
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mt-1.5">1st-pitch strike</p>
        <p className={`font-mono text-[10px] font-bold mt-1 ${tone}`}>
          {isElite ? 'Gets ahead' : isWeak ? 'Behind early' : '≈ league avg'}
        </p>
        <p className="font-mono text-[8px] text-stone-400 mt-0.5">league ~60%</p>
      </div>

      {mixEntries.length > 0 && (
        <div className="flex-1 min-w-[160px] flex flex-col justify-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2.5 font-bold">First-pitch mix</p>
          <div className="space-y-2">
            {mixEntries.map(([code, v]) => (
              <div key={code} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColorFor(code) }} />
                <span className="font-serif text-[13px] text-stone-700 w-20 shrink-0 truncate">{v.name}</span>
                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(v.pct * 1.4, 100)}%`, background: pitchColorFor(code) }} />
                </div>
                <span className="font-mono text-[12px] font-bold text-stone-800 w-8 text-right tabular-nums">{Math.round(v.pct)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  3 · Arsenal mini
// ═══════════════════════════════════════════════════════════════════════
export function ArsenalMiniChart({ arsenal, focus }: {
  arsenal: ArsenalPitch[]
  focus: string | null
  pitcherName: string
}) {
  if (!arsenal || arsenal.length === 0) return null

  const sorted = [...arsenal]
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
    .slice(0, 6)

  const focusPitch = focus
    ? sorted.find(p => p.pitch_type === focus) ?? sorted[0]
    : sorted[0]

  const rest = sorted.filter(p => p.pitch_type !== focusPitch?.pitch_type)

  const whiff = normPct(focusPitch?.whiff_percent)
  const put = normPct(focusPitch?.put_away_percent)
  const pct = normPct(focusPitch?.percentage)
  const xw = focusPitch?.est_woba
  const velo = focusPitch?.avg_velocity
  const color = pitchColorFor(focusPitch?.pitch_type ?? '')

  const isEliteWhiff = whiff != null && whiff >= 34
  const isElitePut = put != null && put >= 30
  const isEliteXw = xw != null && xw <= 0.260

  return (
    <div className="space-y-4">
      {focusPitch && (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-100 bg-stone-50/80">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
            <span className="font-serif text-base font-semibold text-stone-900">{focusPitch.pitch_name}</span>
            {pct != null && (
              <span className="font-mono text-[11px] text-stone-500 ml-auto tabular-nums">{pct.toFixed(0)}% usage</span>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-stone-100">
            <div className="px-3 py-3.5 text-center">
              <div
                className={`font-bold leading-none tabular-nums ${isEliteWhiff ? 'text-orange-600' : 'text-stone-900'}`}
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.1rem' }}
              >
                {whiff != null ? Math.round(whiff) : '—'}
                {whiff != null && <span className="text-lg">%</span>}
              </div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mt-1">Whiff</p>
              {isEliteWhiff && <p className="font-mono text-[8px] font-bold text-orange-500 mt-0.5">ELITE</p>}
            </div>
            <div className="px-3 py-3.5 text-center">
              <div
                className={`font-bold leading-none tabular-nums ${isElitePut ? 'text-orange-600' : 'text-stone-900'}`}
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.1rem' }}
              >
                {put != null ? Math.round(put) : '—'}
                {put != null && <span className="text-lg">%</span>}
              </div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mt-1">Putaway</p>
              {isElitePut && <p className="font-mono text-[8px] font-bold text-orange-500 mt-0.5">ELITE</p>}
            </div>
            <div className="px-3 py-3.5 text-center">
              <div
                className={`font-bold leading-none tabular-nums ${isEliteXw ? 'text-emerald-600' : xw != null && xw >= 0.350 ? 'text-orange-500' : 'text-stone-900'}`}
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.1rem' }}
              >
                {fmtAvg(xw ?? null)}
              </div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mt-1">xwOBA</p>
              {isEliteXw && <p className="font-mono text-[8px] font-bold text-emerald-600 mt-0.5">WEAK CONTACT</p>}
            </div>
          </div>
          {velo != null && (
            <div className="px-4 py-1.5 border-t border-stone-100 bg-stone-50/50 flex justify-center">
              <span className="font-mono text-[11px] text-stone-500 tabular-nums">
                {velo.toFixed(1)} mph
              </span>
            </div>
          )}
        </div>
      )}

      {rest.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold px-0.5">
            Full arsenal
          </p>
          {rest.map(p => {
            const w = normPct(p.whiff_percent)
            const us = normPct(p.percentage)
            const c = pitchColorFor(p.pitch_type)
            const eliteW = w != null && w >= 34
            const eliteX = p.est_woba != null && p.est_woba <= 0.260
            return (
              <div
                key={p.pitch_type}
                className="flex items-center gap-3 rounded-lg px-3 py-2 bg-stone-50/80"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
                <span className="font-serif text-[13px] text-stone-800 w-[4.5rem] shrink-0 truncate">{p.pitch_name}</span>
                <span className="font-mono text-[11px] text-stone-500 w-10 text-right tabular-nums">{us != null ? `${us.toFixed(0)}%` : '—'}</span>
                <span className={`font-mono text-[12px] font-bold w-11 text-right tabular-nums ${eliteW ? 'text-orange-600' : 'text-stone-700'}`}>
                  {w != null ? `${Math.round(w)}%` : '—'}
                </span>
                <span className={`font-mono text-[12px] font-bold w-11 text-right tabular-nums ${eliteX ? 'text-emerald-600' : 'text-stone-700'}`}>
                  {fmtAvg(p.est_woba)}
                </span>
                {p.avg_velocity != null && (
                  <span className="font-mono text-[10px] text-stone-400 w-10 text-right tabular-nums ml-auto">
                    {p.avg_velocity.toFixed(0)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  4 · TTO bars
// ═══════════════════════════════════════════════════════════════════════
export function TtoBarsChart({ tto1_era, tto2_era, tto3_era, tto1_pa, tto2_pa, tto3_pa }: {
  tto1_era: number | null
  tto2_era: number | null
  tto3_era: number | null
  tto1_pa: number | null
  tto2_pa: number | null
  tto3_pa: number | null
  pitcherName: string
}) {
  const bars = [
    { label: '1st', era: tto1_era, pa: tto1_pa, color: '#15803d' },
    { label: '2nd', era: tto2_era, pa: tto2_pa, color: '#78716c' },
    { label: '3rd+', era: tto3_era, pa: tto3_pa, color: '#ea580c' },
  ].filter(b => b.era != null)
  if (!bars.length) return null
  const max = Math.max(...bars.map(b => b.era ?? 0), 5.5)
  const delta = tto1_era != null && tto3_era != null ? tto3_era - tto1_era : null

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold">
          ERA by times through order
        </p>
        {delta != null && (
          <span className={`font-mono text-[12px] font-bold tabular-nums ${delta >= 0.7 ? 'text-orange-600' : delta <= -0.4 ? 'text-emerald-600' : 'text-stone-500'}`}>
            Δ {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        {bars.map(b => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="font-mono text-[11px] font-bold text-stone-600 w-10 shrink-0">{b.label}</span>
            <div className="flex-1 h-2.5 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${((b.era ?? 0) / max) * 100}%`, background: b.color }} />
            </div>
            <span className="font-mono text-[15px] font-bold text-stone-900 w-12 text-right tabular-nums" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {(b.era ?? 0).toFixed(2)}
            </span>
            <span className="font-mono text-[9px] text-stone-400 w-12 text-right">n={b.pa ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  5 · Workload bars
// ═══════════════════════════════════════════════════════════════════════
export function WorkloadBarsChart({ innings_yesterday, ip_last_3 }: {
  innings_yesterday: number | null
  ip_last_3: number | null
}) {
  const bars = [
    { label: 'Yesterday', v: innings_yesterday, heavy: 4, max: 7 },
    { label: 'Last 3 days', v: ip_last_3, heavy: 9.5, max: 14 },
  ].filter(r => r.v != null)
  if (!bars.length) return null

  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold mb-3">
        Bullpen IP
      </p>
      <div className="space-y-2.5">
        {bars.map(r => {
          const val = r.v ?? 0
          const heavy = val >= r.heavy
          return (
            <div key={r.label} className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-stone-600 w-20 shrink-0">{r.label}</span>
              <div className="flex-1 h-2.5 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min((val / r.max) * 100, 100)}%`, background: heavy ? '#ea580c' : '#78716c' }} />
              </div>
              <span className="font-mono text-[15px] font-bold text-stone-900 w-10 text-right tabular-nums" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {val.toFixed(1)}
              </span>
              <span className={`font-mono text-[9px] font-bold w-12 text-right uppercase tracking-wider ${heavy ? 'text-orange-500' : 'text-stone-400'}`}>
                {heavy ? 'Heavy' : 'Ok'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  6 · Transaction card
// ═══════════════════════════════════════════════════════════════════════
export function TransactionCard({ data }: { data: {
  player_name: string; category: string; description: string
  transaction_date: string; il_days?: number | null; injury_reason?: string | null
}}) {
  const dateStr = data.transaction_date
    ? new Date(data.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <span className="font-serif font-semibold text-stone-900 text-[15px]">{data.player_name}</span>
        <span className="font-mono text-[10px] text-stone-400 shrink-0">{dateStr}</span>
      </div>
      <span className="font-mono text-[9px] uppercase tracking-wider bg-stone-100 text-stone-600 px-2 py-0.5 rounded inline-block mb-2">
        {data.category}
      </span>
      <p className="font-serif text-sm text-stone-600 leading-relaxed">{data.description}</p>
      {(data.il_days || data.injury_reason) && (
        <p className="font-mono text-[9px] text-stone-400 mt-2 pt-2 border-t border-stone-100">
          {data.il_days ? `${data.il_days}-day IL` : ''}
          {data.il_days && data.injury_reason ? ' · ' : ''}
          {data.injury_reason ?? ''}
        </p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  7 · Weather vector
// ═══════════════════════════════════════════════════════════════════════
export function WeatherVectorChart({ data }: { data: {
  temp_f: number | null; wind_mph: number | null; wind_direction: number | null
  wind_direction_text: string | null; precipitation_chance: number | null; conditions: string | null
}}) {
  const windDeg = data.wind_direction ?? 0
  const windMph = data.wind_mph ?? 0
  const elevated = windMph >= 12
  return (
    <div className="flex gap-5 items-center flex-wrap">
      <svg width="68" height="68" viewBox="0 0 80 80" className="shrink-0">
        <circle cx="40" cy="40" r="36" fill="none" stroke="#e7e5e4" strokeWidth="1.5" />
        <g transform={`rotate(${windDeg} 40 40)`}>
          <line x1="40" y1="14" x2="40" y2="66" stroke={elevated ? '#ea580c' : '#78716c'} strokeWidth="2.5" />
          <polygon points="40,10 35,22 45,22" fill={elevated ? '#ea580c' : '#78716c'} />
        </g>
        {['N','S','W','E'].map((d, i) => (
          <text key={d} x={i===2?6:i===3?74:40} y={i===0?8:i===1?76:43}
            textAnchor="middle" style={{ fontFamily: 'ui-monospace', fontSize: 8, fill: '#a8a29e' }}>{d}</text>
        ))}
      </svg>
      <div className="flex-1 min-w-0">
        {data.wind_direction_text && (
          <p className="font-serif text-[15px] font-semibold text-stone-900 mb-1.5">
            {data.wind_direction_text}
            <span className={`ml-2 font-mono text-[14px] font-bold tabular-nums ${elevated ? 'text-orange-600' : 'text-stone-600'}`}>
              {windMph} mph
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {data.temp_f != null && (
            <span className="font-mono text-[12px] text-stone-600">
              <span className="text-stone-400 text-[10px] uppercase tracking-wider mr-1">Temp</span>
              {data.temp_f}°F
            </span>
          )}
          {data.precipitation_chance != null && (
            <span className="font-mono text-[12px] text-stone-600">
              <span className="text-stone-400 text-[10px] uppercase tracking-wider mr-1">Precip</span>
              {data.precipitation_chance}%
            </span>
          )}
          {data.conditions && (
            <span className="font-mono text-[12px] text-stone-600">
              <span className="text-stone-400 text-[10px] uppercase tracking-wider mr-1">Sky</span>
              {data.conditions}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  8 · Park factor
// ═══════════════════════════════════════════════════════════════════════
export function ParkFactorChart({ data }: { data: {
  venue_name: string; hr_factor?: number | null; doubles_factor?: number | null; runs_factor?: number | null
}}) {
  const rows = [
    { label: 'HR', v: data.hr_factor },
    { label: '2B', v: data.doubles_factor },
    { label: 'Runs', v: data.runs_factor },
  ].filter(r => r.v != null)
  if (!rows.length) return null

  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold mb-3">
        {data.venue_name} · 1.00 = neutral
      </p>
      <div className="grid grid-cols-3 gap-2">
        {rows.map(r => {
          const v = r.v ?? 1
          const boost = v >= 1.08
          const suppress = v <= 0.92
          return (
            <div key={r.label} className={`rounded-xl px-3 py-3 text-center ${boost ? 'bg-orange-50' : suppress ? 'bg-blue-50' : 'bg-stone-50'}`}>
              <div
                className={`font-bold leading-none tabular-nums ${boost ? 'text-orange-600' : suppress ? 'text-blue-600' : 'text-stone-800'}`}
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.75rem' }}
              >
                {v.toFixed(2)}
              </div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mt-1">{r.label}</p>
              <p className={`font-mono text-[8px] font-bold mt-0.5 ${boost ? 'text-orange-500' : suppress ? 'text-blue-500' : 'text-stone-400'}`}>
                {boost ? `+${((v - 1) * 100).toFixed(0)}%` : suppress ? `${((v - 1) * 100).toFixed(0)}%` : 'neutral'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  9 · ARSENAL RADAR (whole arsenal — used for the primary weapon row)
// ═══════════════════════════════════════════════════════════════════════

const AXES = [
  { key: 'whiffScore',    label: 'Whiff' },
  { key: 'putawayScore',  label: 'Putaway' },
  { key: 'xwobaScore',    label: 'Quality' },
  { key: 'contactScore',  label: 'Contact' },
  { key: 'velocityScore', label: 'Velo' },
] as const

type AxisKey = typeof AXES[number]['key']

export function ArsenalRadarChart({ pitcherName, pitches }: ArsenalRadarPayload) {
  if (!pitches || pitches.length === 0) return null

  const CX = 95; const CY = 95; const R = 68
  const N = AXES.length
  const angleStep = (Math.PI * 2) / N
  const startAngle = -Math.PI / 2

  function getPoints(pitch: ArsenalRadarPayload['pitches'][number]): string {
    return AXES.map((ax, i) => {
      const angle = startAngle + i * angleStep
      const val = pitch[ax.key as AxisKey] / 100
      const x = CX + R * val * Math.cos(angle)
      const y = CY + R * val * Math.sin(angle)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  function axisLabel(i: number) {
    const angle = startAngle + i * angleStep
    const lx = CX + (R + 14) * Math.cos(angle)
    const ly = CY + (R + 14) * Math.sin(angle)
   const anchor: 'start' | 'middle' | 'end' = lx < CX - 4 ? 'end' : lx > CX + 4 ? 'start' : 'middle'
    return { x: lx.toFixed(1), y: (ly + 3).toFixed(1), anchor, label: AXES[i].label }
  }

  function gridPolygon(pct: number): string {
    return AXES.map((_, i) => {
      const angle = startAngle + i * angleStep
      const r = R * pct / 100
      return `${(CX + r * Math.cos(angle)).toFixed(1)},${(CY + r * Math.sin(angle)).toFixed(1)}`
    }).join(' ')
  }

  const displayPitches = [...pitches].slice(0, 3)
  const colorFor = (code: string) => PITCH_COLOR[code] ?? '#78716c'
  const top = displayPitches[0]

  return (
    <div className="space-y-4">
      {top && (
        <div className="rounded-xl border border-stone-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-stone-50 border-b border-stone-100">
            <span className="w-3 h-3 rounded-full" style={{ background: colorFor(top.code) }} />
            <span className="font-serif text-[15px] font-semibold text-stone-900">{top.name}</span>
            {top.usage_pct != null && (
              <span className="font-mono text-[11px] text-stone-500 ml-auto tabular-nums">{top.usage_pct.toFixed(0)}% usage</span>
            )}
            <span className="font-mono text-[8px] font-bold uppercase tracking-wider bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded">
              #1 weapon
            </span>
          </div>
          <div className="grid grid-cols-4 divide-x divide-stone-100">
            <div className="px-2 py-3 text-center">
              <div
                className={`font-bold leading-none tabular-nums ${top.whiff_pct != null && top.whiff_pct >= 34 ? 'text-orange-600' : 'text-stone-900'}`}
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.85rem' }}
              >
                {top.whiff_pct != null ? Math.round(top.whiff_pct) : '—'}
                {top.whiff_pct != null && <span className="text-base">%</span>}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mt-0.5">Whiff</p>
            </div>
            <div className="px-2 py-3 text-center">
              <div
                className={`font-bold leading-none tabular-nums ${top.put_away_pct != null && top.put_away_pct >= 30 ? 'text-orange-600' : 'text-stone-900'}`}
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.85rem' }}
              >
                {top.put_away_pct != null ? Math.round(top.put_away_pct) : '—'}
                {top.put_away_pct != null && <span className="text-base">%</span>}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mt-0.5">Putaway</p>
            </div>
            <div className="px-2 py-3 text-center">
              <div
                className={`font-bold leading-none tabular-nums ${top.est_woba != null && top.est_woba <= 0.270 ? 'text-emerald-600' : 'text-stone-900'}`}
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.85rem' }}
              >
                {top.est_woba != null ? top.est_woba.toFixed(3).replace(/^0/, '') : '—'}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mt-0.5">xwOBA</p>
            </div>
            <div className="px-2 py-3 text-center">
              <div
                className="font-bold leading-none text-stone-900 tabular-nums"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.85rem' }}
              >
                {top.avg_velocity != null ? top.avg_velocity.toFixed(0) : '—'}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mt-0.5">mph</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start flex-wrap">
        <svg width="190" height="190" viewBox="0 0 190 190" className="flex-shrink-0">
          {[25, 50, 75, 100].map(pct => (
            <polygon
              key={pct}
              points={gridPolygon(pct)}
              fill="none"
              stroke="#e7e5e4"
              strokeWidth={pct === 100 ? 1 : 0.5}
            />
          ))}
          {AXES.map((_, i) => {
            const angle = startAngle + i * angleStep
            return (
              <line
                key={i}
                x1={CX} y1={CY}
                x2={(CX + R * Math.cos(angle)).toFixed(1)}
                y2={(CY + R * Math.sin(angle)).toFixed(1)}
                stroke="#e7e5e4"
                strokeWidth={0.5}
              />
            )
          })}
          {displayPitches.map((pitch, pi) => (
            <polygon
              key={pitch.code}
              points={getPoints(pitch)}
              fill={colorFor(pitch.code)}
              fillOpacity={0.14 + pi * 0.05}
              stroke={colorFor(pitch.code)}
              strokeWidth={pi === 0 ? 2.25 : 1.5}
              strokeOpacity={0.9}
            />
          ))}
          {AXES.map((_, i) => {
            const lbl = axisLabel(i)
            return (
              <text
                key={i}
                x={lbl.x} y={lbl.y}
                textAnchor={lbl.anchor}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 8, fill: '#78716c', fontWeight: 600 }}
              >
                {lbl.label}
              </text>
            )
          })}
          <circle cx={CX} cy={CY} r={2} fill="#d6d3d1" />
        </svg>

        <div className="flex-1 min-w-[140px] space-y-2.5">
          {displayPitches.slice(1).map(pitch => (
            <div key={pitch.code} className="rounded-lg bg-stone-50 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorFor(pitch.code) }} />
                <span className="font-serif text-[13px] font-medium text-stone-800">{pitch.name}</span>
                {pitch.usage_pct != null && (
                  <span className="font-mono text-[10px] text-stone-400 ml-auto tabular-nums">{pitch.usage_pct.toFixed(0)}%</span>
                )}
              </div>
              <div className="flex gap-3">
                {pitch.whiff_pct != null && (
                  <div>
                    <span className={`font-mono text-[13px] font-bold tabular-nums ${pitch.whiff_pct >= 34 ? 'text-orange-600' : 'text-stone-700'}`}>
                      {Math.round(pitch.whiff_pct)}%
                    </span>
                    <span className="font-mono text-[8px] text-stone-400 ml-0.5">whiff</span>
                  </div>
                )}
                {pitch.est_woba != null && (
                  <div>
                    <span className={`font-mono text-[13px] font-bold tabular-nums ${pitch.est_woba <= 0.270 ? 'text-emerald-600' : 'text-stone-700'}`}>
                      {pitch.est_woba.toFixed(3).replace(/^0/, '')}
                    </span>
                    <span className="font-mono text-[8px] text-stone-400 ml-0.5">xw</span>
                  </div>
                )}
                {pitch.avg_velocity != null && (
                  <div>
                    <span className="font-mono text-[13px] font-bold text-stone-700 tabular-nums">
                      {pitch.avg_velocity.toFixed(0)}
                    </span>
                    <span className="font-mono text-[8px] text-stone-400 ml-0.5">mph</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {displayPitches.length === 1 && (
            <p className="font-mono text-[9px] text-stone-400 uppercase tracking-wider pt-2">
              {pitcherName.split(' ').slice(-1)[0]} arsenal
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  SINGLE-PITCH — new v7 flow
//   1. PitchSpider (raw SVG, colored to pitch)
//   2. PitchSpiderExpand — inline expand: spider + "Full detail" button
//   3. PitchDetailModal — deep popup with rank rows + raw values
// ═══════════════════════════════════════════════════════════════════════

const PITCH_AXES = [
  { key: 'whiffScore' as const,    label: 'Whiff',    rawKey: 'whiff_pct' as const,    fmt: (v: number) => `${Math.round(v)}%`,           desc: 'Whiff rate on swings' },
  { key: 'putawayScore' as const,  label: 'Putaway',  rawKey: 'put_away_pct' as const, fmt: (v: number) => `${Math.round(v)}%`,           desc: 'Two-strike put-away rate' },
  { key: 'xwobaScore' as const,    label: 'Quality',  rawKey: 'est_woba' as const,     fmt: (v: number) => v.toFixed(3).replace(/^0/, ''), desc: 'xwOBA against (lower = better)' },
  { key: 'contactScore' as const,  label: 'Contact',  rawKey: 'ba_against' as const,   fmt: (v: number) => v.toFixed(3).replace(/^0/, ''), desc: 'Batting avg against (lower = better)' },
  { key: 'velocityScore' as const, label: 'Velo',     rawKey: 'avg_velocity' as const, fmt: (v: number) => `${v.toFixed(1)} mph`,          desc: 'Average velocity' },
]

function rankLabel(score: number): string {
  if (score >= 90) return 'Elite'
  if (score >= 75) return 'Well above'
  if (score >= 60) return 'Above avg'
  if (score >= 40) return 'Average'
  if (score >= 25) return 'Below avg'
  return 'Well below'
}

function rankColor(score: number): string {
  if (score >= 75) return 'text-orange-600'
  if (score >= 60) return 'text-stone-800'
  if (score >= 40) return 'text-stone-500'
  return 'text-blue-600'
}

/** Reusable spider chart — colored to the pitch. */
function PitchSpider({ pitch, size = 200, color }: {
  pitch: PitchDetailPayload['pitch']
  size?: number
  color: string
}) {
  const CX = size / 2
  const CY = size / 2
  const R = size * 0.36
  const N = PITCH_AXES.length
  const angleStep = (Math.PI * 2) / N
  const startAngle = -Math.PI / 2

  const points = PITCH_AXES.map((ax, i) => {
    const angle = startAngle + i * angleStep
    const val = pitch[ax.key] / 100
    return `${(CX + R * val * Math.cos(angle)).toFixed(1)},${(CY + R * val * Math.sin(angle)).toFixed(1)}`
  }).join(' ')

  const grid = (pct: number) =>
    PITCH_AXES.map((_, i) => {
      const angle = startAngle + i * angleStep
      const r = R * pct / 100
      return `${(CX + r * Math.cos(angle)).toFixed(1)},${(CY + r * Math.sin(angle)).toFixed(1)}`
    }).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {[25, 50, 75, 100].map(pct => (
        <polygon key={pct} points={grid(pct)} fill="none" stroke="#e7e5e4" strokeWidth={pct === 100 ? 1 : 0.5} />
      ))}
      {PITCH_AXES.map((_, i) => {
        const angle = startAngle + i * angleStep
        return (
          <line
            key={i}
            x1={CX} y1={CY}
            x2={(CX + R * Math.cos(angle)).toFixed(1)}
            y2={(CY + R * Math.sin(angle)).toFixed(1)}
            stroke="#e7e5e4"
            strokeWidth={0.5}
          />
        )
      })}
      <polygon
        points={points}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {PITCH_AXES.map((ax, i) => {
        const angle = startAngle + i * angleStep
        const lx = CX + (R + 16) * Math.cos(angle)
        const ly = CY + (R + 16) * Math.sin(angle)
        const anchor = lx < CX - 4 ? 'end' : lx > CX + 4 ? 'start' : 'middle'
        return (
          <text
            key={ax.key}
            x={lx.toFixed(1)}
            y={(ly + 3).toFixed(1)}
            textAnchor={anchor}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 10,
              fontWeight: 700,
              fill: '#57534e',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {ax.label}
          </text>
        )
      })}
      <circle cx={CX} cy={CY} r={2} fill="#d6d3d1" />
    </svg>
  )
}

/**
 * Inline row expand: clean spider only, with a small "Full detail" button
 * that raises an event to the parent to open the modal.
 *
 * The onOpenModal callback receives the raw payload so the parent doesn't
 * need to know how spiders are built.
 */
export function PitchSpiderExpand({
  payload,
  onOpenModal,
}: {
  payload: PitchDetailPayload
  onOpenModal?: (p: PitchDetailPayload) => void
}) {
  const { pitcherName, pitch } = payload
  const color = pitchColorFor(pitch.code)

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <PitchSpider pitch={pitch} size={200} color={color} />

      <div className="flex-1 flex flex-col items-center sm:items-start gap-2 min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-serif text-base font-semibold text-stone-900">{pitch.name}</span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
          {pitcherName.split(' ').slice(-1)[0]}
          {pitch.usage_pct != null ? ` · ${pitch.usage_pct.toFixed(0)}% usage` : ''}
        </p>
        <p className="font-serif text-[12px] text-stone-500 max-w-[260px] text-center sm:text-left leading-snug">
          Larger shape = better across the five axes vs a typical MLB range.
        </p>

        {onOpenModal && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenModal(payload) }}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 hover:border-stone-900 hover:bg-stone-900 hover:text-white transition-colors group"
            style={{ borderRadius: 0 }}
          >
            <span
              className="font-bold text-stone-900 group-hover:text-white leading-none"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.95rem', letterSpacing: '0.04em' }}
            >
              Full detail
            </span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Modal: bigger spider + full ranked metrics. Renders via a fixed
 * overlay; parent controls open/close.
 */
export function PitchDetailModal({
  payload,
  onClose,
}: {
  payload: PitchDetailPayload
  onClose: () => void
}) {
  const { pitcherName, pitch } = payload
  const color = pitchColorFor(pitch.code)

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 bg-stone-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200"
        style={{ borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-stone-200 z-10">
          <div className="flex items-center gap-3 px-5 sm:px-6 py-3.5">
            <span className="w-4 h-4 rounded-full shrink-0" style={{ background: color }} />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 leading-none">
                Pitch profile
              </p>
              <h3
                className="text-stone-900 leading-none mt-1 truncate"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.6rem', letterSpacing: '0.02em' }}
              >
                {pitch.name}
              </h3>
              <p className="font-mono text-[10px] text-stone-500 mt-1 truncate">
                {pitcherName}
                {pitch.usage_pct != null ? ` · ${pitch.usage_pct.toFixed(0)}% usage` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors"
              aria-label="Close"
              style={{ borderRadius: 0 }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Spider + big rank rows */}
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="w-full md:w-auto flex justify-center">
              <PitchSpider pitch={pitch} size={240} color={color} />
            </div>

            <div className="flex-1 w-full min-w-0 space-y-2">
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold">
                vs typical MLB range · Baseball Savant
              </p>
              {PITCH_AXES.map(ax => {
                const score = pitch[ax.key]
                const raw = pitch[ax.rawKey]
                return (
                  <div key={ax.key} className="border-b border-stone-100 pb-2">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-stone-500 w-16 shrink-0">
                        {ax.label}
                      </span>
                      <span
                        className="font-bold text-stone-900 tabular-nums"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem' }}
                      >
                        {raw != null ? ax.fmt(raw as number) : '—'}
                      </span>
                      <span className={`ml-auto font-mono text-[10px] font-bold uppercase tracking-wider ${rankColor(score)}`}>
                        {rankLabel(score)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pl-16">
                      <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${score}%`,
                            background: score >= 75 ? color : score >= 50 ? '#a8a29e' : '#94a3b8',
                          }}
                        />
                      </div>
                      <span className={`font-mono text-[11px] font-bold tabular-nums w-8 text-right ${rankColor(score)}`}>
                        {score}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-stone-400 mt-1 pl-16">{ax.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Extra footer facts */}
          {(pitch.hard_hit_pct != null || pitch.est_woba != null || pitch.ba_against != null) && (
            <div className="border-t border-stone-200 pt-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold mb-3">
                Contact quality
              </p>
              <div className="grid grid-cols-3 gap-3">
                {pitch.hard_hit_pct != null && (
                  <div className="text-center bg-stone-50 py-3">
                    <div
                      className="font-bold leading-none text-stone-900 tabular-nums"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}
                    >
                      {Math.round(pitch.hard_hit_pct)}<span className="text-sm">%</span>
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mt-1">Hard-hit</p>
                  </div>
                )}
                {pitch.est_woba != null && (
                  <div className="text-center bg-stone-50 py-3">
                    <div
                      className="font-bold leading-none text-stone-900 tabular-nums"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}
                    >
                      {fmtAvg(pitch.est_woba)}
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mt-1">xwOBA</p>
                  </div>
                )}
                {pitch.ba_against != null && (
                  <div className="text-center bg-stone-50 py-3">
                    <div
                      className="font-bold leading-none text-stone-900 tabular-nums"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}
                    >
                      {fmtAvg(pitch.ba_against)}
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mt-1">BA against</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 text-center pt-2">
            Esc to close · Baseball Savant · season
          </p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  DISPATCHER — v7 accepts onOpenModal for pitch-detail flow
// ═══════════════════════════════════════════════════════════════════════
export function ScoutExpandChart({
  expand,
  onOpenPitchModal,
}: {
  expand: ScoutExpand | null | undefined
  onOpenPitchModal?: (p: PitchDetailPayload) => void
}) {
  if (!expand) return null
  switch (expand.kind) {
    case 'arsenal-radar':
      return <ArsenalRadarChart {...(expand.data as ArsenalRadarPayload)} />
    case 'pitch-detail':
      return <PitchSpiderExpand payload={expand.data as PitchDetailPayload} onOpenModal={onOpenPitchModal} />
    case 'count-state-bars':
      return <CountStateBarsChart {...(expand.data as any)} />
    case 'first-pitch-mini':
      return <FirstPitchMiniChart {...(expand.data as any)} />
    case 'arsenal-mini':
      return <ArsenalMiniChart {...(expand.data as any)} />
    case 'tto-bars':
      return <TtoBarsChart {...(expand.data as any)} />
    case 'workload-bars':
      return <WorkloadBarsChart {...(expand.data as any)} />
    case 'transaction-card':
      return <TransactionCard data={expand.data as any} />
    case 'weather-vector':
      return <WeatherVectorChart data={expand.data as any} />
    case 'park-factor':
      return <ParkFactorChart data={expand.data as any} />
    default:
      return null
  }
}