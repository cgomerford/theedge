'use client'

// src/components/pitching-lab/LineupH2HShareCard.tsx
//
// Shareable "X-friendly" graphic for NextStartScouting.tsx's real H2H vs
// the opponent's projected lineup — same visual system as
// KeyPlayersShareCard.tsx (1080×1350, toPng at pixelRatio 2, cream/
// orange/black, Fraunces/Bebas Neue/JetBrains Mono, zero border-radius),
// built from the exact real data NextStartScouting.tsx already computed
// (real confirmed next start, confirmed boxscore 9 or last-game
// projection, real career per-batter H2H) — no new fetch, just a
// different render of it.

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1350

export type ShareLineupBatter = {
  id: number
  name: string
  order: number
  pitches: number
  ab: number
  h: number
  hr: number
  bb: number
  k: number
  topPitch: string | null // real most-thrown pitch name vs this batter
}

type Props = {
  pitcherId: number
  pitcherName: string
  pitcherTeamId: number
  opponentName: string
  opponentTeamId: number
  startDate: string // formatted, e.g. "Tue, Sep 15"
  lineupAsOf: string | null // formatted
  lineupSource?: 'confirmed' | 'projected' | 'unavailable'
  isHome: boolean
  batters: ShareLineupBatter[] // real lineup order, up to 9
}

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}
function avgColor(avg: number | null): string {
  if (avg == null) return '#78716c'
  if (avg <= 0.180) return '#15803d'
  if (avg <= 0.240) return '#4ade80'
  if (avg <= 0.280) return '#78716c'
  if (avg <= 0.320) return '#fb923c'
  return '#dc2626'
}

export function generateLineupH2HTweetCopy(
  pitcherName: string,
  opponentName: string,
  startDate: string,
  batters: ShareLineupBatter[],
  lineupSource: Props['lineupSource'] = 'projected',
): string {
  const faced = batters.filter(b => b.ab > 0)
  const toughest = [...faced].sort((a, b) => (b.h / b.ab) - (a.h / a.ab))[0]
  const kind = lineupSource === 'confirmed' ? 'confirmed lineup' : 'projected lineup'
  const lines = [
    `⊕ ${pitcherName} vs ${opponentName}'s ${kind} — ${startDate}`,
    '',
  ]
  if (toughest) {
    lines.push(`${toughest.name} has owned him: ${toughest.h}-for-${toughest.ab} (${fmtRate(toughest.h / toughest.ab)}) career.`)
  } else {
    lines.push(`Real career matchup history for the full ${kind} — full breakdown on The Edge.`)
  }
  lines.push('', 'Full lineup H2H breakdown on The Edge.', '', `#MLB #${opponentName.replace(/\s+/g, '')}`)
  return lines.join('\n')
}

function ShareCardInner({ pitcherId, pitcherName, pitcherTeamId, opponentName, opponentTeamId, startDate, isHome, batters, lineupSource }: Props) {
  const rows = batters.slice(0, 9)
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
        <img src={playerHeadshotUrl(pitcherId, 200)} alt={pitcherName} width={84} height={84} style={{ objectFit: 'cover', background: '#F0EBE0', borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#FF5722', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            ⊕ Next Start — Lineup H2H
          </div>
          <div style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontWeight: 800, fontSize: 34, lineHeight: 1.05, color: '#1A1A1A', letterSpacing: 0.2 }}>
            {pitcherName.toUpperCase()}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(pitcherTeamId)} alt="" width={48} height={48} style={{ objectFit: 'contain', flexShrink: 0 }} />
      </div>

      <div style={{ height: 2.5, background: '#1A1A1A', margin: '22px 0 18px' }} />

      {/* Matchup line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(opponentTeamId)} alt="" width={30} height={30} style={{ objectFit: 'contain' }} />
        <span style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: '#1A1A1A' }}>
          {isHome ? 'vs' : '@'} {opponentName}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#78716c', marginLeft: 'auto' }}>{startDate}</span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: lineupSource === 'confirmed' ? '#15803D' : '#A8A29E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 }}>
        {lineupSource === 'confirmed' ? 'vs Confirmed Lineup' : 'vs Projected Lineup'}
      </div>

      {/* Lineup rows */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {rows.map((b, i) => (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0',
            borderBottom: i < rows.length - 1 ? '1.5px solid rgba(26,26,26,0.08)' : 'none',
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#A8A29E', width: 26, textAlign: 'center', flexShrink: 0 }}>
              {b.order}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={playerHeadshotUrl(b.id, 120)} alt={b.name} width={48} height={48} style={{ objectFit: 'cover', background: '#F0EBE0', borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-outfit), 'Outfit', sans-serif", fontSize: 19, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.2 }}>
                {b.name}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#78716c', marginTop: 2 }}>
                {b.pitches > 0
                  ? `${b.pitches} pitches · ${b.ab > 0 ? `${b.h}-for-${b.ab}, ${b.hr} HR, ${b.bb} BB, ${b.k} K` : 'no AB yet'}${b.topPitch ? ` · sees mostly ${b.topPitch}` : ''}`
                  : 'Never faced (Statcast era)'}
              </div>
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700,
              color: avgColor(b.ab > 0 ? b.h / b.ab : null), flexShrink: 0, minWidth: 56, textAlign: 'right',
            }}>
              {b.ab > 0 ? fmtRate(b.h / b.ab) : '—'}
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

export default function LineupH2HShareCard(props: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleExportPng() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, { width: CARD_WIDTH, height: CARD_HEIGHT, pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = `${props.pitcherName.toLowerCase().replace(/\s+/g, '-')}-vs-${props.opponentName.toLowerCase().replace(/\s+/g, '-')}-lineup.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('LineupH2HShareCard: PNG export failed', e)
    } finally {
      setExporting(false)
    }
  }

  async function handleCopyTweet() {
    const text = generateLineupH2HTweetCopy(props.pitcherName, props.opponentName, props.startDate, props.batters, props.lineupSource)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('LineupH2HShareCard: clipboard copy failed', e)
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
