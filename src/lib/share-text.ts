import type { RecentRead } from '@/lib/track-record'
import { shareDisplayName } from '@/lib/teams'

const SITE_URL = 'https://edgereportdaily.com'

function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function shortName(name: string): string {
  return shareDisplayName(name)
}

function teamHashtag(name: string): string {
  return '#' + shortName(name)
}

function gameSlug(p: RecentRead): string {
  return `${teamSlug(p.away_team)}-vs-${teamSlug(p.home_team)}-${p.game_date}`
}

function gameUrl(p: RecentRead): string {
  return `${SITE_URL}/mlb/${gameSlug(p)}`
}

function scoreText(p: RecentRead): string | null {
  if (p.home_score === null || p.away_score === null) return null
  const homeShort = shortName(p.home_team)
  const awayShort = shortName(p.away_team)
  if (p.home_score > p.away_score) {
    return `${homeShort} ${p.home_score}, ${awayShort} ${p.away_score}`
  }
  return `${awayShort} ${p.away_score}, ${homeShort} ${p.home_score}`
}

function resultGlyph(matched: boolean | null): string {
  if (matched === true) return '✓'
  if (matched === false) return '✗'
  return ''
}

function leanLabel(p: RecentRead): string {
  if (p.factor_lean === 'split') return 'Split'
  const team = p.factor_lean === 'home' ? p.home_team : p.away_team
  return shortName(team)
}

function factorStr(p: RecentRead): string {
  return `${p.lean_factors}/${p.total_factors} factors`
}

// ─── Tweet — broadcast, ≤280 chars ───────────────────────────────────────────

export function buildTweetText(p: RecentRead): string {
  const awayShort = shortName(p.away_team)
  const homeShort = shortName(p.home_team)
  const lean = leanLabel(p)
  const factors = factorStr(p)
  const score = scoreText(p)
  const glyph = resultGlyph(p.outcome_matched)
  const url = gameUrl(p)
  const hashtag = p.factor_lean !== 'split' ? teamHashtag(p.factor_lean === 'home' ? p.home_team : p.away_team) : '#MLB'

  if (p.outcome_matched === true) {
    return [
      `The Edge model called this one ✓`,
      ``,
      `${awayShort} @ ${homeShort} · ${factors} leaning ${lean}`,
      `Result: ${score} ${glyph}`,
      ``,
      url,
      ``,
      `#MLB ${hashtag}`,
    ].join('\n')
  }

  if (p.outcome_matched === false) {
    return [
      `The Edge model missed this one.`,
      ``,
      `${awayShort} @ ${homeShort} · predicted ${lean} (${factors})`,
      `Result: ${score} ✗`,
      ``,
      `Every call, every result — public:`,
      url,
      ``,
      `#MLB`,
    ].join('\n')
  }

  // Ungraded — pre-game
  return [
    `Tonight's Edge:`,
    ``,
    `${awayShort} @ ${homeShort} · ${factors} leaning ${lean}`,
    ``,
    url,
    ``,
    `#MLB ${hashtag}`,
  ].join('\n')
}

// ─── Reply — longer, contextual ──────────────────────────────────────────────

export function buildReplyText(p: RecentRead): string {
  const lean = leanLabel(p)
  const factors = factorStr(p)
  const score = scoreText(p)
  const glyph = resultGlyph(p.outcome_matched)
  const url = gameUrl(p)

  if (p.outcome_matched === true) {
    return [
      `The Edge Report predicted this one pre-game.`,
      ``,
      `→ Factor lean: ${lean} (${factors})`,
      `→ Final: ${score} ${glyph}`,
      ``,
      `Full pre-game breakdown: ${url}`,
    ].join('\n')
  }

  if (p.outcome_matched === false) {
    return [
      `Edge Report had this one wrong — own the misses.`,
      ``,
      `→ Predicted: ${lean} (${factors})`,
      `→ Actual: ${score}`,
      ``,
      `Every call, every result, public track record: ${url}`,
    ].join('\n')
  }

  return [
    `Tonight's Edge Report analysis:`,
    ``,
    `→ Factor lean: ${lean} (${factors})`,
    ``,
    `Full breakdown — pitchers, weather, lineup form: ${url}`,
  ].join('\n')
}