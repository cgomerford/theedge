// src/components/nfl/NflTrendLineChart.tsx
// FULL REPLACEMENT — matches the clean editorial reference style (bold
// centered title, italic context subtitle, thick clean lines, simple
// top legend, no glow/glassmorphism). Also fixes a real bug: the
// previous version's Tooltip repeated every series twice, because both
// the Area and the Line elements shared the same dataKey and recharts'
// default Tooltip includes one payload entry per chart element, not
// per series. Fixed by deduping the payload by dataKey before render.
//
// New props: title/subtitle (both optional -- omit for a bare chart).
// data/series/height props unchanged from before, still a drop-in for
// existing callers that don't pass title/subtitle.

'use client'

import { ComposedChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export type TrendSeries = { key: string; label: string; color: string; unit?: '%' | '' }

function formatValue(value: unknown, unit?: '%' | '') {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  const suffix = unit === '%' ? '%' : ''
  return `${value.toFixed(1)}${suffix}`
}

function CustomTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number | null; name?: string }>
  label?: string | number
  series: TrendSeries[]
}) {
  if (!active || !payload?.length) return null

  // DEDUPE by dataKey -- Area + Line sharing a dataKey both land in
  // this payload array; keep only the first occurrence per key.
  const seen = new Set<string>()
  const deduped = payload.filter((entry) => {
    const key = entry.dataKey ?? entry.name ?? ''
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.12)', borderRadius: 4, padding: '10px 12px', boxShadow: '0 2px 8px rgba(26,26,26,0.08)' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A3A3A3', marginBottom: 6 }}>
        Season {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {deduped.map((entry) => {
          const s = series.find((x) => x.key === entry.dataKey || x.label === entry.name)
          if (!s) return null
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: '#1A1A1A', flex: 1 }}>{s.label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#1A1A1A' }}>
                {formatValue(entry.value, s.unit)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function NflTrendLineChart({
  data,
  series,
  height = 300,
  title,
  subtitle,
}: {
  data: Record<string, number | null>[]
  series: TrendSeries[]
  height?: number
  title?: string
  subtitle?: string
}) {
  if (data.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No trend data yet.</div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: '20px 24px' }}>
      {title && (
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, textAlign: 'center', color: '#1A1A1A', letterSpacing: '0.01em', marginBottom: 2 }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 12, textAlign: 'center', color: '#78716C', marginBottom: 12 }}>
          {subtitle}
        </div>
      )}

      {/* Legend -- horizontal line swatch + label, centered above the chart */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 3, background: s.color, flexShrink: 0, borderRadius: 2 }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1A1A1A', fontWeight: 700 }}>{s.label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="rgba(26,26,26,0.08)" vertical={false} />
          <XAxis
            dataKey="season"
            tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }}
            axisLine={{ stroke: 'rgba(26,26,26,0.2)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip series={series} />} />

          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={3}
              strokeLinecap="round"
              dot={{ r: 3, fill: s.color, stroke: '#fff', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}