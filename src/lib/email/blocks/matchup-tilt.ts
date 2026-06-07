// src/lib/email/blocks/matchup-tilt.ts
//
// Editorial cream-on-cream Matchup Tilt panel for the daily brief.
// Replaces the old dark-box version at src/lib/matchup-tilt-email.ts.
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

// Neutral dot colour (for components within EDGE_TIGHT of zero)
const NEUTRAL_DOT = '#C7C2B6'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
 * Eight factor dots, one per component, coloured by which side that
 * component tilts toward.
 */
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

// ─── Main render ──────────────────────────────────────────────────────────────

/**
 * Renders the Matchup Tilt panel as one or more <tr> rows.
 * Designed to be concatenated into the daily-brief body alongside other
 * row helpers from layout.ts. Self-pads to the 40px brief gutter.
 */
export function matchupTiltBlock(data: MatchupTiltData): string {
  const { home, away, components } = data
  const { homeCount, awayCount } = holdsCount(data)

  // Component rows: label (left), edge label (right), italic summary beneath,
  // hairline between rows (skipped on first row).
  const rows = COMPONENTS.map(({ key, label }, idx) => {
    const comp = components[key]
    return `
    <tr><td style="padding:12px 0;${idx > 0 ? `border-top:1px solid ${COLORS.rowDivider};` : ''}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${FONTS.mono};font-size:11px;font-weight:700;color:${COLORS.ink};letter-spacing:0.04em;">
            ${label}
          </td>
          <td align="right">
            ${edgeLabel(comp.tilt, home, away)}
          </td>
        </tr>
        <tr><td colspan="2" style="padding-top:6px;font-family:${FONTS.serif};font-style:italic;font-size:14px;color:${COLORS.body};line-height:1.5;">
          ${escapeHtml(comp.summary)}
        </td></tr>
      </table>
    </td></tr>`
  }).join('')

  return `
  <tr><td class="brief-pad" style="padding:0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.ink};border-bottom:1px solid ${COLORS.ink};">

      <!-- Tilt header: kicker left, holds-count right -->
      <tr><td style="padding:20px 0 4px;">
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

      <!-- Factor dots -->
      <tr><td style="padding:14px 0 18px;" align="center">
        ${factorDots(data)}
      </td></tr>

      <!-- Component rows -->
      ${rows}

      <!-- Trailing breathing room before the bottom hairline -->
      <tr><td style="padding-bottom:6px;font-size:0;line-height:0;">&nbsp;</td></tr>

    </table>
  </td></tr>`
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}