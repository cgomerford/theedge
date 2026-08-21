'use client'

// src/components/FieldingAlignmentDiamond.tsx
//
// Full defensive diamond for the Scout Report Defense section — the Edge
// equivalent of Baseball Savant's "Fielding Alignment" daily highlight
// graphic. Season Fielding Run Value (FRV) badged at each position tonight's
// starter is playing, restyled into Edge's light card system instead of
// Savant's dark video-overlay look.
//
// Data comes from `player_fielding_run_value` (season-blended FRV per
// player, populated weekly by scripts/fetch_fielding_run_value.py) joined
// against tonight's confirmed starting lineup by player_id + position —
// that join happens one level up, in the data-access layer, not here.
// This component is presentational only. A player missing from the FRV
// table renders as an explicit "no data" badge — never a fabricated 0.
// An unconfirmed lineup (empty fielders array) renders a plain empty state
// rather than eight dashes pretending to mean something.
//
// 2026-08-17: visual pass — grass swapped from a flat pale fill to a
// mow-stripe gradient pattern (alternating light/dark bands, matching how
// broadcast overheads actually render turf) for more contrast against the
// white card background. Dirt warmed up with a two-stop gradient instead
// of a flat tan. Layering made explicit rather than relying on DOM/paint
// order: the field SVG is pinned to z-index 0 and every player marker
// wrapper explicitly sets a z-index >= 10, so future edits to this file
// can't accidentally let the field art paint over a headshot.

import { useState } from 'react'

export type FielderPosition = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF'

export type FielderAlignmentEntry = {
  position: FielderPosition
  playerId: number | null
  playerName: string          // 'First Last'
  totalRuns: number | null    // season FRV; null = no data yet, never 0
}

type Props = {
  teamAbbr: string
  teamName: string
  teamColor: string
  fielders: FielderAlignmentEntry[]   // any subset of the 8 non-pitcher spots
}

// ─── Layout: approximate real defensive positioning, home plate at bottom ────
// Values are percentages of the container so absolute positioning works cleanly.
//
// 2026-08-17: widened spread and added real vertical clearance between OF
// and INF rows. The original layout only accounted for circle-to-circle
// distance, not the name label rendered BELOW each circle — CF's label
// was landing in LF/RF's circle space, and 1B/3B sat too close to SS/2B.
// Circle size also dropped from 52px to 44px to give more margin at
// column widths around 400–500px.
const LAYOUT: Record<FielderPosition, { x: number; y: number }> = {
  CF:   { x: 50,  y: 8  },
  LF:   { x: 14,  y: 26 },
  RF:   { x: 86,  y: 26 },
  SS:   { x: 30,  y: 52 },
  '2B': { x: 70,  y: 52 },
  '3B': { x: 22,  y: 76 },
  '1B': { x: 78,  y: 76 },
  C:    { x: 50,  y: 96 },
}

const POSITION_ORDER: FielderPosition[] = ['CF', 'LF', 'RF', 'SS', '2B', '3B', '1B', 'C']

function frvBadge(v: number | null): { bg: string; text: string; label: string; ring: string } {
  if (v === null) return { bg: '#E7E5E4', text: '#78716C', label: '–', ring: '#D6D3D1' }
  const rounded = Math.round(v)
  const label = rounded >= 0 ? `+${rounded}` : `${rounded}`
  if (v >= 15) return { bg: '#15803D', text: '#FFFFFF', label, ring: '#166534' }
  if (v >= 5)  return { bg: '#86EFAC', text: '#14532D', label, ring: '#16A34A' }
  if (v > -5)  return { bg: '#F5F5F4', text: '#44403C', label, ring: '#A8A29E' }
  if (v > -15) return { bg: '#FCA5A5', text: '#7F1D1D', label, ring: '#DC2626' }
  return { bg: '#B91C1C', text: '#FFFFFF', label, ring: '#991B1B' }
}

function lastName(full: string): string {
  const parts = full.trim().split(' ')
  return parts[parts.length - 1]
}

function headshotUrl(playerId: number | null): string | null {
  if (!playerId) return null
  // Official MLB silo headshot (Cloudinary). Falls back to generic silhouette when missing.
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${playerId}/headshot/silo/current`
}

export default function FieldingAlignmentDiamond({ teamAbbr, teamName, teamColor, fielders }: Props) {
  const [hoverId, setHoverId] = useState<number | null>(null)
  const byPosition = new Map(fielders.map(f => [f.position, f]))
  const hasAnyData = fielders.length > 0

  return (
    <div
      className="bg-white rounded-2xl border-2 border-stone-300 overflow-hidden shadow-sm"
      style={{ borderLeft: `5px solid ${teamColor}` }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 border-b-2 border-stone-200 flex items-center justify-between"
        style={{ background: `linear-gradient(135deg, ${teamColor}18, transparent 65%)` }}
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-stone-900 leading-none font-black tracking-tight"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.15rem', letterSpacing: '0.04em' }}
          >
            {teamAbbr}
          </span>
          <span className="text-stone-500 font-mono text-[10px] uppercase tracking-[0.18em] font-semibold">
            Fielding Alignment
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500 font-bold">
          Season FRV
        </span>
      </div>

      {!hasAnyData ? (
        <div className="px-4 py-14 text-center font-mono text-xs text-stone-400 font-medium tracking-wide">
          Lineup not yet confirmed
        </div>
      ) : (
        <div className="p-3 pb-2">
          {/* Diamond container — taller aspect ratio (was 320/300) gives
              the wider vertical spread above real room to breathe */}
          <div className="relative w-full" style={{ aspectRatio: '320 / 360' }}>
            {/* Field background (SVG) — pinned to z-index 0 so it can never
                paint over a marker regardless of DOM order elsewhere in
                this file. */}
            <svg
              viewBox="0 0 320 300"
              className="absolute inset-0 w-full h-full"
              style={{ display: 'block', zIndex: 0 }}
            >
              <defs>
                {/* Mow-stripe grass — alternating light/dark bands on a
                    diagonal, like a real broadcast-overhead field, instead
                    of one flat pale-green fill. */}
                <pattern
                  id="mowStripes"
                  width="34"
                  height="34"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(38)"
                >
                  <rect width="34" height="34" fill="#4C9A4C" />
                  <rect width="17" height="34" fill="#57A857" />
                </pattern>
                <radialGradient id="grassShade" cx="50%" cy="15%" r="85%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
                  <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
                  <stop offset="100%" stopColor="#1a3d1a" stopOpacity="0.14" />
                </radialGradient>
                <linearGradient id="dirtGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#DCB994" />
                  <stop offset="100%" stopColor="#C79B6E" />
                </linearGradient>
              </defs>

              {/* Layer 1: outfield grass */}
              <path
                d="M160 280 L15 90 Q160 -25 305 90 Z"
                fill="url(#mowStripes)"
                stroke="#3E7D3E"
                strokeWidth="1.5"
              />
              {/* Layer 1b: soft vignette/shade over the grass for depth,
                  strictly above the stripe fill, strictly below the dirt */}
              <path
                d="M160 280 L15 90 Q160 -25 305 90 Z"
                fill="url(#grassShade)"
              />

              {/* Layer 2: infield dirt — always painted after grass, so it
                  sits on top regardless of pattern/gradient changes above */}
              <path
                d="M160 270 L232 202 L160 134 L88 202 Z"
                fill="url(#dirtGradient)"
                stroke="#A9835C"
                strokeWidth="1.25"
              />

              {/* Layer 3: foul lines — always above grass + dirt */}
              <line x1="160" y1="270" x2="15" y2="90" stroke="#F5F5F4" strokeWidth="2" strokeDasharray="4,3" opacity={0.85} />
              <line x1="160" y1="270" x2="305" y2="90" stroke="#F5F5F4" strokeWidth="2" strokeDasharray="4,3" opacity={0.85} />

              {/* Layer 4: home plate — topmost field element */}
              <polygon points="160,278 153,271 156,263 164,263 167,271" fill="#1C1917" />
            </svg>

            {/* Player markers — explicit z-index floor of 10, always above
                the field SVG's z-index 0 */}
            {POSITION_ORDER.map(pos => {
              const f = byPosition.get(pos)
              const { x, y } = LAYOUT[pos]
              const badge = frvBadge(f?.totalRuns ?? null)
              const isHover = f?.playerId != null && hoverId === f.playerId
              const src = headshotUrl(f?.playerId ?? null)

              return (
                <div
                  key={pos}
                  className="absolute flex flex-col items-center"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isHover ? 30 : 10,
                    transition: 'transform 0.15s ease',
                  }}
                  onMouseEnter={() => f?.playerId && setHoverId(f.playerId)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  {/* Headshot + FRV badge */}
                  <div
                    className="relative"
                    style={{
                      transform: isHover ? 'scale(1.12)' : 'scale(1)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    {/* Headshot circle */}
                    <div
                      className="rounded-full overflow-hidden border-[3px] shadow-md bg-stone-200"
                      style={{
                        width: 44,
                        height: 44,
                        borderColor: badge.ring,
                      }}
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={f?.playerName ?? pos}
                          width={44}
                          height={44}
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                          onError={(e) => {
                            // Fallback to a neutral silhouette if the image fails
                            ;(e.target as HTMLImageElement).src =
                              'https://img.mlbstatic.com/mlb-photos/image/upload/w_120/v1/people/generic/headshot/silo/current'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-stone-300">
                          <span className="text-stone-500 font-mono text-xs font-bold">{pos}</span>
                        </div>
                      )}
                    </div>

                    {/* FRV badge – bold overlay */}
                    <div
                      className="absolute -bottom-1 -right-1 min-w-[28px] h-6 px-1.5 rounded-md flex items-center justify-center border-2 border-white shadow"
                      style={{ background: badge.bg, zIndex: 20 }}
                    >
                      <span
                        className="font-mono text-[11px] font-black leading-none"
                        style={{ color: badge.text }}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Name + position */}
                  {f && (
                    <div className="mt-1.5 text-center leading-none">
                      <div
                        className="text-[11px] font-bold text-stone-800 tracking-tight"
                        style={{ fontFamily: "'Fraunces', serif" }}
                      >
                        {lastName(f.playerName)}
                      </div>
                      <div className="font-mono text-[9px] font-semibold text-stone-500 mt-0.5 uppercase tracking-wider">
                        {pos}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend – bolder */}
          <div className="flex items-center justify-center gap-4 mt-2 pt-2.5 border-t-2 border-stone-200">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border border-stone-400" style={{ background: '#B91C1C' }} />
              <span className="font-mono text-[9px] text-stone-500 uppercase font-semibold tracking-wide">Below avg</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border border-stone-400" style={{ background: '#F5F5F4' }} />
              <span className="font-mono text-[9px] text-stone-500 uppercase font-semibold tracking-wide">Average</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border border-stone-400" style={{ background: '#15803D' }} />
              <span className="font-mono text-[9px] text-stone-500 uppercase font-semibold tracking-wide">Above avg</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}