'use client'

import { useState, useEffect, useRef } from 'react'
import MetricTip from './MetricTip'
import ViewModeToggle from './ViewModeToggle'
import CardExportToolbar from './CardExportToolbar'
import PercentileRing from './PercentileRing'
import YearSelectModal, { type YearSelection } from './YearSelectModal'
import {
  PITCHER_STAT_GROUPS, BATTER_STAT_GROUPS,
  PITCHER_CORE_GROUP_TITLES, BATTER_CORE_GROUP_TITLES,
  textColorForBg,
  type StatDef,
} from '@/lib/player-stats'
import { teamColorById } from '@/lib/lab'

type SubjectType = 'pitcher' | 'batter'
type SelectedPlayer = { id: number; fullName: string; primaryPosition: string; subjectType: SubjectType }
type PercentileResult = { rank: number; poolSize: number; percentile: number }

type PitcherCardData = {
  stats: Record<string, unknown>
  percentiles: Record<string, PercentileResult | null>
  arsenal: { pitch_name: string; usage_pct: number; whiff_pct: number; baa: number; avg_velocity: number }[]
  formSignal: { signal: string; magnitude: number; current_value: number } | null
  teamId: number | null
}

type BatterCardData = {
  season: { key: string; label: string; value: string }[]
  percentiles: Record<string, PercentileResult | null>
  percentilesAvailable: boolean
  formSignal: { signal: string; magnitude: number; current_value: number } | null
  teamId: number | null
}

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_180,q_auto:best/v1/people/${personId}/headshot/67/current`
}

function percentileColor(p: number): string {
  if (p >= 80) return '#15803D'
  if (p >= 60) return '#FF5722'
  if (p >= 35) return '#78716C'
  return '#DC2626'
}

// Value + label + percentile bar with the actual "Nth percentile" text,
// laid out as a grid cell rather than a full-width row — this is the
// piece that keeps cards from stretching endlessly down the page.
function StatBlock({ label, tooltip, value, pct }: { label: string; tooltip: any; value: string; pct?: PercentileResult | null }) {
  return (
    <div className="min-w-0 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mb-0.5 truncate">
          <MetricTip tip={tooltip}>{label}</MetricTip>
        </div>
        <div className="font-mono text-base font-bold text-stone-900 leading-tight truncate">{value}</div>
      </div>
      {pct && <PercentileRing percentile={pct.percentile} size={32} strokeWidth={3} />}
    </div>
  )
}
function StatGridGroup({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-stone-200 first:border-t-0">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between py-2 text-left">
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">{title}</span>
        <span className="text-stone-400 text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="grid grid-cols-2 gap-x-4 gap-y-3 pb-3">{children}</div>}
    </div>
  )
}

function ArsenalStrip({ arsenal }: { arsenal: PitcherCardData['arsenal'] }) {
  if (arsenal.length === 0) return null
  return (
    <div className="border-t border-stone-200 py-2">
      <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722] block mb-2">Arsenal</span>
      <div className="space-y-1.5">
        {arsenal.slice(0, 5).map(p => (
          <div key={p.pitch_name} className="flex items-center gap-2 text-[10px] font-mono">
            <span className="w-16 shrink-0 truncate text-stone-600">{p.pitch_name}</span>
            <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#1A1A1A]" style={{ width: `${p.usage_pct}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-stone-500">{p.usage_pct?.toFixed(0)}%</span>
            <span className="w-10 shrink-0 text-right text-stone-400">{p.avg_velocity?.toFixed(1)}mph</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FormBadge({ formSignal, textColor }: { formSignal: { signal: string; magnitude: number } | null; textColor: string }) {
  if (!formSignal) return null
  const hot = formSignal.magnitude > 0
  return (
    <span
      className="inline-block text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1"
      style={{ background: hot ? '#FEF3C7' : '#DBEAFE', color: hot ? '#92400E' : '#1E3A8A' }}
    >
      {formSignal.signal.replace(/_/g, ' ')}
    </span>
  )
}

export default function PlayerCard({ player, onRemove }: { player: SelectedPlayer; onRemove: () => void }) {
  const [pitcherData, setPitcherData] = useState<PitcherCardData | null>(null)
  const [batterData, setBatterData] = useState<BatterCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'core' | 'advanced'>('core')
  const [yearModalOpen, setYearModalOpen] = useState(false)
  const [yearSel, setYearSel] = useState<YearSelection>({ mode: 'single', years: [new Date().getFullYear()] })
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const url = player.subjectType === 'pitcher'
      ? `/api/lab/pitcher-card?id=${player.id}`
      : `/api/lab/batter-card?id=${player.id}&mode=${yearSel.mode}&years=${yearSel.years.join(',')}`

    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.error) throw new Error(json.detail || json.error)
        if (player.subjectType === 'pitcher') setPitcherData(json)
        else setBatterData(json)
      })
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load this player."))
      .finally(() => !cancelled && setLoading(false))

    return () => { cancelled = true }
  }, [player.id, player.subjectType, yearSel.mode, yearSel.years.join(',')])

  const seasonMap = batterData ? Object.fromEntries(batterData.season.map(r => [r.key, r.value])) : {}
  const yearLabel = yearSel.mode === 'career' ? 'Career' : yearSel.mode === 'multi' ? `${yearSel.years.length} years` : String(yearSel.years[0])

  const teamId = pitcherData?.teamId ?? batterData?.teamId ?? null
  const headerBg = teamColorById(teamId)
  const headerText = textColorForBg(headerBg)

  return (
    <div ref={cardRef} className="border border-stone-200 bg-white min-w-0">
      <div className="p-4 flex items-start gap-3" style={{ background: headerBg, color: headerText }}>
        <img src={headshotUrl(player.id)} alt={player.fullName} className="w-14 h-14 rounded-full object-cover border-2 shrink-0" style={{ borderColor: headerText === '#FAF8F3' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)' }} />
        <div className="min-w-0 flex-1">
          <div className="font-serif font-bold text-base leading-tight truncate">{player.fullName}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">{player.primaryPosition} · {player.subjectType}</div>
          <FormBadge formSignal={pitcherData?.formSignal ?? batterData?.formSignal ?? null} textColor={headerText} />
        </div>
        <button type="button" onClick={onRemove} className="text-sm opacity-60 hover:opacity-100" style={{ color: headerText }} aria-label={`Remove ${player.fullName}`}>✕</button>
      </div>

      <div className="px-4 pt-3 pb-3 flex items-center justify-between gap-2 flex-wrap border-b border-stone-100">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} offenseLabel={player.subjectType === 'batter' ? 'Offense' : 'Core'} />
        <div className="flex items-center gap-2">
          {player.subjectType === 'batter' && (
            <button type="button" onClick={() => setYearModalOpen(true)} className="text-[9px] font-mono uppercase tracking-widest border border-stone-300 px-2 py-1 hover:border-stone-900">
              {yearLabel}
            </button>
          )}
          <CardExportToolbar targetRef={cardRef} fileName={`${player.fullName.replace(/\s+/g, '-').toLowerCase()}-the-edge`} />
        </div>
      </div>

      <div className="px-4 pb-4">
        {loading ? (
          <p className="text-xs font-mono text-stone-400 py-4">Loading…</p>
        ) : error ? (
          <p className="text-xs font-mono text-red-600 py-4">{error}</p>
        ) : player.subjectType === 'pitcher' && pitcherData ? (
          <>
            {PITCHER_STAT_GROUPS
              .filter(g => viewMode === 'advanced' ? !PITCHER_CORE_GROUP_TITLES.has(g.title) : PITCHER_CORE_GROUP_TITLES.has(g.title))
              .map((group, i) => {
                const visible = group.stats.filter(s => !s.advanced || (pitcherData.stats[s.key] !== null && pitcherData.stats[s.key] !== undefined))
                if (visible.length === 0) return null
                return (
                  <StatGridGroup key={group.title} title={group.title} defaultOpen={i < 2}>
                    {visible.map((stat: StatDef) => {
                      const v = pitcherData.stats[stat.key]
                      const display = typeof v === 'number' ? stat.format(v) : '—'
                      return <StatBlock key={stat.key} label={stat.label} tooltip={stat.tooltip} value={display} pct={pitcherData.percentiles[stat.key]} />
                    })}
                  </StatGridGroup>
                )
              })}
            {viewMode === 'advanced' && <ArsenalStrip arsenal={pitcherData.arsenal} />}
          </>
        ) : batterData ? (
          <>
            {!batterData.percentilesAvailable && (
              <p className="text-[9px] font-mono text-stone-300 pt-2">Percentile ranks only apply to single-year view.</p>
            )}
            {BATTER_STAT_GROUPS
              .filter(g => viewMode === 'advanced' ? !BATTER_CORE_GROUP_TITLES.has(g.title) : BATTER_CORE_GROUP_TITLES.has(g.title))
              .map((group, i) => (
                <StatGridGroup key={group.title} title={group.title} defaultOpen={i < 2}>
                  {group.stats.map(stat => (
                    <StatBlock key={stat.key} label={stat.label} tooltip={stat.tooltip} value={seasonMap[stat.key] ?? '—'} pct={batterData.percentiles[stat.key]} />
                  ))}
                </StatGridGroup>
              ))}
          </>
        ) : null}
      </div>

      {yearModalOpen && (
        <YearSelectModal
          initial={yearSel}
          onClose={() => setYearModalOpen(false)}
          onConfirm={sel => { setYearSel(sel); setYearModalOpen(false) }}
        />
      )}
    </div>
  )
}