import Link from 'next/link'
import type { CalendarGame } from '@/lib/dugout-calendar'

type Props = {
  games: CalendarGame[]
  yearMonth: string  // 'YYYY-MM'
  teamShort: string  // e.g. 'PHILLIES' for header
  teamPrimaryColor: string  // hex for accent
  prevMonth: string | null  // 'YYYY-MM', null if at season start
  nextMonth: string | null  // 'YYYY-MM', null if at current month
}

// ============================================================
// Helpers — pure, no React
// ============================================================

function getMonthName(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(n => parseInt(n, 10))
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(n => parseInt(n, 10))
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Day-of-week (0 = Sun, 6 = Sat) for the 1st of the month
function firstDayWeekday(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(n => parseInt(n, 10))
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ============================================================
// Cell styling
// ============================================================

type CellState =
  | { kind: 'empty' }
  | { kind: 'win'; game: CalendarGame; isToday: boolean }
  | { kind: 'loss'; game: CalendarGame; isToday: boolean }
  | { kind: 'pending'; game: CalendarGame; isToday: boolean }
  | { kind: 'postponed'; game: CalendarGame; isToday: boolean }

function cellState(game: CalendarGame | undefined, isToday: boolean): CellState {
  if (!game) return { kind: 'empty' }
  if (game.team_won === true) return { kind: 'win', game, isToday }
  if (game.team_won === false) return { kind: 'loss', game, isToday }
  // null team_won — could be future, in-progress, or postponed
  // We use score nullity as a proxy: scores present but no win = should not happen, but defensive
  return { kind: 'pending', game, isToday }
}

function cellClasses(state: CellState): string {
  const base = 'aspect-square flex flex-col p-2 text-xs transition border'
  if (state.kind === 'empty') {
    return `${base} bg-stone-50 border-stone-100`
  }

  const todayRing = state.isToday ? ' ring-2 ring-orange-500 ring-offset-1' : ''

  switch (state.kind) {
    case 'win':
      return `${base} bg-green-50 border-green-200 hover:bg-green-100${todayRing}`
    case 'loss':
      return `${base} bg-red-50 border-red-200 hover:bg-red-100${todayRing}`
    case 'pending':
      return `${base} bg-amber-50 border-amber-200 hover:bg-amber-100${todayRing}`
    case 'postponed':
      return `${base} bg-stone-100 border-stone-300${todayRing}`
  }
}

function cellGlyph(state: CellState): { letter: string; color: string } {
  switch (state.kind) {
    case 'win':       return { letter: 'W', color: 'text-green-700' }
    case 'loss':      return { letter: 'L', color: 'text-red-700' }
    case 'pending':   return { letter: '·', color: 'text-amber-700' }
    case 'postponed': return { letter: '—', color: 'text-stone-500' }
    case 'empty':     return { letter: '',  color: '' }
  }
}

function tooltipText(game: CalendarGame): string {
  const venue = game.is_home ? 'vs' : '@'
  const opp = game.opponent_short
  const score = game.team_score != null && game.opponent_score != null
    ? ` · ${game.team_score}-${game.opponent_score}`
    : ''
  const edge = game.edge_score != null
    ? ` · Edge ${game.edge_score > 0 ? '+' : ''}${game.edge_score}`
    : ''
  const modelCall = game.was_correct === true
    ? ' · model ✓'
    : game.was_correct === false
      ? ' · model ✗'
      : ''
  return `${venue} ${opp}${score}${edge}${modelCall}`
}

// ============================================================
// Component
// ============================================================

export default function DugoutCalendar({
  games,
  yearMonth,
  teamShort,
  teamPrimaryColor,
  prevMonth,
  nextMonth,
}: Props) {
  const totalDays = daysInMonth(yearMonth)
  const startWeekday = firstDayWeekday(yearMonth)
  const today = todayISO()

  // Map of YYYY-MM-DD → CalendarGame
  // (a team could play 2 in one day during doubleheaders — we take the first for the cell view)
  const gameByDate = new Map<string, CalendarGame>()
  for (const g of games) {
    if (!gameByDate.has(g.game_date)) {
      gameByDate.set(g.game_date, g)
    }
  }

  // Aggregate stats for the month header strip
  const playedGames = games.filter(g => g.team_won !== null)
  const wins = playedGames.filter(g => g.team_won === true).length
  const losses = playedGames.filter(g => g.team_won === false).length

  const gradedPreds = games.filter(g => g.was_correct !== null)
  const correctPreds = gradedPreds.filter(g => g.was_correct === true).length
  const modelAcc = gradedPreds.length > 0
    ? `${Math.round((correctPreds / gradedPreds.length) * 100)}%`
    : '—'

  // Build day cells — leading blanks for first row, then 1..totalDays
  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, iso: null })
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${yearMonth}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, iso })
  }

  return (
    <section className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      {/* ═══ HEADER ═══ */}
      <div className="border-b border-stone-200 bg-stone-50 p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">
            ⊕ {teamShort} · Season at a glance
          </div>
          <h2 className="font-serif text-2xl text-stone-900 leading-tight">
            {getMonthName(yearMonth)}
          </h2>
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-2">
          {prevMonth ? (
            <Link
              href={`/dugout?month=${prevMonth}`}
              className="px-3 py-1.5 border border-stone-300 text-xs font-mono uppercase tracking-widest hover:bg-stone-100"
            >
              ← Prev
            </Link>
          ) : (
            <span className="px-3 py-1.5 border border-stone-200 text-xs font-mono uppercase tracking-widest text-stone-300">
              ← Prev
            </span>
          )}
          {nextMonth ? (
            <Link
              href={`/dugout?month=${nextMonth}`}
              className="px-3 py-1.5 border border-stone-300 text-xs font-mono uppercase tracking-widest hover:bg-stone-100"
            >
              Next →
            </Link>
          ) : (
            <span className="px-3 py-1.5 border border-stone-200 text-xs font-mono uppercase tracking-widest text-stone-300">
              Next →
            </span>
          )}
        </div>
      </div>

      {/* ═══ STATS STRIP ═══ */}
      <div className="border-b border-stone-200 px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="font-mono">
          <span className="text-stone-400 uppercase tracking-widest">Record:</span>{' '}
          <span className="font-bold" style={{ color: teamPrimaryColor }}>
            {wins}-{losses}
          </span>
        </span>
        <span className="font-mono">
          <span className="text-stone-400 uppercase tracking-widest">Model acc:</span>{' '}
          <span className="font-bold text-stone-900">{modelAcc}</span>
          <span className="text-stone-400 ml-1">({correctPreds}/{gradedPreds.length})</span>
        </span>
        <span className="font-mono ml-auto text-[10px] text-stone-400 uppercase tracking-widest">
          Click cell → game page
        </span>
      </div>

      {/* ═══ DAY-OF-WEEK HEADER ═══ */}
      <div className="grid grid-cols-7 border-b border-stone-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div
            key={d}
            className="text-center py-2 text-[10px] font-mono uppercase tracking-widest text-stone-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ═══ GRID ═══ */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (cell.day === null || cell.iso === null) {
            return <div key={i} className="aspect-square bg-stone-50 border border-stone-100" />
          }

          const game = gameByDate.get(cell.iso)
          const isToday = cell.iso === today
          const state = cellState(game, isToday)
          const glyph = cellGlyph(state)

          // Empty cell — non-clickable
          if (state.kind === 'empty') {
            return (
              <div key={i} className={cellClasses(state)}>
                <span className="text-stone-400 font-mono text-[10px]">{cell.day}</span>
              </div>
            )
          }

          // Has a game — wrap in Link
          return (
            <Link
              key={i}
              href={`/mlb/${state.game.slug}`}
              title={tooltipText(state.game)}
              className={cellClasses(state)}
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] text-stone-600">{cell.day}</span>
                {state.game.was_correct !== null && (
                  <span
                    className={`font-mono text-[10px] font-bold ${
                      state.game.was_correct ? 'text-green-600' : 'text-red-600'
                    }`}
                    aria-label={state.game.was_correct ? 'Model correct' : 'Model missed'}
                  >
                    {state.game.was_correct ? '✓' : '✗'}
                  </span>
                )}
              </div>
              <div className="flex-grow flex items-center justify-center">
                <span className={`font-serif text-3xl font-bold ${glyph.color} leading-none`}>
                  {glyph.letter}
                </span>
              </div>
              <div className="text-[9px] font-mono uppercase tracking-wide text-stone-500 truncate">
                {state.game.is_home ? 'vs' : '@'} {state.game.opponent_short}
              </div>
            </Link>
          )
        })}
      </div>

      {/* ═══ LEGEND ═══ */}
      <div className="border-t border-stone-200 px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-green-100 border border-green-300" />
          Won
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-red-100 border border-red-300" />
          Lost
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-amber-100 border border-amber-300" />
          Upcoming
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-green-600 font-bold">✓</span>
          Model right
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-red-600 font-bold">✗</span>
          Model wrong
        </span>
      </div>
    </section>
  )
}