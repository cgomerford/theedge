// src/lib/email/blocks/pitcher-card.ts
//
// Side-by-side starting pitcher card for the daily brief email.
// Away pitcher on the left, home pitcher on the right.
// MLB headshots from mlbstatic CDN, agate-style mono stats.

import { COLORS, FONTS } from '../layout'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PitcherInfo {
  /** MLB player ID — used for headshot URL. Null if TBD. */
  id: number | null
  fullName: string | null
  /** Short team name for the label above the pitcher, e.g. "Philadelphia" */
  teamCity: string
  /** Team primary colour for the monogram fallback */
  teamColor: string
  /** Season stats — null if unavailable or pitcher is TBD */
  stats: {
    era: string
    whip: string
    k_per_9: string
    wins?: number
    losses?: number
  } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function headshot(pitcher: PitcherInfo): string {
  if (pitcher.id && pitcher.fullName) {
    // Real MLB headshot — 48px circle, falls back to initials on broken image
    return `
    <img src="https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,g_face,w_180,h_180,q_auto:best/v1/people/${pitcher.id}/headshot/67/current"
         alt="${escapeHtml(pitcher.fullName)}"
         width="48" height="48"
         style="display:block;width:48px;height:48px;border-radius:50%;background:${COLORS.rowDivider};object-fit:cover;-ms-interpolation-mode:bicubic;border:1px solid ${COLORS.ink};">`
  }
  // TBD fallback — grey circle with "?"
  return `
  <div style="width:48px;height:48px;border-radius:50%;background:${COLORS.rowDivider};border:1px solid ${COLORS.ink};text-align:center;line-height:48px;font-family:${FONTS.mono};font-size:16px;font-weight:700;color:${COLORS.muted};">
    ?
  </div>`
}

function statLine(label: string, value: string): string {
  return `<tr><td style="padding:4px 0;font-family:${FONTS.mono};font-size:11px;color:#666;letter-spacing:0.06em;">
    ${label} <span style="color:${COLORS.ink};font-weight:700;">${escapeHtml(value)}</span>
  </td></tr>`
}

function oneSide(pitcher: PitcherInfo): string {
  const name = pitcher.fullName ?? 'TBD'
  const isKnown = pitcher.id !== null && pitcher.fullName !== null

  // Name block: headshot + team city + name
  const nameBlock = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="60" valign="top" style="padding-right:12px;">
        ${headshot(pitcher)}
      </td>
      <td valign="middle">
        <div style="font-family:${FONTS.mono};font-size:9px;letter-spacing:0.16em;color:${COLORS.muted};text-transform:uppercase;margin-bottom:3px;">
          ${escapeHtml(pitcher.teamCity)}
        </div>
        <div style="font-family:${FONTS.serif};font-size:17px;font-weight:600;color:${COLORS.ink};line-height:1.15;">
          ${escapeHtml(name)}
        </div>
      </td>
    </tr>
  </table>`

  // Stats block — only if pitcher is known and we have stats
  if (!isKnown || !pitcher.stats) {
    return `
    <td width="50%" valign="top" style="padding:0 8px;">
      ${nameBlock}
      <div style="margin-top:14px;border-top:1px solid ${COLORS.ink};padding-top:10px;font-family:${FONTS.serif};font-style:italic;font-size:13px;color:${COLORS.muted};">
        Starter to be determined.
      </div>
    </td>`
  }

  const record = pitcher.stats.wins !== undefined && pitcher.stats.losses !== undefined
    ? `${pitcher.stats.wins}–${pitcher.stats.losses}`
    : null

  return `
  <td width="50%" valign="top" style="padding:0 8px;">
    ${nameBlock}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px solid ${COLORS.ink};">
      <tr><td style="padding-top:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
      ${statLine('ERA&nbsp;&nbsp;', pitcher.stats.era)}
      ${statLine('WHIP', pitcher.stats.whip)}
      ${statLine('K/9&nbsp;&nbsp;', pitcher.stats.k_per_9)}
      ${record ? statLine('W-L&nbsp;&nbsp;', record) : ''}
    </table>
  </td>`
}

// ─── Main render ──────────────────────────────────────────────────────────────

/**
 * Renders a side-by-side pitcher card as a single <tr> row.
 * Away pitcher on the left, home pitcher on the right.
 */
export function pitcherCardBlock(away: PitcherInfo, home: PitcherInfo): string {
  return `
  <tr><td class="brief-pad" style="padding:32px 40px 0;">
    <div style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.16em;color:${COLORS.orange};text-transform:uppercase;margin-bottom:18px;">
      § Starting Pitchers
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${oneSide(away)}
        ${oneSide(home)}
      </tr>
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
    .replace(/"/g, '&quot;')
}