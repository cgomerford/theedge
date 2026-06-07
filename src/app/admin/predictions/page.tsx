import { requireAdmin } from '@/lib/admin'
import { getRecentReads } from '@/lib/track-record'
import SiteHeader from '@/components/SiteHeader'
import Link from 'next/link'
import ShareButton from './ShareButton'
import { buildTweetText, buildReplyText } from '@/lib/share-text'

export const metadata = {
  title: 'Predictions Explorer · Admin',
  robots: { index: false, follow: false },  // never indexed by search engines
}

export const dynamic = 'force-dynamic'  // always fresh, no caching

type Props = {
  searchParams: Promise<{ date?: string; days?: string }>
}

export default async function AdminPredictionsPage({ searchParams }: Props) {
  // Gate — bounces non-admins before any work happens
  const admin = await requireAdmin()

  const sp = await searchParams
  
// Default: last 7 days ending today
  const endDate = sp.date ?? new Date().toISOString().split('T')[0]
  const days = parseInt(sp.days ?? '7', 10)

  // Build the date range as an array
  const dateRange: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(endDate + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - i)
    dateRange.push(d.toISOString().split('T')[0])
  }

  // Earliest date in the range — used for the SQL query lower bound
  const startDate = dateRange[dateRange.length - 1]

  // Fetch every prediction in the date range
const predictions = await getRecentReads(500)

  // Compute summary stats
  const gradedCount = predictions.filter(p => p.outcome_matched !== null).length
const correctCount = predictions.filter(p => p.outcome_matched === true).length
  const wrongCount = predictions.filter(p => p.outcome_matched === false).length
  const accuracy = gradedCount > 0 
    ? `${((correctCount / gradedCount) * 100).toFixed(1)}%` 
    : '—'

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900">
      <SiteHeader variant="page" />

      {/* ═══ MASTHEAD ════════════════════════════════════════════ */}
      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600">
              ⊕ Admin · Predictions Explorer
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
              {admin.email}
            </div>
          </div>
          <h1 className="font-serif font-light text-4xl sm:text-6xl tracking-tight leading-none">
            Track record<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base max-w-2xl">
            Every prediction, every result. Copy the share text or download the card.
          </p>
        </div>
      </div>

      {/* ═══ DATE CONTROLS ═══════════════════════════════════════ */}
      <div className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-4">
          <form method="GET" className="flex items-center gap-2">
            <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500">
              End date
            </label>
            <input
              type="date"
              name="date"
              defaultValue={endDate}
              className="border border-stone-300 px-3 py-1.5 text-sm font-mono"
            />
            <label className="text-[11px] font-mono uppercase tracking-widest text-stone-500 ml-2">
              Days back
            </label>
            <select
              name="days"
              defaultValue={String(days)}
              className="border border-stone-300 px-3 py-1.5 text-sm font-mono"
            >
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
            </select>
            <button
              type="submit"
              className="bg-stone-900 text-white px-4 py-1.5 text-xs font-mono uppercase tracking-widest hover:bg-stone-700 transition"
            >
              Load
            </button>
          </form>

          <div className="ml-auto flex gap-2">
            <Link
              href={`/admin/predictions?date=${new Date().toISOString().split('T')[0]}&days=1`}
              className="text-xs font-mono uppercase tracking-widest text-stone-600 hover:text-stone-900 underline"
            >
              Today
            </Link>
            <Link
              href={`/admin/predictions?date=${(() => {
                const y = new Date()
                y.setDate(y.getDate() - 1)
                return y.toISOString().split('T')[0]
              })()}&days=1`}
              className="text-xs font-mono uppercase tracking-widest text-stone-600 hover:text-stone-900 underline"
            >
              Yesterday
            </Link>
            <Link
              href={`/admin/predictions?days=7`}
              className="text-xs font-mono uppercase tracking-widest text-stone-600 hover:text-stone-900 underline"
            >
              Last 7
            </Link>
          </div>
        </div>
      </div>

{/* ═══ TABLE ════════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {predictions.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-12 text-center">
            <h2 className="text-xl font-serif text-stone-900 mb-2">No predictions in this range</h2>
            <p className="text-stone-500 text-sm">
              {startDate} → {endDate}
            </p>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="bg-stone-900 text-stone-100 rounded-lg p-4 mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <span className="font-mono">
                <span className="text-stone-400 uppercase tracking-widest text-xs">Predictions:</span>{' '}
                <span className="font-bold">{predictions.length}</span>
              </span>
              <span className="font-mono">
                <span className="text-stone-400 uppercase tracking-widest text-xs">Graded:</span>{' '}
                <span className="font-bold">{gradedCount}</span>
              </span>
              <span className="font-mono">
                <span className="text-stone-400 uppercase tracking-widest text-xs">Correct:</span>{' '}
                <span className="font-bold text-green-400">{correctCount}</span>
              </span>
              <span className="font-mono">
                <span className="text-stone-400 uppercase tracking-widest text-xs">Wrong:</span>{' '}
                <span className="font-bold text-red-400">{wrongCount}</span>
              </span>
              <span className="font-mono">
                <span className="text-stone-400 uppercase tracking-widest text-xs">Accuracy:</span>{' '}
                <span className="font-bold text-yellow-300">{accuracy}</span>
              </span>
            </div>

            {/* Predictions table */}
            <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-stone-500">Date</th>
                    <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-stone-500">Matchup</th>
                    <th className="text-center p-3 font-mono text-[10px] uppercase tracking-widest text-stone-500">Edge</th>
                    <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-stone-500">Predicted</th>
                    <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-stone-500">Actual</th>
                    <th className="text-center p-3 font-mono text-[10px] uppercase tracking-widest text-stone-500">Result</th>
                    <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-stone-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => {
                    const predictedTeamName = p.factor_lean === 'home' ? p.home_team : p.factor_lean === 'away' ? p.away_team : null
const actualTeamName = p.actual_winner === 'home' ? p.home_team : p.actual_winner === 'away' ? p.away_team : null
                    const slug = `${teamSlug(p.away_team)}-vs-${teamSlug(p.home_team)}-${p.game_date}`
                    const scoreText = p.home_score !== null && p.away_score !== null
                      ? `${p.away_score}-${p.home_score}`
                      : null

                    return (
                      <tr key={p.game_pk} className="border-t border-stone-100 hover:bg-stone-50">
                        <td className="p-3 font-mono text-xs text-stone-600">{p.game_date}</td>
                        <td className="p-3 font-serif">
                          <Link href={`/mlb/${slug}`} className="hover:underline" target="_blank">
                            {shortName(p.away_team)} @ {shortName(p.home_team)}
                          </Link>
                        </td>
                        <td className="p-3 text-center font-mono font-bold">
                          {p.lean_factors}/{p.total_factors}
                        </td>
                        <td className="p-3 font-serif">
                         {predictedTeamName ? shortName(predictedTeamName) : <span className="text-stone-400 text-xs">Split</span>}
                        </td>
                        <td className="p-3 font-serif text-stone-600">
                          {actualTeamName ? (
                            <>
                              {shortName(actualTeamName)}
                              {scoreText && <span className="text-xs font-mono text-stone-400 ml-2">{scoreText}</span>}
                            </>
                          ) : (
                            <span className="text-stone-400 text-xs">Pending</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {p.outcome_matched === true && <span className="text-green-600 font-bold">✓</span>}
{p.outcome_matched === false && <span className="text-red-600 font-bold">✗</span>}
{p.outcome_matched === null && <span className="text-stone-400 text-xs">—</span>}
                        </td>
                       <td className="p-3 text-right">
                          <ShareButton
                            tweetText={buildTweetText(p)}
                            replyText={buildReplyText(p)}
                            imageUrl={`/api/share-card/${p.game_pk}`}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

// Small utility — same logic as in mlb.ts but local to avoid the import
function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function shortName(name: string): string {
  const parts = name.split(' ')
  return parts[parts.length - 1]
}