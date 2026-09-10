// src/components/nfl/NflQbCoveragePressureFormation.tsx

'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import NflInfoButton, { EPA_EXPLAINER, COVERAGE_EXPLAINERS } from './NflInfoButton'
import type { QbCoverageSplit, QbPressureSplit, QbFormationSplit } from '@/lib/nfl/queries'

export function NflQbCoverageChart({ splits }: { splits: QbCoverageSplit[] }) {
  if (splits.length === 0) {
    return <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24, textAlign: 'center', fontFamily: "'Fraunces', serif", fontSize: 13, fontStyle: 'italic', color: '#A3A3A3' }}>No coverage data yet.</div>
  }
  const data = splits.map((s) => ({ name: s.coverageType.replace('_', ' '), epa: s.epaPerAtt, comp: s.compPct, att: s.attempts }))
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 8 }}>
        EPA per attempt by coverage shell faced.<NflInfoButton text={EPA_EXPLAINER} label="EPA" /> Bars need 5+ attempts to show.
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="rgba(26,26,26,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={{ stroke: 'rgba(26,26,26,0.2)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", borderRadius: 4 }} formatter={(v: any, n: any, item: any) => [`${Number(v).toFixed(2)} EPA/att (${item?.payload?.comp?.toFixed(0)}% comp, ${item?.payload?.att} att)`, 'vs ' + item?.payload?.name]} />
          <Bar dataKey="epa" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.epa >= 0 ? '#FF5722' : '#78716C'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(26,26,26,0.06)' }}>
        {data.map((d) => (
          <span key={d.name} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#78716C' }}>
            {d.name}<NflInfoButton text={COVERAGE_EXPLAINERS[d.name] ?? ''} label={d.name} />
          </span>
        ))}
      </div>
    </div>
  )
}
 

export function NflQbPressureChart({ splits }: { splits: QbPressureSplit[] }) {
  if (splits.length === 0) {
    return <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24, textAlign: 'center', fontFamily: "'Fraunces', serif", fontSize: 13, fontStyle: 'italic', color: '#A3A3A3' }}>No pressure data yet.</div>
  }
  const data = splits.map((s) => ({ name: s.pressured ? 'Pressured' : 'Clean Pocket', epa: s.epaPerAtt, comp: s.compPct, att: s.attempts }))
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 8 }}>EPA per attempt, pressured vs clean pocket.</div>
      <div style={{ display: 'flex', gap: 16 }}>
        {data.map((d) => (
          <div key={d.name} style={{ flex: 1, background: '#F4F0E8', padding: 16, textAlign: 'center' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', textTransform: 'uppercase' }}>{d.name}</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 28, color: d.epa >= 0 ? '#FF5722' : '#1A1A1A' }}>{d.epa.toFixed(2)}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3' }}>{d.comp.toFixed(0)}% comp · {d.att} att</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function NflQbFormationChart({ splits }: { splits: QbFormationSplit[] }) {
  if (splits.length === 0) {
    return <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24, textAlign: 'center', fontFamily: "'Fraunces', serif", fontSize: 13, fontStyle: 'italic', color: '#A3A3A3' }}>No formation data yet.</div>
  }
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 12 }}>Snap formation breakdown.</div>
      {splits.map((s) => (
        <div key={s.formation} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, marginBottom: 2 }}>
            <span>{s.formation}</span>
            <span style={{ fontWeight: 700 }}>{s.pct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: '#F0EBE0', borderRadius: 3 }}>
            <div style={{ height: 6, width: `${s.pct}%`, background: '#FF5722', borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  )
}