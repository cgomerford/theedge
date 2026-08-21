'use client'

/**
 * src/components/KeyPlayersShareCard.tsx
 *
 * Admin-only export tool for the Top 3 Key Players read — same visual
 * system as Top3ShareCard.tsx (1080×1350, toPng at pixelRatio 2, same
 * header/footer/watermark treatment), adapted for a MIXED ranked list
 * (batters + confirmed starter) instead of batters-only.
 *
 * Reuses zoneTiltColor / leanText / leanColor from Top3ShareCard.tsx
 * rather than duplicating them — one source of truth for the color
 * thresholds, matching the single-writer discipline used elsewhere.
 *
 * Brand: cream / orange / black, Fraunces, Bebas Neue, JetBrains Mono,
 * zero border-radius. No raw scores. No betting language.
 */

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import { zoneTiltColor, leanText, leanColor } from '@/components/Top3ShareCard'
import type { KeyPlayerCandidate } from '@/lib/key-players'
import type { ZoneFitCell } from '@/lib/series-matchup'

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1350

const ZONE_GRID_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

// ─── Normalizing a mixed candidate into one display shape ────────────────
// Pitcher candidates carry batter-positive zone_fit on their toughest_matchup
// line (see pitcher-series-edge.ts) — flip is applied here for DISPLAY only,
// so green always means "this candidate's edge" regardless of type.

type DisplayCard = {
  kind: 'batter' | 'pitcher'
  playerId: number
  playerName: string
  score: number
  subLabel: string          // "SP" for pitchers, blank for batters
  headline: string
  zoneCells: ZoneFitCell[]
  flipZoneSign: boolean
}

function toDisplayCard(c: KeyPlayerCandidate): DisplayCard {
  if (c.kind === 'batter') {
    const topLine = c.batter.per_pitcher[0] ?? null
    const bestPutAway = c.batter.per_pitcher
      .flatMap((p) => p.pitch_type_fit)
      .find((pt) => pt.is_put_away_pitch && !pt.velocity_matched_low_sample && pt.velocity_matched_ba != null)

    let headline = `${leanText(c.score)} across the series.`
    if (bestPutAway && bestPutAway.velocity_matched_ba! >= 0.28) {
      headline = `Hits his put-away ${bestPutAway.pitch_name} well — hard to shut down late in counts.`
    } else if (bestPutAway && bestPutAway.velocity_matched_ba! <= 0.2) {
      headline = `Struggles against the put-away ${bestPutAway.pitch_name} — vulnerable in two-strike counts.`
    }

    return {
      kind: 'batter',
      playerId: c.batter.player_id,
      playerName: c.batter.player_name,
      score: c.score,
      subLabel: '',
      headline,
      zoneCells: topLine?.zone_fit ?? [],
      flipZoneSign: false,
    }
  }

  const tough = c.pitcher.toughest_matchup
  const drivingPitch = tough
    ? [...tough.pitch_type_fit].sort((a, b) => (b.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0))[0]
    : null

  const headline = tough && drivingPitch
    ? `His ${drivingPitch.pitch_name.toLowerCase()} attacks a real weakness — sharpest against ${tough.batter_name}.`
    : `${leanText(c.score)} against the projected lineup.`

  return {
    kind: 'pitcher',
    playerId: c.pitcher.pitcher_id,
    playerName: c.pitcher.pitcher_name,
    score: c.score,
    subLabel: 'SP',
    headline,
    zoneCells: tough?.zone_fit ?? [],
    flipZoneSign: true, // zone_fit here is batter-positive convention — flip for display
  }
}

// ─── Tweet copy ─────────────────────────────────────────────────────────

export function generateKeyPlayersTweetCopy(candidates: KeyPlayerCandidate[], teamName: string): string {
  const cards = candidates.map(toDisplayCard)
  const top = cards[0]
  if (!top) {
    return `Top 3 Key Players for ${teamName} this series — full breakdown on The Edge.`
  }

  return [
    `⊕ Top 3 Key Players — ${teamName}`,
    ``,
    `${top.playerName}${top.subLabel ? ` (${top.subLabel})` : ''} leads the read: ${leanText(top.score).toLowerCase()}.`,
    ``,
    `Full zone + pitch-type breakdown on The Edge.`,
    ``,
    `#${teamName.replace(/\s+/g, '')} #MLB`,
  ].join('\n')
}

// ─── Mini zone grid (matches Top3ShareCard's MiniZoneGrid exactly) ───────

function MiniZoneGrid({ cells, flip, label }: { cells: ZoneFitCell[]; flip: boolean; label: string }) {
  const byZone = new Map(cells.map((c) => [c.zone, c]))

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#78716c',
        marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1.1,
      }}>
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: 268 }}>
        {ZONE_GRID_LAYOUT.flat().map((zone) => {
          const cell = byZone.get(zone)
          const tilt = cell ? (flip ? -cell.tilt : cell.tilt) : 0
          const color = cell ? zoneTiltColor(tilt) : '#E7E5E4'
          return (
            <div key={zone} style={{ aspectRatio: '1', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.40)' }}>{zone}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 11, height: 11, background: '#15803d' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#78716c' }}>Edge</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 11, height: 11, background: '#dc2626' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#78716c' }}>Tough</span>
        </div>
      </div>
    </div>
  )
}

// ─── Visual card ────────────────────────────────────────────────────────

function ShareCardInner({
  candidates, teamName, teamId, seriesLabel,
}: {
  candidates: KeyPlayerCandidate[]
  teamName: string
  teamId: number
  seriesLabel: string
}) {
  const cards = candidates.map(toDisplayCard)
  const first = cards[0]

  return (
    <div style={{
      width: CARD_WIDTH, height: CARD_HEIGHT, background: '#FAF8F3', color: '#1A1A1A',
      fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column',
      padding: '48px 52px 44px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 10, height: '100%', background: '#FF5722' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(teamId)} alt={teamName} width={52} height={52} style={{ objectFit: 'contain' }} />
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: '#FF5722',
            letterSpacing: 2, textTransform: 'uppercase',
          }}>
            § Top 3 Key Players
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#78716c', marginTop: 2 }}>
            {seriesLabel}
          </div>
        </div>
      </div>

      <div style={{ height: 2.5, background: '#1A1A1A', margin: '24px 0 28px' }} />

      {/* #1 spotlight */}
      {first && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerHeadshotUrl(first.playerId)} alt={first.playerName} width={132} height={132}
            style={{ objectFit: 'cover', background: '#F0EBE0', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#FF5722',
              marginBottom: 6, letterSpacing: 1.4,
            }}>
              ⊕ NO. 1 READ
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, lineHeight: 0.95, color: '#1A1A1A',
              marginBottom: 10, letterSpacing: 0.4, display: 'flex', alignItems: 'baseline', gap: 12,
            }}>
              {first.playerName.toUpperCase()}
              {first.subLabel && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#78716c', letterSpacing: 1 }}>
                  {first.subLabel}
                </span>
              )}
            </div>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 18, fontStyle: 'italic', color: '#44403c',
              lineHeight: 1.4, maxWidth: 580, marginBottom: 12,
            }}>
              {first.headline}
            </div>
            <div style={{
              display: 'inline-block', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
              color: leanColor(first.score), border: `2px solid ${leanColor(first.score)}`, padding: '5px 12px',
              textTransform: 'uppercase', letterSpacing: 1.1,
            }}>
              {leanText(first.score)}
            </div>

            {first.zoneCells.length > 0 && (
              <MiniZoneGrid
                cells={first.zoneCells}
                flip={first.flipZoneSign}
                label={first.kind === 'pitcher' ? 'Zone matchup vs projected lineup' : 'Zone matchup vs confirmed starter'}
              />
            )}
          </div>
        </div>
      )}

      <div style={{ height: 1.5, background: 'rgba(26,26,26,0.12)', margin: '4px 0 8px' }} />

      {/* #2 / #3 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {cards.slice(1, 3).map((c, i) => (
          <div key={c.playerId} style={{
            display: 'flex', alignItems: 'center', gap: 18, padding: '18px 0',
            borderBottom: i === 0 ? '1.5px solid rgba(26,26,26,0.10)' : 'none',
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, color: '#A8A29E', width: 36,
              lineHeight: 1, textAlign: 'center',
            }}>
              {i + 2}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={playerHeadshotUrl(c.playerId)} alt={c.playerName} width={68} height={68}
              style={{ objectFit: 'cover', background: '#F0EBE0', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: '#1A1A1A',
                lineHeight: 1.15, display: 'flex', alignItems: 'baseline', gap: 8,
              }}>
                {c.playerName}
                {c.subLabel && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A8A29E' }}>{c.subLabel}</span>
                )}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: leanColor(c.score), marginTop: 3 }}>
                {leanText(c.score)}
              </div>
            </div>
            {c.zoneCells.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: 54, flexShrink: 0 }}>
                {ZONE_GRID_LAYOUT.flat().map((zone) => {
                  const cell = c.zoneCells.find((z) => z.zone === zone)
                  const tilt = cell ? (c.flipZoneSign ? -cell.tilt : cell.tilt) : 0
                  return <div key={zone} style={{ width: 16, height: 16, background: cell ? zoneTiltColor(tilt) : '#E7E5E4' }} />
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 24 }} />

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20,
        borderTop: '1.5px solid rgba(26,26,26,0.12)',
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1.4, color: '#1A1A1A' }}>THE EDGE</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A8A29E', letterSpacing: 0.4 }}>edgereportdaily.com</div>
      </div>

      {/* Watermark */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%, -50%) rotate(-32deg)',
          width: '165%', display: 'flex', flexWrap: 'wrap', gap: 44, justifyContent: 'center',
        }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2.5,
              color: 'rgba(26,26,26,0.038)', whiteSpace: 'nowrap',
            }}>
              THE EDGE · EDGEREPORTDAILY.COM
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Export wrapper ─────────────────────────────────────────────────────

type Props = {
  candidates: KeyPlayerCandidate[]
  teamName: string
  teamId: number
  seriesLabel: string
}

export default function KeyPlayersShareCard({ candidates, teamName, teamId, seriesLabel }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleExportPng() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, { width: CARD_WIDTH, height: CARD_HEIGHT, pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = `key-players-${teamName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('KeyPlayersShareCard: PNG export failed', e)
    } finally {
      setExporting(false)
    }
  }

  async function handleCopyTweet() {
    const text = generateKeyPlayersTweetCopy(candidates, teamName)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('KeyPlayersShareCard: clipboard copy failed', e)
    }
  }

  if (candidates.length === 0) {
    return <p className="text-sm font-mono text-stone-400 italic">No Key Players read yet for {teamName} — nothing to export.</p>
  }

  return (
    <div className="space-y-5">
      <div style={{ width: CARD_WIDTH / 2, height: CARD_HEIGHT / 2, overflow: 'hidden', border: '1px solid #e5e5e5', background: '#FAF8F3' }}>
        <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}>
          <div ref={cardRef}>
            <ShareCardInner candidates={candidates} teamName={teamName} teamId={teamId} seriesLabel={seriesLabel} />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={handleExportPng} disabled={exporting}
          className="text-xs font-mono uppercase tracking-widest font-bold px-5 py-2.5 bg-stone-900 text-white disabled:opacity-50 hover:bg-stone-800 transition-colors">
          {exporting ? 'Exporting…' : 'Download PNG'}
        </button>
        <button type="button" onClick={handleCopyTweet}
          className="text-xs font-mono uppercase tracking-widest font-bold px-5 py-2.5 border border-stone-300 hover:border-stone-500 transition-colors">
          {copied ? 'Copied!' : 'Copy tweet text'}
        </button>
      </div>
    </div>
  )
}
