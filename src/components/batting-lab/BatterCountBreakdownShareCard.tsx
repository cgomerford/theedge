'use client'

// src/components/batting-lab/BatterCountBreakdownShareCard.tsx
//
// Shareable "X-friendly" graphic for BatterSequenceExplorer.tsx's real
// pitch-sequencing data — the batter-side mirror of the other share
// cards in this app (same 1080×1350 visual system: cream/orange/black,
// Outfit/JetBrains Mono, zero border-radius), scoped to the real
// 2-strike "put-away" counts (0-2/1-2/2-2/3-2) since those are the
// highest-leverage counts in a real at-bat. For each count: the real
// most-seen (pitch, zone) combo he's faced this season, a little
// location box showing where, and how he's actually performed there —
// no new fetch, just a different render of BatterSequenceExplorer's own
// real tallyPitches() output.

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import { ZONE_LABELS } from '@/lib/hot-zones'
import { CORE_KEYS, CHASE_KEYS, CHASE_SET } from '@/components/pitching-lab/ZoneGrid'

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1350

export type ShareCountRow = {
  balls: number
  strikes: number
  pitchType: string | null
  pitchName: string | null
  zone: string | null
  sampleCount: number // real total pitches seen at this count
  topCount: number // real count of the top (pitchType, zone) combo
  ball: number; strike: number; whiff: number; foul: number; inPlay: number
  ab: number; singles: number; doubles: number; triples: number; hr: number; so: number; outInPlay: number
  avg: number | null; slg: number | null
}

type Props = {
  batterId: number
  batterName: string
  batterTeamId: number
  rows: ShareCountRow[]
}

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}
function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}
function outcomeLine(r: ShareCountRow): string {
  if (r.ab === 0) return 'No real AB-ending pitch in this bucket yet'
  const parts = [
    r.singles > 0 && pluralize(r.singles, 'single'),
    r.doubles > 0 && pluralize(r.doubles, 'double'),
    r.triples > 0 && pluralize(r.triples, 'triple'),
    r.hr > 0 && pluralize(r.hr, 'home run'),
    r.so > 0 && pluralize(r.so, 'strikeout'),
    r.outInPlay > 0 && pluralize(r.outInPlay, 'out in play', 'outs in play'),
  ].filter(Boolean)
  return `${parts.join(', ')} — AVG ${fmtRate(r.avg)} · SLG ${fmtRate(r.slg)}`
}

export function generateCountBreakdownTweetCopy(batterName: string, rows: ShareCountRow[]): string {
  const withData = rows.filter(r => r.pitchType != null)
  const lines = [`⊕ ${batterName} — real put-away count breakdown`, '']
  for (const r of withData) {
    lines.push(`${r.balls}-${r.strikes}: mostly ${r.pitchName} (${ZONE_LABELS[r.zone ?? ''] ?? r.zone}) — ${r.ab > 0 ? `AVG ${fmtRate(r.avg)}` : 'no AB yet'}`)
  }
  lines.push('', 'Full breakdown on The Edge.', '', '#MLB')
  return lines.join('\n')
}

// Inline-style mini zone board — same 13-zone geometry as ZoneGrid.tsx /
// BatterSequenceExplorer's own MiniZone, redrawn with inline styles so
// html-to-image captures it identically regardless of stylesheet timing.
function MiniZoneBox({ zone }: { zone: string | null }) {
  const cellSize = 15, gap = 2, chaseBand = 13
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2
  function cellStyle(z: string): React.CSSProperties {
    const active = z === zone
    const isChase = CHASE_SET.has(z)
    return {
      background: active ? '#FF5722' : '#EDE8DD',
      border: '1px solid rgba(255,255,255,0.6)',
      borderRadius: isChase ? 0 : 2,
    }
  }
  return (
    <div style={{ position: 'relative', width: total, height: total, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', overflow: 'hidden', borderRadius: 3 }}>
        {CHASE_KEYS.map(z => <div key={z} style={cellStyle(z)} />)}
      </div>
      <div style={{ position: 'absolute', top: chaseBand, left: chaseBand, width: core, height: core, display: 'grid', gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}>
        {CORE_KEYS.map(z => <div key={z} style={cellStyle(z)} />)}
      </div>
    </div>
  )
}

function ShareCardInner({ batterId, batterName, batterTeamId, rows }: Props) {
  return (
    <div style={{
      width: CARD_WIDTH, height: CARD_HEIGHT, background: '#FAF8F3', color: '#1A1A1A',
      fontFamily: "var(--font-outfit), 'Outfit', sans-serif", display: 'flex', flexDirection: 'column',
      padding: '44px 52px 40px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 10, height: '100%', background: '#FF5722' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={playerHeadshotUrl(batterId, 200)} alt={batterName} width={84} height={84} style={{ objectFit: 'cover', background: '#F0EBE0', borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#FF5722', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            ⊕ How Pitchers Attack Him
          </div>
          <div style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontWeight: 800, fontSize: 34, lineHeight: 1.05, color: '#1A1A1A', letterSpacing: 0.2 }}>
            {batterName.toUpperCase()}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(batterTeamId)} alt="" width={48} height={48} style={{ objectFit: 'contain', flexShrink: 0 }} />
      </div>

      <div style={{ height: 2.5, background: '#1A1A1A', margin: '22px 0 18px' }} />

      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#A8A29E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 22 }}>
        Real Put-Away Counts — Every Pitcher, This Season
      </div>

      {/* Count rows */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {rows.map((r, i) => (
          <div key={`${r.balls}-${r.strikes}`} style={{
            display: 'flex', alignItems: 'center', gap: 20, padding: '20px 0',
            borderBottom: i < rows.length - 1 ? '1.5px solid rgba(26,26,26,0.08)' : 'none',
          }}>
            <div style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontWeight: 800, fontSize: 30, color: '#1A1A1A',
              width: 62, textAlign: 'center', flexShrink: 0,
            }}>
              {r.balls}-{r.strikes}
            </div>
            <MiniZoneBox zone={r.zone} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {r.pitchType == null ? (
                <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 14, color: '#A8A29E' }}>
                  No real pitches on record at this count yet.
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontSize: 18, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.2 }}>
                    {r.pitchName} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 400, color: '#A8A29E' }}>· {ZONE_LABELS[r.zone ?? ''] ?? r.zone} (n={r.topCount})</span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#78716c', marginTop: 4 }}>
                    Ball {r.ball} · Strike {r.strike} · Whiff {r.whiff} · Foul {r.foul} · In play {r.inPlay}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1A1A1A', marginTop: 3 }}>
                    {outcomeLine(r)}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18,
        borderTop: '1.5px solid rgba(26,26,26,0.12)', marginTop: 12,
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 1.4, color: '#1A1A1A' }}>THE EDGE</div>
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

export default function BatterCountBreakdownShareCard(props: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleExportPng() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, { width: CARD_WIDTH, height: CARD_HEIGHT, pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = `${props.batterName.toLowerCase().replace(/\s+/g, '-')}-put-away-counts.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('BatterCountBreakdownShareCard: PNG export failed', e)
    } finally {
      setExporting(false)
    }
  }

  async function handleCopyTweet() {
    const text = generateCountBreakdownTweetCopy(props.batterName, props.rows)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('BatterCountBreakdownShareCard: clipboard copy failed', e)
    }
  }

  return (
    <div className="space-y-4">
      <div style={{ width: CARD_WIDTH / 2.7, height: CARD_HEIGHT / 2.7, overflow: 'hidden', border: '1px solid #e5e5e5', background: '#FAF8F3' }}>
        <div style={{ transform: 'scale(0.3704)', transformOrigin: 'top left' }}>
          <div ref={cardRef}>
            <ShareCardInner {...props} />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={handleExportPng} disabled={exporting}
          className="text-[10px] font-mono uppercase tracking-widest font-bold px-4 py-2 bg-stone-900 text-white disabled:opacity-50 hover:bg-stone-800 transition-colors">
          {exporting ? 'Exporting…' : 'Download PNG'}
        </button>
        <button type="button" onClick={handleCopyTweet}
          className="text-[10px] font-mono uppercase tracking-widest font-bold px-4 py-2 border border-stone-300 hover:border-stone-500 transition-colors">
          {copied ? 'Copied!' : 'Copy tweet text'}
        </button>
      </div>
    </div>
  )
}
