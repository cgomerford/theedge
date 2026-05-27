// src/lib/matchup-tilt-email.ts
//
// Generates a table-based HTML block for the daily brief email.
// Uses only inline styles — no CSS classes, no flexbox, no grid.
// Safe for Gmail, Apple Mail, Outlook, Yahoo.
//
// Usage in emails.ts:
//
//   import { generateMatchupTiltEmailBlock } from './matchup-tilt-email';
//   import { buildMatchupTiltData } from './matchup-tilt';
//   import type { ComponentsRaw } from './matchup-tilt';
//
//   // Inside your email builder, per game:
//   const tiltData = prediction.components_raw
//     ? buildMatchupTiltData(
//         prediction.components_raw as ComponentsRaw,
//         { abbr: homeAbbr, name: homeName, primaryColor: homeColor },
//         { abbr: awayAbbr, name: awayName, primaryColor: awayColor },
//         venue, gameTime,
//       )
//     : null;
//
//   const tiltHtml = tiltData ? generateMatchupTiltEmailBlock(tiltData) : '';
//
//   // Insert into your email template where EdgeIndicator block was:
//   const emailHtml = `
//     ...
//     ${storyLeadHtml}
//     ${tiltHtml}
//     ${narrativeHtml}
//     ...
//   `;

import type { MatchupTiltData } from './matchup-tilt'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Renders a 10-cell mini tilt bar for email.
 * Each cell is a tiny <td> coloured home/away/neutral.
 */
function emailBar(
  tilt: number,
  homeColor: string,
  awayColor: string,
): string {
  const CELLS = 10;
  const MID = Math.floor(CELLS / 2);
  const filled = Math.round((Math.abs(tilt) / 100) * MID);
  const isHome = tilt > 5;
  const isAway = tilt < -5;
  const activeColor = isHome ? homeColor : isAway ? awayColor : '#A3A3A3';

  let cells = '';
  for (let i = 0; i < CELLS; i++) {
    const isHomeFill = isHome && i >= MID && i < MID + filled;
    const isAwayFill = isAway && i < MID && i >= MID - filled;
    const bg = isHomeFill || isAwayFill ? activeColor : '#E8E4DA';
    cells += `<td width="16" height="6" style="background:${bg};border-radius:3px;padding:0;font-size:0;line-height:0;">&nbsp;</td>`;
  }

  return `<table cellpadding="0" cellspacing="2" border="0" style="display:inline-table;"><tr>${cells}</tr></table>`;
}

/**
 * Returns edge label HTML for email (e.g. "PHI EDGE ↑").
 */
function emailEdgeLabel(
  tilt: number,
  homeAbbr: string,
  awayAbbr: string,
  homeColor: string,
  awayColor: string,
): string {
  if (Math.abs(tilt) <= 5) {
    return `<span style="color:#A3A3A3;font-family:monospace;font-size:10px;">EVEN</span>`;
  }
  const isHome = tilt > 0;
  const abbr = isHome ? homeAbbr : awayAbbr;
  const color = isHome ? homeColor : awayColor;
  const strength =
    Math.abs(tilt) >= 50
      ? 'EDGE ↑↑'
      : Math.abs(tilt) >= 20
        ? 'EDGE ↑'
        : 'SLIGHT';
  return `<span style="color:${color};font-weight:700;font-family:monospace;font-size:10px;">${abbr} ${strength}</span>`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateMatchupTiltEmailBlock(
  data: MatchupTiltData,
): string {
  const { home, away, venue, gameTime, components } = data;

  const keys: Array<{
    key: keyof typeof components;
    label: string;
  }> = [
    { key: 'pitching', label: 'Starting Pitching' },
    { key: 'bullpen', label: 'Bullpen' },
    { key: 'offense', label: 'Offensive Form' },
    { key: 'matchup', label: 'Pitch Matchups' },
    { key: 'park', label: 'Park Factor' },
    { key: 'weather', label: 'Weather' },
    { key: 'defense', label: 'Defense' },
    { key: 'rest', label: 'Rest & Travel' },
  ];

  const allTilts = keys.map((k) => components[k.key].tilt);
  const homeCount = allTilts.filter((t) => t > 5).length;
  const awayCount = allTilts.filter((t) => t < -5).length;

  // Build component rows
  const rows = keys
    .map(({ key, label }) => {
      const comp = components[key];
      const bar = emailBar(comp.tilt, home.primaryColor, away.primaryColor);
      const edge = emailEdgeLabel(
        comp.tilt,
        home.abbr,
        away.abbr,
        home.primaryColor,
        away.primaryColor,
      );

      return `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #F0EDE6;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="120" style="font-family:monospace;font-size:11px;font-weight:700;color:#1A1A1A;vertical-align:middle;">
                ${label}
              </td>
              <td style="vertical-align:middle;padding:0 6px;">
                ${bar}
              </td>
              <td width="80" style="text-align:right;vertical-align:middle;">
                ${edge}
              </td>
            </tr>
            <tr>
              <td colspan="3" style="font-family:monospace;font-size:10px;color:#A3A3A3;padding-top:2px;line-height:1.4;">
                ${comp.summary}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  // Factor dots (8 coloured circles)
  const dots = keys
    .map(({ key }) => {
      const t = components[key].tilt;
      const color =
        t > 5 ? home.primaryColor : t < -5 ? away.primaryColor : '#555';
      return `<td width="10" height="10" style="padding:0 2px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
      </td>`;
    })
    .join('');

  return `
<!-- ═══ Matchup Tilt Email Block ═══ -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
  style="border-radius:12px;overflow:hidden;margin:16px 0;border:1px solid #E8E4DA;">

  <!-- ── Header (dark) ────────────────────────────────────────────────── -->
  <tr>
    <td style="background:#1A1A1A;padding:18px 20px 14px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">

        <!-- Label + time -->
        <tr>
          <td style="font-family:monospace;font-size:10px;color:#555;letter-spacing:0.12em;">
            § MATCHUP TILT
          </td>
          <td style="text-align:right;font-family:monospace;font-size:10px;color:#555;">
            ${gameTime}
          </td>
        </tr>

        <!-- Team names -->
        <tr>
          <td colspan="2" style="padding-top:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:900;color:${home.primaryColor};letter-spacing:-0.02em;">
                  ${home.abbr}
                  <br/>
                  <span style="font-size:10px;font-weight:400;color:#555;letter-spacing:0.08em;font-family:monospace;">HOME</span>
                </td>
                <td style="text-align:center;font-family:monospace;font-size:10px;color:#444;letter-spacing:0.1em;vertical-align:middle;">
                  vs
                </td>
                <td style="text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:900;color:${away.primaryColor};letter-spacing:-0.02em;">
                  ${away.abbr}
                  <br/>
                  <span style="font-size:10px;font-weight:400;color:#555;letter-spacing:0.08em;font-family:monospace;">AWAY</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Factor dots -->
        <tr>
          <td colspan="2" style="padding-top:12px;text-align:center;">
            <table cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>${dots}</tr>
            </table>
          </td>
        </tr>

        <!-- Factor count -->
        <tr>
          <td colspan="2" style="padding-top:6px;text-align:center;font-family:monospace;font-size:11px;color:#666;">
            <span style="color:${home.primaryColor};font-weight:700;">${home.abbr} holds ${homeCount}</span>
            &nbsp;·&nbsp;
            <span style="color:${away.primaryColor};font-weight:700;">${away.abbr} holds ${awayCount}</span>
          </td>
        </tr>

      </table>
    </td>
  </tr>

  <!-- ── Component rows (cream) ───────────────────────────────────────── -->
  <tr>
    <td style="background:#FAF8F3;padding:4px 20px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows}
      </table>
    </td>
  </tr>

  <!-- ── Pro CTA footer (dark) ────────────────────────────────────────── -->
  <tr>
    <td style="background:#1A1A1A;padding:14px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:monospace;font-size:11px;color:#FDE047;font-weight:700;letter-spacing:0.06em;">
            ⊕ WANT THE FULL BREAKDOWN?
          </td>
          <td style="text-align:right;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://www.edgereportdaily.com/pricing" style="height:28px;v-text-anchor:middle;width:90px;" arcsize="20%" strokecolor="#FF5722" fillcolor="#FF5722">
            <center style="color:#ffffff;font-family:monospace;font-size:11px;font-weight:700;">Unlock →</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="https://www.edgereportdaily.com/pricing"
               style="background:#FF5722;color:#ffffff;font-family:monospace;font-size:11px;font-weight:700;letter-spacing:0.06em;text-decoration:none;padding:6px 14px;border-radius:6px;display:inline-block;line-height:1.4;">
              Unlock →
            </a>
            <!--<![endif]-->
          </td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:monospace;font-size:10px;color:#555;padding-top:4px;">
            Every sub-factor, every game — see what's driving the edge.
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Venue line ───────────────────────────────────────────────────── -->
  <tr>
    <td style="background:#FAF8F3;text-align:center;padding:8px 0;font-family:monospace;font-size:9px;color:#C0BBB0;letter-spacing:0.12em;">
      § ${venue.toUpperCase()}
    </td>
  </tr>

</table>
<!-- ═══ End Matchup Tilt Email Block ═══ -->
`;
}