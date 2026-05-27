'use client';

import { useState } from 'react';
import type { MatchupTiltData, ComponentTilt } from '@/lib/matchup-tilt';

const COMPONENT_META: Array<{
  key: keyof MatchupTiltData['components'];
  label: string;
}> = [
  { key: 'pitching', label: 'Starting Pitching' },
  { key: 'bullpen', label: 'Bullpen' },
  { key: 'offense', label: 'Offensive Form' },
  { key: 'matchup', label: 'Pitch Matchups' },
  { key: 'park', label: 'Park Factor' },
  { key: 'weather', label: 'Weather' },
  { key: 'defense', label: 'Defense' },
  { key: 'rest', label: 'Rest & Travel' },
];

function TiltBar({
  tilt,
  homeColor,
  awayColor,
}: {
  tilt: number;
  homeColor: string;
  awayColor: string;
}) {
  const pct = Math.min(Math.abs(tilt) / 100, 1);
  const isHome = tilt > 5;
  const isAway = tilt < -5;
  const isNeutral = !isHome && !isAway;

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <div className="flex-1 h-1.5 bg-stone-200 rounded-full flex justify-end overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: isAway ? `${pct * 100}%` : '0%',
            background: awayColor,
          }}
        />
      </div>
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: isNeutral ? '#A8A29E' : isHome ? homeColor : awayColor,
        }}
      />
      <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: isHome ? `${pct * 100}%` : '0%',
            background: homeColor,
          }}
        />
      </div>
    </div>
  );
}

interface MatchupTiltProps {
  data: MatchupTiltData;
  isPro: boolean;
}

export default function MatchupTilt({ data, isPro }: MatchupTiltProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showUpgradeFor, setShowUpgradeFor] = useState<string | null>(null);

  const { home, away, gameTime, components } = data;

  const allTilts = COMPONENT_META.map((m) => components[m.key].tilt);
  const homeCount = allTilts.filter((t) => t > 5).length;
  const awayCount = allTilts.filter((t) => t < -5).length;
  const neutralCount = COMPONENT_META.length - homeCount - awayCount;

  const overallTilt = allTilts.reduce((s, t) => s + t, 0) / allTilts.length;
  const needleOffset = Math.max(-1, Math.min(1, overallTilt / 60));

  const handleExpand = (key: string) => {
    if (!isPro) {
      setShowUpgradeFor((prev) => (prev === key ? null : key));
      return;
    }
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const edgeInfo = (tilt: number) => {
    if (Math.abs(tilt) <= 5) return { label: '— EVEN', color: '#78716C' };
    const isHome = tilt > 0;
    const abbr = isHome ? home.abbr : away.abbr;
    const color = isHome ? home.primaryColor : away.primaryColor;
    const strength = Math.abs(tilt) >= 50 ? 'EDGE ↑↑' : Math.abs(tilt) >= 20 ? 'EDGE ↑' : 'SLIGHT';
    return { label: `${abbr} ${strength}`, color };
  };

  return (
    <div className="w-full">
      {/* Hero Tilt Meter - Fixed Away @ Home order */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl px-6 pt-7 pb-5 mb-1 relative overflow-hidden shadow-sm">
        <p className="font-mono text-[10px] tracking-[0.14em] text-stone-500 mb-5">
          § MATCHUP TILT · {gameTime}
        </p>

        <div className="flex justify-between items-start mb-3">
          {/* AWAY TEAM (Left) */}
          <div>
            <p className="text-3xl font-black tracking-tight leading-none" style={{ color: away.primaryColor }}>
              {away.abbr}
            </p>
            <p className="font-mono text-[10px] text-stone-500 mt-0.5">AWAY</p>
          </div>
          
          <p className="font-mono text-[10px] text-stone-400 tracking-widest pt-1">
            FACTOR GAP
          </p>
          
          {/* HOME TEAM (Right) */}
          <div className="text-right">
            <p className="text-3xl font-black tracking-tight leading-none" style={{ color: home.primaryColor }}>
              {home.abbr}
            </p>
            <p className="font-mono text-[10px] text-stone-500 mt-0.5">HOME</p>
          </div>
        </div>

        <div className="relative h-3.5 mb-3">
          <div className="absolute inset-y-1 inset-x-0 bg-stone-200 rounded-full" />
          
          {/* Away fill (Left) */}
          <div
            className="absolute right-1/2 top-1 bottom-1 rounded-l-full transition-all duration-700"
            style={{ width: `${Math.max(0, -needleOffset) * 50}%`, background: `linear-gradient(270deg, ${away.primaryColor}88, ${away.primaryColor})` }}
          />
          {/* Home fill (Right) */}
          <div
            className="absolute left-1/2 top-1 bottom-1 rounded-r-full transition-all duration-700"
            style={{ width: `${Math.max(0, needleOffset) * 50}%`, background: `linear-gradient(90deg, ${home.primaryColor}88, ${home.primaryColor})` }}
          />
          
          <div
            className="absolute top-0 bottom-0 w-3.5 rounded-full border-2 border-white transition-all duration-700 z-10"
            style={{ left: `calc(50% + ${needleOffset * 50}%)`, transform: 'translateX(-50%)', background: '#F59E0B', boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}
          />
          <div className="absolute left-1/2 top-0.5 bottom-0.5 w-px bg-stone-300 -translate-x-1/2 z-0" />
        </div>

        <div className="flex justify-center gap-1 mb-2">
          {COMPONENT_META.map((m) => {
            const t = components[m.key].tilt;
            const bg = t > 5 ? home.primaryColor : t < -5 ? away.primaryColor : '#D6D3D1';
            return <div key={m.key} className="w-2 h-2 rounded-full" style={{ background: bg }} />;
          })}
        </div>

        <p className="text-center font-mono text-[11px] text-stone-500">
          <span className="font-bold" style={{ color: away.primaryColor }}>{away.abbr} holds {awayCount} factors</span>
          {' · '}
          <span className="font-bold" style={{ color: home.primaryColor }}>{home.abbr} holds {homeCount}</span>
          {neutralCount > 0 && <span> · {neutralCount} neutral</span>}
        </p>
      </div>

      {/* Column Headers (Away first, Home second) */}
      <div className="flex justify-end pr-9 py-3 gap-3 font-mono text-[10px] font-bold tracking-wider">
        <span className="w-12 text-right" style={{ color: away.primaryColor }}>{away.abbr}</span>
        <span className="w-12 text-right" style={{ color: home.primaryColor }}>{home.abbr}</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {COMPONENT_META.map((meta) => {
          const comp = components[meta.key];
          const isOpen = expanded[meta.key];
          const showUpgrade = showUpgradeFor === meta.key;
          const edge = edgeInfo(comp.tilt);

          return (
            <div key={meta.key} className="bg-white rounded-xl overflow-hidden border border-stone-200">
              <div className="flex items-center px-3.5 py-3 gap-2.5">
                <div className="w-32 flex-shrink-0">
                  <span className="font-mono text-[12px] font-bold text-stone-800 leading-none">{meta.label}</span>
                </div>
                <div className="flex-1">
                  <TiltBar tilt={comp.tilt} homeColor={home.primaryColor} awayColor={away.primaryColor} />
                </div>
                <div className="w-20 text-right flex-shrink-0">
                  <span className="font-mono text-[10px] font-bold tracking-wider" style={{ color: edge.color }}>{edge.label}</span>
                </div>
              <button
                  onClick={() => handleExpand(meta.key)}
                  className="flex-shrink-0 flex items-center justify-center w-6 h-6 transition-colors hover:text-orange-600"
                  style={{ color: isPro ? '#EA580C' : '#A8A29E' }}
                  aria-label={isPro ? (isOpen ? 'Collapse' : 'Expand') : 'Unlock Pro'}
                  title={isPro ? (isOpen ? 'Collapse breakdown' : 'Expand breakdown') : 'Unlock Pro to view'}
                >
                  {isPro ? (
                    /* Smoothly rotating chevron for Pro users */
                    <svg 
                      className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  ) : (
                    /* Minimalist lock SVG for Free users */
                    <svg 
                      className="w-3.5 h-3.5" 
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  )}
                </button>
              </div>

              {!isOpen && !showUpgrade && (
                <p className="px-3.5 pb-2.5 font-mono text-[10px] text-stone-400 leading-relaxed">{comp.summary}</p>
              )}

              {isOpen && isPro && (
                <div className="px-3.5 pb-3 border-t border-stone-100 bg-stone-50">
                  <div className="flex justify-end gap-3 pt-2 pb-1">
                    <span className="font-mono text-[10px] font-bold w-12 text-right" style={{ color: away.primaryColor }}>{away.abbr}</span>
                    <span className="font-mono text-[10px] font-bold w-12 text-right" style={{ color: home.primaryColor }}>{home.abbr}</span>
                  </div>
                  {comp.subfactors.map((sf, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-stone-200 last:border-0">
                      <span className="font-mono text-[11px] text-stone-600 flex-1">
                        {sf.label} {sf.note && <span className="text-stone-400 ml-1">({sf.note})</span>}
                      </span>
                      <div className="flex gap-3">
                        {/* Away stat */}
                        <span className="font-mono text-[12px] w-12 text-right" style={{ fontWeight: !sf.homeWins ? 700 : 400, color: !sf.homeWins ? away.primaryColor : '#57534E' }}>{sf.away}</span>
                        {/* Home stat */}
                        <span className="font-mono text-[12px] w-12 text-right" style={{ fontWeight: sf.homeWins ? 700 : 400, color: sf.homeWins ? home.primaryColor : '#57534E' }}>{sf.home}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showUpgrade && !isPro && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-3 bg-stone-50 border-t border-stone-200">
                  <div>
                    <p className="font-mono text-[11px] text-orange-600 font-bold tracking-wider">⊕ PRO — Sub-factor breakdown</p>
                    <p className="font-mono text-[10px] text-stone-500 mt-0.5">{comp.subfactors.length} data points behind this score</p>
                  </div>
                  <a href="/pricing" className="bg-orange-600 text-white font-mono text-[11px] font-bold tracking-wider px-3.5 py-1.5 rounded-md flex-shrink-0 no-underline hover:bg-orange-700 transition">Unlock →</a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isPro && (
        <div className="mt-4 bg-stone-50 border border-stone-200 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[12px] text-orange-600 font-bold tracking-wider mb-1">⊕ GO DEEPER WITH PRO</p>
            <p className="font-mono text-[10px] text-stone-500 leading-relaxed">Unlock all sub-factors across 8 components — every game, every night.</p>
          </div>
          <a href="/pricing" className="bg-orange-600 text-white font-mono text-[11px] font-bold tracking-wider px-4 py-2 rounded-lg flex-shrink-0 no-underline hover:bg-orange-700 transition">Try Pro →</a>
        </div>
      )}
    </div>
  );
}