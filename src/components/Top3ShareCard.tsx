'use client'

/**
 * src/components/Top3ShareCard.tsx
 *
 * Admin-only export tool. Renders a fixed 1080×1350 social image +
 * matching tweet copy via html-to-image.
 *
 * Brand: cream / orange / black, Fraunces, Bebas Neue, JetBrains Mono,
 * zero border-radius. No raw scores. No betting language.
 */

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import type {
  SeriesTop3Result,
  Top3Batter,
  Top3BatterPitcherLine,
  ZoneFitCell,
} from '@/lib/series-matchup'

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1350

const ZONE_GRID_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

export function zoneTiltColor(tilt: number): string {
  if (tilt > 0.15) return '#15803d'
  if (tilt > 0.03) return '#4ade80'
  if (tilt > -0.03) return '#D6D3D1'
  if (tilt > -0.15) return '#fb923c'
  return '#dc2626'
}

export function leanText(score: number): string {
  if (score > 0.15) return 'Strong advantage'
  if (score > 0.03) return 'Slight edge'
  if (score > -0.03) return 'Neutral matchup'
  if (score > -0.15) return 'Slight pitcher edge'
  return 'Tough matchup'
}

export function leanColor(score: number): string {
  if (score > 0.03) return '#15803d'
  if (score > -0.03) return '#57534e'
  return '#EA580C'
}

function pickHeadlineLine(batter: Top3Batter): Top3BatterPitcherLine | null {
  if (batter.per_pitcher.length === 0) return null
  return [...batter.per_pitcher].sort(
    (a, b) => Math.abs(b.zone_score) - Math.abs(a.zone_score),
  )[0]
}

function highlightLine(batter: Top3Batter): string {
  const bestPutAway = batter.per_pitcher
    .flatMap((p) => p.pitch_type_fit)
    .find(
      (pt) =>
        pt.is_put_away_pitch &&
        !pt.velocity_matched_low_sample &&
        pt.velocity_matched_ba != null,
    )

  if (bestPutAway && bestPutAway.velocity_matched_ba! >= 0.280) {
    return `Hits his put-away ${bestPutAway.pitch_name} well — hard to shut down late in counts.`
  }
  if (bestPutAway && bestPutAway.velocity_matched_ba! <= 0.200) {
    return `Struggles against the put-away ${bestPutAway.pitch_name} — vulnerable in two-strike counts.`
  }
  return `${leanText(batter.series_score)} across the series.`
}

function MiniZoneGrid({
  cells,
  pitcherName,
}: {
  cells: ZoneFitCell[]
  pitcherName: string
}) {
  const byZone = new Map(cells.map((c) => [c.zone, c]))

  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 700,
          color: '#78716c',
          marginBottom: 10,
          textTransform: 'uppercase',
          letterSpacing: 1.1,
        }}
      >
        Zone matchup vs {pitcherName}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
          width: 268,
        }}
      >
        {ZONE_GRID_LAYOUT.flat().map((zone) => {
          const cell = byZone.get(zone)
          const color = cell ? zoneTiltColor(cell.tilt) : '#E7E5E4'
          return (
            <div
              key={zone}
              style={{
                aspectRatio: '1',
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(0,0,0,0.40)',
                }}
              >
                {zone}
              </span>
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 10,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 11, height: 11, background: '#15803d' }} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: '#78716c',
            }}
          >
            Batter edge
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 11, height: 11, background: '#dc2626' }} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: '#78716c',
            }}
          >
            Pitcher edge
          </span>
        </div>
      </div>
    </div>
  )
}

export function generateTweetCopy(
  result: SeriesTop3Result,
  teamName: string,
): string {
  const top = result.batters[0]
  if (!top) {
    return `Top 3 batters to watch for ${teamName} this series — full breakdown on The Edge.`
  }

  return [
    `⊕ Top 3 For The Series — ${teamName}`,
    ``,
    `${top.player_name} leads the read: ${leanText(top.series_score).toLowerCase()} across the confirmed starters left in this series.`,
    ``,
    `Full zone + pitch-type breakdown on The Edge.`,
    ``,
    `#${teamName.replace(/\s+/g, '')} #MLB`,
  ].join('\n')
}

// ─── Visual card ────────────────────────────────────────────────────────────

function ShareCardInner({
  result,
  teamName,
  teamId,
  seriesLabel,
}: {
  result: SeriesTop3Result
  teamName: string
  teamId: number
  seriesLabel: string
}) {
  const top3 = result.batters
  const headline = top3[0] ? pickHeadlineLine(top3[0]) : null

  return (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        background: '#FAF8F3',
        color: '#1A1A1A',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        padding: '48px 52px 44px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 10,
          height: '100%',
          background: '#FF5722',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={teamLogoUrl(teamId)}
          alt={teamName}
          width={52}
          height={52}
          style={{ objectFit: 'contain' }}
        />
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              fontWeight: 700,
              color: '#FF5722',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            § Top 3 For The Series
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              color: '#78716c',
              marginTop: 2,
            }}
          >
            {seriesLabel}
          </div>
        </div>
      </div>

      {/* Rule */}
      <div
        style={{
          height: 2.5,
          background: '#1A1A1A',
          margin: '24px 0 28px',
        }}
      />

      {/* ── #1 Spotlight ─────────────────────────────────────────────── */}
      {top3[0] && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerHeadshotUrl(top3[0].player_id)}
            alt={top3[0].player_name}
            width={132}
            height={132}
            style={{
              objectFit: 'cover',
              background: '#F0EBE0',
              flexShrink: 0,
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: '#FF5722',
                marginBottom: 6,
                letterSpacing: 1.4,
              }}
            >
              ⊕ NO. 1 READ
            </div>

            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 48,
                lineHeight: 0.95,
                color: '#1A1A1A',
                marginBottom: 10,
                letterSpacing: 0.4,
              }}
            >
              {top3[0].player_name.toUpperCase()}
            </div>

            <div
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 18,
                fontStyle: 'italic',
                color: '#44403c',
                lineHeight: 1.4,
                maxWidth: 580,
                marginBottom: 12,
              }}
            >
              {highlightLine(top3[0])}
            </div>

            <div
              style={{
                display: 'inline-block',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: leanColor(top3[0].series_score),
                border: `2px solid ${leanColor(top3[0].series_score)}`,
                padding: '5px 12px',
                textTransform: 'uppercase',
                letterSpacing: 1.1,
              }}
            >
              {leanText(top3[0].series_score)}
            </div>

            {headline && headline.zone_fit.length > 0 && (
              <MiniZoneGrid
                cells={headline.zone_fit}
                pitcherName={headline.pitcher_name}
              />
            )}
          </div>
        </div>
      )}

      {/* Divider before #2/#3 */}
      <div
        style={{
          height: 1.5,
          background: 'rgba(26,26,26,0.12)',
          margin: '4px 0 8px',
        }}
      />

      {/* ── #2 / #3 ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {top3.slice(1, 3).map((b, i) => {
          const line = pickHeadlineLine(b)
          return (
            <div
              key={b.player_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                padding: '18px 0',
                borderBottom:
                  i === 0 ? '1.5px solid rgba(26,26,26,0.10)' : 'none',
              }}
            >
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 34,
                  color: '#A8A29E',
                  width: 36,
                  lineHeight: 1,
                  textAlign: 'center',
                }}
              >
                {i + 2}
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={playerHeadshotUrl(b.player_id)}
                alt={b.player_name}
                width={68}
                height={68}
                style={{
                  objectFit: 'cover',
                  background: '#F0EBE0',
                  flexShrink: 0,
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#1A1A1A',
                    lineHeight: 1.15,
                  }}
                >
                  {b.player_name}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 14,
                    fontWeight: 700,
                    color: leanColor(b.series_score),
                    marginTop: 3,
                  }}
                >
                  {leanText(b.series_score)}
                </div>
              </div>

              {/* Compact 3×3 strip */}
              {line && line.zone_fit.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 3,
                    width: 54,
                    flexShrink: 0,
                  }}
                >
                  {ZONE_GRID_LAYOUT.flat().map((zone) => {
                    const cell = line.zone_fit.find((c) => c.zone === zone)
                    return (
                      <div
                        key={zone}
                        style={{
                          width: 16,
                          height: 16,
                          background: cell
                            ? zoneTiltColor(cell.tilt)
                            : '#E7E5E4',
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Spacer that actually pushes footer down without looking empty */}
      <div style={{ flex: 1, minHeight: 24 }} />

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 20,
          borderTop: '1.5px solid rgba(26,26,26,0.12)',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 28,
            letterSpacing: 1.4,
            color: '#1A1A1A',
          }}
        >
          THE EDGE
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: '#A8A29E',
            letterSpacing: 0.4,
          }}
        >
          edgereportdaily.com
        </div>
      </div>

      {/* Light diagonal watermark */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '52%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-32deg)',
            width: '165%',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 44,
            justifyContent: 'center',
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 20,
                letterSpacing: 2.5,
                color: 'rgba(26,26,26,0.038)',
                whiteSpace: 'nowrap',
              }}
            >
              THE EDGE · EDGEREPORTDAILY.COM
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Export wrapper ─────────────────────────────────────────────────────────

type Props = {
  result: SeriesTop3Result
  teamName: string
  teamId: number
  seriesLabel: string
}

export default function Top3ShareCard({
  result,
  teamName,
  teamId,
  seriesLabel,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleExportPng() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        pixelRatio: 2,
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `top3-${teamName
        .toLowerCase()
        .replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('Top3ShareCard: PNG export failed', e)
    } finally {
      setExporting(false)
    }
  }

  async function handleCopyTweet() {
    const text = generateTweetCopy(result, teamName)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Top3ShareCard: clipboard copy failed', e)
    }
  }

  if (result.batters.length === 0) {
    return (
      <p className="text-sm font-mono text-stone-400 italic">
        No confirmed Top 3 yet for {teamName} — nothing to export.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div
        style={{
          width: CARD_WIDTH / 2,
          height: CARD_HEIGHT / 2,
          overflow: 'hidden',
          border: '1px solid #e5e5e5',
          background: '#FAF8F3',
        }}
      >
        <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}>
          <div ref={cardRef}>
            <ShareCardInner
              result={result}
              teamName={teamName}
              teamId={teamId}
              seriesLabel={seriesLabel}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleExportPng}
          disabled={exporting}
          className="text-xs font-mono uppercase tracking-widest font-bold px-5 py-2.5 bg-stone-900 text-white disabled:opacity-50 hover:bg-stone-800 transition-colors"
        >
          {exporting ? 'Exporting…' : 'Download PNG'}
        </button>
        <button
          type="button"
          onClick={handleCopyTweet}
          className="text-xs font-mono uppercase tracking-widest font-bold px-5 py-2.5 border border-stone-300 hover:border-stone-500 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy tweet text'}
        </button>
      </div>
    </div>
  )
}