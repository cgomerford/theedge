// src/lib/email/postgame-report.ts
//
// Post-game report email template — sent per-game, right after the final
// out, to subscribers following either team. Condensed version of the
// full Post-Game Report page (src/components/PostGameReportTab.tsx):
// final score, top performers, the most impactful at-bat, and a CTA to
// the full report on the game page.
//
// No LLM recap yet — this is data-only, matching the "empty state beats
// fabricated data" rule. A generated recap paragraph is a good v2 addition
// once src/lib/postgame.ts has a narrative step, same pattern as
// src/lib/narrative.ts for the pre-game brief.
//
// Usage in the cron route:
//
//   import { buildPostgameEmail } from '@/lib/email/postgame-report'
//
//   const email = buildPostgameEmail({
//     recipientEmail,
//     preferencesToken,
//     report,
//     awayTeamName,
//     homeTeamName,
//     finalScore,
//     slug,
//     isPro,
//   })
//
//   await resend.emails.send({
//     from: 'The Edge <hello@edgereportdaily.com>',
//     to: recipientEmail,
//     subject: email.subject,
//     html: email.html,
//     text: email.text,
//   })

import {
  wrapEmail,
  masthead,
  editorialHeadline,
  hairline,
  kicker,
  briefFooter,
  SITE_URL,
  COLORS,
  FONTS,
} from './layout'
import type { PostGameReport, TopPerformerEntry } from '@/lib/postgame'

// ─── Types ──────────────────────────────────────────────────────────────────

interface PostgameEmailInput {
  recipientEmail: string
  preferencesToken: string
  report: PostGameReport
  awayTeamName: string
  homeTeamName: string
  finalScore: { away: number; home: number }
  /** Game page slug — CTA links to `${SITE_URL}/mlb/${slug}` */
  slug: string
  isPro?: boolean
}

interface PostgameEmailOutput {
  subject: string
  html: string
  text: string
}

// ─── Small local helpers (mirrors auth.ts's ctaButton/bodyPara/spacer —
//     not exported from layout.ts, so re-declared here rather than
//     reaching into another template file) ───────────────────────────────

function ctaButton(href: string, label: string): string {
  return `
  <tr><td class="brief-pad" style="padding:0 40px;">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="10%" strokecolor="${COLORS.ink}" fillcolor="${COLORS.ink}">
    <center style="color:${COLORS.yellow};font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.5px;">${label}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="${href}" style="display:inline-block;background:${COLORS.ink};color:${COLORS.yellow};font-family:${FONTS.mono};font-weight:700;font-size:13px;padding:14px 28px;text-decoration:none;letter-spacing:0.06em;">
      ${label}
    </a>
    <!--<![endif]-->
  </td></tr>`
}

function bodyPara(text: string, opts: { padTop?: number; padBottom?: number; color?: string; italic?: boolean } = {}): string {
  const padTop = opts.padTop ?? 0
  const padBottom = opts.padBottom ?? 0
  const color = opts.color ?? COLORS.body
  const fontStyle = opts.italic ? 'italic' : 'normal'
  return `
  <tr><td class="brief-pad" style="padding:${padTop}px 40px ${padBottom}px;">
    <p style="font-family:${FONTS.serif};font-size:16px;line-height:1.55;color:${color};margin:0;font-style:${fontStyle};">
      ${text}
    </p>
  </td></tr>`
}

function spacer(px: number): string {
  return `<tr><td style="padding-top:${px}px;font-size:0;line-height:0;">&nbsp;</td></tr>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Final score block ────────────────────────────────────────────────────

function scoreBlock(awayTeamName: string, homeTeamName: string, finalScore: { away: number; home: number }): string {
  const awayWon = finalScore.away > finalScore.home
  return `
  <tr><td class="brief-pad" style="padding:8px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="45%" style="text-align:center;padding:16px 8px;background:${awayWon ? COLORS.ink : 'transparent'};">
          <div style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.08em;color:${awayWon ? COLORS.yellow : COLORS.muted};text-transform:uppercase;margin-bottom:6px;">
            ${escapeHtml(awayTeamName)}
          </div>
          <div style="font-family:${FONTS.mono};font-size:32px;font-weight:700;color:${awayWon ? '#fff' : COLORS.ink};">
            ${finalScore.away}
          </div>
        </td>
        <td width="10%" style="text-align:center;font-family:${FONTS.mono};font-size:11px;color:${COLORS.muted};">
          FINAL
        </td>
        <td width="45%" style="text-align:center;padding:16px 8px;background:${!awayWon ? COLORS.ink : 'transparent'};">
          <div style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.08em;color:${!awayWon ? COLORS.yellow : COLORS.muted};text-transform:uppercase;margin-bottom:6px;">
            ${escapeHtml(homeTeamName)}
          </div>
          <div style="font-family:${FONTS.mono};font-size:32px;font-weight:700;color:${!awayWon ? '#fff' : COLORS.ink};">
            ${finalScore.home}
          </div>
        </td>
      </tr>
    </table>
  </td></tr>`
}

// ─── Top performer row ─────────────────────────────────────────────────────

function performerRow(label: string, entry: TopPerformerEntry | undefined): string {
  if (!entry) return ''
  return `
  <tr><td class="brief-pad" style="padding:10px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.1em;color:${COLORS.muted};text-transform:uppercase;padding-bottom:3px;">
          ${label}
        </td>
      </tr>
      <tr>
        <td style="font-family:${FONTS.serif};font-size:16px;color:${COLORS.ink};">
          <strong>${escapeHtml(entry.playerName)}</strong> (${entry.teamAbbr}) — ${escapeHtml(entry.displayValue)}
          <span style="font-family:${FONTS.mono};font-size:11px;color:${COLORS.muted};"> · ${escapeHtml(entry.context)}</span>
        </td>
      </tr>
    </table>
  </td></tr>`
}

// ─── Subject line ──────────────────────────────────────────────────────────

function buildSubject(
  awayTeamName: string,
  homeTeamName: string,
  finalScore: { away: number; home: number },
): string {
  const awayShort = awayTeamName.split(' ').pop() ?? awayTeamName
  const homeShort = homeTeamName.split(' ').pop() ?? homeTeamName
  const winnerShort = finalScore.away > finalScore.home ? awayShort : homeShort
  const loserScore = Math.min(finalScore.away, finalScore.home)
  const winnerScore = Math.max(finalScore.away, finalScore.home)
  return `${winnerShort} win it, ${winnerScore}-${loserScore} · The Edge`
}

// ─── Plain text ─────────────────────────────────────────────────────────────

function buildPlainText(
  awayTeamName: string,
  homeTeamName: string,
  finalScore: { away: number; home: number },
  report: PostGameReport,
  gameUrl: string,
  preferencesUrl: string,
  unsubscribeUrl: string,
): string {
  const lines: string[] = []
  lines.push('THE EDGE — POST-GAME REPORT')
  lines.push('')
  lines.push(`${awayTeamName} ${finalScore.away} — ${homeTeamName} ${finalScore.home} (Final)`)
  lines.push('')

  const hardest = report.topPerformers.hardestHitBall[0]
  if (hardest) lines.push(`Hardest hit ball: ${hardest.playerName} (${hardest.teamAbbr}) — ${hardest.displayValue}`)
  const fastest = report.topPerformers.fastestPitch[0]
  if (fastest) lines.push(`Fastest pitch: ${fastest.playerName} (${fastest.teamAbbr}) — ${fastest.displayValue}`)
  const spin = report.topPerformers.highestSpinRate[0]
  if (spin) lines.push(`Highest spin rate: ${spin.playerName} (${spin.teamAbbr}) — ${spin.displayValue}`)

  if (report.mostImpactfulAB) {
    lines.push('')
    lines.push(`Biggest moment: ${report.mostImpactfulAB.batterName} vs ${report.mostImpactfulAB.pitcherName} — ${report.mostImpactfulAB.description}`)
  }

  lines.push('')
  lines.push(`Full report: ${gameUrl}`)
  lines.push('')
  lines.push(`Update preferences: ${preferencesUrl}`)
  lines.push(`Unsubscribe: ${unsubscribeUrl}`)
  lines.push('')
  lines.push('— The Edge')

  return lines.join('\n')
}

// ─── Main builder ───────────────────────────────────────────────────────────

export function buildPostgameEmail({
  recipientEmail,
  preferencesToken,
  report,
  awayTeamName,
  homeTeamName,
  finalScore,
  slug,
  isPro = false,
}: PostgameEmailInput): PostgameEmailOutput {
  const gameUrl = `${SITE_URL}/mlb/${slug}/postgame`
  const preferencesUrl = `${SITE_URL}/preferences/${preferencesToken}`
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(recipientEmail)}`

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York',
  })

  const bodyParts: string[] = []

  bodyParts.push(masthead(dateStr))
  bodyParts.push(hairline())

  bodyParts.push(editorialHeadline({
    title: `${finalScore.away > finalScore.home ? awayTeamName.split(' ').pop() : homeTeamName.split(' ').pop()} win it.`,
    dek: 'The post-game report — top performers, the biggest moment, and how it actually happened.',
  }))

  bodyParts.push(scoreBlock(awayTeamName, homeTeamName, finalScore))
  bodyParts.push(spacer(16))
  bodyParts.push(hairline())

  bodyParts.push(kicker('§ Top performers', { color: COLORS.orange, padTop: 24, padBottom: 4 }))
  bodyParts.push(performerRow('Hardest hit ball', report.topPerformers.hardestHitBall[0]))
  bodyParts.push(performerRow('Fastest pitch', report.topPerformers.fastestPitch[0]))
  bodyParts.push(performerRow('Highest spin rate', report.topPerformers.highestSpinRate[0]))

  if (report.mostImpactfulAB) {
    bodyParts.push(spacer(8))
    bodyParts.push(hairline())
    bodyParts.push(kicker('§ The biggest moment', { color: COLORS.orange, padTop: 24, padBottom: 4 }))
    bodyParts.push(bodyPara(
      `<strong>${escapeHtml(report.mostImpactfulAB.batterName)}</strong> vs ${escapeHtml(report.mostImpactfulAB.pitcherName)}, ${report.mostImpactfulAB.inning}${report.mostImpactfulAB.half === 'top' ? '▲' : '▼'} — ${escapeHtml(report.mostImpactfulAB.description)}`,
      { padTop: 8, padBottom: 4 },
    ))
  }

  bodyParts.push(spacer(24))
  bodyParts.push(ctaButton(gameUrl, isPro ? 'Full report + umpire scorecard →' : 'Full post-game report →'))
  bodyParts.push(spacer(32))
  bodyParts.push(hairline())

  bodyParts.push(briefFooter({ preferencesUrl, unsubscribeUrl }))

  const subject = buildSubject(awayTeamName, homeTeamName, finalScore)
  const preheader = report.mostImpactfulAB
    ? `${report.mostImpactfulAB.batterName}: ${report.mostImpactfulAB.description}`
    : `${awayTeamName} ${finalScore.away} — ${homeTeamName} ${finalScore.home}`

  const html = wrapEmail({
    title: `The Edge — Post-Game Report`,
    preheader,
    body: bodyParts.join(''),
  })

  const text = buildPlainText(awayTeamName, homeTeamName, finalScore, report, gameUrl, preferencesUrl, unsubscribeUrl)

  return { subject, html, text }
}
