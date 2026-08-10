// ─── Per-game snip — one Edge-model card for a specific game ────────────────
// buildSnips() above operates once-daily across the whole slate (picks a
// single "top" read). This is the missing per-game version — same public-
// safe rules (no raw Edge Score, "N of 8 factors" framing only, link
// omitted from the body per the eotd footnote's reach rationale), hard-
// capped at SNIP_CHAR_TARGET so it's always safe to paste as-is.

import { shareDisplayName } from '@/lib/teams'
import type { TodaysRead, Snip } from '@/lib/admin-dashboard'
const SNIP_CHAR_TARGET = 400

export function buildGameSnip(read: TodaysRead): Snip {
  const hashtag = '#' + shareDisplayName(read.lean_team).replace(/\s+/g, '')

  const header     = `\u2295 THE EDGE`
  const factorLine = `${read.factor_count} of 8 factors lean ${read.lean_team} tonight vs ${read.other_team}.`
  const closer     = `Not a tip \u2014 just where the data points.`
  const tags       = `#MLB ${hashtag}`

  // Everything except the narrative line is fixed-length — truncate only
  // the story_lead/summary text to hit the character target, never the
  // factor line, closer, or hashtags.
  const fixedLen = [header, '', factorLine, '', '', '', closer, '', tags].join('\n').length

  const narrativeSource =
    read.story_lead?.trim() || read.summary?.trim() || `The biggest tilt is ${read.dominant_factor}.`
  const budget = Math.max(20, SNIP_CHAR_TARGET - fixedLen)
  const narrative = narrativeSource.length > budget
    ? narrativeSource.slice(0, budget - 1).replace(/\s+\S*$/, '') + '\u2026'
    : narrativeSource

  const body = [header, '', factorLine, '', narrative, '', closer, '', tags].join('\n')

  return {
    id: `game-${read.game_pk}`,
    title: `\u2295 Edge \u2014 ${read.matchup}`,
    why: `${body.length} chars \u00b7 link in first reply`,
    body,
    footnote: 'No score, no link in the post. Drop edgereportdaily.com in your FIRST REPLY \u2014 in-post links cut reach 50\u201390%.',
  }
}