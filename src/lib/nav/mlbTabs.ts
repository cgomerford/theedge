// The ONE list of MLB tabs. Used by the MLB sub-header, the header's MLB panel and the mobile menu.
// Not in the nav on purpose (routes stay): /mlb/abs, Contact Lab, Platoon Lab, Track Record / Past Games.
// Teams is skipped until a /mlb/teams index page exists (today only /mlb/teams/[slug]).
export type MlbTab = { id: string; href: string; label: string; pro?: boolean }

export const MLB_TABS: MlbTab[] = [
  { id: 'games', href: '/mlb', label: 'Games' },
  { id: 'scores', href: '/mlb/scores', label: 'Scores' },
  // No scout report index exists: this lands on the games list, where each game links to its scout report.
  { id: 'scout', href: '/mlb#scout-reports', label: 'Scout reports' },
  { id: 'pitching', href: '/mlb/lab/pitching-lab', label: 'Pitching Lab' },
  { id: 'batting', href: '/mlb/lab/batting-lab', label: 'Batting Lab' },
  { id: 'stats', href: '/mlb/stats', label: 'Stats' },
  { id: 'ask', href: '/mlb/ask', label: 'Ask the stats' },
  { id: 'glossary', href: '/mlb/glossary', label: 'Glossary' },
]

/** Which tab is active for a path: Games on /mlb and on game pages, Scout reports on a game's scout report, labs by prefix, and so on. */
export function activeMlbTab(pathname: string | null): string | undefined {
  const p = pathname ?? ''
  if (/^\/mlb\/[^/]+\/scout-report\/?$/.test(p)) return 'scout'
  if (p.startsWith('/mlb/lab/pitching-lab')) return 'pitching'
  if (p.startsWith('/mlb/lab/batting-lab')) return 'batting'
  if (p.startsWith('/mlb/scores')) return 'scores'
  if (p.startsWith('/mlb/ask')) return 'ask'
  if (p.startsWith('/mlb/stats')) return 'stats'
  if (p.startsWith('/mlb/glossary')) return 'glossary'
  if (p === '/mlb' || /^\/mlb\/\d{4}|^\/mlb\/[a-z0-9-]+-\d{4}-\d{2}-\d{2}/.test(p)) return 'games'
  return undefined
}
