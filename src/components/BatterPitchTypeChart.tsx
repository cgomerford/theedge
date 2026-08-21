// src/components/BatterPitchTypeChart.tsx
'use client'

import type { BatterPitchTypeRow } from '@/lib/postgame-batter-adapt'

const PITCH_COLORS: Record<string, string> = {
  FF: '#dc2626', FA: '#dc2626', SI: '#f59e0b', FC: '#7c2d12',
  SL: '#e11d48', ST: '#9333ea', SV: '#9333ea',
  CU: '#7c3aed', KC: '#7c3aed', CS: '#7c3aed',
  CH: '#16a34a', FS: '#0d9488', FO: '#0d9488', KN: '#6b7280',
}
function colorFor(code: string): string {
  return PITCH_COLORS[code.toUpperCase()] ?? '#57534e'
}

export default function BatterPitchTypeChart({ rows }: { rows: BatterPitchTypeRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 p-4 text-center">No pitch type data.</p>
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Pitch types seen</span>
      </div>
      <div className="p-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-100">
              {['Pitch', '#', 'Usage%', 'Velo'].map((h, i) => (
                <th key={h} className={`py-1.5 font-mono text-[8px] uppercase tracking-wider text-stone-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.typeCode} className="border-b border-stone-50 last:border-0">
                <td className="py-1.5">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: colorFor(r.typeCode) }} />
                  <span className="font-serif text-stone-900">{r.typeName}</span>
                </td>
                <td className="text-right font-mono text-stone-700">{r.count}</td>
                <td className="text-right font-mono text-stone-700">{r.usagePct}%</td>
                <td className="text-right font-mono text-stone-700">{r.avgVelo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}