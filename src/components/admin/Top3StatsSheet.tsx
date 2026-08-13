// src/components/admin/Top3StatsSheet.tsx
//
// Renders the Top3StatsPayload as a fixed A4-dimension printable sheet
// (794×1123px, 96dpi) and exports it as a single-page PDF.
//
// EXPORT MECHANISM: same pattern as StatCardPanel.tsx — html-to-image's
// toPng() rather than html2canvas, for reliable next/font (Fraunces/Bebas
// Neue/JetBrains Mono) rendering. The preview is visually scaled down with
// a CSS transform on an OUTER wrapper; the ref is on the unscaled inner
// stage, so the exported image is always captured at true 794×1123 size —
// same trick StatCardPanel uses for its scaled preview.
//
// Install if not already present:
//   npm install html-to-image jspdf
//
// IMAGES / CORS: headshots and team logos are loaded from the public MLB
// CDN with crossOrigin="anonymous" so toPng can read pixel data without
// tainting the canvas. If an image 404s or CORS blocks it, this falls back
// to an initials/blank badge rather than leaving a broken image in the
// export — empty state beats a broken PDF. If you find the whole export
// failing silently, check the browser console first: an untainted-canvas
// error there means one of the CDN images didn't get the CORS header this
// run and toPng refused to read the canvas.
//
// LEVEL LABEL: the page header used to hardcode "/ yesterday's stats". The
// caller (yesterday-stats/page.tsx) now passes a per-level levelLabel
// (e.g. "yesterday's stats · AAA") so MLB/AAA/AA sheets are visually
// distinguishable when exported as separate PDFs — otherwise all three
// PDFs render an identical header and only the filename tells them apart.

'use client'

import { forwardRef, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { playerHeadshotUrl, teamLogoUrlPng } from '@/lib/mlb'
import type { Top3StatsPayload, Top3Category, Top3Entry } from '@/types/live-tracker'

const COLORS = {
  cream: '#FAF8F3',
  orange: '#FF5722',
  stone: '#1A1A1A',
  gray: '#A3A3A3',
  line: '#E2DCCF',
} as const

const A4 = { w: 794, h: 1123 }

const DEFAULT_LEVEL_LABEL = "yesterday's stats"

function initialsOf(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

// ── Image sub-components with graceful fallback ────────────────────────

function Headshot({ playerId, name, size }: { playerId: number | null; name: string | null; size: number }) {
  const [failed, setFailed] = useState(false)
  if (!playerId || failed) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          background: COLORS.stone, color: COLORS.cream,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-jetbrains), monospace', fontSize: size * 0.32, fontWeight: 700,
        }}
      >
        {initialsOf(name)}
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playerHeadshotUrl(playerId, 120)}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      alt=""
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${COLORS.line}` }}
    />
  )
}

function TeamBadge({ teamId, size }: { teamId: number | null; size: number }) {
  const [failed, setFailed] = useState(false)
  if (!teamId || failed) {
    return <div style={{ width: size, height: size, flexShrink: 0, background: COLORS.line }} />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={teamLogoUrlPng(teamId, 80)}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      alt=""
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  )
}

// ── Category card ────────────────────────────────────────────────────────

function CategoryCard({ cat }: { cat: Top3Category }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.line}`, background: '#fff',
        display: 'flex', flexDirection: 'column', padding: '7px 8px', overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-jetbrains), monospace', fontSize: 7.5, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.05em', color: COLORS.orange,
          borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 4, marginBottom: 4, flexShrink: 0,
        }}
      >
        {cat.label}
      </div>

      {cat.entries.length === 0 ? (
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), monospace', fontSize: 7.5, color: COLORS.gray,
            fontStyle: 'italic', flex: 1, display: 'flex', alignItems: 'center',
          }}
        >
          No qualifying performance
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, justifyContent: 'center' }}>
          {cat.entries.map((e: Top3Entry) => (
            <div key={e.rank} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 7.5, color: COLORS.gray, width: 8, flexShrink: 0 }}>
                {e.rank}
              </div>
              {e.playerId != null
                ? <Headshot playerId={e.playerId} name={e.playerName} size={20} />
                : <TeamBadge teamId={e.teamId} size={20} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-inter), Inter, sans-serif', fontSize: 8, fontWeight: 600, color: COLORS.stone,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {e.playerName ?? e.teamAbbr ?? '—'}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains), monospace', fontSize: 6.5, color: COLORS.gray,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {e.teamAbbr ?? ''}{e.opponentAbbr ? ` vs ${e.opponentAbbr}` : ''}
                </div>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains), monospace', fontSize: 8.5, fontWeight: 700, color: COLORS.stone,
                  whiteSpace: 'nowrap', flexShrink: 0, textAlign: 'right',
                }}
              >
                {e.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── A4 stage — this is the exact node captured by toPng ─────────────────

type Top3StatsStageProps = {
  payload: Top3StatsPayload
  levelLabel?: string
}

export const Top3StatsStage = forwardRef<HTMLDivElement, Top3StatsStageProps>(
  function Top3StatsStage({ payload, levelLabel }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: A4.w, height: A4.h, background: COLORS.cream, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', padding: 20,
          border: `3px solid ${COLORS.stone}`, fontFamily: 'var(--font-inter), Inter, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            borderBottom: `3px solid ${COLORS.stone}`, paddingBottom: 10, marginBottom: 12, flexShrink: 0,
          }}
        >
          <div style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 800, fontSize: 22, letterSpacing: '-0.3px' }}>
            <span style={{ color: COLORS.orange }}>⊕</span> THE EDGE{' '}
            <span style={{ fontWeight: 400, fontSize: 13, color: COLORS.gray }}>/ {levelLabel ?? DEFAULT_LEVEL_LABEL}</span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains), monospace', fontSize: 9.5, color: COLORS.gray,
              textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right',
            }}
          >
            {payload.date}
            <br />
            {payload.gamesIncluded} games{payload.gamesMissing > 0 ? ` · ${payload.gamesMissing} unavailable` : ''}
          </div>
        </div>

        <div
          style={{
            flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(5, 1fr)', gap: 6, overflow: 'hidden',
          }}
        >
          {payload.categories.map(cat => <CategoryCard key={cat.category} cat={cat} />)}
        </div>

        <div
          style={{
            flexShrink: 0, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${COLORS.line}`,
            fontFamily: 'var(--font-jetbrains), monospace', fontSize: 7, color: COLORS.gray,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}
        >
          § Source: MLB Stats API — literal box-score / pitch-log stats, no model score · edgereportdaily.com
        </div>
      </div>
    )
  }
)

// ── Panel — export button + scaled preview ───────────────────────────────

type Top3StatsSheetProps = {
  payload: Top3StatsPayload
  levelLabel?: string
}

export default function Top3StatsSheet({ payload, levelLabel }: Top3StatsSheetProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExportPdf() {
    if (!stageRef.current) return
    setExporting(true)
    setError(null)
    try {
      const dataUrl = await toPng(stageRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: COLORS.cream })
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [A4.w, A4.h] })
      pdf.addImage(dataUrl, 'PNG', 0, 0, A4.w, A4.h)
      pdf.save(`the-edge-yesterday-stats-${payload.date}.pdf`)
    } catch (err) {
      console.error('Top3 sheet PDF export failed:', err)
      setError('Export failed — check the console. A CORS-tainted canvas from a headshot/logo image is the most likely cause.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button onClick={handleExportPdf} disabled={exporting} className="t3-export-btn">
          {exporting ? 'Exporting…' : 'Export A4 PDF'}
        </button>
        {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: COLORS.orange }}>{error}</span>}
      </div>

      <div style={{ background: '#e5e1d6', padding: 24, display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
        <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
          <Top3StatsStage ref={stageRef} payload={payload} levelLabel={levelLabel} />
        </div>
      </div>

      <style>{`
        .t3-export-btn{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;background:#FF5722;color:#fff;border:none;padding:9px 18px;cursor:pointer}
        .t3-export-btn:hover{background:#e64a19}
        .t3-export-btn:disabled{opacity:.5;cursor:default}
      `}</style>
    </div>
  )
}