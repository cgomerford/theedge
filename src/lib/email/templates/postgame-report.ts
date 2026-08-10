// src/lib/email/templates/postgame-report.ts
//
// Builds the postgame report email. Reuses the shared shell from
// src/lib/email/layout.ts (COLORS, FONTS, hairline(), kicker(), SITE_URL) —
// I only had a fragment of that file in front of me, so two assumptions to
// verify when you're back:
//
//   1. `wrapEmail({ title, preheader, body })` exists and returns the full
//      <html> document — that's what the top-of-file comment in layout.ts
//      describes. If the real export name/signature differs, swap the one
//      call at the bottom of buildPostgameReportEmail().
//   2. layout.ts doesn't (yet) export a two-column "team row" or table
//      helper, so this file builds its own inline-styled <table> rows
//      rather than trying to guess one. Worth promoting into layout.ts if
//      you like the pattern, since the pregame email likely wants a
//      similar linescore/box treatment eventually.
//
// Email HTML rules followed throughout: table-based layout, inline styles
// only, no flexbox/grid, no external CSS, no <script>.

import { COLORS, FONTS, SITE_URL, hairline, kicker, wrapEmail } from '@/lib/email/layout'
import type { PostgameReport } from '@/types/postgame'
function outsToIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

function td(content: string, opts: { align?: 'left' | 'right' | 'center'; bold?: boolean; width?: string } = {}): string {
  const align = opts.align ?? 'left'
  const weight = opts.bold ? '700' : '400'
  return `<td style="padding:6px 10px;text-align:${align};font-family:${FONTS.mono};font-size:12px;color:${COLORS.ink};font-weight:${weight};${opts.width ? `width:${opts.width};` : ''}">${content}</td>`
}

function sectionHeading(label: string): string {
  return `
  <tr><td style="padding:26px 40px 10px;">
    <div style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.orange};border-bottom:1px solid ${COLORS.ink}22;padding-bottom:8px;">
      § ${label}
    </div>
  </td></tr>`
}

function pitcherTable(report: PostgameReport, teamId: number): string {
  const rows = report.pitchers
    .filter(p => p.teamId === teamId)
    .sort((a, b) => b.outsRecorded - a.outsRecorded)
    .map(p => `
      <tr>
        ${td(p.pitcherName, { bold: true })}
        ${td(outsToIP(p.outsRecorded), { align: 'right' })}
        ${td(String(p.strikeouts), { align: 'right' })}
        ${td(String(p.walks), { align: 'right' })}
        ${td(String(p.hitsAllowed), { align: 'right' })}
        ${td(String(p.runsAllowed), { align: 'right' })}
      </tr>`)
    .join('')

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      ${td('PITCHER', { bold: true })}
      ${td('IP', { align: 'right', bold: true })}
      ${td('K', { align: 'right', bold: true })}
      ${td('BB', { align: 'right', bold: true })}
      ${td('H', { align: 'right', bold: true })}
      ${td('R', { align: 'right', bold: true })}
    </tr>
    ${rows}
  </table>`
}

function battingTable(report: PostgameReport, side: 'away' | 'home'): string {
  const rows = report.batters[side]
    .filter(b => b.atBats > 0 || b.walks > 0)
    .map(b => `
      <tr>
        ${td(b.batterName, { bold: true })}
        ${td(`${b.hits}-${b.atBats}`, { align: 'right' })}
        ${td(String(b.runsScored), { align: 'right' })}
        ${td(String(b.rbi), { align: 'right' })}
      </tr>`)
    .join('')

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      ${td('BATTER', { bold: true })}
      ${td('H-AB', { align: 'right', bold: true })}
      ${td('R', { align: 'right', bold: true })}
      ${td('RBI', { align: 'right', bold: true })}
    </tr>
    ${rows}
  </table>`
}

function superlativeRow(report: PostgameReport): string {
  const s = report.superlatives
  const items = [
    { label: 'FASTEST PITCH', value: s.fastestPitch ? `${s.fastestPitch.speed} mph` : '—', sub: s.fastestPitch?.pitcherName },
    { label: 'HARDEST HIT', value: s.hardestHit ? `${s.hardestHit.exitVelo} mph` : '—', sub: s.hardestHit?.batterName },
    { label: 'LONGEST HIT', value: s.longestHit ? `${s.longestHit.distance} ft` : '—', sub: s.longestHit?.batterName },
  ]
  const cells = items.map(it => `
    <td style="padding:14px 10px;text-align:center;width:33%;border-left:1px solid ${COLORS.ink}15;">
      <div style="font-family:${FONTS.mono};font-size:9px;letter-spacing:0.12em;color:${COLORS.muted};text-transform:uppercase;margin-bottom:4px;">${it.label}</div>
      <div style="font-family:Georgia,serif;font-weight:700;font-size:22px;color:${COLORS.ink};">${it.value}</div>
      ${it.sub ? `<div style="font-family:${FONTS.mono};font-size:10px;color:${COLORS.muted};margin-top:2px;">${it.sub}</div>` : ''}
    </td>`).join('')

  return `
  <tr><td style="padding:0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.ink}22;background:#fff;">
      <tr>${cells}</tr>
    </table>
  </td></tr>`
}

function keyPlaysList(report: PostgameReport): string {
  const items = report.keyPlays.slice(0, 5).map(kp => `
    <tr><td style="padding:6px 0;border-bottom:1px solid ${COLORS.rowDivider};">
      <span style="font-family:${FONTS.mono};font-size:10px;color:${COLORS.muted};">
        ${kp.halfInning === 'top' ? '▲' : '▼'} ${kp.inning}
      </span>
      <span style="font-family:Georgia,serif;font-size:13px;color:${COLORS.body};margin-left:8px;">
        ${kp.description}
      </span>
    </td></tr>`).join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table>`
}

export function buildPostgameReportEmail(report: PostgameReport): { subject: string; html: string } {
  const homeWon = report.finalHomeScore > report.finalAwayScore
  const winner = homeWon ? report.home : report.away
  const loser = homeWon ? report.away : report.home
  const winScore = homeWon ? report.finalHomeScore : report.finalAwayScore
  const loseScore = homeWon ? report.finalAwayScore : report.finalHomeScore

  const subject = `Final: ${winner.abbreviation} ${winScore}, ${loser.abbreviation} ${loseScore}`

  const body = `
  ${kicker('POSTGAME REPORT', { color: COLORS.orange })}
  <tr><td style="padding:6px 40px 20px;">
    <div style="font-family:Georgia,serif;font-weight:700;font-size:26px;color:${COLORS.ink};">
      ${report.away.abbreviation} ${report.finalAwayScore} — ${report.home.abbreviation} ${report.finalHomeScore}
    </div>
    <div style="font-family:${FONTS.mono};font-size:11px;color:${COLORS.muted};margin-top:4px;">
      ${report.gameDate}${report.gameNumber > 1 ? ` · Game ${report.gameNumber}` : ''}
    </div>
  </td></tr>

  ${hairline()}
  ${superlativeRow(report)}

  ${sectionHeading('Key Plays')}
  <tr><td style="padding:0 40px 10px;">${keyPlaysList(report)}</td></tr>

  ${sectionHeading(`Pitching — ${report.away.name}`)}
  <tr><td style="padding:0 40px 10px;">${pitcherTable(report, report.away.teamId)}</td></tr>

  ${sectionHeading(`Pitching — ${report.home.name}`)}
  <tr><td style="padding:0 40px 10px;">${pitcherTable(report, report.home.teamId)}</td></tr>

  ${sectionHeading(`Batting — ${report.away.name}`)}
  <tr><td style="padding:0 40px 10px;">${battingTable(report, 'away')}</td></tr>

  ${sectionHeading(`Batting — ${report.home.name}`)}
  <tr><td style="padding:0 40px 24px;">${battingTable(report, 'home')}</td></tr>

  ${hairline()}
  <tr><td style="padding:16px 40px 30px;">
    <a href="${SITE_URL}/mlb/${report.slug}" style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.08em;color:${COLORS.orange};text-decoration:none;">
      → Full report with pitch charts on edgereportdaily.com
    </a>
  </td></tr>
  `

  // Per layout.ts's own header comment: "Templates compose by concatenating
  // row helpers and passing the result to wrapEmail({ title, preheader, body })".
  // If the real signature differs from that (e.g. takes a 4th param, or
  // preheader is optional), this is the one call to adjust.
  const html = wrapEmail({ title: subject, preheader: subject, body })

  return { subject, html }
}
