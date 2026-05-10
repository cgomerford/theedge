import type { ProjectedLineup } from '@/lib/lineups'

type Props = {
  lineup: ProjectedLineup
  teamName: string
  teamShort: string
  teamLogoUrl?: string | null
}

export default function LineupCard({ lineup, teamName, teamShort, teamLogoUrl }: Props) {
  // Empty state
  if (lineup.source === 'unavailable' || lineup.batters.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          {teamLogoUrl && (
            <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={teamLogoUrl} alt={teamShort} className="max-w-full max-h-full object-contain" />
            </div>
          )}
          <h3 className="text-lg font-serif font-bold text-stone-900">{teamShort}</h3>
        </div>
        <p className="text-sm text-stone-500 italic">
          Lineup not yet available.
        </p>
      </div>
    )
  }

  // Status pill
  const statusLabel = lineup.source === 'confirmed' 
    ? 'Confirmed today'
    : `Based on ${formatDate(lineup.game_date_used)}`
  
  const statusColor = lineup.source === 'confirmed' 
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-stone-600 bg-stone-50 border-stone-200'

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {teamLogoUrl && (
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={teamLogoUrl} alt={teamShort} className="max-w-full max-h-full object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base md:text-lg font-serif font-bold text-stone-900 truncate">
                {teamShort} Lineup
              </h3>
              <div className="text-xs font-mono uppercase tracking-wider text-stone-500">
                Projected · 9 batters
              </div>
            </div>
          </div>
          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 border rounded whitespace-nowrap ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Batting order */}
      <div className="divide-y divide-stone-100">
        {lineup.batters.map((batter) => (
          <div key={batter.player_id} className="px-5 py-3 flex items-center gap-4 hover:bg-stone-50 transition">
            <div className="w-6 text-stone-400 font-mono text-sm flex-shrink-0">
              {batter.batting_order}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-serif font-semibold text-stone-900 text-sm md:text-base truncate">
                {batter.player_name}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">
                {batter.position}
              </div>
            </div>
            <div className="flex gap-3 md:gap-4 text-right flex-shrink-0">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">AVG</div>
                <div className="font-mono text-sm text-stone-900 tabular-nums">
                  {batter.season_avg !== null ? batter.season_avg.toFixed(3) : '---'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">OPS</div>
                <div className="font-mono text-sm text-stone-900 tabular-nums">
                  {batter.season_ops !== null ? batter.season_ops.toFixed(3) : '---'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pro tease footer */}
      <div className="px-5 py-3 border-t border-stone-100 bg-stone-50">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 flex items-center gap-2">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Pro: hot zones · L5 splits · vs RHP/LHP
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  
  // If it was yesterday, say "yesterday's game"
  if (d.toDateString() === yesterday.toDateString()) return "yesterday's game"
  
  // Otherwise short date format
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + " game"
}