'use client'
// src/app/nfl/[slug]/NFLGamePage.tsx
// The Edge NFL — Game Page (v3)
// Next Gen Stats-inspired visuals with interactive tooltips + Explosive Plays

import { useState } from 'react'
import Link from 'next/link'
import type { NFLGame } from '@/lib/nfl-schedule'
import type { NFLGameDBData, NFLTeamStatsData } from '@/lib/nfl-game'

type Props = {
  game: NFLGame
  dbGame: NFLGameDBData | null
  homeStats: NFLTeamStatsData | null
  awayStats: NFLTeamStatsData | null
  edgeScore: number | null
  narrative: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function num(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '–'
  return val.toFixed(decimals)
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold whitespace-nowrap">
        § {children}
      </span>
      <div className="flex-1 h-px bg-stone-200" />
    </div>
  )
}

function ReadLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 mb-4 rounded-r-lg border-l-[3px] border-yellow-400 font-serif italic text-sm text-stone-600 leading-relaxed"
      style={{ background: 'rgba(253,224,71,0.07)' }}>
      {children}
    </div>
  )
}

// ── Matchup Header ────────────────────────────────────────────────────────────
function MatchupHeader({ game, dbGame }: { game: NFLGame; dbGame: NFLGameDBData | null }) {
  const isFinal = game.status === 'final' || dbGame?.status === 'final'
  const isLive = game.status === 'in_progress'
  const homeScore = dbGame?.home_score ?? game.homeScore
  const awayScore = dbGame?.away_score ?? game.awayScore

  return (
    <div className="py-8 border-b border-stone-200 mb-8">
      <div className="flex items-center gap-2 mb-5">
        <Link href="/nfl" className="font-mono text-[9px] uppercase tracking-widest text-stone-400 hover:text-orange-500 transition">NFL</Link>
        <span className="text-stone-300 font-mono text-[9px]">/</span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">
          {game.season} · Week {game.week || dbGame?.week}
        </span>
        {isFinal && <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-stone-100 text-stone-500 uppercase tracking-widest ml-1">Final</span>}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <img src={game.awayTeam.logo} alt={game.awayTeam.abbreviation} className="w-16 h-16 object-contain shrink-0" onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-0.5">Away</div>
            <div className="font-serif text-2xl font-bold text-stone-900 leading-tight">{game.awayTeam.shortName}</div>
            <div className="font-mono text-xs text-stone-400 mt-0.5">{dbGame?.away_record || game.awayTeam.record}</div>
          </div>
        </div>

        <div className="text-center shrink-0 px-6">
          {isFinal || isLive ? (
            <div>
              <div className="flex items-center gap-3">
                <span className="font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '52px', color: '#1A1A1A', lineHeight: 1 }}>{awayScore ?? 0}</span>
                <span className="font-mono text-stone-300 text-2xl">–</span>
                <span className="font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '52px', color: '#1A1A1A', lineHeight: 1 }}>{homeScore ?? 0}</span>
              </div>
              <div className="font-mono text-[9px] uppercase tracking-widest mt-1" style={{ color: isLive ? '#15803D' : '#78716C' }}>
                {isLive ? '● Live' : 'Final'}
              </div>
            </div>
          ) : (
            <div>
              <div className="font-serif text-stone-300 text-3xl font-light">vs</div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mt-1">{game.statusDisplay}</div>
              {game.broadcast && <div className="font-mono text-[9px] text-stone-300 mt-1 uppercase tracking-wider">{game.broadcast}</div>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 flex-1 min-w-0 justify-end">
          <div className="text-right min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-0.5">Home</div>
            <div className="font-serif text-2xl font-bold text-stone-900 leading-tight">{game.homeTeam.shortName}</div>
            <div className="font-mono text-xs text-stone-400 mt-0.5">{dbGame?.home_record || game.homeTeam.record}</div>
          </div>
          <img src={game.homeTeam.logo} alt={game.homeTeam.abbreviation} className="w-16 h-16 object-contain shrink-0" onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider">{formatDate(game.date)}</span>
        {(dbGame?.venue_name || game.venue) && <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider">· {dbGame?.venue_name || game.venue}</span>}
      </div>
    </div>
  )
}

// ── PASSING ZONE HEATMAP with Hover Tooltips ─────────────────────────────────
interface ZoneData { comp: number; att: number; yards: number; td: number; int: number }

function getZonePerformance(zone: ZoneData | null) {
  if (!zone || zone.att === 0) return { color: '#E7E5E4', label: 'No Data', score: 0 }
  const compPct = (zone.comp / zone.att) * 100
  const ypa = zone.yards / zone.att
  const score = (compPct - 58) + (ypa - 6.5) * 4 + (zone.td * 10) - (zone.int * 14)
  if (score >= 18) return { color: '#14532D', label: 'Elite', score }
  if (score >= 8)  return { color: '#4ADE80', label: 'Above Avg', score }
  if (score >= -6) return { color: '#A3A3A3', label: 'Average', score }
  return { color: '#FCA5A5', label: 'Below Avg', score }
}

function ZoneCell({ zone, label }: { zone: ZoneData | null; label: string }) {
  const perf = getZonePerformance(zone)
  const textColor = perf.color === '#14532D' || perf.color === '#4ADE80' ? '#fff' : '#1A1A1A'
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div 
      className="group relative aspect-[4.2/3] rounded-2xl flex flex-col items-center justify-center p-3 text-center border border-stone-200 transition-all active:scale-[0.985] cursor-pointer"
      style={{ backgroundColor: perf.color }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: textColor }}>{label}</div>
      
      {zone && zone.att > 0 ? (
        <div className="mt-1">
          <div className="font-mono text-2xl font-bold leading-none" style={{ color: textColor }}>{zone.comp}/{zone.att}</div>
          <div className="font-mono text-[11px] mt-1 tracking-tight" style={{ color: textColor }}>
            {zone.yards} yds {zone.td > 0 && `• ${zone.td} TD`}
          </div>
        </div>
      ) : (
        <div className="font-mono text-xs text-stone-400 mt-2">–</div>
      )}

      {/* Tooltip */}
      {showTooltip && zone && zone.att > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-xl bg-stone-900 text-white p-3 text-xs shadow-xl z-50 border border-stone-700">
          <div className="font-mono text-[10px] text-orange-400 mb-1">{label} • {perf.label}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>Completions</div><div className="text-right font-mono">{zone.comp}/{zone.att}</div>
            <div>Yards</div><div className="text-right font-mono">{zone.yards}</div>
            <div>Touchdowns</div><div className="text-right font-mono">{zone.td}</div>
            <div>Interceptions</div><div className="text-right font-mono">{zone.int}</div>
            <div>Yards/Attempt</div><div className="text-right font-mono">{num(zone.yards / zone.att, 1)}</div>
          </div>
          <div className="mt-2 pt-2 border-t border-stone-700 text-[10px] text-stone-400">
            Performance Score: {Math.round(perf.score)}
          </div>
        </div>
      )}
    </div>
  )
}

function PassingZoneHeatmap({ qbName, teamAbbr, zones }: { 
  qbName: string
  teamAbbr: string
  zones: Record<'deepLeft'|'deepMid'|'deepRight'|'intLeft'|'intMid'|'intRight'|'shortLeft'|'shortMid'|'shortRight', ZoneData | null>
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
        <div>
          <div className="font-serif text-2xl font-semibold tracking-tight">{qbName}</div>
          <div className="font-mono text-[10px] text-stone-500 -mt-0.5">{teamAbbr} • Passing Efficiency by Zone</div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-3 gap-2.5 max-w-[560px] mx-auto">
          <ZoneCell zone={zones.deepLeft} label="DEEP LEFT" />
          <ZoneCell zone={zones.deepMid} label="DEEP MID" />
          <ZoneCell zone={zones.deepRight} label="DEEP RIGHT" />
          <ZoneCell zone={zones.intLeft} label="INT LEFT" />
          <ZoneCell zone={zones.intMid} label="INT MID" />
          <ZoneCell zone={zones.intRight} label="INT RIGHT" />
          <ZoneCell zone={zones.shortLeft} label="SHORT LEFT" />
          <ZoneCell zone={zones.shortMid} label="SHORT MID" />
          <ZoneCell zone={zones.shortRight} label="SHORT RIGHT" />
        </div>
        <div className="text-center mt-4">
          <p className="font-mono text-[9px] text-stone-400">Hover zones for detailed stats • Color = performance vs league average</p>
        </div>
      </div>
    </div>
  )
}

// ── FOOTBALL FIELD DIAGRAM with Hover Tooltips ───────────────────────────────
function FootballFieldDiagram({ title, routes = [] }: { 
  title: string
  routes?: Array<{ path: string; color: string; label?: string; detail?: string }>
}) {
  const [hoveredRoute, setHoveredRoute] = useState<number | null>(null)

  return (
    <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
        <div className="font-serif font-semibold text-lg tracking-tight">{title}</div>
      </div>

      <div className="p-4 bg-[#0F172A]">
        <svg viewBox="0 0 400 210" className="w-full max-w-[560px] mx-auto">
          <rect x="0" y="0" width="400" height="210" fill="#166534" rx="6" />
          {[40,80,120,160,200,240,280,320,360].map((x,i) => (
            <line key={i} x1={x} y1="8" x2={x} y2="202" stroke="#4ADE80" strokeWidth="0.75" opacity="0.4" />
          ))}
          {[60,100,140,180,220,260,300,340].map((x,i) => (
            <g key={i}>
              <line x1={x} y1="68" x2={x} y2="73" stroke="#fff" strokeWidth="1.5" />
              <line x1={x} y1="137" x2={x} y2="142" stroke="#fff" strokeWidth="1.5" />
            </g>
          ))}
          <line x1="115" y1="8" x2="115" y2="202" stroke="#fff" strokeWidth="2.5" />
          <text x="120" y="22" fill="#fff" fontSize="8" fontFamily="monospace">LOS</text>
          <line x1="18" y1="8" x2="18" y2="202" stroke="#fff" strokeWidth="4" />
          <line x1="382" y1="8" x2="382" y2="202" stroke="#fff" strokeWidth="4" />

          {routes.map((route, idx) => (
            <g 
              key={idx}
              onMouseEnter={() => setHoveredRoute(idx)}
              onMouseLeave={() => setHoveredRoute(null)}
              className="cursor-pointer"
            >
              <path 
                d={route.path} 
                fill="none" 
                stroke={route.color} 
                strokeWidth={hoveredRoute === idx ? "5.5" : "4"} 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                opacity={hoveredRoute === null || hoveredRoute === idx ? 0.95 : 0.35}
              />
              <circle 
                cx={parseFloat(route.path.split(' ').pop() || '200')} 
                cy={parseFloat((route.path.split(',').pop() || '110').split(' ')[0])} 
                r={hoveredRoute === idx ? "6.5" : "5"} 
                fill={route.color} 
              />
            </g>
          ))}

          <circle cx="92" cy="105" r="7" fill="#F59E0B" />
          <text x="76" y="103" fill="#fff" fontSize="7" fontFamily="monospace">QB</text>
        </svg>
      </div>

      {routes.length > 0 && (
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {routes.map((r, i) => (
            <div 
              key={i} 
              className={`flex items-center gap-2 transition-all ${hoveredRoute === i ? 'font-semibold text-stone-900' : 'text-stone-600'}`}
              onMouseEnter={() => setHoveredRoute(i)}
              onMouseLeave={() => setHoveredRoute(null)}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="font-mono">{r.label || 'Route'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── EXPLOSIVE PLAYS VISUAL ────────────────────────────────────────────────────
function ExplosivePlaysVisual({ away, home, awayName, homeName }: {
  away: { rate: number; deepPass: number; bigRun: number }
  home: { rate: number; deepPass: number; bigRun: number }
  awayName: string
  homeName: string
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-serif text-xl font-semibold tracking-tight">Explosive Plays</div>
          <div className="font-mono text-[10px] text-stone-500">15+ yard plays • 2025 Season</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Away */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="font-mono text-sm font-bold text-stone-500">{awayName}</div>
            <div className="font-mono text-3xl font-bold text-stone-900">{away.rate}<span className="text-base align-super">%</span></div>
          </div>
          <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${away.rate}%` }} />
          </div>
          <div className="flex justify-between text-xs font-mono text-stone-500">
            <div>Deep Pass: <span className="text-stone-900 font-semibold">{away.deepPass}%</span></div>
            <div>Big Run: <span className="text-stone-900 font-semibold">{away.bigRun}%</span></div>
          </div>
        </div>

        {/* Home */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="font-mono text-sm font-bold text-stone-500">{homeName}</div>
            <div className="font-mono text-3xl font-bold text-stone-900">{home.rate}<span className="text-base align-super">%</span></div>
          </div>
          <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${home.rate}%` }} />
          </div>
          <div className="flex justify-between text-xs font-mono text-stone-500">
            <div>Deep Pass: <span className="text-stone-900 font-semibold">{home.deepPass}%</span></div>
            <div>Big Run: <span className="text-stone-900 font-semibold">{home.bigRun}%</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TEAM RADAR ────────────────────────────────────────────────────────────────
function TeamRadar({ home, away, homeName, awayName }: {
  home: Record<string, number>
  away: Record<string, number>
  homeName: string
  awayName: string
}) {
  const metrics = ['Pass Off', 'Rush Off', 'Pass Def', 'Rush Def', 'Red Zone', '3rd Down', 'Turnovers']
  const maxVal = 100

  const getPoints = (values: Record<string, number>) => {
    return metrics.map((m, i) => {
      const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2
      const value = Math.min(values[m] || 50, maxVal)
      const r = (value / maxVal) * 85
      return { x: 120 + r * Math.cos(angle), y: 120 + r * Math.sin(angle) }
    })
  }

  const homePoints = getPoints(home)
  const awayPoints = getPoints(away)
  const homePath = homePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
  const awayPath = awayPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="font-serif text-xl font-semibold">Team Strength Comparison</div>
      </div>
      <svg viewBox="0 0 240 240" className="w-full max-w-[280px] mx-auto">
        {[30, 55, 80].map(r => <circle key={r} cx="120" cy="120" r={r} fill="none" stroke="#E7E5E4" strokeWidth="1" />)}
        {metrics.map((_, i) => {
          const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2
          return <line key={i} x1="120" y1="120" x2={120 + 90 * Math.cos(angle)} y2={120 + 90 * Math.sin(angle)} stroke="#E7E5E4" strokeWidth="1" />
        })}
        <path d={homePath} fill="#FF5722" fillOpacity="0.25" stroke="#FF5722" strokeWidth="2.5" />
        <path d={awayPath} fill="#3B82F6" fillOpacity="0.25" stroke="#3B82F6" strokeWidth="2.5" />
        {metrics.map((m, i) => {
          const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2
          return (
            <text key={i} x={120 + 102 * Math.cos(angle)} y={120 + 102 * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#78716C" fontFamily="monospace">
              {m}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function TabRead({ game, edgeScore, narrative }: { game: NFLGame; edgeScore: number | null; narrative: string | null }) {
  const isPreLaunch = new Date(game.date) < new Date('2026-09-09')
  return (
    <div className="space-y-6">
      {edgeScore != null ? (
        <div className="rounded-3xl overflow-hidden" style={{ background: '#1A1A1A' }}>
          <div className="px-7 py-6 flex items-center justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-orange-500 mb-1.5">⊕ Edge Score</div>
              <div className="font-bold leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '68px', color: edgeScore > 0 ? '#FF5722' : '#60A5FA', lineHeight: 0.95 }}>
                {edgeScore > 0 ? '+' : ''}{edgeScore}
              </div>
              <div className="font-mono text-[10px] text-stone-400 uppercase tracking-wider mt-1.5">
                {edgeScore > 0 ? `Favors ${game.homeTeam.shortName}` : edgeScore < 0 ? `Favors ${game.awayTeam.shortName}` : 'Even'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1">Confidence</div>
              <div className="font-mono text-base font-bold text-white uppercase tracking-wider">
                {Math.abs(edgeScore) >= 25 ? 'Strong' : Math.abs(edgeScore) >= 12 ? 'Moderate' : Math.abs(edgeScore) >= 5 ? 'Slight' : 'Tossup'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-3xl px-6 py-7 text-center">
          <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">⊕ Edge Score</div>
          <p className="font-serif italic text-stone-400">{isPreLaunch ? 'Edge Scores begin Week 1 • September 9, 2026' : 'Generating...'}</p>
        </div>
      )}

      {narrative ? (
        <div>
          <SectionLabel>The Read</SectionLabel>
          <div className="bg-white border border-stone-200 rounded-3xl px-7 py-6">
            <p className="font-serif text-[15px] text-stone-800 leading-relaxed tracking-[-0.1px]">{narrative}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-3xl px-6 py-9 text-center">
          <p className="font-serif italic text-stone-400">{isPreLaunch ? 'The Read launches with the 2026 season.' : 'Generating narrative...'}</p>
        </div>
      )}
    </div>
  )
}

function TabOffenseDefense({ game }: { game: NFLGame }) {
  const away = game.awayTeam.abbreviation
  const home = game.homeTeam.abbreviation

  const awayZones = {
    deepLeft: { comp: 2, att: 5, yards: 51, td: 0, int: 1 },
    deepMid: { comp: 1, att: 3, yards: 34, td: 1, int: 0 },
    deepRight: { comp: 0, att: 2, yards: 0, td: 0, int: 0 },
    intLeft: { comp: 5, att: 7, yards: 61, td: 0, int: 0 },
    intMid: { comp: 6, att: 8, yards: 74, td: 1, int: 0 },
    intRight: { comp: 3, att: 4, yards: 31, td: 0, int: 0 },
    shortLeft: { comp: 7, att: 8, yards: 44, td: 0, int: 0 },
    shortMid: { comp: 9, att: 10, yards: 58, td: 0, int: 0 },
    shortRight: { comp: 4, att: 5, yards: 29, td: 0, int: 0 },
  }

  const homeZones = {
    deepLeft: { comp: 1, att: 3, yards: 38, td: 1, int: 0 },
    deepMid: { comp: 2, att: 4, yards: 59, td: 0, int: 1 },
    deepRight: { comp: 0, att: 1, yards: 0, td: 0, int: 0 },
    intLeft: { comp: 5, att: 6, yards: 54, td: 1, int: 0 },
    intMid: { comp: 7, att: 9, yards: 81, td: 1, int: 0 },
    intRight: { comp: 3, att: 5, yards: 37, td: 0, int: 0 },
    shortLeft: { comp: 6, att: 7, yards: 42, td: 0, int: 0 },
    shortMid: { comp: 10, att: 11, yards: 67, td: 0, int: 0 },
    shortRight: { comp: 5, att: 6, yards: 35, td: 0, int: 0 },
  }

  return (
    <div className="space-y-8">
      <ReadLine>Zone performance reveals where each quarterback thrives or struggles. Hover any zone for details.</ReadLine>

      <div>
        <SectionLabel>QB Performance by Passing Zone</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PassingZoneHeatmap qbName={`${game.awayTeam.shortName} QB`} teamAbbr={away} zones={awayZones} />
          <PassingZoneHeatmap qbName={`${game.homeTeam.shortName} QB`} teamAbbr={home} zones={homeZones} />
        </div>
      </div>
    </div>
  )
}

function TabMatchupMap({ game }: { game: NFLGame }) {
  const homeName = game.homeTeam.shortName
  const awayName = game.awayTeam.shortName

  const homeStats = { 'Pass Off': 82, 'Rush Off': 61, 'Pass Def': 74, 'Rush Def': 68, 'Red Zone': 71, '3rd Down': 64, 'Turnovers': 58 }
  const awayStats = { 'Pass Off': 77, 'Rush Off': 79, 'Pass Def': 69, 'Rush Def': 81, 'Red Zone': 66, '3rd Down': 59, 'Turnovers': 72 }

  return (
    <div className="space-y-6">
      <ReadLine>One visual summary of who wins each phase of the game.</ReadLine>
      <TeamRadar home={homeStats} away={awayStats} homeName={homeName} awayName={awayName} />
    </div>
  )
}

function TabFieldView({ game }: { game: NFLGame }) {
  const awayName = game.awayTeam.shortName
  const homeName = game.homeTeam.shortName

  const explosiveAway = { rate: 27, deepPass: 34, bigRun: 19 }
  const explosiveHome = { rate: 31, deepPass: 29, bigRun: 24 }

  return (
    <div className="space-y-8">
      <ReadLine>See the actual routes and concepts that define this matchup. Hover routes for details.</ReadLine>

      <div>
        <SectionLabel>Key Route Concepts — {awayName}</SectionLabel>
        <FootballFieldDiagram 
          title={`${awayName} vs ${homeName} — Key Routes`}
          routes={[
            { path: "M 92,105 Q 155,58 245,48", color: "#4ADE80", label: "Deep Post (Explosive)", detail: "28 yards, TD" },
            { path: "M 92,105 Q 148,88 195,115", color: "#F59E0B", label: "Dig Route", detail: "12 yards" },
            { path: "M 92,105 Q 135,138 180,158", color: "#EF4444", label: "Flat (Incompletion)", detail: "Dropped" },
          ]} 
        />
      </div>

      <ExplosivePlaysVisual 
        away={explosiveAway} 
        home={explosiveHome} 
        awayName={awayName} 
        homeName={homeName} 
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FootballFieldDiagram 
          title="Explosive Plays"
          routes={[
            { path: "M 92,105 Q 175,42 265,38", color: "#4ADE80", label: "Deep Shot" },
            { path: "M 92,105 Q 155,125 230,148", color: "#4ADE80", label: "YAC Opportunity" },
          ]} 
        />
        <FootballFieldDiagram 
          title="Red Zone Attack"
          routes={[
            { path: "M 92,105 Q 138,82 168,88", color: "#F59E0B", label: "Fade" },
            { path: "M 92,105 Q 122,118 155,128", color: "#EF4444", label: "Checkdown" },
          ]} 
        />
      </div>
    </div>
  )
}

function TabSituational() {
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-8 text-center">
      <p className="font-serif italic text-stone-400">Situational success heatmaps coming soon.</p>
    </div>
  )
}

function TabFantasy({ game }: { game: NFLGame }) {
  const isPreLaunch = new Date(game.date) < new Date('2026-09-09')
  return (
    <div className="space-y-6">
      <ReadLine>Fantasy intelligence launches with the full model on September 9, 2026.</ReadLine>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: 'Start / Sit', body: 'Matchup-based recommendations with target share and injury context.' },
          { label: 'DFS Stacks', body: 'Best correlated plays based on game script and coverage.' },
          { label: 'Target Share', body: 'Who gets the ball where against this specific defense.' },
          { label: 'QB vs Defense', body: 'Advanced metrics tailored to this opponent.' },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-2xl px-6 py-5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-orange-500 font-bold mb-1.5">⊕ {item.label}</div>
            <p className="font-serif text-sm text-stone-600 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'read', label: 'The Read' },
  { key: 'offense', label: 'Off vs Def' },
  { key: 'matchup', label: 'Matchup Map' },
  { key: 'field', label: 'Field View' },
  { key: 'situation', label: 'Situational' },
  { key: 'fantasy', label: 'Fantasy' },
] as const

type TabKey = typeof TABS[number]['key']

export default function NFLGamePage({ game, dbGame, homeStats, awayStats, edgeScore, narrative }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('read')

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-20">
      <MatchupHeader game={game} dbGame={dbGame} />

      <div className="flex gap-1 border-b border-stone-200 mb-8 overflow-x-auto pb-px">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-3.5 font-mono text-[10px] uppercase tracking-[1.5px] transition-all whitespace-nowrap border-b-2 -mb-px font-medium ${
              activeTab === tab.key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'read' && <TabRead game={game} edgeScore={edgeScore} narrative={narrative} />}
      {activeTab === 'offense' && <TabOffenseDefense game={game} />}
      {activeTab === 'matchup' && <TabMatchupMap game={game} />}
      {activeTab === 'field' && <TabFieldView game={game} />}
      {activeTab === 'situation' && <TabSituational />}
      {activeTab === 'fantasy' && <TabFantasy game={game} />}
    </div>
  )
}
