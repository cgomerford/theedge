// src/lib/nfl/roster-transactions.ts
//
// Real roster transactions (signings, releases, IR moves, trades, waiver
// claims) from ESPN's public transactions endpoint. Distinct from
// src/lib/nfl/transactions.ts, which — despite its name — is the injury
// report (see that file's header comment). Deliberately NOT reusing that
// filename to avoid colliding with a different data source; the injury
// file should get renamed to something like nfl/injuries.ts in a
// dedicated pass once every importer of it has been grepped for, not
// bundled into this change.
//
// Curl-verified 2026-08-16 against:
//   https://site.api.espn.com/apis/site/v2/sports/football/nfl/transactions
//   https://.../transactions?page=2
// Confirmed shape: { count, pageIndex, pageSize, pageCount, transactions: [
//   { date, description, team: { id, location, name, abbreviation,
//     displayName, color, alternateColor, logos[], links[] } }
// ]}
// No transaction `type`/`category` field exists — `description` is a
// single free-text string that can bundle multiple discrete moves in one
// entry (e.g. "Signed CB X. Placed CB Y on the exempt/left list.
// Reinstated DT Z from PUP."). This module classifies a PRIMARY action
// per entry (from the first clause) for badge display, but does not
// split multi-move entries into separate rows — that would require
// guessing where one "move" ends and the attribution to a player begins,
// which is exactly the kind of guessed-parsing the project's data rules
// warn against. Full description text is preserved so nothing is lost.
//
// pageSize is fixed at 25 (confirmed — requesting doesn't appear to
// accept a pageSize override in testing; only `page` was verified).

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

export type NFLRosterTransaction = {
  id: string
  date: string
  description: string
  team: {
    id: string
    abbreviation: string
    displayName: string
    color: string | null
    logo: string | null
  }
  primaryAction: string
}

// Ordered so more specific phrases are checked before generic ones
// (e.g. "Placed ... injured reserve" before a bare "Placed").
// Built directly off verbs actually observed in real ESPN descriptions —
// not a guessed/invented taxonomy.
const ACTION_PATTERNS: Array<{ match: RegExp; label: string }> = [
  { match: /placed .* on injured reserve/i, label: 'Injured Reserve' },
  { match: /placed .* on (the )?physically unable to perform/i, label: 'PUP List' },
  { match: /placed .* on (the )?exempt/i, label: 'Exempt List' },
  { match: /placed .* on (the )?reserve\/retired/i, label: 'Retired' },
  { match: /placed .* on (the )?practice squad injured/i, label: 'PS Injured' },
  { match: /reinstated/i, label: 'Reinstated' },
  { match: /activated/i, label: 'Activated' },
  { match: /^signed .* to (a |the )?practice squad/i, label: 'Practice Squad Signing' },
  { match: /released .* from (the )?practice squad/i, label: 'PS Release' },
  { match: /^signed /i, label: 'Signed' },
  { match: /^re-signed /i, label: 'Re-signed' },
  { match: /^waived /i, label: 'Waived' },
  { match: /^released /i, label: 'Released' },
  { match: /claimed .* off waivers/i, label: 'Waiver Claim' },
  { match: /^traded /i, label: 'Traded' },
  { match: /^acquired /i, label: 'Traded' },
  { match: /suspended/i, label: 'Suspended' },
  { match: /promoted .* to (the )?active roster/i, label: 'Promoted' },
  { match: /elevated/i, label: 'Elevated' },
]

function classifyPrimaryAction(description: string): string {
  const firstClause = description.split('. ')[0] ?? description
  for (const { match, label } of ACTION_PATTERNS) {
    if (match.test(firstClause)) return label
  }
  return 'Roster Move'
}

async function fetchTransactionsPage(page: number): Promise<any[]> {
  try {
    const res = await fetch(`${ESPN}/transactions?page=${page}`, {
      next: { revalidate: 1800 }, // 30 min — transactions don't need to-the-minute freshness
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.transactions ?? []
  } catch (e) {
    console.error(`fetchTransactionsPage(${page}) error:`, e)
    return []
  }
}

function parseTransaction(raw: any, index: number): NFLRosterTransaction | null {
  if (!raw?.description || !raw?.team) return null
  const team = raw.team
  return {
    id: `${team.id ?? 'unk'}-${raw.date ?? 'unk'}-${index}`,
    date: raw.date ?? '',
    description: raw.description,
    team: {
      id: String(team.id ?? ''),
      abbreviation: team.abbreviation ?? '',
      displayName: team.displayName ?? '',
      color: team.color ? `#${team.color}` : null,
      logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${(team.abbreviation ?? '').toLowerCase()}.png`,
    },
    primaryAction: classifyPrimaryAction(raw.description),
  }
}

// League-wide recent transactions for the homepage wire.
// pageSize is 25 (confirmed) so limit=25 needs just page 1; anything
// above that pulls page 2 as well. Two pages max — this is a homepage
// teaser, not the full log.
export async function getHomepageTransactions(limit: number = 20): Promise<NFLRosterTransaction[]> {
  const pagesNeeded = limit > 25 ? 2 : 1
  const pages = await Promise.all(
    Array.from({ length: pagesNeeded }, (_, i) => fetchTransactionsPage(i + 1))
  )
  const raw = pages.flat()
  const parsed = raw
    .map((r, i) => parseTransaction(r, i))
    .filter((t): t is NFLRosterTransaction => t !== null)

  return parsed.slice(0, limit)
}

// Per-team transactions (for team pages later) — filters the same feed
// client-side by team abbreviation since ESPN's transactions endpoint
// doesn't expose a per-team filter param (only unverified — worth a
// separate curl check with a teamId param before relying on it).
export async function getTeamTransactions(
  teamAbbr: string,
  pagesToScan: number = 4,
): Promise<NFLRosterTransaction[]> {
  const pages = await Promise.all(
    Array.from({ length: pagesToScan }, (_, i) => fetchTransactionsPage(i + 1))
  )
  const raw = pages.flat()
  return raw
    .map((r, i) => parseTransaction(r, i))
    .filter((t): t is NFLRosterTransaction => t !== null)
    .filter(t => t.team.abbreviation.toUpperCase() === teamAbbr.toUpperCase())
}