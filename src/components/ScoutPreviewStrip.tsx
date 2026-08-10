// src/components/ScoutPreviewStrip.tsx
//
// THE SCOUT PREVIEW STRIP — 3-line summary for each game card on /mlb.
//
// Sits below the standard "N of 8 factors lean X" line on the slate page's
// game cards. Renders the sharpest pitching / batting / bullpen row from
// tonight's Scout Report, with a click-through to the full 27 rows.
//
// The strip pulls exactly one row from each of pitching / batting / bullpen —
// the highest-weight row in each section, already computed by scout.ts and
// exposed as report.previewStrip. If a section is empty (e.g. batting
// tendencies not yet available), that line quietly drops. Nothing invented.
//
// SERVER COMPONENT — no client state needed. Drops straight into the /mlb
// game card map.

import Link from 'next/link'
import type { ScoutRow } from '@/lib/scout'

// ─── Brand tokens ──────────────────────────────────────────────────────
const CREAM = '#FAF8F3'
const ORANGE = '#FF5722'
const YELLOW = '#FDE047'
const BLACK = '#1A1A1A'
const STONE_200 = '#e7e5e4'
const STONE_400 = '#a8a29e'
const STONE_500 = '#78716c'
const STONE_800 = '#292524'

// ─── Types ─────────────────────────────────────────────────────────────
type Props = {
  previewStrip: {
    pitching?: ScoutRow
    batting?: ScoutRow
    bullpen?: ScoutRow
  }
  /** Total rows in the full scout report — drives the CTA ("all 27 ›") */
  actualCount: number
  /** Route target — usually /mlb/{slug}?tab=scout */
  href: string
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Trim a scout row's line into a preview-friendly form.
 * Rows in the tab are 15-25 words; the strip needs 8-14 words. Take the
 * first sentence (up to first period) or the first clause (up to first
 * em-dash) — whichever is shorter and still complete.
 */
function trimLine(line: string): string {
  // First sentence
  const firstPeriod = line.indexOf('.')
  const firstDash = line.indexOf('—')

  let candidate = line
  if (firstDash > 0 && firstDash < 90 && (firstPeriod < 0 || firstDash < firstPeriod)) {
    candidate = line.slice(0, firstDash).trim()
  } else if (firstPeriod > 0) {
    candidate = line.slice(0, firstPeriod).trim()
  }

  // Cap at ~110 chars — long enough for context, short enough for a card
  if (candidate.length > 110) {
    candidate = candidate.slice(0, 107).trim() + '…'
  }
  return candidate
}

/**
 * Renders a preview line with the highlight substring bolded (no yellow
 * underline in the strip — the card is small, keep it visually calm).
 */
function renderPreviewLine(line: string, highlight?: string) {
  const trimmed = trimLine(line)
  if (!highlight) return <>{trimmed}</>

  // Try to find the highlight in the trimmed line; if it's been chopped off,
  // just render the trimmed line without highlight.
  const idx = trimmed.toLowerCase().indexOf(highlight.toLowerCase())
  if (idx === -1) return <>{trimmed}</>

  const before = trimmed.slice(0, idx)
  const match = trimmed.slice(idx, idx + highlight.length)
  const after = trimmed.slice(idx + highlight.length)
  return (
    <>
      {before}
      <span style={{ fontWeight: 700, color: BLACK }}>{match}</span>
      {after}
    </>
  )
}

// ─── Preview line component ────────────────────────────────────────────

function PreviewLine({ row }: { row: ScoutRow }) {
  return (
    <li
      className="font-serif"
      style={{
        fontSize: 13.5,
        lineHeight: 1.5,
        color: STONE_800,
        padding: '3px 0 3px 14px',
        position: 'relative',
        listStyle: 'none',
      }}
    >
      <span
        className="font-mono"
        style={{
          position: 'absolute',
          left: 0,
          color: ORANGE,
        }}
      >
        ›
      </span>
      {renderPreviewLine(row.line, row.highlight)}
      <span
        className="font-mono"
        style={{ fontSize: 10.5, color: STONE_500, marginLeft: 6 }}
      >
        · {row.sampleTag}
      </span>
    </li>
  )
}

// ─── Main strip component ──────────────────────────────────────────────

export default function ScoutPreviewStrip({ previewStrip, actualCount, href }: Props) {
  const { pitching, batting, bullpen } = previewStrip

  // If nothing to preview, render nothing — the card will just show the
  // standard factors line without a scout block.
  if (!pitching && !batting && !bullpen) return null

  // Which sections actually have a preview line — drives the label suffix
  const sections: string[] = []
  if (pitching) sections.push('pitching')
  if (batting) sections.push('batting')
  if (bullpen) sections.push('bullpen')

  return (
    <>
      {/* Preview block */}
      <div style={{ padding: '10px 14px', background: CREAM }}>
        <div
          className="font-mono"
          style={{
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: ORANGE,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          ⊕ Scout preview
          <span style={{ color: STONE_500, marginLeft: 8, fontWeight: 400 }}>
            · {sections.join(' · ')}
          </span>
        </div>

        <ul style={{ margin: 0, padding: 0 }}>
          {pitching && <PreviewLine row={pitching} />}
          {batting && <PreviewLine row={batting} />}
          {bullpen && <PreviewLine row={bullpen} />}
        </ul>
      </div>

      {/* CTA */}
      <div
        style={{
          padding: '8px 14px',
          background: '#fff',
          borderTop: `1px solid ${STONE_200}`,
        }}
      >
        <Link
          href={href}
          className="font-mono"
          style={{
            fontSize: 10.5,
            color: ORANGE,
            textDecoration: 'none',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Full scout report — all {actualCount} ›
        </Link>
      </div>
    </>
  )
}