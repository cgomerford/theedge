// src/lib/email/blocks/matchup-tilt.ts
//
// CONDENSED for daily brief — replaces the previous full 8-factor,
// all-subfactors version. That version was technically correct but never
// matched the agreed design (see chat mockup): a short Edge Indicator
// (lean headline + tilt bar + team logos) plus a 3-line "Scout Report"
// teaser and a CTA to read the full breakdown on the site. Long-form
// factor-by-factor detail stays on the live game page — email is meant to
// stay narrative and light per the brand voice rules, not reproduce the
// whole Scout Report tab.
//
// Scout Report lines are NOT new invented copy — they reuse the same
// per-factor `summary` strings already computed in buildMatchupTiltData
// (pitchingSummary/bullpenSummary/etc in matchup-tilt.ts), picking the 3
// factors with the strongest |tilt| as the most decision-relevant ones to
// surface. Real analysis, not placeholder text.

import type { MatchupTiltData } from '@/lib/matchup-tilt'
import { COLORS, FONTS, SITE_URL } from '../layout'

const COMPONENT_LABELS: Record<keyof MatchupTiltData['components'], string> = {
  pitching: 'Pitching',
  bullpen: 'Bullpen',
  offense: 'Batting',
  matchup: 'Matchup',
  park: 'Park',
  weather: 'Weather',
  defense: 'Defense',
  rest: 'Rest',
}

const EDGE_TIGHT = 5
const EDGE_LIGHT = 20
const EDGE_HEAVY = 50

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

function teamLogoUrl(teamId: number | null | undefined): string | null {
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null
}

function holdsCount(data: MatchupTiltData): { homeCount: number; awayCount: number } {
  const tilts = Object.values(data.components).map(c => c.tilt)
  return {
    homeCount: tilts.filter(t => t > EDGE_TIGHT).length,
    awayCount: tilts.filter(t => t < -EDGE_TIGHT).length,
  }
}

function leanHeadline(data: MatchupTiltData): { text: string; color: string } {
  const { home, away } = data
  const { homeCount, awayCount } = holdsCount(data)

  if (homeCount === awayCount) {
    return { text: 'The data is split — dig into the factors on the site.', color: COLORS.muted }
  }

  const leanTeam = homeCount > awayCount ? home : away
  const leanCount = Math.max(homeCount, awayCount)
  const color = homeCount > awayCount ? home.primaryColor : away.primaryColor
  const strength = leanCount >= 6 ? 'clearly favour' : leanCount >= 4 ? 'lean' : 'slightly lean'

  return { text: `${leanCount} of 8 factors ${strength} ${leanTeam.abbr}`, color }
}

/** Top 3 factors by |tilt| — the most decision-relevant, for the Scout Report teaser. */
function topFactors(data: MatchupTiltData): Array<{ label: string; summary: string }> {
  const entries = (Object.keys(data.components) as Array<keyof MatchupTiltData['components']>)
    .map(key => ({ key, label: COMPONENT_LABELS[key], ...data.components[key] }))
    .sort((a, b) => Math.abs(b.tilt) - Math.abs(a.tilt))
  return entries.slice(0, 3).map(e => ({ label: e.label, summary: e.summary }))
}

export function matchupTiltBlock(data: MatchupTiltData, previewSlug: string): string {
  const { home, away } = data
  const homeLogo = teamLogoUrl(home.teamId)
  const awayLogo = teamLogoUrl(away.teamId)
  const { homeCount, awayCount } = holdsCount(data)
  const homePct = Math.max(6, Math.min(94, 50 + (homeCount - awayCount) * (44 / 8)))
  const awayPct = 100 - homePct
  const lean = leanHeadline(data)
  const factors = topFactors(data)
  const reportUrl = `${SITE_URL}/mlb/${previewSlug}`

  // ── Condensed Edge Indicator ──
  const indicator = `
  <tr><td class="brief-pad" style="padding:20px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLORS.ink};">
      <tr><td style="padding:14px 18px;">
        <div style="font-family:${FONTS.mono};font-size:9px;letter-spacing:0.16em;color:${COLORS.orange};text-transform:uppercase;margin-bottom:10px;">
          ⊕ Edge Indicator
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;margin-bottom:8px;">
          <tr>
            <td width="${awayPct.toFixed(1)}%" style="height:8px;background:${away.primaryColor};font-size:0;line-height:0;">&nbsp;</td>
            <td width="${homePct.toFixed(1)}%" style="height:8px;background:${home.primaryColor};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              ${awayLogo ? `<img src="${awayLogo}" width="16" height="16" alt="${escapeHtml(away.abbr)}" style="display:inline-block;vertical-align:middle;margin-right:6px;">` : ''}
              <span style="font-family:${FONTS.mono};font-size:12px;font-weight:700;color:${lean.color};">${escapeHtml(lean.text)}</span>
              ${homeLogo ? `<img src="${homeLogo}" width="16" height="16" alt="${escapeHtml(home.abbr)}" style="display:inline-block;vertical-align:middle;margin-left:6px;">` : ''}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>`

  // ── Scout Report teaser ──
  const factorRows = factors.map((f, i) => `
    <tr><td style="padding:6px 0;${i > 0 ? `border-top:1px solid ${COLORS.rowDivider};` : ''}font-family:${FONTS.serif};font-size:13px;color:${COLORS.ink};line-height:1.5;">
      <strong>${escapeHtml(f.label)} —</strong> ${escapeHtml(f.summary)}
    </td></tr>`).join('')

  const scoutReport = `
  <tr><td class="brief-pad" style="padding:16px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLORS.ink};">
      <tr><td style="padding:16px 18px 4px;">
        <div style="font-family:${FONTS.mono};font-size:9px;letter-spacing:0.16em;color:${COLORS.orange};text-transform:uppercase;">
          § Scout Report
        </div>
      </td></tr>
      <tr><td style="padding:8px 18px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${factorRows}
        </table>
      </td></tr>
      <tr><td style="padding:12px 18px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="background:${COLORS.ink};">
            <a href="${reportUrl}" style="display:block;padding:11px 20px;font-family:${FONTS.mono};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.cream};text-decoration:none;">
              Read the full Scout Report →
            </a>
          </td></tr>
        </table>
        <div style="font-family:${FONTS.serif};font-style:italic;font-size:11px;color:${COLORS.muted};margin-top:8px;">
          Pitch location grids, hot zones, and the full breakdown are on the site.
        </div>
      </td></tr>
    </table>
  </td></tr>`

  return indicator + scoutReport
}