'use client'

// src/components/batting-lab/BatterSeriesH2HShareCard.tsx
//
// Shareable "X-friendly" graphic for BatterH2H.tsx's real H2H vs the
// confirmed starters in this batter's next series — the batter-side
// mirror of LineupH2HShareCard.tsx (same 1080×1350 visual system: cream/
// orange/black, Outfit/JetBrains Mono, zero border-radius), built from
// the exact real data BatterH2H.tsx already computed (real next series,
// real confirmed starters, real career H2H per starter via MLB's own
// vsPlayerTotal stat) — no new fetch, just a different render of it.

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1350

export type ShareSeriesStarter = {
  id: number
  name: string
  gameDate: string | null // formatted, e.g. "Tue, Sep 15" — the real game this pitcher is confirmed for
  ab: number
  hits: number
  homeRuns: number
  walks: number
  strikeouts: number
  avg: string // real MLB vsPlayerTotal AVG, already formatted (e.g. ".364")
  ops: string
  facedMost: boolean
}

type Props = {
  batterId: number
  batterName: string
  batterTeamId: number
  opponentName: string
  opponentTeamId: number
  seriesLabel: string // e.g. "3 games · Tue, Sep 15-Thu, Sep 17"
  starters: ShareSeriesStarter[]
}

function avgColor(ab: number, avgStr: string): string {
  if (ab === 0) return '#78716c'
  const v = Number(avgStr)
  if (Number.isNaN(v)) return '#78716c'
  if (v <= 0.180) return '#dc2626'
  if (v <= 0.240) return '#fb923c'
  if (v <= 0.280) return '#78716c'
  if (v <= 0.320) return '#4ade80'
  return '#15803d'
}

export function generateSeriesH2HTweetCopy(batterName: string, opponentName: string, seriesLabel: string, starters: ShareSeriesStarter[]): string {
  const faced = starters.filter(s => s.ab > 0)
  const best = [...faced].sort((a, b) => Number(b.avg) - Number(a.avg))[0]
  const lines = [`⊕ ${batterName} vs ${opponentName}'s confirmed starters — ${seriesLabel}`, '']
  if (best) {
    lines.push(`${batterName} vs ${best.name}: ${best.hits}-for-${best.ab} (${best.avg}) career.`)
  } else {
    lines.push(`Real career H2H vs every confirmed starter in the series — full breakdown on The Edge.`)
  }
  lines.push('', 'Full series H2H breakdown on The Edge.', '', `#MLB #${opponentName.replace(/\s+/g, '')}`)
  return lines.join('\n')
}

function ShareCardInner({ batterId, batterName, batterTeamId, opponentName, opponentTeamId, seriesLabel, starters }: Props) {
  const rows = starters.slice(0, 6)
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
            ⊕ Next Series — H2H
          </div>
          <div style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontWeight: 800, fontSize: 34, lineHeight: 1.05, color: '#1A1A1A', letterSpacing: 0.2 }}>
            {batterName.toUpperCase()}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(batterTeamId)} alt="" width={48} height={48} style={{ objectFit: 'contain', flexShrink: 0 }} />
      </div>

      <div style={{ height: 2.5, background: '#1A1A1A', margin: '22px 0 18px' }} />

      {/* Matchup line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(opponentTeamId)} alt="" width={30} height={30} style={{ objectFit: 'contain' }} />
        <span style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: '#1A1A1A' }}>
          vs {opponentName}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#78716c', marginLeft: 'auto' }}>{seriesLabel}</span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#A8A29E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 24 }}>
        vs Confirmed Starters
      </div>

      {/* Starter rows */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {rows.length === 0 && (
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 16, color: '#A8A29E', padding: '40px 0', textAlign: 'center' }}>
            No real starters confirmed yet for this series.
          </div>
        )}
        {rows.map((s, i) => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 18, padding: '22px 0',
            borderBottom: i < rows.length - 1 ? '1.5px solid rgba(26,26,26,0.08)' : 'none',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={playerHeadshotUrl(s.id, 140)} alt={s.name} width={60} height={60} style={{ objectFit: 'cover', background: '#F0EBE0', borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.2 }}>
                  {s.name}
                </div>
                {s.facedMost && (
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#fff',
                    background: '#FF5722', padding: '3px 8px', textTransform: 'uppercase', letterSpacing: 0.6,
                  }}>
                    Faced most
                  </div>
                )}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#78716c', marginTop: 4 }}>
                {s.gameDate ? `Confirmed for ${s.gameDate} · ` : ''}
                {s.ab > 0 ? `${s.hits}-for-${s.ab}, ${s.homeRuns} HR, ${s.walks} BB, ${s.strikeouts} K` : 'No real career at-bats on record'}
              </div>
            </div>
            {s.ab > 0 && (
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: avgColor(s.ab, s.avg) }}>
                  {s.avg}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A8A29E' }}>
                  OPS {s.ops}
                </div>
              </div>
            )}
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

export default function BatterSeriesH2HShareCard(props: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleExportPng() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, { width: CARD_WIDTH, height: CARD_HEIGHT, pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = `${props.batterName.toLowerCase().replace(/\s+/g, '-')}-vs-${props.opponentName.toLowerCase().replace(/\s+/g, '-')}-starters.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('BatterSeriesH2HShareCard: PNG export failed', e)
    } finally {
      setExporting(false)
    }
  }

  async function handleCopyTweet() {
    const text = generateSeriesH2HTweetCopy(props.batterName, props.opponentName, props.seriesLabel, props.starters)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('BatterSeriesH2HShareCard: clipboard copy failed', e)
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
