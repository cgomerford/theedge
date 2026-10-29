// src/lib/banned-words.ts
//
// The banned-word list and the text matcher, in one place. scripts/checks/copy-lint.ts (the guard) and the article and graphics checkers
// in the admin both read this file, so the word list can never drift between them. No Node imports: it runs in the browser too.

export const BANNED: string[] = [
  'lean', 'leans', 'leaning', 'factors lean', 'toss-up', 'tossup', 'tier', 'edge score',
  'edge indicator', 'edge read', 'tilt', 'tilts', 'pick', 'picks', 'lock', 'locks', 'odds',
  'spread', 'moneyline', 'over/under', 'cover', 'value', 'fade', 'units', 'parlay', 'sharp',
  '% to win', 'projected', 'projection', 'projections', 'start', 'sit', 'bench', 'add', 'drop',
  'pick up', 'stash', 'must-roster', 'sleeper', 'sleepers', 'streamer', 'streamers',
  'buy low', 'sell high', 'trade value', 'ECR', 'FAAB', 'trending',
]

// Phrases stripped before matching. "Projected" is never allowed, except in George's exact lineup label below (a batting order, not a forecast).
export const ALLOWED: RegExp[] = [
  /forward line/gi, /line-?mates/gi,
  /receiver drops?/gi, /drop rate/gi,
  /goalie starts/gi, /recent starts/gi, /start time/gi, /since the start/gi, /start of/gi,
  /special[ -]teams units/gi, /(?:PP|PK) units?/gi, /unit [12]/gi, /by unit/gi,
  /cover [0-9]/gi, /fade routes?/gi, /lock in/gi, /\bvalues\b/gi,
  /pick a (?:batter|pitcher)/gi, /projected lineup, not yet confirmed/gi, /first mlb start/gi, /most recent outing/gi,
  /when recaps start/gi, /pick your teams/gi,   // George's exact wording on /me
  /add a team/gi,                               // the button wording in the My x9Lab dashboard design
  /add to a game plan card/gi,                  // the button wording in George's approved Second Look mockup
  /swing[ -]path tilt/gi, /swing tilt/gi,   // Savant's own bat-tracking metric (swing_path_tilt), not a lean
]

function escape(s: string) { return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') }
export const BANNED_RE = new RegExp(
  '(?<![\\w-])(' + BANNED.map(escape).sort((a, b) => b.length - a.length).join('|') + ')(?![\\w-])', 'gi')

export const MD_GENERIC = new Set(['pick', 'picks', 'lock', 'locks', 'spread', 'cover', 'value', 'units', 'sharp', 'start', 'sit', 'bench', 'add', 'drop', 'stash', 'tier', 'sleeper', 'sleepers', 'trending', 'fade', 'pick up'])
export const MD_RE = new RegExp(
  '(?<![\\w-])(' + BANNED.filter(w => !MD_GENERIC.has(w.toLowerCase())).map(escape).sort((a, b) => b.length - a.length).join('|') + ')(?![\\w-])', 'gi')

export type Hit = { line: number; col: number; word: string; context: string }

export function lintText(text: string, line = 1, col = 1): Hit[] {
  let cleaned = text
  for (const re of ALLOWED) cleaned = cleaned.replace(re, m => ' '.repeat(m.length))
  const hits: Hit[] = []
  BANNED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BANNED_RE.exec(cleaned))) {
    hits.push({ line, col: col + m.index, word: m[1], context: text.slice(Math.max(0, m.index - 20), m.index + m[1].length + 20).replace(/\s+/g, ' ') })
  }
  return hits
}

// Prose may use the everyday words the UI list bans (start, add, value, drop, cover, bench ...). It may not use the words that read as tips or
// betting: pick(s), lock(s), sleeper(s), fade, stash, trending, odds, spread, parlay ... "draft pick" (a baseball term) is allowed below.
const PROSE_EVERYDAY = new Set(['spread', 'cover', 'value', 'units', 'sharp', 'start', 'sit', 'bench', 'add', 'drop', 'tier', 'pick up'])
const PROSE_ALLOWED: RegExp[] = [/draft picks?/gi, /first-round picks?/gi, /pick-?offs?/gi, /pick(?:ed)? off/gi, /lock(?:ed)? in\b/gi, /lock(?:ed)? down/gi, /clubhouse locks?/gi]
const PROSE_RE = new RegExp(
  '(?<![\\w-])(' + BANNED.filter(w => !PROSE_EVERYDAY.has(w.toLowerCase())).map(escape).sort((a, b) => b.length - a.length).join('|') + ')(?![\\w-])', 'gi')

/** For long-form prose (articles, captions): tips, betting and prediction words only; everyday baseball words are fine in a sentence. */
export function lintProse(text: string): Hit[] {
  let cleaned = text
  for (const re of [...ALLOWED, ...PROSE_ALLOWED]) cleaned = cleaned.replace(re, m => ' '.repeat(m.length))
  const hits: Hit[] = []
  PROSE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PROSE_RE.exec(cleaned))) hits.push({ line: 1, col: m.index + 1, word: m[1], context: text.slice(Math.max(0, m.index - 24), m.index + m[1].length + 24).replace(/\s+/g, ' ') })
  return hits
}
