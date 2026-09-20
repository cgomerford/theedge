'use client'

// src/components/player/trends/parts.tsx — shared client pieces for the Pro Statcast trends charts.
// Plain Recharts + the team/player page primitives. No fetching: props in, pixels out.

import { Line, LineChart, Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, MONO, SANS } from '@/components/team/ui'

export const AXIS = { fontSize: 10, fontFamily: MONO, fill: '#a89e8c' }
export const GRID = '#f1eee6'
export const BASE = '#8a8275'
export const PITCH_COLOR: Record<string, string> = {
  FF: '#D4533B', SI: '#EF9F27', FC: '#B8860B', SL: '#378ADD', ST: '#7F77DD', CU: '#1D9E75', SV: '#5DCAA5', CH: '#8a8275', FS: '#D4537E', KN: '#444444', UN: '#bbbbbb',
}
export const PITCH_NAME: Record<string, string> = { FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', CU: 'Curve', SV: 'Slurve', CH: 'Changeup', FS: 'Splitter', KN: 'Knuckle', UN: 'Other' }

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {label && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint }}>{label}</span>}
      <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 999, overflow: 'hidden', background: '#fff' }}>
        {options.map(o => {
          const on = o.v === value
          return (
            <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
              style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', padding: '6px 11px', border: 'none', cursor: 'pointer', background: on ? '#1A1A1A' : 'transparent', color: on ? '#FAF8F3' : '#5b5347' }}>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type LineDef = { key: string; label: string; color: string; dash?: string; dots?: boolean; width?: number }

/** Multi-line chart over an index axis with optional season-baseline reference lines. */
export function TrendLines({ data, lines, baselines, fmt, height = 190, domain, xKey = 'i' }: {
  data: Record<string, number | string | null>[]; lines: LineDef[]; baselines?: { y: number | null; color: string; label: string }[]
  fmt: (v: number) => string; height?: number; domain?: [number | 'auto', number | 'auto']; xKey?: string
}) {
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} minTickGap={26} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={42} domain={domain ?? ['auto', 'auto']} tickFormatter={v => fmt(Number(v))} />
            <Tooltip content={<Tip lines={lines} fmt={fmt} />} />
            {(baselines ?? []).filter(b => b.y != null).map(b => <ReferenceLine key={b.label} y={b.y as number} stroke={b.color} strokeDasharray="4 4" />)}
            {lines.map(l => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={l.dots ? 0 : l.width ?? 2.2} strokeDasharray={l.dash}
                dot={l.dots ? { r: 3, fill: l.color, strokeWidth: 0, fillOpacity: 0.55 } : false} activeDot={{ r: 4 }} connectNulls={!l.dots} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[...lines.filter(l => !l.dots || true).map(l => ({ label: l.label, color: l.color, dash: !!l.dash, dot: !!l.dots })), ...(baselines ?? []).filter(b => b.y != null).map(b => ({ label: `${b.label} ${fmt(b.y as number)}`, color: b.color, dash: true, dot: false }))]} />
    </div>
  )
}

/** 100%-stacked area (spray mix, pitch usage). Values are already percentages summing to ~100. */
export function StackedShare({ data, keys, height = 190, xKey = 'i' }: { data: Record<string, number | string | null>[]; keys: { key: string; label: string; color: string }[]; height?: number; xKey?: string }) {
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} minTickGap={26} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, 100]} tickFormatter={v => `${v}%`} />
            <Tooltip content={<Tip lines={keys.map(k => ({ key: k.key, label: k.label, color: k.color }))} fmt={v => `${v.toFixed(0)}%`} />} />
            {keys.map(k => <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stackId="s" stroke={k.color} fill={k.color} fillOpacity={0.85} isAnimationActive={false} />)}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Legend items={keys.map(k => ({ label: k.label, color: k.color, dash: false, dot: false }))} />
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string; dash: boolean; dot: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontFamily: MONO, fontSize: 10, color: '#5b5347' }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {it.dot
            ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, opacity: 0.6 }} />
            : it.dash
              ? <span style={{ width: 14, height: 0, borderTop: `2px dashed ${it.color}` }} />
              : <span style={{ width: 12, height: 3, background: it.color, borderRadius: 2 }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

function Tip({ active, payload, label, lines, fmt }: { active?: boolean; payload?: { dataKey?: string; value?: number | null; payload?: Record<string, unknown> }[]; label?: string | number; lines: { key: string; label: string; color: string }[]; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload ?? {}
  return (
    <div style={{ background: '#1A1A1A', color: '#FAF8F3', padding: '7px 10px', fontFamily: MONO, fontSize: 11, lineHeight: 1.5, borderRadius: 8 }}>
      <div style={{ opacity: 0.6 }}>#{String(label)}{row.d ? ` · ${String(row.d)}` : ''}</div>
      {lines.map(l => {
        const v = row[l.key]
        return typeof v === 'number' ? <div key={l.key} style={{ color: l.color === '#1A1A1A' ? '#FAF8F3' : undefined }}><span style={{ display: 'inline-block', width: 8, height: 8, background: l.color, borderRadius: 2, marginRight: 6 }} />{l.label} {fmt(v)}</div> : null
      })}
    </div>
  )
}

export function Verdict({ text, tone }: { text: string; tone: 'up' | 'down' | 'flat' }) {
  const c = tone === 'up' ? { bg: '#E1F5EE', fg: '#085041' } : tone === 'down' ? { bg: '#FAD9D2', fg: '#7A1F14' } : { bg: '#f1eee6', fg: '#5b5347' }
  return <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, background: c.bg, color: c.fg, padding: '5px 12px', borderRadius: 999 }}>{text}</span>
}

export const fmt3 = (v: number) => v.toFixed(3).replace(/^0/, '')
export const fmtPct = (v: number) => `${v.toFixed(0)}%`
export const fmtPct1 = (v: number) => `${v.toFixed(1)}%`
export const fmt1 = (v: number) => v.toFixed(1)
export const fmt2 = (v: number) => v.toFixed(2)
