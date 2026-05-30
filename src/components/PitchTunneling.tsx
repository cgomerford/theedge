'use client'

import { useState, useEffect } from 'react'

export type PitchProfile = {
  pitchName: string;
  pitchType: string;
  velocity: number;
  vBreak: number; // in inches
  hBreak: number; // in inches
  color?: string;
}

type PitchTunnelingProps = {
  pitcherName?: string;
  releaseZ?: number; // Release Height (feet, e.g., 5.8)
  releaseX?: number; // Arm Slot/Side (feet, e.g., -1.5 for RHP)
  arsenal?: PitchProfile[];
}

// Fallback data if the API doesn't have the specific pitcher's break data yet
const DEFAULT_ARSENAL: PitchProfile[] = [
  { pitchName: 'Four-Seam Fastball', pitchType: 'FF', velocity: 95, vBreak: 15, hBreak: -5, color: '#EF4444' },
  { pitchName: 'Slider', pitchType: 'SL', velocity: 84, vBreak: 2, hBreak: 8, color: '#EAB308' },
  { pitchName: 'Curveball', pitchType: 'CU', velocity: 78, vBreak: -10, hBreak: 10, color: '#3B82F6' },
  { pitchName: 'Changeup', pitchType: 'CH', velocity: 86, vBreak: 5, hBreak: -12, color: '#10B981' },
]

const PITCH_COLORS: Record<string, string> = {
  'FF': '#EF4444', 'SL': '#EAB308', 'CU': '#3B82F6', 'CH': '#10B981', 'SI': '#F97316', 'FC': '#8B5CF6'
}

export default function PitchTunneling({ 
  pitcherName = 'League Average RHP', 
  releaseZ = 5.8, 
  releaseX = -1.5, 
  arsenal = [] 
}: PitchTunnelingProps) {
  
  const activeArsenal = arsenal.length > 1 ? arsenal : DEFAULT_ARSENAL
  
  const [pitch1Idx, setPitch1Idx] = useState(0)
  const [pitch2Idx, setPitch2Idx] = useState(1)

  const p1 = activeArsenal[pitch1Idx]
  const p2 = activeArsenal[pitch2Idx]

  const commitPoint = 23.8 // Feet from plate
  const DISTANCE = 55 
  const viewBoxWidth = 500
  const viewBoxHeight = 300

  // Scaling functions (Feet to SVG Pixels)
  const scaleY = (ft: number) => viewBoxWidth - (ft / DISTANCE) * viewBoxWidth 
  const scaleZ = (ft: number) => viewBoxHeight - (ft / 8) * viewBoxHeight 
  const scaleX = (ft: number) => (viewBoxWidth / 2) + (ft * 30) 

  // Math to convert inches of break into our SVG curve coordinates
  const generateSidePath = (vBreakInches: number) => {
    // Normalizing break: gravity naturally drops a ball ~30 inches. 
    // Positive vBreak (like a fastball) fights gravity. Negative vBreak (curveball) adds to it.
    const effectiveDrop = 3 - (vBreakInches / 12) 
    return `M ${scaleY(DISTANCE)},${scaleZ(releaseZ)} Q ${scaleY(commitPoint)},${scaleZ(releaseZ - 1.5)} ${scaleY(0)},${scaleZ(effectiveDrop)}`
  }

  const generateBatterPath = (vBreakInches: number, hBreakInches: number) => {
    const effectiveDrop = 3 - (vBreakInches / 12)
    const sweep = hBreakInches / 12 // Convert inches to feet
    return `M ${scaleX(releaseX)},${scaleZ(releaseZ)} Q ${scaleX(sweep * 0.3)},${scaleZ(releaseZ - 1.5)} ${scaleX(sweep)},${scaleZ(effectiveDrop)}`
  }

  const p1Color = p1.color || PITCH_COLORS[p1.pitchType] || '#A3A3A3'
  const p2Color = p2.color || PITCH_COLORS[p2.pitchType] || '#A3A3A3'

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm font-mono mt-10">
      <div className="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-orange-600 font-bold mb-1">§ Pitch Tunneling</h3>
          <p className="text-sm font-bold text-stone-800">{pitcherName}</p>
          <p className="text-[10px] text-stone-500 mt-1">Release: {releaseZ}ft high, {Math.abs(releaseX)}ft {releaseX < 0 ? 'Right' : 'Left'} side</p>
        </div>
        
        <div className="flex flex-col gap-2">
          <select 
            className="text-xs border border-stone-200 rounded px-2 py-1.5 bg-stone-50 outline-none focus:border-orange-500"
            value={pitch1Idx} onChange={(e) => setPitch1Idx(Number(e.target.value))}
          >
            {activeArsenal.map((p, i) => <option key={i} value={i}>{p.pitchName} ({p.velocity} mph)</option>)}
          </select>
          <select 
            className="text-xs border border-stone-200 rounded px-2 py-1.5 bg-stone-50 outline-none focus:border-orange-500"
            value={pitch2Idx} onChange={(e) => setPitch2Idx(Number(e.target.value))}
          >
            {activeArsenal.map((p, i) => <option key={i} value={i}>{p.pitchName} ({p.velocity} mph)</option>)}
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-2 text-center">Side View (Vertical Break)</div>
          <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full bg-stone-50 border border-stone-100 rounded">
            <line x1="0" y1={scaleZ(0)} x2={viewBoxWidth} y2={scaleZ(0)} stroke="#E5E7EB" strokeWidth="2" /> 
            
            <line x1={scaleY(commitPoint)} y1="0" x2={scaleY(commitPoint)} y2={viewBoxHeight} stroke="#A3A3A3" strokeDasharray="4 4" />
            <text x={scaleY(commitPoint) - 5} y="20" textAnchor="end" fill="#A3A3A3" fontSize="10">Commit Point ({commitPoint}ft)</text>

            <path d={generateSidePath(p1.vBreak)} fill="none" stroke={p1Color} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
            <path d={generateSidePath(p2.vBreak)} fill="none" stroke={p2Color} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
          </svg>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-2 text-center">Batter's Eye (Horizontal Sweep)</div>
          <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full bg-stone-50 border border-stone-100 rounded">
            <rect x={scaleX(-0.83)} y={scaleZ(3.5)} width={scaleX(0.83) - scaleX(-0.83)} height={scaleZ(1.5) - scaleZ(3.5)} fill="none" stroke="#D1D5DB" strokeWidth="2" />
            
            <path d={generateBatterPath(p1.vBreak, p1.hBreak)} fill="none" stroke={p1Color} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
            <path d={generateBatterPath(p2.vBreak, p2.hBreak)} fill="none" stroke={p2Color} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
          </svg>
        </div>
      </div>
    </div>
  )
}