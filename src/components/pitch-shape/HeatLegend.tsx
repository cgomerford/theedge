// src/components/pitch-shape/HeatLegend.tsx
//
// The colour key for every league heat map: one continuous blue-to-red gradient labelled in the chosen measure's own numbers, plus the blank swatch. The gradient and its marks come from the same constants the
// maps are coloured with (heatGrid.ts, metrics.ts), so it can never disagree with them. One rule for every measure: red is better for the pitcher, blue is worse. No hooks and no data, so the server page and the
// client maps can both use it.
import { C } from '@/components/team/ui'
import { HEAT_GRADIENT_CSS } from './heatGrid'
import { METRICS, metricPos, type MetricDef, type MetricKey } from './metrics'

export default function HeatLegend({ compact = false, metric = 'whiff', def, scaled = false, rule = 'pitcher' }: { compact?: boolean; metric?: MetricKey; /** a stretched copy of the measure's scale (see scaledDef); the marks and the text follow it */ def?: MetricDef; scaled?: boolean; /** what red means: better for the pitcher (the default), or simply the higher number */ rule?: 'pitcher' | 'number' }) {
  const m = def ?? METRICS[metric]
  const w = compact ? 280 : 360
  const ticks = [...m.ticks].map(t => ({ t, pos: metricPos(m, t) * 100 })).sort((a, b) => a.pos - b.pos)
  const last = ticks.length - 1
  // the two ends carry a short "or less" / "or more" mark; the labels in between are placed along the bar and any that would touch their neighbour are left out
  const lessEnd = m.betterHigh ? 0 : last, moreEnd = m.betterHigh ? last : 0
  const label = (i: number) => (i === lessEnd ? `≤${m.fmt(ticks[i].t)}` : i === moreEnd ? `≥${m.fmt(ticks[i].t)}` : m.fmt(ticks[i].t))
  const minGap = compact ? 17 : 15   // percent of the bar a label needs
  const kept = ticks.map((k, i) => ({ k, i })).filter(({ k }, idx, arr) => idx === 0 || idx === arr.length - 1 || (k.pos - arr[0].k.pos >= minGap && arr[arr.length - 1].k.pos - k.pos >= minGap))
  const whiff = metric === 'whiff'
  const mid = (m.lo + m.hi) / 2
  return (
    <div style={{ fontSize: compact ? 11 : 12.5, color: '#5b5347' }} aria-label={`Colour key: ${m.short}`}>
      <div style={{ fontWeight: 800, color: C.ink, marginBottom: 6 }}>{whiff ? 'How often hitters swing and miss' : m.short}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ width: compact ? 30 : 36, height: compact ? 16 : 20, border: `1px solid ${C.line}`, background: '#f1eee6' }} />
          <span style={{ fontSize: 10.5, marginTop: 3, textAlign: 'center', lineHeight: 1.2 }}>too few<br />{m.per}</span>
        </div>
        <div style={{ width: w, maxWidth: '100%' }}>
          <div style={{ height: compact ? 16 : 20, background: HEAT_GRADIENT_CSS, border: `1px solid ${C.line}` }} />
          <div style={{ position: 'relative', height: 16, marginTop: 3, fontVariantNumeric: 'tabular-nums', fontSize: 10.5 }}>
            {kept.map(({ k, i }, idx) => (
              <span key={k.t} style={{ position: 'absolute', left: `${k.pos}%`, transform: idx === 0 ? 'none' : idx === kept.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)', whiteSpace: 'nowrap' }}>{label(i)}</span>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#2166AC', fontWeight: 800 }}>← {whiff ? 'fewer misses' : rule === 'number' ? 'lower' : 'worse for the pitcher'}</span><span style={{ color: '#B2182B', fontWeight: 800 }}>{whiff ? 'more misses' : rule === 'number' ? 'higher' : 'better for the pitcher'} →</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        {m.explain} {rule === 'number' ? 'Red is the higher number and blue the lower number, whatever the measure, so where lower is better for the pitcher (wOBA, average, slugging) red is where hitters did more damage.' : 'Red is better for the pitcher and blue is worse, whatever the measure.'}{' '}
        {scaled ? <>The colours are stretched across the range this pitch actually covers (the middle 90% of {m.per}-weighted values, {m.fmt(m.lo)} to {m.fmt(m.hi)}, pale at about {m.fmt(mid)}), so the differences show. Switch to the fixed scale to compare one pitch with another. </>
          : <>{whiff ? 'The pale middle is about 15% of swings missed, and the colour turns red early: it is already warm at 20% and darkest from 26%. ' : ''}This fixed scale is the same on every map, so a colour always means the same number; a pitch that misses far more or less than a fastball will land near one end. </>}
        A box under its minimum ({m.min.toLocaleString('en-US')} {m.per}) is left blank, never coloured.
      </div>
    </div>
  )
}
