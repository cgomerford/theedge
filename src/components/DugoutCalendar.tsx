import Link from 'next/link'
import type { CalendarGame } from '@/lib/dugout-calendar'
import { cellIntensity, summarizeMonth } from '@/lib/dugout-calendar'

type Props = {
  games: CalendarGame[]
  yearMonth: string  // 'YYYY-MM'
  teamShort: string
  teamPrimaryColor: string  // hex
  teamSecondaryColor?: string  // hex, optional
  prevMonth: string | null
  nextMonth: string | null
}

// ============================================================
// Pure helpers
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

function firstDayWeekday(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(n => parseInt(n, 10))
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// Convert hex (e.g. "#E81828") + alpha 0..1 → rgba string
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatDateForDisplay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ============================================================
// Cell — extracted for readability
// ============================================================

type CellProps = {
  game: CalendarGame | undefined
  day: number | null
  iso: string | null
  isToday: boolean
  teamPrimaryColor: string
}

function CalendarCell({ game, day, iso, isToday, teamPrimaryColor }: CellProps) {
  // Empty day (leading blank or non-game day)
  if (day === null) {
    return <div className="aspect-[1.1/1] bg-stone-50/40" />
  }

  // No-game day
  if (!game) {
    return (
      <div className="aspect-[1.1/1] bg-white border-t border-l border-stone-100 p-2">
        <span className="text-stone-300 font-mono text-[10px]">{day}</span>
      </div>
    )
  }

  // Has a game — figure out visual state
  const intensity = cellIntensity(game)
  const isWin = game.team_won === true
  const isLoss = game.team_won === false
  const isPending = game.team_won === null

  // Background gradient + letter color
  let bgStyle: React.CSSProperties = {}
  let letter = '·'
  let letterColor = '#a8a29e'

  if (isWin) {
    // Team color gradient, intensity-modulated
    const startAlpha = 0.08 + intensity * 0.22  // 0.08-0.30
    const endAlpha = 0.20 + intensity * 0.40    // 0.20-0.60
    bgStyle = {
      background: `linear-gradient(135deg, ${hexToRgba(teamPrimaryColor, startAlpha)} 0%, ${hexToRgba(teamPrimaryColor, endAlpha)} 100%)`,
    }
    letter = 'W'
    letterColor = teamPrimaryColor
  } else if (isLoss) {
    // Charcoal gradient
    const startAlpha = 0.06 + intensity * 0.10  // 0.06-0.16
    const endAlpha = 0.14 + intensity * 0.24    // 0.14-0.38
    bgStyle = {
      background: `linear-gradient(135deg, rgba(28, 25, 23, ${startAlpha}) 0%, rgba(28, 25, 23, ${endAlpha}) 100%)`,
    }
    letter = 'L'
    letterColor = '#44403c'
  } else if (isPending) {
    // Soft warm cream — upcoming
    bgStyle = {
      background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.05) 0%, rgba(251, 191, 36, 0.15) 100%)',
    }
    letter = '·'
    letterColor = '#a8a29e'
  }

  // Today gets a vivid border treatment
  const todayBorder = isToday
    ? { boxShadow: `inset 0 0 0 2px #FF5722, 0 4px 12px rgba(255, 87, 34, 0.2)` }
    : {}

  // Edge score chip — small, tasteful
  const edgeChip = game.edge_score !== null && (
    <span
      className="text-[9px] font-mono font-bold px-1.5 py-0.5 leading-none whitespace-nowrap"
      style={{
        background: game.was_correct === true
          ? 'rgba(22, 101, 52, 0.12)'
          : game.was_correct === false
            ? 'rgba(153, 27, 27, 0.12)'
            : 'rgba(120, 113, 108, 0.12)',
        color: game.was_correct === true
          ? '#15803d'
          : game.was_correct === false
            ? '#b91c1c'
            : '#78716c',
      }}
    >
      {game.edge_score > 0 ? '+' : ''}{game.edge_score}
    </span>
  )

  return (
    <Link
      href={`/mlb/${game.slug}`}
      className="group aspect-[1.1/1] border-t border-l border-stone-100 p-2 flex flex-col relative overflow-hidden transition-all duration-150 hover:shadow-lg hover:-translate-y-[1px] hover:z-10"
      style={{ ...bgStyle, ...todayBorder }}
    >
      {/* Top row — date + edge chip */}
      <div className="flex items-start justify-between gap-1 relative z-10">
        <span
          className={`font-mono text-[10px] font-bold ${
            isToday ? 'text-orange-600' : 'text-stone-500'
          }`}
        >
          {day}
        </span>
        {edgeChip}
      </div>

      {/* Letter — big, dominant, centered */}
      <div className="flex-grow flex items-center justify-center relative z-10">
        <span
          className="font-serif font-black leading-none"
          style={{
            color: letterColor,
            fontSize: isWin || isLoss ? '2.5rem' : '1.5rem',
            opacity: isPending ? 0.5 : 1,
            textShadow: isWin ? `0 1px 0 ${hexToRgba(teamPrimaryColor, 0.2)}` : undefined,
          }}
        >
          {letter}
        </span>
      </div>

      {/* Bottom row — opponent + score */}
      <div className="flex items-end justify-between gap-1 relative z-10">
        <span className="text-[9px] font-mono uppercase tracking-wide text-stone-600 truncate">
          {game.is_home ? 'vs' : '@'}&nbsp;{game.opponent_short}
        </span>
        {game.team_score !== null && game.opponent_score !== null && (
          <span className="text-[9px] font-mono font-bold text-stone-700 whitespace-nowrap">
            {game.team_score}-{game.opponent_score}
          </span>
        )}
      </div>
    </Link>
  )
}

// ============================================================
// Main component
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

  const gameByDate = new Map<string, CalendarGame>()
  for (const g of games) {
    if (!gameByDate.has(g.game_date)) {
      gameByDate.set(g.game_date, g)
    }
  }

  const summary = summarizeMonth(games)

  // Build cells
  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, iso: null })
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${yearMonth}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, iso })
  }

  // Streak emoji
  const streakSymbol = summary.current_streak.type === 'W'
    ? '🔥'
    : summary.current_streak.type === 'L'
      ? '🧊'
      : ''

  return (
    <section className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-sm">
      {/* ═══ HEADER STRIP ═══ */}
      <div
        className="px-5 py-4 flex items-center justify-between flex-wrap gap-3 border-b border-stone-200"
        style={{
          background: `linear-gradient(90deg, ${hexToRgba(teamPrimaryColor, 0.08)} 0%, rgba(255,255,255,0) 60%)`,
        }}
      >
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-0.5">
            ⊕ {teamShort} · Season at a glance
          </div>
          <h2 className="font-serif text-3xl font-light text-stone-900 leading-none tracking-tight">
            {getMonthName(yearMonth)}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {prevMonth ? (
            <Link
              href={`/dugout?month=${prevMonth}`}
              className="px-3 py-1.5 border border-stone-300 text-xs font-mono uppercase tracking-widest hover:bg-stone-900 hover:text-white hover:border-stone-900 transition"
            >
              ← Prev
            </Link>
          ) : (
            <span className="px-3 py-1.5 border border-stone-200 text-xs font-mono uppercase tracking-widest text-stone-300 cursor-not-allowed">
              ← Prev
            </span>
          )}
          {nextMonth ? (
            <Link
              href={`/dugout?month=${nextMonth}`}
              className="px-3 py-1.5 border border-stone-300 text-xs font-mono uppercase tracking-widest hover:bg-stone-900 hover:text-white hover:border-stone-900 transition"
            >
              Next →
            </Link>
          ) : (
            <span className="px-3 py-1.5 border border-stone-200 text-xs font-mono uppercase tracking-widest text-stone-300 cursor-not-allowed">
              Next →
            </span>
          )}
        </div>
      </div>

      {/* ═══ DASHBOARD STATS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-stone-200">
        {/* Record */}
        <div className="p-4 border-r border-stone-200 last:border-r-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">
            Record
          </div>
          <div className="font-serif text-2xl font-bold" style={{ color: teamPrimaryColor }}>
            {summary.wins}<span className="text-stone-300 font-light">-</span>{summary.losses}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
            {summary.wins + summary.losses} played
          </div>
        </div>

        {/* Streak */}
        <div className="p-4 border-r border-stone-200 last:border-r-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">
            Streak
          </div>
          {summary.current_streak.type ? (
            <>
              <div className="font-serif text-2xl font-bold text-stone-900">
                {streakSymbol} {summary.current_streak.type}{summary.current_streak.count}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
                {summary.current_streak.type === 'W' ? 'on the rise' : 'searching'}
              </div>
            </>
          ) : (
            <div className="font-serif text-xl text-stone-400">—</div>
          )}
        </div>

        {/* Model accuracy */}
        <div className="p-4 border-r border-stone-200 last:border-r-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">
            Edge model
          </div>
          {summary.model_accuracy_pct !== null ? (
            <>
              <div className="font-serif text-2xl font-bold text-stone-900">
                {summary.model_accuracy_pct}%
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
                {summary.model_correct} of {summary.model_total} calls
              </div>
            </>
          ) : (
            <div className="font-serif text-xl text-stone-400">—</div>
          )}
        </div>

        {/* Best win / worst loss */}
        <div className="p-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">
            Best win
          </div>
          {summary.best_win ? (
            <>
              <div className="font-serif text-base font-bold text-stone-900 leading-tight">
                {summary.best_win.team_score}-{summary.best_win.opponent_score}
                <span className="font-light text-stone-400 text-sm ml-1">
                  {summary.best_win.is_home ? 'vs' : '@'} {summary.best_win.opponent_short}
                </span>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
                {formatDateForDisplay(summary.best_win.game_date)}
              </div>
            </>
          ) : (
            <div className="font-serif text-xl text-stone-400">—</div>
          )}
        </div>
      </div>

      {/* ═══ DAY-OF-WEEK HEADER ═══ */}
      <div className="grid grid-cols-7 bg-stone-50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div
            key={d}
            className="text-center py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ═══ GRID ═══ */}
      <div className="grid grid-cols-7 border-r border-b border-stone-100">
        {cells.map((cell, i) => (
          <CalendarCell
            key={i}
            game={cell.iso ? gameByDate.get(cell.iso) : undefined}
            day={cell.day}
            iso={cell.iso}
            isToday={cell.iso === today}
            teamPrimaryColor={teamPrimaryColor}
          />
        ))}
      </div>
    </section>
  )
}