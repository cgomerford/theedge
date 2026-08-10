/**
 * src/lib/fantasy-transactions.ts
 *
 * MLB's official transaction log covers injuries AND roster moves from
 * one endpoint — /api/v1/transactions. Rather than building separate
 * "injuries" and "transactions" data sources, this fetches once and
 * categorizes by reading typeDesc + description text. The description
 * field MLB returns is already close to tweet-ready, e.g.:
 *   "Philadelphia Phillies placed RHP Zack Wheeler on the 15-day
 *    injured list retroactive to July 10, 2026. Right elbow inflammation."
 *
 * ⚠ UNAUDITED — categorization is text-matching against typeDesc/description,
 * not a documented enum from MLB. Spot-check a week's worth against
 * mlb.com/transactions before trusting the grouping blindly.
 */

const MLB_STATS_BASE = 'https://statsapi.mlb.com/api/v1'

export type MLBTransaction = {
  id: number
  playerId: number | null
  playerName: string | null
  team: string | null       // toTeam — the team the move is happening on/to
  fromTeam: string | null
  typeCode: string | null
  typeDesc: string | null
  description: string
  date: string               // YYYY-MM-DD
}

export async function fetchTransactions(
  startDate: string,
  endDate: string,
  sportId: number = 1,
): Promise<MLBTransaction[]> {
  const url = `${MLB_STATS_BASE}/transactions?startDate=${startDate}&endDate=${endDate}&sportId=${sportId}`
  try {
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) return []
    const data = await res.json()
    const rows: unknown[] = data?.transactions ?? []
    return rows
      .map((r) => {
        const t = r as Record<string, any>
        return {
          id: t.id,
          playerId: t.person?.id ?? null,
          playerName: t.person?.fullName ?? null,
          team: t.toTeam?.name ?? null,
          fromTeam: t.fromTeam?.name ?? null,
          typeCode: t.typeCode ?? null,
          typeDesc: t.typeDesc ?? null,
          description: t.description ?? '',
          date: t.date ?? t.effectiveDate ?? t.resolutionDate ?? '',
        } as MLBTransaction
      })
      .filter(t => Number.isFinite(t.id) && t.description)
  } catch {
    return []
  }
}

// ─── Categorization — text match against typeDesc + description ────────────

function textOf(t: MLBTransaction): string {
  return `${t.typeDesc ?? ''} ${t.description ?? ''}`.toLowerCase()
}

export function isInjuryMove(t: MLBTransaction): boolean {
  const s = textOf(t)
  return s.includes('injured list') || s.includes(' il ') || s.includes('il.') || s.includes('il,')
}
export function isILPlacement(t: MLBTransaction): boolean {
  return isInjuryMove(t) && textOf(t).includes('placed')
}
export function isILActivation(t: MLBTransaction): boolean {
  const s = textOf(t)
  return isInjuryMove(t) && (s.includes('activated') || s.includes('reinstated'))
}
export function isTrade(t: MLBTransaction): boolean {
  return (t.typeDesc ?? '').toLowerCase().includes('trade')
}
export function isDFAOrRelease(t: MLBTransaction): boolean {
  const s = textOf(t)
  return s.includes('designated for assignment') || s.includes('released') || (t.typeDesc ?? '').toLowerCase().includes('release')
}
export function isRecall(t: MLBTransaction): boolean {
  const s = textOf(t)
  return s.includes('recalled') || s.includes('selected the contract')
}
export function isOption(t: MLBTransaction): boolean {
  return textOf(t).includes('optioned')
}

// ─── Weekly report — bucketed + sorted newest first ─────────────────────────

export type WeeklyTransactionReport = {
  ilPlaced: MLBTransaction[]
  ilActivated: MLBTransaction[]
  trades: MLBTransaction[]
  dfaRelease: MLBTransaction[]
  recalled: MLBTransaction[]
  optioned: MLBTransaction[]
  other: MLBTransaction[]
}

function emptyReport(): WeeklyTransactionReport {
  return { ilPlaced: [], ilActivated: [], trades: [], dfaRelease: [], recalled: [], optioned: [], other: [] }
}

export async function getWeeklyTransactionReport(
  startDate: string,
  endDate: string,
): Promise<WeeklyTransactionReport> {
  const all = await fetchTransactions(startDate, endDate).catch(() => [] as MLBTransaction[])
  const report = emptyReport()

  for (const t of all) {
    // Order matters — injury checks first since trade/release descriptions
    // never overlap with IL language, but check specific before generic.
    if (isILPlacement(t)) report.ilPlaced.push(t)
    else if (isILActivation(t)) report.ilActivated.push(t)
    else if (isTrade(t)) report.trades.push(t)
    else if (isDFAOrRelease(t)) report.dfaRelease.push(t)
    else if (isRecall(t)) report.recalled.push(t)
    else if (isOption(t)) report.optioned.push(t)
    else if (isInjuryMove(t)) report.ilPlaced.push(t) // catch-all injury fallback
    else report.other.push(t)
  }

  const byDateDesc = (a: MLBTransaction, b: MLBTransaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  for (const key of Object.keys(report) as (keyof WeeklyTransactionReport)[]) {
    report[key].sort(byDateDesc)
  }
  return report
}
