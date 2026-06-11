'use client'

// src/components/SeriesContext.tsx
// GM Lab — Series Context card
// Reads from series_context table via props passed from page.tsx
// Shows: game N of M, series score dots, who leads, stakes narrative

type SeriesContextProps = {
  seriesGameNumber: number
  seriesTotalGames: number
  awayTeamName: string
  homeTeamName: string
  awayAbbr: string
  homeAbbr: string
  awaySeriesWins: number
  homeSeriesWins: number
  seriesLeader: string | null        // 'home' | 'away' | 'tied'
  seriesDescription: string | null   // e.g. "Philadelphia Phillies lead series 1-0"
  lastWinner: string | null          // team name
  lastGameMargin: number | null      // run margin of last game
  isSeriesDecider: boolean
  awayFacesElimination: boolean
  homeFacesElimination: boolean
  seriesOpenerDate: string | null
  awayPrimaryColor?: string
  homePrimaryColor?: string
}

export default function SeriesContext({
  seriesGameNumber,
  seriesTotalGames,
  awayTeamName,
  homeTeamName,
  awayAbbr,
  homeAbbr,
  awaySeriesWins,
  homeSeriesWins,
  seriesLeader,
  seriesDescription,
  lastWinner,
  lastGameMargin,
  isSeriesDecider,
  awayFacesElimination,
  homeFacesElimination,
  seriesOpenerDate,
  awayPrimaryColor = '#1A1A1A',
  homePrimaryColor = '#1A1A1A',
}: SeriesContextProps) {

  // ── Stakes line ──────────────────────────────────────────────────────────
  function buildStakesLine(): string {
    if (isSeriesDecider) {
      return `Series decider — winner takes the series, loser moves on empty-handed.`
    }
    if (awayFacesElimination) {
      return `${awayTeamName} must win to stay alive in this series.`
    }
    if (homeFacesElimination) {
      return `${homeTeamName} must win to stay alive in this series.`
    }
    if (seriesGameNumber === 1) {
      return `Opening game of a ${seriesTotalGames}-game set. Series momentum starts here.`
    }
    if (seriesLeader === 'tied') {
      return `Series tied — whoever takes tonight builds the advantage heading into the final game${seriesTotalGames === 3 ? '' : 's'}.`
    }
    if (seriesLeader === 'away') {
      return `${awayTeamName} lead the series and can clinch with a win tonight.`
    }
    if (seriesLeader === 'home') {
      return `${homeTeamName} lead the series and can clinch with a win tonight.`
    }
    return seriesDescription ?? ''
  }

  // ── Last game note ───────────────────────────────────────────────────────
  function buildLastGameNote(): string | null {
    if (seriesGameNumber <= 1 || !lastWinner) return null
    const margin = lastGameMargin != null ? ` by ${lastGameMargin}` : ''
    return `${lastWinner} won Game ${seriesGameNumber - 1}${margin}.`
  }

  // ── Dot rendering ────────────────────────────────────────────────────────
  // Dots left of centre = away wins, right = home wins
  function buildDots() {
    const dots = []
    for (let i = 0; i < seriesTotalGames; i++) {
      const isAwayWin = i < awaySeriesWins
      const isHomeWin = i >= seriesTotalGames - homeSeriesWins
      const isCurrentGame = i === awaySeriesWins && !isHomeWin

      dots.push({ isAwayWin, isHomeWin, isCurrentGame })
    }
    return dots
  }

  const dots = buildDots()
  const stakesLine = buildStakesLine()
  const lastGameNote = buildLastGameNote()

  const isElimination = awayFacesElimination || homeFacesElimination || isSeriesDecider

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, #FFFBF0 0%, #FFFFFF 100%)' }}>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl leading-none text-stone-900"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              Game {seriesGameNumber}
            </span>
            <span className="font-mono text-xs text-stone-400 uppercase tracking-widest">
              of {seriesTotalGames}
            </span>
          </div>
          <div className="font-mono text-[10px] text-stone-400 uppercase tracking-wider mt-1">
            {awayTeamName} at {homeTeamName}
          </div>
        </div>

        {/* Elimination / Decider badge */}
        {isElimination && (
          <div className="shrink-0 px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider"
            style={{ background: 'rgba(220,38,38,0.10)', color: '#DC2626' }}>
            {isSeriesDecider ? 'Series Decider' : 'Elimination Game'}
          </div>
        )}
      </div>

      {/* ── Series score dots ── */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-stone-100">
        {/* Away label */}
        <span className="font-mono text-xs font-bold text-stone-500 w-8 shrink-0">{awayAbbr}</span>

        {/* Dots */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          {dots.map((dot, i) => (
            <div key={i}
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
              style={{
                background: dot.isAwayWin
                  ? awayPrimaryColor
                  : dot.isHomeWin
                    ? homePrimaryColor
                    : 'transparent',
                borderColor: dot.isCurrentGame
                  ? '#FF5722'
                  : dot.isAwayWin
                    ? awayPrimaryColor
                    : dot.isHomeWin
                      ? homePrimaryColor
                      : '#D4D0C8',
                boxShadow: dot.isCurrentGame ? '0 0 0 2px rgba(255,87,34,0.25)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Home label */}
        <span className="font-mono text-xs font-bold text-stone-500 w-8 shrink-0 text-right">{homeAbbr}</span>

        {/* Series score */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className="font-mono text-sm font-bold" style={{ color: awaySeriesWins > homeSeriesWins ? awayPrimaryColor : '#78716C' }}>
            {awaySeriesWins}
          </span>
          <span className="font-mono text-xs text-stone-300">–</span>
          <span className="font-mono text-sm font-bold" style={{ color: homeSeriesWins > awaySeriesWins ? homePrimaryColor : '#78716C' }}>
            {homeSeriesWins}
          </span>
        </div>
      </div>

      {/* ── Stakes narrative ── */}
      <div className="px-5 py-4">
        {/* Series leader pill */}
        {seriesLeader && seriesLeader !== 'tied' && seriesGameNumber > 1 && (
          <div className="mb-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
              style={{
                background: seriesLeader === 'away'
                  ? `${awayPrimaryColor}18`
                  : `${homePrimaryColor}18`,
                color: seriesLeader === 'away' ? awayPrimaryColor : homePrimaryColor,
              }}>
              {seriesLeader === 'away' ? awayAbbr : homeAbbr} leads series
            </span>
          </div>
        )}

        {/* Stakes line */}
        <p className="font-serif italic text-stone-700 text-sm leading-relaxed mb-2">
          {stakesLine}
        </p>

        {/* Last game note */}
        {lastGameNote && (
          <p className="font-mono text-[11px] text-stone-400 mt-2">
            {lastGameNote}
          </p>
        )}

        {/* Opener date */}
        {seriesOpenerDate && seriesGameNumber === 1 && (
          <p className="font-mono text-[10px] text-stone-400 mt-1 uppercase tracking-wider">
            Series opens {new Date(seriesOpenerDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  )
}