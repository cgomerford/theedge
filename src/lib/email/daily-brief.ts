// src/lib/email/daily-brief.ts
//
// Daily brief email template — editorial Monocle/FT briefing style.
// One email per subscriber, all their teams' games stacked.
//
// EXTENDED 2026-08: buildSubject() rewritten to lead with the actual
// matchup and start time, plus a 2-factor teaser pulled from the same
// component tilt scores (ctx.components) that drive the Scout Report
// block in the email body — real analysis, not new/placeholder copy.

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
import type { ComponentScores } from '@/lib/matchup-tilt'

export type { BriefGameContext } from './blocks/game-card'

interface DailyBriefInput {
  recipientEmail: string
  preferencesToken: string
  games: BriefGameContext[]
  teamShortNames: string[]
  isPro?: boolean
}

interface DailyBriefOutput {
  subject: string
  html: string
  text: string
}

// ─── Subject-line factor teaser ────────────────────────────────────────────
//
// Reuses ComponentScores' own key names (matchup-tilt.ts) — NOT the same
// key set as MatchupTiltData.components in email/blocks/matchup-tilt.ts
// (that one renames starting_pitcher → pitching for display). Separate
// small map here rather than importing that one, since the keys genuinely
// differ and importing would be misleading.

const SUBJECT_FACTOR_LABELS: Record<keyof ComponentScores, string> = {
  starting_pitcher: 'Pitching',
  bullpen: 'Bullpen',
  offense: 'Batting',
  defense: 'Defense',
  matchup: 'Matchup',
  park: 'Park',
  weather: 'Weather',
  rest: 'Rest',
}

function topFactorLabels(scores: ComponentScores, count: number): string[] {
  const entries = Object.entries(scores) as [keyof ComponentScores, number][]
  return entries
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, count)
    .map(([key]) => SUBJECT_FACTOR_LABELS[key])
}

// ─── Subject line builder ─────────────────────────────────────────────────────

function buildSubject(teamLabel: string, games: BriefGameContext[]): string {
  if (games.length === 0) {
    return `${teamLabel} tonight · The Edge`
  }

  // Same "most decisive game" selection as before — prefers a real edge
  // over a tossup — falls back to the first game if none qualify, so the
  // subject still shows a real matchup instead of the generic fallback.
  const strongest =
    games
      .filter(g => g.edge_score !== null && g.confidence_tier !== 'tossup')
      .sort((a, b) => Math.abs(b.edge_score ?? 0) - Math.abs(a.edge_score ?? 0))[0]
    ?? games[0]

  const awayName = strongest.game.teams.away.team.name
  const homeName = strongest.game.teams.home.team.name
  const awayShort = awayName.split(' ').pop() ?? awayName
  const homeShort = homeName.split(' ').pop() ?? homeName

  const gameTime = new Date(strongest.game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  let factorStr = ''
  if (strongest.components) {
    const labels = topFactorLabels(strongest.components, 2)
    if (labels.length > 0) {
      const winnerShort = strongest.predicted_winner === 'home' ? homeShort : awayShort
      factorStr = ` · ${labels.join(' & ')} lean ${winnerShort}`
    }
  }

  return `${awayShort} vs ${homeShort} · ${gameTime}${factorStr} · The Edge`
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

  const bodyParts: string[] = []

  bodyParts.push(masthead(dateStr))
  bodyParts.push(hairline())

  bodyParts.push(editorialHeadline({
    title: `Five-minute brief for ${teamLabel}.`,
    dek: 'Statcast, advanced metrics, and the matchups that actually matter. Information only\u00A0— no\u00A0advice.',
  }))

  bodyParts.push(hairline())
  bodyParts.push(kicker(gameCountText, { color: COLORS.orange, padTop: 24, padBottom: 0 }))

  games.forEach((ctx, idx) => {
    if (idx > 0) {
      bodyParts.push(`<tr><td style="padding-top:40px;font-size:0;line-height:0;">&nbsp;</td></tr>`)
      bodyParts.push(hairline())
      bodyParts.push(`<tr><td style="padding-top:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`)
    }
    bodyParts.push(gameCardBlock(ctx, { isPro }))
  })

  bodyParts.push(`<tr><td style="padding-top:40px;font-size:0;line-height:0;">&nbsp;</td></tr>`)
  bodyParts.push(hairline())

  bodyParts.push(briefFooter({ preferencesUrl, unsubscribeUrl }))

  const subject = buildSubject(teamLabel, games)

  const firstGame = games[0]
  const preheader = firstGame?.llm_summary
    ?? `${gameCount} game${gameCount === 1 ? '' : 's'} for ${teamLabel} tonight.`

  const html = wrapEmail({
    title: `The Edge — Daily Briefing — ${dateStr}`,
    preheader,
    body: bodyParts.join(''),
  })

  const text = buildPlainText(teamLabel, games, preferencesUrl, unsubscribeUrl)

  return { subject, html, text }
}