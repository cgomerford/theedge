'use client'

// src/components/player/PlayerBioExportButton.tsx
//
// "Export bio" — a plain button, no permanently-visible card. Click it
// and it downloads a real PNG of PlayerSnipCard.tsx's headshot + name +
// percentile-rankings design (real team-color background, real team
// logo watermark) — the same card that used to sit inline on Overview,
// now rendered off-screen purely to capture, so the page itself stays
// the plain PercentileRankingsCard layout it was before.

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import PlayerSnipCard from '@/components/player/PlayerSnipCard'

const EXPORT_WIDTH = 560

type Props = {
  playerId: number
  name: string
  teamAbbr: string
  teamId: number
  teamColor: string
  percentileRows: { key: string; label: string; percentile: number | null }[]
  season?: number
}

export default function PlayerBioExportButton(props: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, { width: EXPORT_WIDTH, pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = `${props.name.toLowerCase().replace(/\s+/g, '-')}-bio.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('PlayerBioExportButton: PNG export failed', e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <button
        type="button" onClick={handleExport} disabled={exporting}
        className="font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition border-stone-200 text-stone-500 hover:border-[#FF5722] hover:text-[#FF5722] disabled:opacity-50 shrink-0"
      >
        {exporting ? 'Exporting…' : 'Export bio ↓'}
      </button>

      {/* Off-screen at a fixed real width for a consistent, crisp capture — never shown on-page. */}
      <div style={{ position: 'fixed', top: 0, left: -9999, pointerEvents: 'none' }} aria-hidden>
        <div ref={cardRef} style={{ width: EXPORT_WIDTH }}>
          <PlayerSnipCard {...props} />
        </div>
      </div>
    </>
  )
}
