// src/lib/email/blocks/game-card.ts
//
// Composes a full game section for the daily brief email.
// One game = headline + tilt + narrative + pitchers + conditions + link.
//
// EXTENDED 2026-08: buildTilt() now passes teamId through to
// buildMatchupTiltData so matchup-tilt.ts's email block can render team
// logos beside each abbreviation.

import { findTeamByName } from '@/lib/teams'
import { buildMatchupTiltData } from '@/lib/matchup-tilt'
import type { ComponentsRaw, ComponentScores, MatchupTiltData } from '@/lib/matchup-tilt'
import type { MLBGame } from '@/lib/mlb'
import { COLORS, FONTS, SITE_URL } from '../layout'
import { matchupTiltBlock } from './matchup-tilt'
import { pitcherCardBlock, type PitcherInfo } from './pitcher-card'
import { weatherCardBlock, type WeatherInfo } from './weather-card'

export interface BriefGameContext {
  game: MLBGame
  awaySeasonStats: {
    era: string
    whip: string
    k_per_9: string
    wins: number
    losses: number
  } | null
  homeSeasonStats: {
    era: string
    whip: string
    k_per_9: string
    wins: number
    losses: number
  } | null
  weather: WeatherInfo | null
  windImpact: string | null
  venueName: string
  isIndoor: boolean
  slug: string
  edge_score: number | null
  predicted_winner: 'home' | 'away' | null
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup' | null
  llm_summary: string | null
  llm_narrative: string | null
  llm_narrative_pro?: string | null
  components?: ComponentScores | null
  components_raw?: ComponentsRaw | null
}

const FALLBACK_HOME_COLOR = '#1a1a1a'
const FALLBACK_AWAY_COLOR = '#555555'

function resolveTeamColor(teamName: string, fallback: string): string {
  const team = findTeamByName(teamName)
  return team?.primary_color ?? fallback
}

function resolveTeamAbbr(teamName: string): string {
  const team = findTeamByName(teamName)
  return team?.abbrev ?? teamName.split(' ').pop()?.toUpperCase() ?? '???'
}

function resolveTeamShort(teamName: string): string {
  return teamName.split(' ').pop() ?? teamName
}

function resolveTeamCity(teamName: string): string {
  const parts = teamName.split(' ')
  if (parts.length <= 1) return teamName
  const twoWordTeams = ['Red Sox', 'White Sox', 'Blue Jays']
  const lastTwo = parts.slice(-2).join(' ')
  if (twoWordTeams.includes(lastTwo)) return parts.slice(0, -2).join(' ')
  return parts.slice(0, -1).join(' ')
}

function formatGameTime(gameDate: string): string {
  return new Date(gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function buildTilt(ctx: BriefGameContext): MatchupTiltData | null {
  if (!ctx.components_raw || !ctx.components) return null

  const awayName = ctx.game.teams.away.team.name
  const homeName = ctx.game.teams.home.team.name
  const gameTime = formatGameTime(ctx.game.gameDate)

  try {
    return buildMatchupTiltData(
      ctx.components_raw as ComponentsRaw,
      ctx.components as ComponentScores,
      {
        abbr: resolveTeamAbbr(homeName),
        name: homeName,
        primaryColor: resolveTeamColor(homeName, FALLBACK_HOME_COLOR),
        teamId: ctx.game.teams.home.team.id,
      },
      {
        abbr: resolveTeamAbbr(awayName),
        name: awayName,
        primaryColor: resolveTeamColor(awayName, FALLBACK_AWAY_COLOR),
        teamId: ctx.game.teams.away.team.id,
      },
      ctx.venueName,
      gameTime,
    )
  } catch (e) {
    console.error('[game-card] buildMatchupTiltData failed:', e)
    return null
  }
}

function buildPitcherInfo(
  side: 'home' | 'away',
  ctx: BriefGameContext,
): PitcherInfo {
  const teamData = side === 'home' ? ctx.game.teams.home : ctx.game.teams.away
  const stats = side === 'home' ? ctx.homeSeasonStats : ctx.awaySeasonStats
  const pitcher = teamData.probablePitcher

  return {
    id: pitcher?.id ?? null,
    fullName: pitcher?.fullName ?? null,
    teamCity: resolveTeamCity(teamData.team.name),
    teamColor: resolveTeamColor(
      teamData.team.name,
      side === 'home' ? FALLBACK_HOME_COLOR : FALLBACK_AWAY_COLOR,
    ),
    stats: stats
      ? {
          era: stats.era,
          whip: stats.whip,
          k_per_9: stats.k_per_9,
          wins: stats.wins,
          losses: stats.losses,
        }
      : null,
  }
}

function narrativeBlock(ctx: BriefGameContext, isPro: boolean): string {
  const narrative = isPro ? (ctx.llm_narrative_pro ?? ctx.llm_narrative) : ctx.llm_narrative
  if (!narrative) return ''

  const label = isPro ? '⊕ The GM Briefing' : '⊕ The Read'

  return `
  <tr><td class="brief-pad" style="padding:32px 40px 0;">
    <div style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.16em;color:${COLORS.orange};text-transform:uppercase;margin-bottom:14px;">
      ${label}
    </div>
    <p style="font-family:${FONTS.serif};font-size:18px;line-height:1.55;color:${COLORS.ink};margin:0;font-weight:400;">
      ${escapeHtml(narrative)}
    </p>
  </td></tr>`
}

function previewLink(slug: string): string {
  const url = `${SITE_URL}/mlb/${slug}`
  return `
  <tr><td class="brief-pad" style="padding:32px 40px 0;">
    <a href="${url}" style="font-family:${FONTS.mono};font-size:12px;letter-spacing:0.12em;color:${COLORS.ink};text-decoration:none;text-transform:uppercase;border-bottom:1px solid ${COLORS.ink};padding-bottom:2px;">
      Read the full preview →
    </a>
  </td></tr>`
}

export function gameCardBlock(ctx: BriefGameContext, opts: { isPro?: boolean } = {}): string {
  const isPro = opts.isPro ?? false
  const awayName = ctx.game.teams.away.team.name
  const homeName = ctx.game.teams.home.team.name
  const awayShort = resolveTeamShort(awayName)
  const homeShort = resolveTeamShort(homeName)
  const gameTime = formatGameTime(ctx.game.gameDate)

  const headline = `
  <tr><td class="brief-pad" style="padding:12px 40px 4px;">
    <h2 class="brief-game-headline" style="font-family:${FONTS.serif};font-size:32px;line-height:1.1;font-weight:600;letter-spacing:-0.015em;color:${COLORS.ink};margin:0;">
      ${escapeHtml(awayShort)} <span style="font-style:italic;font-weight:400;color:${COLORS.muted};font-size:24px;">at</span> ${escapeHtml(homeShort)}
    </h2>
  </td></tr>`

  const timeVenue = `
  <tr><td class="brief-pad" style="padding:0 40px 24px;">
    <div style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.12em;color:#666;text-transform:uppercase;">
      ${escapeHtml(gameTime)} &nbsp;·&nbsp; ${escapeHtml(ctx.venueName)}
    </div>
  </td></tr>`

  const tiltData = buildTilt(ctx)
  const tilt = tiltData ? matchupTiltBlock(tiltData, ctx.slug) : ''

  const narrative = narrativeBlock(ctx, isPro)

  const awayPitcher = buildPitcherInfo('away', ctx)
  const homePitcher = buildPitcherInfo('home', ctx)
  const pitchers = pitcherCardBlock(awayPitcher, homePitcher)

  const weather = weatherCardBlock({
    weather: ctx.weather,
    windImpact: ctx.windImpact,
    isIndoor: ctx.isIndoor,
  })

  const link = previewLink(ctx.slug)

  return [headline, timeVenue, tilt, narrative, pitchers, weather, link].join('')
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}