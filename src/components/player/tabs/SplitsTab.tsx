'use client'

import { useEffect, useState } from 'react'
import type { PlayerSplitsData, SplitLine } from '@/lib/player-splits'

export default function SplitsTab({ playerId, isPitcher }: { playerId: number; isPitcher: boolean }) {
  const [data, setData] = useState<PlayerSplitsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/player/splits/${playerId}?type=${isPitcher ? 'pitcher' : 'batter'}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled) setData(j) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playerId, isPitcher])

  if (loading) return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">Loading splits…</p>
  if (!data) return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">No split data available.</p>

  return (
    <div className="space-y-5">
      <SplitSection title="vs Handedness" rows={data.handedness} isPitcher={isPitcher} />
      <SplitSection title="Home / Away" rows={data.homeAway} isPitcher={isPitcher} />
      <SplitSection title="Day / Night" rows={data.daynight} isPitcher={isPitcher} />
      <SplitSection title="By month" rows={data.monthly} isPitcher={isPitcher} />
      {!isPitcher && <SplitSection title="By count" rows={data.count} isPitcher={isPitcher} />}
      <SplitSection title="Situational" rows={data.situational} isPitcher={isPitcher} />
      <SplitSection title="Leverage" rows={data.leverage} isPitcher={isPitcher} />
    </div>
  )
}

function SplitSection({
  title, rows, isPitcher,
}: {
  title: string
  rows: SplitLine[]
  isPitcher: boolean
}) {
  if (rows.length === 0) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
          ⊕ {title}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50">
            <tr>
              {isPitcher ? (
                <>
                  <th className="px-3 py-2 text-left text-[9px] font-mono uppercase tracking-widest text-stone-500">Split</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">BF</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">IP</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">ERA</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">WHIP</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">K/9</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">BAA</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 text-left text-[9px] font-mono uppercase tracking-widest text-stone-500">Split</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">PA</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">AVG</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">OBP</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">SLG</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">OPS</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">HR</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">K</th>
                  <th className="px-3 py-2 text-right text-[9px] font-mono uppercase tracking-widest text-stone-500">BB</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.sitCode + i} className="border-t border-stone-50 hover:bg-stone-50/50">
                {isPitcher ? (
                  <>
                    <td className="px-3 py-2 font-serif text-stone-800 whitespace-nowrap">{r.label}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-600">{r.bf}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.ip}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">{r.era}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.whip}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.k9}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.baa}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-serif text-stone-800 whitespace-nowrap">{r.label}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-600">{r.pa}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">{r.avg}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.obp}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.slg}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-stone-900">{r.ops}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.hr}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.so}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{r.bb}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}