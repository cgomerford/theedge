// src/lib/email/daily-brief.ts
//
// Daily brief email template — editorial Monocle/FT briefing style.
// One email per subscriber, all their teams' games stacked.
//
// Usage in the cron route:
//
//   import { buildDailyBrief } from '@/lib/email/daily-brief'
//
//   const email = buildDailyBrief({
//     recipientEmail,
//     preferencesToken,
//     games,
//     teamShortNames,
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
import { gameCardBlock, type BriefGameContext } from './blocks/game-card'

// Re-export so the cron route only needs one import path
export type { BriefGameContext } from './blocks/game-card'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyBriefInput {
  recipientEmail: string
  preferencesToken: string
  games: BriefGameContext[]
  /** Short display names of the subscriber's followed teams, e.g. ["Phillies", "Mets"] */
  teamShortNames: string[]
  isPro?: boolean
}

interface DailyBriefOutput {
  subject: string
  html: string
  text: string
}

// ─── Subject line builder ─────────────────────────────────────────────────────

function buildSubject(
  teamLabel: string,
  games: BriefGameContext[],
): string {
  // Find the strongest non-tossup game for a subject-line kicker
  const strongest = games
    .filter(g => g.edge_score !== null && g.confidence_tier !== 'tossup')
    .sort((a, b) => Math.abs(b.edge_score ?? 0) - Math.abs(a.edge_score ?? 0))[0]

  if (!strongest) {
    return `${teamLabel} tonight · The Edge`
  }

  const tierWord =
    strongest.confidence_tier === 'strong' ? 'Strong'
    : strongest.confidence_tier === 'moderate' ? 'Moderate'
    : 'Slight'

  const winnerName =
    strongest.predicted_winner === 'home'
      ? strongest.game.teams.home.team.name
      : strongest.game.teams.away.team.name

  const winnerShort = winnerName.split(' ').pop() ?? winnerName

  return `${teamLabel} tonight · ${tierWord} edge to ${winnerShort} · The Edge`
}

// ─── Team label ───────────────────────────────────────────────────────────────

function buildTeamLabel(names: string[]): string {
  if (names.length === 0) return 'your teams'
  if (names.length === 1) return `the ${names[0]}`
  if (names.length === 2) return `the ${names[0]} & ${names[1]}`
  return `the ${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

// ─── Date formatting ──────────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

function buildPlainText(
  teamLabel: string,
  games: BriefGameContext[],
  preferencesUrl: string,
  unsubscribeUrl: string,
): string {
  const dateStr = formatDate()
  const header = `THE EDGE · DAILY BRIEFING · ${dateStr.toUpperCase()}\n\nFive-minute brief for ${teamLabel}.\n`

  const gameSections = games.map(ctx => {
    const awayName = ctx.game.teams.away.team.name
    const homeName = ctx.game.teams.home.team.name
    const awayShort = awayName.split(' ').pop() ?? awayName
    const homeShort = homeName.split(' ').pop() ?? homeName
    const gameTime = new Date(ctx.game.gameDate).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })

    const awayPitcher = ctx.game.teams.away.probablePitcher?.fullName ?? 'TBD'
    const homePitcher = ctx.game.teams.home.probablePitcher?.fullName ?? 'TBD'
    const awayEra = ctx.awaySeasonStats?.era ?? '–'
    const homeEra = ctx.homeSeasonStats?.era ?? '–'

    const weatherLine = ctx.isIndoor
      ? 'Retractable roof, climate-controlled.'
      : ctx.weather
        ? `${ctx.weather.temp_f}°F, ${ctx.weather.conditions}, wind ${ctx.weather.wind_mph}mph${ctx.windImpact ? ' — ' + ctx.windImpact : ''}`
        : ''

    const narrativeLine = ctx.llm_narrative ? `\n${ctx.llm_narrative}\n` : ''

    return [
      `${awayShort} at ${homeShort}`,
      `${gameTime} · ${ctx.venueName}`,
      '',
      `${awayPitcher} (${awayEra} ERA) vs ${homePitcher} (${homeEra} ERA)`,
      weatherLine,
      narrativeLine,
      `Full preview: ${SITE_URL}/mlb/${ctx.slug}`,
    ].filter(Boolean).join('\n')
  }).join('\n\n---\n\n')

  return [
    header,
    gameSections,
    '',
    '---',
    `Manage preferences: ${preferencesUrl}`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n')
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildDailyBrief(input: DailyBriefInput): DailyBriefOutput {
  const {
    recipientEmail,
    preferencesToken,
    games,
    teamShortNames,
    isPro = false,
  } = input

  const teamLabel = buildTeamLabel(teamShortNames)
  const dateStr = formatDate()
  const preferencesUrl = `${SITE_URL}/preferences/${preferencesToken}`
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(recipientEmail)}`

  const gameCount = games.length
  const gameCountText = gameCount === 1 ? '§ One game tonight' : `§ ${gameCount} games tonight`

  // ── Assemble HTML body as concatenated <tr> rows ──

  const bodyParts: string[] = []

  // Masthead
  bodyParts.push(masthead(dateStr))
  bodyParts.push(hairline())

  // Editorial headline + italic dek
  bodyParts.push(editorialHeadline({
    title: `Five-minute brief for ${teamLabel}.`,
    dek: 'Statcast, advanced metrics, and the matchups that actually matter. Information only\u00A0— no\u00A0advice.',
  }))

  // Hairline + game count
  bodyParts.push(hairline())
  bodyParts.push(kicker(gameCountText, { color: COLORS.orange, padTop: 24, padBottom: 0 }))

  // Game cards — separated by hairlines when there's more than one
  games.forEach((ctx, idx) => {
    if (idx > 0) {
      // Spacer + hairline between games
      bodyParts.push(`<tr><td style="padding-top:40px;font-size:0;line-height:0;">&nbsp;</td></tr>`)
      bodyParts.push(hairline())
      bodyParts.push(`<tr><td style="padding-top:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`)
    }
    bodyParts.push(gameCardBlock(ctx, { isPro }))
  })

  // Bottom spacing before footer hairline
  bodyParts.push(`<tr><td style="padding-top:40px;font-size:0;line-height:0;">&nbsp;</td></tr>`)
  bodyParts.push(hairline())

  // Footer
  bodyParts.push(briefFooter({ preferencesUrl, unsubscribeUrl }))

  // ── Subject ──
  const subject = buildSubject(teamLabel, games)

  // ── Preheader (inbox preview text) ──
  const firstGame = games[0]
  const preheader = firstGame?.llm_summary
    ?? `${gameCount} game${gameCount === 1 ? '' : 's'} for ${teamLabel} tonight.`

  // ── Wrap in full HTML document ──
  const html = wrapEmail({
    title: `The Edge — Daily Briefing — ${dateStr}`,
    preheader,
    body: bodyParts.join(''),
  })

  // ── Plain text ──
  const text = buildPlainText(teamLabel, games, preferencesUrl, unsubscribeUrl)

  return { subject, html, text }
}