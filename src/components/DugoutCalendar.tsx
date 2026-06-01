'use client'

import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import type { CalendarGame } from '@/lib/dugout-calendar'
import { cellIntensity, summarizeMonth } from '@/lib/dugout-calendar'

type Props = {
  games: CalendarGame[]
  yearMonth: string
  teamShort: string
  teamPrimaryColor: string
  teamSecondaryColor?: string
  prevMonth: string | null   // initial boundary hint from server
  nextMonth: string | null
}

// ── pure helpers (same as before) ──────────────────────────

function getMonthName(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function firstDayWeekday(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatDateForDisplay(iso: string): string {
  const [, , d] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthIdx = parseInt(iso.split('-')[1], 10) - 1
  return `${months[monthIdx]} ${parseInt(d, 10)}`
}

// ── CalendarCell (same as before) ─────────────────────────

function CalendarCell({
  game, day, iso, isToday, teamPrimaryColor,
}: {
  game?: CalendarGame
  day: number | null
  iso: string | null
  isToday: boolean
  teamPrimaryColor: string
}) {
  if (!day || !iso) {
    return <div className="border-l border-t border-stone-100 bg-stone-50/50 min-h-[52px] md:min-h-[72px]" />
  }

  const isWin = game?.team_won === true
  const isLoss = game?.team_won === false
  const isPending = game && game.team_won === null
  const intensity = game ? cellIntensity(game) : 0

  const bg = isWin
    ? `rgba(134,190,135,${0.15 + intensity * 0.45})`
    : isLoss
    ? `rgba(239,154,154,${0.15 + intensity * 0.45})`
    : isPending
    ? 'rgba(251,191,36,0.08)'
    : undefined

  const letter = isWin ? 'W' : isLoss ? 'L' : isPending ? '·' : ''
  const letterColor = isWin
    ? '#166534'
    : isLoss
    ? '#991b1b'
    : isPending
    ? '#92400e'
    : '#d6d3d1'

  const edgeDisplay = game?.edge_score != null
    ? (game.edge_score >= 0 ? '+' : '') + game.edge_score.toFixed(1)
    : null

  const cellContent = (
    <div
      className="border-l border-t border-stone-100 min-h-[52px] md:min-h-[72px] p-1 flex flex-col justify-between relative"
      style={{ background: bg }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between">
        <span
          className="text-[10px] font-mono leading-none"
          style={{
            color: isToday ? teamPrimaryColor : '#a8a29e',
            fontWeight: isToday ? 700 : 400,
          }}
        >
          {day}
        </span>
        {edgeDisplay && (
          <span
            className="text-[8px] font-mono leading-none px-0.5 rounded"
            style={{
              color: game?.edge_score! > 0 ? '#166534' : '#991b1b',
              background: game?.edge_score! > 0 ? 'rgba(134,190,135,0.2)' : 'rgba(239,154,154,0.2)',
            }}
          >
            {edgeDisplay}
          </span>
        )}
      </div>

      {/* W/L letter — bigger on desktop */}
      <div className="flex items-center justify-center flex-1">
        <span
          className="font-serif font-bold leading-none select-none"
          style={{
            color: letterColor,
            fontSize: letter === 'W' || letter === 'L' ? '1.5rem' : '1rem',
            opacity: isPending ? 0.5 : 1,
          }}
        >
          {letter}
        </span>
      </div>

      {/* Opponent + score */}
      <div className="flex items-end justify-between gap-1">
        <span className="text-[8px] font-mono uppercase tracking-wide text-stone-500 truncate">
          {game ? `${game.is_home ? 'vs' : '@'} ${game.opponent_short}` : ''}
        </span>
        {game?.team_score != null && game?.opponent_score != null && (
          <span className="text-[8px] font-mono font-bold text-stone-600 whitespace-nowrap">
            {game.team_score}-{game.opponent_score}
          </span>
        )}
      </div>

      {/* Today indicator dot */}
      {isToday && (
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
          style={{ background: teamPrimaryColor }}
        />
      )}
    </div>
  )

  // Link to game page if there's a slug
  if (game?.slug) {
    return <Link href={`/mlb/${game.slug}`}>{cellContent}</Link>
  }
  return cellContent
}

// ── Main component ─────────────────────────────────────────

const SEASON_YEAR = new Date().getFullYear()
const SEASON_START = `${SEASON_YEAR}-04`
const SEASON_END   = new Date().toISOString().slice(0, 7)   // can't go past today's month

export default function DugoutCalendar({
  games: initialGames,
  yearMonth: initialMonth,
  teamShort,
  teamPrimaryColor,
  prevMonth: initialPrev,
  nextMonth: initialNext,
}: Props) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth)
  const [games, setGames] = useState<CalendarGame[]>(initialGames)
  const [loading, setLoading] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  const today = todayISO()
  const prevMonth = shiftMonth(currentMonth, -1) >= SEASON_START ? shiftMonth(currentMonth, -1) : null
  const nextMonth = shiftMonth(currentMonth, 1)  <= SEASON_END  ? shiftMonth(currentMonth, 1)  : null

  async function goToMonth(month: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/dugout/calendar?month=${month}`)
      const data = await res.json()
      setGames(data.games ?? [])
      setCurrentMonth(month)
      // Scroll calendar into view — no page jump
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (e) {
      console.error('Calendar fetch failed', e)
    } finally {
      setLoading(false)
    }
  }

  const totalDays = daysInMonth(currentMonth)
  const startWeekday = firstDayWeekday(currentMonth)
  const gameByDate = new Map<string, CalendarGame>()
  for (const g of games) {
    if (!gameByDate.has(g.game_date)) gameByDate.set(g.game_date, g)
  }

  const summary = summarizeMonth(games)
  const streakSymbol = summary.current_streak.type === 'W' ? '🔥' : summary.current_streak.type === 'L' ? '🧊' : ''

  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, iso: null })
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${currentMonth}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, iso })
  }

  const NavButton = ({ direction, month }: { direction: 'prev' | 'next', month: string | null }) => {
    const label = direction === 'prev' ? '← Prev' : 'Next →'
    if (!month) {
      return (
        <span className="px-3 py-1.5 border border-stone-200 text-xs font-mono uppercase tracking-widest text-stone-300 cursor-not-allowed select-none">
          {label}
        </span>
      )
    }
    return (
      <button
        onClick={() => goToMonth(month)}
        disabled={loading}
        className="px-3 py-1.5 border border-stone-300 text-xs font-mono uppercase tracking-widest hover:bg-stone-900 hover:text-white hover:border-stone-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? '···' : label}
      </button>
    )
  }

  return (
    <section ref={sectionRef} className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-sm scroll-mt-4">
      {/* ═══ HEADER ═══ */}
      <div
        className="px-5 py-4 flex items-center justify-between flex-wrap gap-3 border-b border-stone-200"
        style={{ background: `linear-gradient(90deg, ${hexToRgba(teamPrimaryColor, 0.08)} 0%, rgba(255,255,255,0) 60%)` }}
      >
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-0.5">
            ⊕ {teamShort} · Season at a glance
          </div>
          <h2 className="font-serif text-3xl font-light text-stone-900 leading-none tracking-tight">
            {getMonthName(currentMonth)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <NavButton direction="prev" month={prevMonth} />
          <NavButton direction="next" month={nextMonth} />
        </div>
      </div>

      {/* ═══ STATS STRIP ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-stone-200">
        <div className="p-4 border-r border-stone-200">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">Record</div>
          <div className="font-serif text-2xl font-bold" style={{ color: teamPrimaryColor }}>
            {summary.wins}<span className="text-stone-300 font-light">-</span>{summary.losses}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
            {summary.wins + summary.losses} played
          </div>
        </div>

        <div className="p-4 border-r border-stone-200">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">Streak</div>
          {summary.current_streak.type ? (
            <>
              <div className="font-serif text-2xl font-bold text-stone-900">
                {streakSymbol} {summary.current_streak.type}{summary.current_streak.count}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
                {summary.current_streak.type === 'W' ? 'on the rise' : 'searching'}
              </div>
            </>
          ) : <div className="font-serif text-xl text-stone-400">—</div>}
        </div>

        <div className="p-4 border-r border-stone-200">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">Edge model</div>
          {summary.model_accuracy_pct !== null ? (
            <>
              <div className="font-serif text-2xl font-bold text-stone-900">{summary.model_accuracy_pct}%</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
                {summary.model_correct} of {summary.model_total} calls
              </div>
            </>
          ) : <div className="font-serif text-xl text-stone-400">—</div>}
        </div>

        <div className="p-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-1">Best win</div>
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
          ) : <div className="font-serif text-xl text-stone-400">—</div>}
        </div>
      </div>

      {/* ═══ DAY HEADERS ═══ */}
      <div className="grid grid-cols-7 bg-stone-50">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
            {d}
          </div>
        ))}
      </div>

      {/* ═══ GRID ═══ */}
      <div className={`grid grid-cols-7 border-r border-b border-stone-100 transition-opacity ${loading ? 'opacity-40' : 'opacity-100'}`}>
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