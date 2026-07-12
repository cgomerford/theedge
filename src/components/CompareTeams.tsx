'use client'

import { useState, useEffect, useRef } from 'react'
import CardExportToolbar from './CardExportToolbar'
import OverlayStatRow from './OverlayStatRow'
import { TEAM_CONTEXT_GROUPS } from '@/lib/player-stats'
import { teamColorById } from '@/lib/lab'

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

export default function CompareTeams({
  teamAId, teamBId, teamAName, teamBName, onClose,
}: {
  teamAId: number; teamBId: number; teamAName: string; teamBName: string; onClose: () => void
}) {
  const [dataA, setDataA] = useState<any>(null)
  const [dataB, setDataB] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const cardRef = useRef<HTMLDivElement>(null)

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(TEAM_CONTEXT_GROUPS.map(g => [g.title, true]))
  )
  function toggleGroup(title: string) {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }))
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/lab/team-card?teamId=${teamAId}`).then(r => r.json()),
      fetch(`/api/lab/team-card?teamId=${teamBId}`).then(r => r.json()),
    ]).then(([ja, jb]) => { setDataA(ja); setDataB(jb) }).finally(() => setLoading(false))
  }, [teamAId, teamBId])

  const colorA = teamColorById(teamAId)
  const colorB = teamColorById(teamBId)

  let aWins = 0, bWins = 0, ties = 0
  if (dataA && dataB) {
    for (const group of TEAM_CONTEXT_GROUPS) {
      if (!openGroups[group.title]) continue
      for (const stat of group.stats) {
        const va = dataA.team?.[stat.key], vb = dataB.team?.[stat.key]
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
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722]">Team head to head</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 border border-stone-200 px-2 py-0.5">Comparing: {new Date().getFullYear()} season</span>
        </div>
        <div className="flex items-center gap-3">
          <CardExportToolbar targetRef={cardRef} fileName={`${teamAName}-vs-${teamBName}-the-edge`.replace(/\s+/g, '-').toLowerCase()} />
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-900 text-sm">✕ Close compare</button>
        </div>
      </div>
      {loading ? (
        <p className="p-6 text-xs font-mono text-stone-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-stone-200">
            <div className="p-4 font-serif font-bold" style={{ color: colorA }}>{teamAName}</div>
            <div className="p-4 font-serif font-bold" style={{ color: colorB }}>{teamBName}</div>
          </div>

          <VerdictBanner aName={teamAName} bName={teamBName} colorA={colorA} colorB={colorB} aWins={aWins} bWins={bWins} ties={ties} />

          {TEAM_CONTEXT_GROUPS.map(group => {
            const open = openGroups[group.title]
            return (
              <div key={group.title} className="border-t border-stone-200">
                <button type="button" onClick={() => toggleGroup(group.title)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">{group.title}</span>
                  <span className="text-stone-400 text-xs">{open ? '− collapse' : '+ expand'}</span>
                </button>
                {open && (
                  <div className="px-4 pb-2">
                    {group.stats.map(stat => {
                      const va = dataA?.team?.[stat.key], vb = dataB?.team?.[stat.key]
                      const bothNum = typeof va === 'number' && typeof vb === 'number'
                      let deltaFormatted: string | null = null, leaderName: string | null = null, leaderColor = '#78716C', isTie = false
                      if (bothNum) {
                        if (va === vb) { isTie = true } else {
                          const better = stat.higherIsBetter ? (va > vb ? 'a' : 'b') : (va < vb ? 'a' : 'b')
                          deltaFormatted = stat.format(Math.abs(va - vb))
                          leaderName = better === 'a' ? teamAName : teamBName
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
  />
)
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}