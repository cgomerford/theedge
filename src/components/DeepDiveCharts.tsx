'use client'

// src/components/DeepDiveCharts.tsx
//
// MLB side is now REAL Statcast data (ABS challenge ledger, extra bases
// taken vs. given, pitch run-value by count, miss-distance, bat speed vs.
// production — see src/components/MlbDeepDives.tsx and the four lib
// fetchers it's fed from), passed down as `mlbData` from page.tsx.
//
// NFL side is still the original illustrative mockup-G panels — no NFL
// equivalent of Statcast (pitch mix / air-yards-vs-YAC / etc.) has a
// confirmed real source yet, so those stay hardcoded and labeled
// "Illustrative" rather than pretending otherwise.

import { useState } from 'react'
import MlbDeepDivesGrid, { type MlbDeepDivesData } from '@/components/MlbDeepDives'

type Sport = 'mlb' | 'nfl'

function seasonTrendArea(points: number[], label: string, unit: string) {
  const W = 560, H = 210, PAD = 32
  const max = Math.max(...points) * 1.15
  const min = Math.min(...points) * 0.85
  const stepX = (W - PAD * 2) / (points.length - 1)
  const coords = points.map((p, i): [number, number] => [PAD + i * stepX, H - PAD - ((p - min) / (max - min)) * (H - PAD * 2)])
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c[0]} ${c[1]}`).join(' ')
  const area = `${line} L ${coords[coords.length - 1][0]} ${H - PAD} L ${coords[0][0]} ${H - PAD} Z`
  const gridY = [0.25, 0.5, 0.75, 1]
    .map(f => `<line x1="${PAD}" y1="${H - PAD - f * (H - PAD * 2)}" x2="${W - PAD}" y2="${H - PAD - f * (H - PAD * 2)}" stroke="rgba(26,26,26,0.08)" stroke-width="1"/>`)
    .join('')
  const dots = coords
    .map(([x, y], i) => (i === coords.length - 1 ? `<circle cx="${x}" cy="${y}" r="4" fill="#EA580C"/>` : `<circle cx="${x}" cy="${y}" r="2" fill="#FF5722" opacity="0.6"/>`))
    .join('')
  return `<svg viewBox="0 0 ${W} ${H}">${gridY}<path d="${area}" fill="rgba(255,87,34,0.12)"/><path d="${line}" fill="none" stroke="#FF5722" stroke-width="2.5"/>${dots}<text x="${PAD}" y="16" font-size="9" fill="rgba(26,26,26,0.45)">${label} (${unit}) — WEEK 1 THROUGH NOW</text></svg>`
}

function badgeScatter(points: [number, number, string, string][], xLabel: string, yLabel: string) {
  const W = 560, H = 230, PAD = 40
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const xMin = Math.min(...xs) - 2, xMax = Math.max(...xs) + 2
  const yMin = Math.min(...ys) * 0.85, yMax = Math.max(...ys) * 1.1
  const sx = (v: number) => PAD + ((v - xMin) / (xMax - xMin)) * (W - PAD * 2)
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - PAD * 2)
  const badges = points
    .map(([x, y, abbr, color]) => `
      <g transform="translate(${sx(x)},${sy(y)})">
        <circle r="13" fill="${color}" stroke="#0D0D0C" stroke-width="1.5"/>
        <text text-anchor="middle" dy="4" font-size="9" fill="#FAF8F3" font-weight="800">${abbr}</text>
      </g>`)
    .join('')
  return `<svg viewBox="0 0 ${W} ${H}">
    <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="rgba(26,26,26,0.2)"/>
    <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="rgba(26,26,26,0.2)"/>
    <text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="9" fill="rgba(26,26,26,0.45)">${xLabel}</text>
    <text x="12" y="${H / 2}" text-anchor="middle" font-size="9" fill="rgba(26,26,26,0.45)" transform="rotate(-90 12 ${H / 2})">${yLabel}</text>
    ${badges}
  </svg>`
}

function donut(labels: string[], values: number[], colors: string[]) {
  const total = values.reduce((a, b) => a + b, 0)
  let angle = -90
  const R = 68, CX = 110, CY = 110, IR = 40
  const arcs = values
    .map((v, i) => {
      const frac = v / total, start = angle, end = angle + frac * 360
      angle = end
      const rad = (d: number) => (d * Math.PI) / 180
      const x1 = CX + R * Math.cos(rad(start)), y1 = CY + R * Math.sin(rad(start))
      const x2 = CX + R * Math.cos(rad(end)), y2 = CY + R * Math.sin(rad(end))
      const ix1 = CX + IR * Math.cos(rad(end)), iy1 = CY + IR * Math.sin(rad(end))
      const ix2 = CX + IR * Math.cos(rad(start)), iy2 = CY + IR * Math.sin(rad(start))
      const large = frac > 0.5 ? 1 : 0
      return `<path d="M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${IR} ${IR} 0 ${large} 0 ${ix2} ${iy2} Z" fill="${colors[i]}" opacity="0.92"/>`
    })
    .join('')
  const legend = labels.map((l, i) => ({ label: l, pct: Math.round((values[i] / total) * 100), color: colors[i] }))
  return { svg: `<svg viewBox="0 0 220 220">${arcs}</svg>`, legend }
}

function scatterMini(points: [number, number, boolean][]) {
  const W = 260, H = 150, PAD = 16
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const xMin = Math.min(...xs) * 0.97, xMax = Math.max(...xs) * 1.03
  const yMin = Math.min(...ys) * 0.9, yMax = Math.max(...ys) * 1.08
  const sx = (v: number) => PAD + ((v - xMin) / (xMax - xMin)) * (W - PAD * 2)
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - PAD * 2)
  const dots = points
    .map(([x, y, hot]) => `<circle cx="${sx(x)}" cy="${sy(y)}" r="${hot ? 4.5 : 3}" fill="${hot ? '#FF5722' : '#8A8577'}" opacity="${hot ? 0.95 : 0.5}"/>`)
    .join('')
  return `<svg viewBox="0 0 ${W} ${H}"><line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="rgba(26,26,26,0.2)"/><line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="rgba(26,26,26,0.2)"/>${dots}</svg>`
}

const NFL_TREND = [22, 24, 21, 28, 31, 29, 34, 33, 37, 35, 39, 41, 38, 43]
const NFL_SCATTER: [number, number, string, string][] = [
  [6, 38, 'BUF', '#00338D'], [2, 31, 'MIA', '#008E97'], [-3, 25, 'NE', '#002244'],
  [8, 41, 'SF', '#AA0000'], [-1, 28, 'DAL', '#041E42'], [4, 34, 'BAL', '#241773'],
  [1, 29, 'KC', '#E31837'], [-2, 26, 'CIN', '#FB4F14'], [7, 39, 'PHI', '#004C54'],
  [3, 32, 'DET', '#0076B6'],
]
const NFL_DONUT = donut(['C3', 'Blitz', 'Nkl', 'C1', 'C2'], [32, 22, 20, 15, 11], ['#FF5722', '#EA580C', '#1A1A1A', '#8A8577', '#D8D5CC'])
const NFL_VELO: [number, number, boolean][] = [
  [6.2, 4.1, false], [8.4, 3.2, true], [5.1, 6.8, false], [9.6, 2.4, true],
  [4.8, 5.5, false], [7.3, 4.9, false], [10.2, 3.1, true], [6.9, 4.0, false],
]

export default function DeepDiveCharts({ mlbData }: { mlbData: MlbDeepDivesData }) {
  const [sport, setSport] = useState<Sport>('mlb')
  const mlb = sport === 'mlb'

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-[#FF5722]">Deep dives</div>
          <div className="text-[10px] text-[#8A8577] mt-0.5">
            {mlb ? 'Real Statcast data — refreshed every 6h' : 'Illustrative — real per-game data ships with Pro'}
          </div>
        </div>
        <div className="inline-flex gap-[2px] rounded-full border border-[#DEDACE] p-0.5">
          <button onClick={() => setSport('mlb')} className={`rounded-full text-[10px] font-bold uppercase px-3 py-1 transition-colors duration-200 ${mlb ? 'bg-[#FF5722] text-black' : 'text-[#8A8577]'}`}>MLB</button>
          <button onClick={() => setSport('nfl')} className={`rounded-full text-[10px] font-bold uppercase px-3 py-1 transition-colors duration-200 ${!mlb ? 'bg-[#FF5722] text-black' : 'text-[#8A8577]'}`}>NFL</button>
        </div>
      </div>

      {mlb ? (
        <MlbDeepDivesGrid data={mlbData} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 md:col-span-2 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
            <div className="text-[13px] font-bold text-[#1A1A1A]">Pressure rate trend</div>
            <div className="text-[10px] text-[#8A8577] mb-3">Weekly, across the season</div>
            <div className="flex-1 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: seasonTrendArea(NFL_TREND, 'Pressure rate', '%') }} />
            <div className="flex justify-between text-[9.5px] text-[#8A8577] mt-2">
              <span>WEEK 1</span>
              <span className="text-[#EA580C] font-bold">{NFL_TREND[NFL_TREND.length - 1]}% now</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 md:col-span-2 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
            <div className="text-[13px] font-bold text-[#1A1A1A]">Pressure vs. coverage grade</div>
            <div className="text-[10px] text-[#8A8577] mb-3">By team — unit effect, illustrative</div>
            <div className="flex-1 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: badgeScatter(NFL_SCATTER, 'PASS RUSH WIN RATE', 'PRESSURE %') }} />
            <div className="flex justify-between text-[9.5px] text-[#8A8577] mt-2">
              <span>10 teams shown</span>
              <span className="text-[#EA580C] font-bold">Full league view in Pro</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
            <div className="text-[13px] font-bold text-[#1A1A1A]">Defensive mix</div>
            <div className="text-[10px] text-[#8A8577] mb-3">League-wide usage</div>
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <div dangerouslySetInnerHTML={{ __html: NFL_DONUT.svg }} />
              <div className="flex flex-wrap gap-2 justify-center">
                {NFL_DONUT.legend.map(l => (
                  <span key={l.label} className="text-[9.5px] text-[#8A8577] inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: l.color }} />
                    {l.label} {l.pct}%
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
            <div className="text-[13px] font-bold text-[#1A1A1A]">Air yards vs. YAC</div>
            <div className="text-[10px] text-[#8A8577] mb-3">By target, this season</div>
            <div className="flex-1 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: scatterMini(NFL_VELO) }} />
          </div>
        </div>
      )}
    </div>
  )
}
