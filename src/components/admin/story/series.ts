// src/components/admin/story/series.ts
//
// Which postseason series a game belongs to, from the MLB schedule fields.

import type { SeriesInfo } from './types'

const POST_TYPES = new Set(['F', 'D', 'L', 'W'])        // wild card, division, league championship, world series
const SHORT: [RegExp, string][] = [
  [/^AL Division/i, 'ALDS'], [/^NL Division/i, 'NLDS'], [/^AL Championship/i, 'ALCS'], [/^NL Championship/i, 'NLCS'],
  [/^World Series/i, 'World Series'], [/^AL Wild Card/i, 'AL Wild Card'], [/^NL Wild Card/i, 'NL Wild Card'],
]

/** MLB schedule fields gameType / seriesDescription / seriesGameNumber / gamesInSeries (verified against the live API). */
export function seriesOf(g: Record<string, unknown> | undefined): SeriesInfo | null {
  if (!g || !POST_TYPES.has(String(g.gameType))) return null
  const desc = String(g.seriesDescription ?? '')
  const label = SHORT.find(([re]) => re.test(desc))?.[1] ?? (desc || 'Postseason')
  const game = Number(g.seriesGameNumber), of = Number(g.gamesInSeries)
  return Number.isFinite(game) && game > 0 ? { label, game, of: Number.isFinite(of) && of > 0 ? of : game } : { label, game: 1, of: 1 }
}

