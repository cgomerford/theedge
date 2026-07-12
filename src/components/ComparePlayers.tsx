'use client'

import { useState, useEffect, useRef } from 'react'
import CardExportToolbar from './CardExportToolbar'
import YearSelectModal, { type YearSelection } from './YearSelectModal'
import OverlayStatRow from './OverlayStatRow'
import { PITCHER_STAT_GROUPS, BATTER_STAT_GROUPS, batterHigherIsBetter, type StatDef } from '@/lib/player-stats'
import { teamColorById } from '@/lib/lab'

type SubjectType = 'pitcher' | 'batter'
type SelectedPlayer = { id: number; fullName: string; primaryPosition: string; subjectType: SubjectType }

function headshotUrl(id: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_180,q_auto:best/v1/people/${id}/headshot/67/current`
}
function lastName(fullName: string) {
  return fullName.split(' ').slice(-1)[0]
}

function VerdictBanner({
  aName, bName, colorA, colorB, aWins, bWins, ties,
}: { aName: string; bName: string; colorA: string; colorB: string; aWins: number; bWins: number; ties: number }) {
  const total = aWins + bWins
  const pctA = total > 0 ? (aWins / total) * 100 : 50
  const pctB = total > 0 ? (bWins / total) * 100 : 50
  const leader = aWins > bWins ? 'a' : bWins > aWins ? 'b' : null

  return (
    <div className="p-5 bg-stone-50 border-b border-stone-200">
      <div className="text-center mb-3 font-serif font-bold text-lg sm:text-xl text-stone-900">
        {leader === 'a' && <>{aName} leads <span style={{ color: colorA }}>{aWins}</span> of {total} categories</>}
        {leader === 'b' && <>{bName} leads <span style={{ color: colorB }}>{bWins}</span> of {total} categories</>}
        {leader === null && total > 0 && <>Dead even — {aWins} categories each</>}
        {total === 0 && <>Expand a category below to see the verdict</>}
      </div>
      {total > 0 && (
        <>
          <div className="flex h-3 rounded-full overflow-hidden">
            <div style={{ width: `${pctA}%`, background: colorA }} />
            <div style={{ width: `${pctB}%`, background: colorB }} />
          </div>
          <div className="flex justify-between text-[9px] font-mono uppercase tracking-widest text-stone-500 mt-1.5">
            <span>{aName}: {aWins}</span>
            {ties > 0 && <span>{ties} tied</span>}
            <span>{bName}: {bWins}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default function ComparePlayers({ a, b, onClose }: { a: SelectedPlayer; b: SelectedPlayer; onClose: () => void }) {
  const [dataA, setDataA] = useState<any>(null)
  const [dataB, setDataB] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [yearModalOpen, setYearModalOpen] = useState(false)
  const [yearSel, setYearSel] = useState<YearSelection>({ mode: 'single', years: [new Date().getFullYear()] })
  const cardRef = useRef<HTMLDivElement>(null)

  const isPitcher = a.subjectType === 'pitcher'
  const mismatched = a.subjectType !== b.subjectType
  const groups = isPitcher ? PITCHER_STAT_GROUPS : BATTER_STAT_GROUPS

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(groups.map(g => [g.title, true]))
  )
  function toggleGroup(title: string) {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }))
  }

  useEffect(() => {
    if (mismatched) { setLoading(false); return }
    const url = (p: SelectedPlayer) => isPitcher
      ? `/api/lab/pitcher-card?id=${p.id}`
      : `/api/lab/batter-card?id=${p.id}&mode=${yearSel.mode}&years=${yearSel.years.join(',')}`
    setLoading(true)
    Promise.all([fetch(url(a)).then(r => r.json()), fetch(url(b)).then(r => r.json())])
      .then(([ja, jb]) => { setDataA(ja); setDataB(jb) })
      .finally(() => setLoading(false))
  }, [a.id, b.id, a.subjectType, b.subjectType, yearSel.mode, yearSel.years.join(',')])

  const yearLabel = isPitcher ? String(new Date().getFullYear())
    : yearSel.mode === 'career' ? 'Career'
    : yearSel.mode === 'multi' ? yearSel.years.sort().join(', ')
    : String(yearSel.years[0])

  const colorA = teamColorById(dataA?.teamId)
  const colorB = teamColorById(dataB?.teamId)

  let aWins = 0, bWins = 0, ties = 0
  if (!isPitcher && dataA && dataB) {
    const mapA = Object.fromEntries((dataA.season ?? []).map((r: any) => [r.key, r.value]))
    const mapB = Object.fromEntries((dataB.season ?? []).map((r: any) => [r.key, r.value]))
    for (const group of groups) {
      if (!openGroups[group.title]) continue
      for (const stat of group.stats) {
        const na = parseFloat(mapA[stat.key]), nb = parseFloat(mapB[stat.key])
        if (isNaN(na) || isNaN(nb)) continue
        if (na === nb) { ties++; continue }
        const better = batterHigherIsBetter(stat.key) ? (na > nb ? 'a' : 'b') : (na < nb ? 'a' : 'b')
        if (better === 'a') aWins++; else bWins++
      }
    }
  } else if (isPitcher && dataA && dataB) {
    for (const group of groups) {
      if (!openGroups[group.title]) continue
      for (const stat of group.stats as StatDef[]) {
        const va = dataA.stats?.[stat.key], vb = dataB.stats?.[stat.key]
        if (typeof va !== 'number' || typeof vb !== 'number') continue
        if (va === vb) { ties++; continue }
        const better = stat.higherIsBetter ? (va > vb ? 'a' : 'b') : (va < vb ? 'a' : 'b')
        if (better === 'a') aWins++; else bWins++
      }
    }
  }

  return (
    <div ref={cardRef} className="border border-stone-200 bg-white">
      <div className="flex items-center justify-between p-4 border-b border-stone-200 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722]">Head to head</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 border border-stone-200 px-2 py-0.5">Comparing: {yearLabel}</span>
          {!isPitcher && (
            <button type="button" onClick={() => setYearModalOpen(true)} className="text-[10px] font-mono uppercase tracking-widest text-stone-400 hover:text-stone-900 underline">change</button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CardExportToolbar targetRef={cardRef} fileName={`${a.fullName}-vs-${b.fullName}-the-edge`.replace(/\s+/g, '-').toLowerCase()} />
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-900 text-sm">✕ Close compare</button>
        </div>
      </div>

      {mismatched ? (
        <p className="p-6 font-serif italic text-stone-400 text-sm">Compare only works between two players of the same type — pick two pitchers or two batters.</p>
      ) : loading ? (
        <p className="p-6 text-xs font-mono text-stone-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-stone-200">
            {[a, b].map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 p-4">
                <img src={headshotUrl(p.id)} alt={p.fullName} className="w-12 h-12 rounded-full object-cover border-2" style={{ borderColor: i === 0 ? colorA : colorB }} />
                <span className="font-serif font-bold" style={{ color: i === 0 ? colorA : colorB }}>{p.fullName}</span>
              </div>
            ))}
          </div>

          <VerdictBanner aName={a.fullName} bName={b.fullName} colorA={colorA} colorB={colorB} aWins={aWins} bWins={bWins} ties={ties} />

          {groups.map(group => {
            const open = openGroups[group.title]
            return (
              <div key={group.title} className="border-t border-stone-200">
                <button type="button" onClick={() => toggleGroup(group.title)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">{group.title}</span>
                  <span className="text-stone-400 text-xs">{open ? '− collapse' : '+ expand'}</span>
                </button>
                {open && (
                  <div className="px-4 pb-2">
                    {isPitcher ? (
                      (group.stats as StatDef[]).map(stat => {
                        const va = dataA?.stats?.[stat.key]
                        const vb = dataB?.stats?.[stat.key]
                        if (stat.advanced && va == null && vb == null) return null
                        const bothNum = typeof va === 'number' && typeof vb === 'number'
                        let deltaFormatted: string | null = null, leaderName: string | null = null, leaderColor = '#78716C', isTie = false
                        if (bothNum) {
                          if (va === vb) { isTie = true } else {
                            const better = stat.higherIsBetter ? (va > vb ? 'a' : 'b') : (va < vb ? 'a' : 'b')
                            deltaFormatted = stat.format(Math.abs(va - vb))
                            leaderName = lastName(better === 'a' ? a.fullName : b.fullName)
                            leaderColor = better === 'a' ? colorA : colorB
                          }
                        }
                     return (
  <OverlayStatRow
    key={stat.key} label={stat.label} tooltip={stat.tooltip}
    valueAFormatted={typeof va === 'number' ? stat.format(va) : null}
    valueBFormatted={typeof vb === 'number' ? stat.format(vb) : null}
    deltaFormatted={bothNum ? deltaFormatted : null} leaderName={leaderName} leaderColor={leaderColor} isTie={isTie}
    pctA={dataA?.percentiles?.[stat.key]} pctB={dataB?.percentiles?.[stat.key]}
    percentileUnavailable={yearSel.mode !== 'single'}
  />
)
                      })
                    ) : (
                      (() => {
                        const mapA = Object.fromEntries((dataA?.season ?? []).map((r: any) => [r.key, r.value]))
                        const mapB = Object.fromEntries((dataB?.season ?? []).map((r: any) => [r.key, r.value]))
                        return group.stats.map(stat => {
                          const va = mapA[stat.key], vb = mapB[stat.key]
                          const na = parseFloat(va), nb = parseFloat(vb)
                          const bothNum = !isNaN(na) && !isNaN(nb)
                          let deltaFormatted: string | null = null, leaderName: string | null = null, leaderColor = '#78716C', isTie = false
                          if (bothNum) {
                            if (na === nb) { isTie = true } else {
                              const better = batterHigherIsBetter(stat.key) ? (na > nb ? 'a' : 'b') : (na < nb ? 'a' : 'b')
                              const decimals = (String(va).split('.')[1] || '').length
                              deltaFormatted = Math.abs(na - nb).toFixed(decimals)
                              leaderName = lastName(better === 'a' ? a.fullName : b.fullName)
                              leaderColor = better === 'a' ? colorA : colorB
                            }
                          }
                         return (
  <OverlayStatRow
    key={stat.key} label={stat.label} tooltip={stat.tooltip}
    valueAFormatted={va ?? null}
    valueBFormatted={vb ?? null}
    deltaFormatted={bothNum ? deltaFormatted : null} leaderName={leaderName} leaderColor={leaderColor} isTie={isTie}
    pctA={dataA?.percentiles?.[stat.key]} pctB={dataB?.percentiles?.[stat.key]}
  />
)
                        })
                      })()
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {yearModalOpen && (
        <YearSelectModal initial={yearSel} onClose={() => setYearModalOpen(false)} onConfirm={sel => { setYearSel(sel); setYearModalOpen(false) }} />
      )}
    </div>
  )
}