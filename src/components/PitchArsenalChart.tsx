import type { PitchArsenalEntry } from '@/lib/pitch-arsenal-fetch'

type Props = {
  arsenal: PitchArsenalEntry[]
  pitcherName: string
}

// Pitch type → color (matches existing pitchColor in mlb.ts)
const PITCH_COLORS: Record<string, string> = {
  FF: '#E84B4B',  // 4-Seam — red
  SI: '#E88B4B',  // Sinker — orange
  FC: '#9B6FE8',  // Cutter — purple
  SL: '#4B85E8',  // Slider — blue
  ST: '#4BB5E8',  // Sweeper — light blue
  SV: '#6F9BE8',  // Slurve
  CU: '#3DB85F',  // Curveball — green
  KC: '#5DC880',  // Knuckle Curve
  CH: '#E8C84B',  // Changeup — yellow
  FS: '#B8B84B',  // Splitter
  FO: '#A0A04B',  // Forkball
  SC: '#888888',  // Screwball
  KN: '#CCCCCC',  // Knuckleball
  EP: '#999999',  // Eephus
}

export default function PitchArsenalChart({ arsenal, pitcherName }: Props) {
  // Filter pitches with usable data
const pitches = arsenal.filter(p => 
  p.avg_velocity !== null && 
  p.whiff_percent !== null &&
  p.percentage > 0
)
console.log('Pitches passing filter:', pitches)
  if (pitches.length === 0) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-6 text-center">
        <p className="text-sm text-stone-500 italic">
          No arsenal data available for {pitcherName}
        </p>
      </div>
    )
  }

  // Chart dimensions
  const width = 480
  const height = 360
  const padding = { top: 20, right: 20, bottom: 50, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Axis ranges
  const minVelo = 65
  const maxVelo = 105
  const minWhiff = 0
  const maxWhiff = 50

  // Scale functions
  const xScale = (velo: number) => padding.left + ((velo - minVelo) / (maxVelo - minVelo)) * chartWidth
  const yScale = (whiff: number) => padding.top + chartHeight - ((whiff - minWhiff) / (maxWhiff - minWhiff)) * chartHeight
  
  // Bubble size based on usage % (5-30 px radius)
  const bubbleRadius = (pct: number) => 5 + (pct / 100) * 25

  // X axis ticks (every 5 mph from 70-100)
  const xTicks = [70, 75, 80, 85, 90, 95, 100]
  // Y axis ticks (every 10% whiff)
  const yTicks = [0, 10, 20, 30, 40]

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 md:p-6">
      <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-2">
        ⊕ Arsenal Effectiveness
      </div>
      <h3 className="text-base md:text-lg font-serif font-bold text-stone-900 mb-1">
        {pitcherName}'s pitches by velocity & whiff rate
      </h3>
      <p className="text-xs text-stone-500 mb-4">
        Bubble size = usage. Top-right = elite (fast + misses bats).
      </p>
      
      <div className="overflow-x-auto -mx-2 px-2">
        <svg 
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background quadrants — subtle hints */}
          <rect 
            x={padding.left + chartWidth / 2} 
            y={padding.top} 
            width={chartWidth / 2} 
            height={chartHeight / 2}
            fill="#FF572210"
          />
          
          {/* Grid lines — vertical (velocity) */}
          {xTicks.map(t => (
            <line 
              key={`vx-${t}`}
              x1={xScale(t)} y1={padding.top}
              x2={xScale(t)} y2={padding.top + chartHeight}
              stroke="#E5E5E5"
              strokeWidth="1"
            />
          ))}
          
          {/* Grid lines — horizontal (whiff) */}
          {yTicks.map(t => (
            <line
              key={`hy-${t}`}
              x1={padding.left} y1={yScale(t)}
              x2={padding.left + chartWidth} y2={yScale(t)}
              stroke="#E5E5E5"
              strokeWidth="1"
            />
          ))}
          
          {/* Axes */}
          <line 
            x1={padding.left} y1={padding.top + chartHeight}
            x2={padding.left + chartWidth} y2={padding.top + chartHeight}
            stroke="#1A1A1A"
            strokeWidth="1.5"
          />
          <line 
            x1={padding.left} y1={padding.top}
            x2={padding.left} y2={padding.top + chartHeight}
            stroke="#1A1A1A"
            strokeWidth="1.5"
          />
          
          {/* X axis labels */}
          {xTicks.map(t => (
            <text
              key={`xl-${t}`}
              x={xScale(t)}
              y={padding.top + chartHeight + 18}
              textAnchor="middle"
              className="text-[10px] fill-stone-500"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >
              {t}
            </text>
          ))}
          <text
            x={padding.left + chartWidth / 2}
            y={padding.top + chartHeight + 38}
            textAnchor="middle"
            className="text-[10px] fill-stone-700 font-semibold"
            style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}
          >
            Velocity (mph) →
          </text>
          
          {/* Y axis labels */}
          {yTicks.map(t => (
            <text
              key={`yl-${t}`}
              x={padding.left - 8}
              y={yScale(t) + 4}
              textAnchor="end"
              className="text-[10px] fill-stone-500"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >
              {t}%
            </text>
          ))}
          <text
            x={-(padding.top + chartHeight / 2)}
            y={15}
            textAnchor="middle"
            transform="rotate(-90)"
            className="text-[10px] fill-stone-700 font-semibold"
            style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}
          >
            ↑ Whiff Rate
          </text>
          
          {/* Pitch bubbles — sorted by size (large first) so small ones render on top */}
          {[...pitches]
            .sort((a, b) => b.percentage - a.percentage)
            .map((pitch, i) => {
              const cx = xScale(pitch.avg_velocity!)
              const cy = yScale(pitch.whiff_percent!)
              const r = bubbleRadius(pitch.percentage)
              const color = PITCH_COLORS[pitch.pitch_type] ?? '#A3A3A3'
              
              return (
                <g key={`pitch-${i}`} className="hover:opacity-100 transition-opacity">
                  <title>
                    {pitch.pitch_name}: {pitch.percentage.toFixed(1)}% usage, {pitch.avg_velocity?.toFixed(1)} mph, {pitch.whiff_percent?.toFixed(1)}% whiff{pitch.ba_against ? `, .${Math.round(pitch.ba_against * 1000).toString().padStart(3, '0')} BAA` : ''}
                  </title>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={color}
                    fillOpacity="0.7"
                    stroke={color}
                    strokeWidth="2"
                  />
                  {/* Label inside or beside bubble depending on size */}
                  {r >= 12 && (
                    <text
                      x={cx}
                      y={cy + 3}
                      textAnchor="middle"
                      className="text-[9px] fill-white font-bold pointer-events-none"
                      style={{ fontFamily: 'ui-monospace, monospace' }}
                    >
                      {pitch.pitch_type}
                    </text>
                  )}
                  {r < 12 && (
                    <text
                      x={cx + r + 4}
                      y={cy + 3}
                      textAnchor="start"
                      className="text-[9px] fill-stone-700 font-semibold"
                      style={{ fontFamily: 'ui-monospace, monospace' }}
                    >
                      {pitch.pitch_type}
                    </text>
                  )}
                </g>
              )
            })}
          
          {/* "Elite zone" annotation in top-right */}
          <text
            x={padding.left + chartWidth - 8}
            y={padding.top + 12}
            textAnchor="end"
            className="text-[9px] fill-orange-600"
            style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}
          >
            ↑ Elite zone
          </text>
        </svg>
      </div>
      
      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-stone-100">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">
          Pitch types
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {pitches.slice(0, 6).map((pitch, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <div 
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: PITCH_COLORS[pitch.pitch_type] ?? '#A3A3A3' }}
              />
              <span className="text-stone-700">{pitch.pitch_name}</span>
              <span className="font-mono text-stone-400">{pitch.percentage.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Pro tease */}
      <div className="mt-4 pt-3 border-t border-stone-100">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 flex items-center gap-2">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Pro: pitch movement charts · location heatmaps · vs lineup
        </div>
      </div>
    </div>
  )
}