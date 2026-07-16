// src/lib/email/blocks/matchup-tilt.ts
//
// Editorial cream-on-cream Matchup Tilt panel for the daily brief.
// Rewritten to mirror the live page's EdgeIndicator/FactorBar visual
// language: a hero lean headline ("3 of 8 factors clearly favour PHI")
// and a proportional two-tone bar per factor, not just a dot.
//
// Signature unchanged from the previous version — game-card.ts does not
// need to change to pick this up.
//
// The home/away swap bug came from emails.ts passing positional args in
// the wrong order. This file is typed strictly: it only takes
// MatchupTiltData, which has explicit `home` and `away` keys, so the
// caller cannot misorder them.

import type { MatchupTiltData } from '@/lib/matchup-tilt'
import { COLORS, FONTS } from '../layout'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPONENTS: Array<{ key: keyof MatchupTiltData['components']; label: string }> = [
  { key: 'pitching', label: 'Starting Pitching' },
  { key: 'bullpen',  label: 'Bullpen' },
  { key: 'offense',  label: 'Offensive Form' },
  { key: 'matchup',  label: 'Pitch Matchups' },
  { key: 'park',     label: 'Park Factor' },
  { key: 'weather',  label: 'Weather' },
  { key: 'defense',  label: 'Defense' },
  { key: 'rest',     label: 'Rest & Travel' },
]

// Tilt thresholds — keep aligned with /lib/matchup-tilt.ts
const EDGE_TIGHT = 5   // within ±5 → EVEN
const EDGE_LIGHT = 20  // 5–20 → SLIGHT
const EDGE_HEAVY = 50  // ≥50 → ↑↑

const NEUTRAL_DOT = '#C7C2B6'
const TRACK_BG = '#EDE8DC'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Edge label for one row, e.g. "PHI EDGE ↑↑" or "EVEN".
 * Positive tilt = home edge. Negative tilt = away edge.
 */
function edgeLabel(
  tilt: number,
  home: { abbr: string; primaryColor: string },
  away: { abbr: string; primaryColor: string },
): string {
  if (Math.abs(tilt) <= EDGE_TIGHT) {
    return `<span style="font-family:${FONTS.mono};font-size:10px;color:${COLORS.muted};letter-spacing:0.04em;">EVEN</span>`
  }
  const isHome = tilt > 0
  const abbr = isHome ? home.abbr : away.abbr
  const color = isHome ? home.primaryColor : away.primaryColor
  const mag = Math.abs(tilt)
  const strength = mag >= EDGE_HEAVY ? 'EDGE ↑↑' : mag >= EDGE_LIGHT ? 'EDGE ↑' : 'SLIGHT'
  return `<span style="font-family:${FONTS.mono};font-size:11px;font-weight:700;color:${color};letter-spacing:0.06em;">${abbr} ${strength}</span>`
}

/**
 * Proportional two-tone bar for one factor — email-safe version of the
 * live page's FactorBar slider. Table cells with percentage widths render
 * reliably across Gmail, Apple Mail, and Outlook (unlike CSS flex/grid).
 * tilt=0 → 50/50 split. tilt=±100 → clamped 6/94 split.
 */
function factorBar(tilt: number, home: { primaryColor: string }, away: { primaryColor: string }): string {
  const homePct = Math.max(6, Math.min(94, 50 + tilt * 0.44))
  const awayPct = 100 - homePct
  const homeOpacity = tilt > EDGE_TIGHT ? 1 : 0.35
  const awayOpacity = tilt < -EDGE_TIGHT ? 1 : 0.35

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
    <tr>
      <td width="${awayPct.toFixed(1)}%" style="height:6px;background:${away.primaryColor};opacity:${awayOpacity};font-size:0;line-height:0;">&nbsp;</td>
      <td width="${homePct.toFixed(1)}%" style="height:6px;background:${home.primaryColor};opacity:${homeOpacity};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>`
}

/** Eight compact dots — quick-glance overview above the detailed rows. */
function factorDots(data: MatchupTiltData): string {
  const cells = COMPONENTS.map(({ key }) => {
    const tilt = data.components[key].tilt
    const color =
      tilt > EDGE_TIGHT ? data.home.primaryColor :
      tilt < -EDGE_TIGHT ? data.away.primaryColor :
      NEUTRAL_DOT
    return `<td width="14" align="center" style="padding:0 3px;"><div style="width:9px;height:9px;border-radius:50%;background:${color};font-size:0;line-height:0;">&nbsp;</div></td>`
  }).join('')

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
    <tr>${cells}</tr>
  </table>`
}

/** Counts how many components tilt to each side (within EDGE_TIGHT = neutral). */
function holdsCount(data: MatchupTiltData): { homeCount: number; awayCount: number } {
  const tilts = COMPONENTS.map(({ key }) => data.components[key].tilt)
  return {
    homeCount: tilts.filter(t => t > EDGE_TIGHT).length,
    awayCount: tilts.filter(t => t < -EDGE_TIGHT).length,
  }
}

/**
 * "3 of 8 factors clearly favour PHI" — same language and threshold
 * logic as EdgeIndicator.tsx's buildEdgeSummary() on the live page.
 * This is the hook: the single line most likely to make someone click
 * through to the full preview.
 */
function leanHeadline(data: MatchupTiltData): string {
  const { home, away } = data
  const { homeCount, awayCount } = holdsCount(data)

  if (homeCount === awayCount) {
    return `<span style="font-family:${FONTS.serif};font-style:italic;font-size:17px;color:${COLORS.muted};">The data is split — dig into the factors below.</span>`
  }

  const leanTeam = homeCount > awayCount ? home : away
  const leanCount = Math.max(homeCount, awayCount)
  const color = homeCount > awayCount ? home.primaryColor : away.primaryColor
  const strength = leanCount >= 6 ? 'clearly favour' : leanCount >= 4 ? 'lean' : 'slightly lean'

  return `<span style="font-family:${FONTS.serif};font-style:italic;font-weight:600;font-size:17px;color:${color};">${leanCount} of 8 factors ${strength} ${escapeHtml(leanTeam.abbr)}</span>`
}

// ─── Main render ──────────────────────────────────────────────────────────────

/**
 * Renders the Matchup Tilt panel as one or more <tr> rows.
 * Designed to be concatenated into the daily-brief body alongside other
 * row helpers from layout.ts. Self-pads to the 40px brief gutter.
 */
export function matchupTiltBlock(data: MatchupTiltData): string {
  const { home, away, components } = data
  const { homeCount, awayCount } = holdsCount(data)

  const rows = COMPONENTS.map(({ key, label }, idx) => {
    const comp = components[key]
    return `
    <tr><td style="padding:14px 0;${idx > 0 ? `border-top:1px solid ${COLORS.rowDivider};` : ''}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${FONTS.mono};font-size:11px;font-weight:700;color:${COLORS.ink};letter-spacing:0.04em;">
            ${label}
          </td>
          <td align="right">
            ${edgeLabel(comp.tilt, home, away)}
          </td>
        </tr>
        <tr><td colspan="2" style="padding:8px 0 6px;">
          ${factorBar(comp.tilt, home, away)}
        </td></tr>
        <tr><td colspan="2" style="font-family:${FONTS.serif};font-style:italic;font-size:14px;color:${COLORS.body};line-height:1.5;">
          ${escapeHtml(comp.summary)}
        </td></tr>
      </table>
    </td></tr>`
  }).join('')

  return `
  <tr><td class="brief-pad" style="padding:0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.ink};border-bottom:1px solid ${COLORS.ink};">

      <!-- Tilt header: kicker left, holds-count right -->
      <tr><td style="padding:20px 0 2px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.16em;color:${COLORS.orange};text-transform:uppercase;">
              § Matchup Tilt
            </td>
            <td align="right" style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.12em;color:${COLORS.muted};text-transform:uppercase;">
              <span style="color:${away.primaryColor};font-weight:700;">${escapeHtml(away.abbr)} hold ${awayCount}</span>
              &nbsp;·&nbsp;
              <span style="color:${home.primaryColor};font-weight:700;">${escapeHtml(home.abbr)} hold ${homeCount}</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Hero lean headline -->
      <tr><td style="padding:6px 0 16px;">
        ${leanHeadline(data)}
      </td></tr>

      <!-- Factor dots — quick overview -->
      <tr><td style="padding:0 0 18px;" align="center">
        ${factorDots(data)}
      </td></tr>

      <!-- Component rows — label, bar, summary -->
      ${rows}

      <!-- Trailing breathing room before the bottom hairline -->
      <tr><td style="padding-bottom:6px;font-size:0;line-height:0;">&nbsp;</td></tr>

    </table>
  </td></tr>`
}