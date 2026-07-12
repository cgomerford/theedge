'use client'

import { useState, useEffect, useRef } from 'react'
import HorizontalBarCompareBase, { type BarDatum } from './HorizontalBarCompareBase'
import CardExportToolbar from './CardExportToolbar'
import { PITCHER_STAT_GROUPS, BATTER_STAT_GROUPS } from '@/lib/player-stats'
import { teamColorById } from '@/lib/lab'

type SelectedPlayer = { id: number; fullName: string; primaryPosition: string; subjectType: 'pitcher' | 'batter' }
const FALLBACK_COLORS = ['#FF5722', '#1A1A1A', '#2563EB', '#15803D']

// StatDef (pitcher) and BatterStatMeta (batter) have different shapes —
// BatterStatMeta has no higherIsBetter field at all. Rather than carry the
// union StatDef | BatterStatMeta through .find()/.filter() downstream
// (same footgun that broke ScatterCompareChart.tsx: TS's inference over a
// union of differently-shaped arrays doesn't narrow reliably, even though
// the actual runtime data is fine), normalize both into one concrete shape
// immediately. Every stat gets a real, always-present higherIsBetter —
// defaulting to true for batter stats missing it, same as before, but now
// as a genuine boolean field instead of a per-render 'in' check.
type NormalizedStat = { key: string; label: string; higherIsBetter: boolean; advanced?: boolean }
type NormalizedGroup = { title: string; stats: NormalizedStat[] }

function normalizeGroups(groups: { title: string; stats: any[] }[]): NormalizedGroup[] {
  return groups.map(g => ({
    title: g.title,
    stats: g.stats.map((s: any): NormalizedStat => ({
      key: s.key,
      label: s.label,
      // TODO: BatterStatMeta doesn't carry higherIsBetter at all — true is
      // correct for most counting/rate stats currently in BATTER_STAT_GROUPS,
      // but would be WRONG for something like strikeouts if one's ever added
      // there. Worth a real audit of player-stats.ts rather than trusting
      // this default forever.
      higherIsBetter: typeof s.higherIsBetter === 'boolean' ? s.higherIsBetter : true,
      advanced: s.advanced,
    })),
  }))
}

function extractValue(subjectType: 'pitcher' | 'batter', j: any, statKey: string): { raw: number | null; formatted: string } {
  if (subjectType === 'pitcher') {
    const v = j.stats?.[statKey]
    if (typeof v !== 'number') return { raw: null, formatted: '—' }
    const stat = PITCHER_STAT_GROUPS.flatMap(g => g.stats).find(s => s.key === statKey)
    return { raw: v, formatted: stat ? stat.format(v) : String(v) }
  }
  const row = (j.season ?? []).find((r: any) => r.key === statKey)
  if (!row) return { raw: null, formatted: '—' }
  const n = parseFloat(row.value)
  return isNaN(n) ? { raw: null, formatted: '—' } : { raw: n, formatted: row.value }
}

export default function PlayerBarCompareChart({ players }: { players: SelectedPlayer[] }) {
  const [subjectType, setSubjectType] = useState<'pitcher' | 'batter'>('batter')
  const pool = players.filter(p => p.subjectType === subjectType)
  const groups: NormalizedGroup[] = normalizeGroups(subjectType === 'pitcher' ? PITCHER_STAT_GROUPS : BATTER_STAT_GROUPS)
  const [groupTitle, setGroupTitle] = useState(groups[0]?.title ?? '')
  const [cardData, setCardData] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const g = normalizeGroups(subjectType === 'pitcher' ? PITCHER_STAT_GROUPS : BATTER_STAT_GROUPS)
    setGroupTitle(g[0]?.title ?? '')
  }, [subjectType])

  useEffect(() => {
    if (pool.length === 0) { setCardData({}); return }
    setLoading(true)
    const url = (p: SelectedPlayer) => subjectType === 'pitcher' ? `/api/lab/pitcher-card?id=${p.id}` : `/api/lab/batter-card?id=${p.id}&mode=single`
    Promise.all(pool.map(p => fetch(url(p)).then(r => r.json()).then(j => [p.id, j] as const)))
      .then(entries => setCardData(Object.fromEntries(entries)))
      .finally(() => setLoading(false))
  }, [pool.map(p => p.id).join(','), subjectType])

  const activeGroup = groups.find(g => g.title === groupTitle)
  const visibleStats: NormalizedStat[] = (activeGroup?.stats ?? []).filter((s) =>
    !s.advanced || pool.some(p => typeof cardData[p.id]?.stats?.[s.key] === 'number')
  )

  function statData(statKey: string): BarDatum[] {
    return pool.map((p, i): BarDatum | null => {
      const j = cardData[p.id]
      if (!j) return null
      const { raw, formatted } = extractValue(subjectType, j, statKey)
      if (raw === null) return null
      return {
        id: String(p.id), name: p.fullName, value: raw, formatted,
        percentile: j.percentiles?.[statKey]?.percentile ?? null,
        color: j.teamId ? teamColorById(j.teamId) : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      }
    }).filter((d): d is BarDatum => d !== null)
  }

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Bar compare</div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['batter', 'pitcher'] as const).map(t => (
              <button key={t} type="button" onClick={() => setSubjectType(t)}
                className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 border ${subjectType === t ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500'}`}>
                {t === 'batter' ? 'Batters' : 'Pitchers'}
              </button>
            ))}
          </div>
          <CardExportToolbar targetRef={chartRef} fileName={`bar-compare-${groupTitle}-the-edge`.replace(/\s+/g, '-').toLowerCase()} />
        </div>
      </div>

      <div className="flex gap-1 flex-wrap mb-4">
        {groups.map(g => (
          <button
            key={g.title}
            type="button"
            onClick={() => setGroupTitle(g.title)}
            className={`text-[9px] font-mono uppercase tracking-widest px-2.5 py-1 border ${groupTitle === g.title ? 'bg-[#FF5722] text-white border-[#FF5722]' : 'border-stone-300 text-stone-500 hover:border-stone-900'}`}
          >
            {g.title}
          </button>
        ))}
      </div>

      {pool.length === 0 ? (
        <p className="text-xs font-mono text-stone-400 py-6">No {subjectType}s selected above.</p>
      ) : loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <div ref={chartRef} className="border border-stone-200 bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
            {visibleStats.map((stat) => {
              const data = statData(stat.key)
              if (data.length === 0) return null
              return (
                <div key={stat.key}>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-stone-500 mb-1.5">{stat.label}</div>
                  <HorizontalBarCompareBase data={data} higherIsBetter={stat.higherIsBetter} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}