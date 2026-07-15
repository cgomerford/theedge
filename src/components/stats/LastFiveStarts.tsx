'use client'

// Per-start grade — OUR OWN methodology, not FanGraphs'. Built from the
// same shape getPitcherRecentStarts (lib/mlb.ts) already returns: IP, H,
// ER, BB, K, ERA per start. No proprietary model involved — this is a
// simple, transparent heuristic, labeled as such rather than implying
// it's an industry-standard grade.

import type { PitcherGameLog } from '@/lib/mlb'

const GRADE_COLOR: Record<string, string> = {
  'A+': '#16A34A', A: '#16A34A', 'B+': '#65A30D', B: '#65A30D',
  C: '#D97706', D: '#DC2626', F: '#DC2626',
}

function gradeStart(g: PitcherGameLog): string {
  const era = parseFloat(g.era)
  const ip = parseFloat(g.ip)
  const isQS = ip >= 6 && g.er <= 3

  if (era === 0 && ip >= 5) return 'A+'
  if (era <= 2 && isQS) return 'A'
  if (isQS) return 'B+'
  if (era <= 4) return 'B'
  if (era <= 6) return 'C'
  return 'D'
}

export default function LastFiveStarts({ starts }: { starts: PitcherGameLog[] }) {
  if (starts.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 py-6 text-center">No recent starts on record.</p>
  }

  const eraVals = starts.map(s => parseFloat(s.era)).filter(v => !isNaN(v))
  const l5Era = eraVals.length ? (eraVals.reduce((a, b) => a + b, 0) / eraVals.length).toFixed(2) : '—'
  const l5K = starts.reduce((sum, s) => sum + s.so, 0)
  const l5W = starts.filter(s => s.result === 'W').length
  const totalIp = starts.reduce((sum, s) => sum + parseFloat(s.ip), 0)
  const totalWalksHits = starts.reduce((sum, s) => sum + s.bb + s.h, 0)
  const l5Whip = totalIp > 0 ? (totalWalksHits / totalIp).toFixed(2) : '—'
  const qsCount = starts.filter(s => parseFloat(s.ip) >= 6 && s.er <= 3).length

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Last 5 Games</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left pb-2 text-[9px] font-mono text-stone-400">Date</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">IP</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">H</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">ER</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">BB</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">K</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">ERA</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">W/L</th>
              <th className="text-right pb-2 text-[9px] font-mono text-stone-400">Grade</th>
            </tr>
          </thead>
          <tbody>
            {starts.slice(0, 5).map((s, i) => {
              const grade = gradeStart(s)
              const color = GRADE_COLOR[grade]
              return (
                <tr key={i} className="border-b border-stone-50 last:border-0">
                  <td className="py-2 font-mono text-stone-600">{new Date(s.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}</td>
                  <td className="text-right py-2 font-mono text-stone-700">{s.ip}</td>
                  <td className="text-right py-2 font-mono text-stone-700">{s.h}</td>
                  <td className="text-right py-2 font-mono text-stone-700">{s.er}</td>
                  <td className="text-right py-2 font-mono text-stone-700">{s.bb}</td>
                  <td className="text-right py-2 font-mono font-bold text-stone-900">{s.so}</td>
                  <td className="text-right py-2 font-mono text-stone-700">{s.era}</td>
                  <td className="text-right py-2 font-mono text-stone-500">{s.result}</td>
                  <td className="text-right py-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: `${color}1a`, color }}>
                      {grade}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-stone-100 text-[10px] font-mono">
        <span className="text-stone-400">L5 ERA <b className="text-stone-900">{l5Era}</b></span>
        <span className="text-stone-400">L5 K <b className="text-stone-900">{l5K}</b></span>
        <span className="text-stone-400">L5 W <b className="text-stone-900">{l5W}</b></span>
        <span className="text-stone-400">L5 WHIP <b className="text-stone-900">{l5Whip}</b></span>
        <span className="text-stone-400">L5 QS <b className="text-stone-900">{qsCount}</b></span>
      </div>
    </div>
  )
}