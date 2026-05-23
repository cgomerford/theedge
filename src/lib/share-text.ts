import type { RecentPrediction } from '@/lib/track-record'

const SITE_URL = 'https://edgereportdaily.com'

function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

import { shareDisplayName } from '@/lib/teams'

function shortName(name: string): string {
  return shareDisplayName(name)
}

function teamHashtag(name: string): string {
  // Last word of name, capitalised. "Philadelphia Phillies" → "#Phillies"
  return '#' + shortName(name)
}

function gameSlug(p: RecentPrediction): string {
  return `${teamSlug(p.away_team)}-vs-${teamSlug(p.home_team)}-${p.game_date}`
}

function gameUrl(p: RecentPrediction): string {
  return `${SITE_URL}/mlb/${gameSlug(p)}`
}

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function scoreText(p: RecentPrediction): string | null {
  if (p.home_score === null || p.away_score === null) return null
  const homeShort = shortName(p.home_team)
  const awayShort = shortName(p.away_team)
  // Winner first, more dramatic — "PHI 5, CLE 3" not "CLE 3, PHI 5"
  if (p.home_score > p.away_score) {
    return `${homeShort} ${p.home_score}, ${awayShort} ${p.away_score}`
  }
  return `${awayShort} ${p.away_score}, ${homeShort} ${p.home_score}`
}

function resultGlyph(wasCorrect: boolean | null): string {
  if (wasCorrect === true) return '✓'
  if (wasCorrect === false) return '✗'
  return ''
}

// ============================================================
// TWEET FORMAT — broadcast, ≤280 chars target
// ============================================================
export function buildTweetText(p: RecentPrediction): string {
  const predictedTeamName = p.predicted_winner === 'home' ? p.home_team : p.away_team
  const awayShort = shortName(p.away_team)
  const homeShort = shortName(p.home_team)
  const edgeStr = (p.edge_score > 0 ? '+' : '') + p.edge_score
  const score = scoreText(p)
  const glyph = resultGlyph(p.was_correct)
  const url = gameUrl(p)
  const hashtag = teamHashtag(predictedTeamName)

  if (p.was_correct === true) {
    // Graded + correct — the boast post
    return [
      `The Edge model called this one ✓`,
      ``,
      `${awayShort} @ ${homeShort} · ${edgeStr} lean ${shortName(predictedTeamName)}`,
      `Result: ${score} ${glyph}`,
      ``,
      url,
      ``,
      `#MLB ${hashtag}`,
    ].join('\n')
  }

  if (p.was_correct === false) {
    // Graded + wrong — the honest post (transparency builds trust)
    return [
      `The Edge model missed this one.`,
      ``,
      `${awayShort} @ ${homeShort} · predicted ${shortName(predictedTeamName)} (${edgeStr})`,
      `Result: ${score} ✗`,
      ``,
      `Every call, every result — public:`,
      url,
      ``,
      `#MLB`,
    ].join('\n')
  }

  // Ungraded — the pre-game post
  return [
    `Tonight's Edge:`,
    ``,
    `${awayShort} @ ${homeShort} · ${edgeStr} lean ${shortName(predictedTeamName)} (${tierLabel(p.confidence_tier)})`,
    ``,
    url,
    ``,
    `#MLB ${hashtag}`,
  ].join('\n')
}

// ============================================================
// REPLY FORMAT — longer, contextual, for reddit/comments
// ============================================================
export function buildReplyText(p: RecentPrediction): string {
  const predictedTeamName = p.predicted_winner === 'home' ? p.home_team : p.away_team
  const edgeStr = (p.edge_score > 0 ? '+' : '') + p.edge_score
  const score = scoreText(p)
  const glyph = resultGlyph(p.was_correct)
  const url = gameUrl(p)

  if (p.was_correct === true) {
    return [
      `The Edge Report predicted this one pre-game.`,
      ``,
      `→ Edge Score: ${edgeStr} (${tierLabel(p.confidence_tier)} lean: ${shortName(predictedTeamName)})`,
      `→ Predicted winner: ${shortName(predictedTeamName)}`,
      `→ Final: ${score} ${glyph}`,
      ``,
      `The model called it. Full pre-game breakdown: ${url}`,
    ].join('\n')
  }

  if (p.was_correct === false) {
    return [
      `Edge Report had this one wrong — own the misses.`,
      ``,
      `→ Predicted: ${shortName(predictedTeamName)} (${edgeStr}, ${tierLabel(p.confidence_tier)})`,
      `→ Actual: ${score}`,
      ``,
      `Every call, every result, public track record: ${url}`,
    ].join('\n')
  }

  return [
    `Tonight's Edge Report call:`,
    ``,
    `→ Edge Score: ${edgeStr} (${tierLabel(p.confidence_tier)} lean: ${shortName(predictedTeamName)})`,
    `→ Predicted winner: ${shortName(predictedTeamName)}`,
    ``,
    `Full breakdown — pitchers, weather, lineup form: ${url}`,
  ].join('\n')
}