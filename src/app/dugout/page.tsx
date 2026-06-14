import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  getScheduleForDate, slugifyGame, shortName, teamLogoUrl, getTeamForm,
} from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { findTeamByName, findTeamBySlug, teamIdBySlug } from '@/lib/teams'
import {
  getMLBStandings, getMLBStatLeaders, getMLBNewsMultiSource,
  MLB_STAT_CATEGORIES,
} from '@/lib/mlb-homepage'
import type { MLBStatLeader, MLBDivisionStandings } from '@/lib/mlb-homepage'
import SiteHeader from '@/components/SiteHeader'
import AnalyticsTrigger from '@/components/AnalyticsTrigger'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import DugoutCalendar from '@/components/DugoutCalendar'
import { getCalendarMonth } from '@/lib/dugout-calendar'
import { getTeamTransactions } from '@/lib/team-transactions'

// ── Helpers ──────────────────────────────────────────────────────────────────

function factorSummary(components: any) {
  if (!components) return null
  const entries = Object.entries(components) as [string, number][]
  const homeCount = entries.filter(([, v]) => v > 5).length
  const awayCount = entries.filter(([, v]) => v < -5).length
  return { homeCount, awayCount, total: entries.length }
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatGameTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York',
    })
  } catch { return '—' }
}

function parseStreak(code: string) {
  const m = (code ?? '').match(/^([WL])(\d+)$/)
  if (!m) return { type: null as 'W' | 'L' | null, count: 0 }
  return { type: m[1] as 'W' | 'L', count: parseInt(m[2]) }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export const revalidate = 600

type Props = { searchParams: Promise<{ month?: string }> }

export default async function DugoutPage({ searchParams }: Props) {
  const sp = await searchParams
  const sub = await getCurrentSubscriber()
  if (!sub) redirect('/')

  const supa = createAdminClient()
  const { data: subscriber } = await supa
    .from('subscribers')
    .select('email, teams, primary_team, preferences_token, is_pro, role')
    .eq('id', sub.id)
    .single()
  if (!subscriber) redirect('/')

  // ── Team + theme ────────────────────────────────────────────────────────
  const primaryTeamSlug = subscriber.primary_team ?? subscriber.teams?.[0] ?? 'phillies'
  const primaryTeam     = findTeamBySlug(primaryTeamSlug)
  const primaryTeamId   = teamIdBySlug(primaryTeamSlug)
  const theme = primaryTeam
    ? { primary: primaryTeam.primary_color, secondary: primaryTeam.secondary_color, text: primaryTeam.text_on_primary }
    : { primary: '#1A1A1A', secondary: '#FF5722', text: '#FFFFFF' }

  // ── Core data ───────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const followedSlugs: string[] = subscriber.teams ?? []

  const [
    allGames, predictions, allStandings, news, primaryTeamForm,
    ilTransactions, recentTransactions,
  ] = await Promise.all([
    getScheduleForDate(today),
    getPredictionsForDate(today),
    getMLBStandings(),
    getMLBNewsMultiSource(),
    primaryTeamId ? getTeamForm(primaryTeamId) : Promise.resolve(null),
    primaryTeamId ? getTeamTransactions(primaryTeamId, 30) : Promise.resolve([]),
    primaryTeamId ? getTeamTransactions(primaryTeamId, 14) : Promise.resolve([]),
  ])

  // ── Stat leaders for primary team's key categories ───────────────────────
  // Fetch top 10 per category, then filter to those on the primary team
  const BATTING_CATS  = MLB_STAT_CATEGORIES.filter(c => c.group === 'batting').slice(0, 2)
  const PITCHING_CATS = MLB_STAT_CATEGORIES.filter(c => c.group === 'pitching').slice(0, 2)
  const ALL_CATS      = [...BATTING_CATS, ...PITCHING_CATS]

  const leaderArrays = await Promise.all(
    ALL_CATS.map(cat => getMLBStatLeaders(cat.slug, 50, cat.group))
  )
  // Build a map: category slug → top 3 league leaders (unfiltered — team filter applied in render)
  const leagueLeaders: Record<string, MLBStatLeader[]> = {}
  ALL_CATS.forEach((cat, i) => {
    leagueLeaders[cat.slug] = leaderArrays[i].slice(0, 3)
  })

  // ── Division standings — just the primary team's division ────────────────
  const primaryTeamDivision: MLBDivisionStandings | null = (() => {
    if (!primaryTeam) return null
    // Find which division contains the primary team by matching team name
    return allStandings.find(div =>
      div.teams.some(t => t.name === primaryTeam.name || t.abbreviation === primaryTeam.short)
    ) ?? null
  })()

  // ── Games ───────────────────────────────────────────────────────────────
  const myGames = allGames.filter(game => {
    const away = findTeamByName(game.teams.away.team.name)
    const home = findTeamByName(game.teams.home.team.name)
    return (away && followedSlugs.includes(away.slug)) || (home && followedSlugs.includes(home.slug))
  })

  const primaryTeamGame = primaryTeam
    ? myGames.find(game => {
        const away = findTeamByName(game.teams.away.team.name)
        const home = findTeamByName(game.teams.home.team.name)
        return away?.slug === primaryTeamSlug || home?.slug === primaryTeamSlug
      })
    : null

  const primaryGamePrediction = primaryTeamGame ? predictions.get(primaryTeamGame.gamePk) : null

  // ── Calendar ─────────────────────────────────────────────────────────────
  const currentMonth   = today.slice(0, 7)
  const selectedMonth  = sp.month ?? currentMonth
  const calendarMonth  = /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth) ? selectedMonth : currentMonth

  function shiftMonth(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(n => parseInt(n, 10))
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }

  const SEASON_START = `${currentMonth.slice(0, 4)}-04`
  const prevMonth = shiftMonth(calendarMonth, -1) >= SEASON_START ? shiftMonth(calendarMonth, -1) : null
  const nextMonth = shiftMonth(calendarMonth, 1)  <= currentMonth  ? shiftMonth(calendarMonth, 1)  : null

  const calendarGames = primaryTeamId ? await getCalendarMonth(primaryTeamId, calendarMonth) : []

  // ── Transactions split ───────────────────────────────────────────────────
  const activeIL = ilTransactions.filter(t => t.category === 'IL')
  const txFeed   = recentTransactions.filter(t => t.category !== 'IL').slice(0, 8)

  // ── News: prefer team-relevant items ────────────────────────────────────
  const teamKeywords = [primaryTeam?.name ?? '', primaryTeam?.short ?? '', primaryTeam?.short ?? '']
    .filter(Boolean).map(k => k.toLowerCase())
  const teamNews  = news.filter(n =>
    teamKeywords.some(kw => n.headline.toLowerCase().includes(kw))
  ).slice(0, 4)
  const otherNews = news.filter(n =>
    !teamKeywords.some(kw => n.headline.toLowerCase().includes(kw))
  ).slice(0, 4 - teamNews.length)
  const displayNews = [...teamNews, ...otherNews].slice(0, 5)

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />

      {/* ── TEAM HERO ──────────────────────────────────────────────────── */}
      <section className="px-6 py-12 md:py-16" style={{ backgroundColor: theme.primary, color: theme.text }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest mb-6 opacity-70">
            ⊕ Your Dugout · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start">

            {/* LEFT: Team identity + form */}
            <div className="w-full md:w-7/12">
              <div className="flex items-center gap-5 mb-5">
                {primaryTeam && primaryTeamId && (
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src={teamLogoUrl(primaryTeamId)} alt={primaryTeam.short} className="w-16 h-16 md:w-20 md:h-20 object-contain" />
                  </div>
                )}
                <div>
                  <h1 className="text-4xl md:text-5xl font-serif font-bold leading-none tracking-tight mb-2">
                    {primaryTeam?.short ?? 'Welcome'}
                    <span className="opacity-60 font-light italic"> Edge</span>
                  </h1>
                  {primaryTeamGame ? (
                    <p className="opacity-90 text-base md:text-lg">
                      vs {shortName(
                        primaryTeamGame.teams.home.team.name === primaryTeam?.name
                          ? primaryTeamGame.teams.away.team.name
                          : primaryTeamGame.teams.home.team.name
                      )} tonight ·{' '}
                      {new Date(primaryTeamGame.gameDate).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
                      })}
                    </p>
                  ) : (
                    <p className="opacity-80 text-base md:text-lg">No game tonight. Resting up.</p>
                  )}
                </div>
              </div>

              <AnalyticsTrigger event="dugout_viewed" />

              {primaryTeamForm && (
                <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Last 10</div>
                    <div className="text-xl font-serif font-bold">{primaryTeamForm.last_10_wins}-{primaryTeamForm.last_10_losses}</div>
                  </div>
                  {primaryTeamForm.streak_count > 0 && (
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Streak</div>
                      <div className="text-xl font-serif font-bold">{primaryTeamForm.streak_type}{primaryTeamForm.streak_count}</div>
                    </div>
                  )}
                  {primaryTeamForm.run_diff_l10 !== 0 && (
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Run diff L10</div>
                      <div className="text-xl font-serif font-bold">
                        {primaryTeamForm.run_diff_l10 >= 0 ? '+' : ''}{primaryTeamForm.run_diff_l10.toFixed(1)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Tonight's edge spotlight */}
            <div className="w-full md:w-5/12 md:flex-shrink-0">
              {primaryTeamGame && primaryGamePrediction ? (
                <Link
                  href={`/mlb/${slugifyGame(primaryTeamGame)}`}
                  className="block bg-black/30 border border-white/10 rounded-lg p-6 hover:bg-black/40 transition group"
                >
                  <div className="text-xs font-mono uppercase tracking-widest mb-3 opacity-60">⊕ Tonight's Edge</div>
                  {(() => {
                    const factors = factorSummary(primaryGamePrediction.components)
                    const winnerShort = primaryGamePrediction.predicted_winner === 'home'
                      ? shortName(primaryTeamGame.teams.home.team.name)
                      : shortName(primaryTeamGame.teams.away.team.name)
                    const isTossup = primaryGamePrediction.confidence_tier === 'tossup'
                    return (
                      <>
                        {factors && (
                          <div className="mb-3">
                            <div className="flex items-baseline gap-2 mb-2">
                              <div className="text-4xl md:text-5xl font-serif font-black leading-none">
                                {Math.max(factors.homeCount, factors.awayCount)} of {factors.total}
                              </div>
                              <div className="text-sm font-mono uppercase tracking-wider opacity-80">factors</div>
                            </div>
                            <div className="flex gap-1 mb-3">
                              {Object.entries(primaryGamePrediction.components).map(([key, val]) => {
                                const v = val as number
                                const bg = v > 5 ? 'bg-white' : v < -5 ? 'bg-white/30' : 'bg-white/10'
                                return <div key={key} className={`w-2 h-2 rounded-full ${bg}`} />
                              })}
                            </div>
                          </div>
                        )}
                        {!isTossup ? (
                          <div className="mb-3">
                            <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Tilts toward</div>
                            <div className="text-xl font-serif font-bold">{winnerShort.toUpperCase()}</div>
                            <div className="text-xs font-mono uppercase tracking-widest opacity-80 mt-1">— {primaryGamePrediction.confidence_tier}</div>
                          </div>
                        ) : (
                          <div className="mb-3">
                            <div className="text-xl font-serif font-bold opacity-80">Toss-up</div>
                            <div className="text-xs font-mono uppercase tracking-wider opacity-60 mt-1">Factors split evenly</div>
                          </div>
                        )}
                        {primaryGamePrediction.summary && (
                          <p className="text-sm font-serif italic leading-relaxed opacity-90 mt-4">
                            &ldquo;{primaryGamePrediction.summary}&rdquo;
                          </p>
                        )}
                      </>
                    )
                  })()}
                  <div className="text-xs font-mono uppercase tracking-wider opacity-70 mt-4 group-hover:opacity-100 transition">
                    Read the full edge →
                  </div>
                </Link>
              ) : primaryTeamGame ? (
                <div className="bg-black/30 border border-white/10 rounded-lg p-6">
                  <div className="text-xs font-mono uppercase tracking-widest mb-3 opacity-60">⊕ Tonight's Edge</div>
                  <p className="text-base opacity-80">Edge analysis updating shortly.</p>
                </div>
              ) : (
                <div className="bg-black/30 border border-white/10 rounded-lg p-6">
                  <div className="text-xs font-mono uppercase tracking-widest mb-3 opacity-60">⊕ No Game Tonight</div>
                  <p className="text-base opacity-80">Check the full slate or browse the track record.</p>
                </div>
              )}
            </div>
          </div>

          {followedSlugs.length > 1 && (
            <div className="text-sm opacity-60 mt-8 font-mono">
              Following: {followedSlugs.map(slug => findTeamBySlug(slug)?.short).filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </section>

      {/* ── CALENDAR ─────────────────────────────────────────────────────── */}
      {primaryTeam && primaryTeamId && (
        <section className="px-6 pt-12 max-w-5xl mx-auto">
          <DugoutCalendar
            games={calendarGames}
            yearMonth={calendarMonth}
            teamShort={primaryTeam.short.toUpperCase()}
            teamPrimaryColor={theme.primary}
            teamSecondaryColor={theme.secondary}
            prevMonth={prevMonth}
            nextMonth={nextMonth}
          />
        </section>
      )}

      {/* ── PREVIEWS + NEWS  (Athletic-style two-column) ─────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-[1fr_300px] gap-0 border border-stone-200">

          {/* LEFT: My games */}
          <div className="border-r border-stone-200">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-stone-50">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
                § Tonight · Your teams
              </span>
              <Link href="/mlb" className="text-[10px] font-mono text-stone-400 hover:text-stone-700 transition">
                Full slate →
              </Link>
            </div>

            {myGames.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="font-serif italic text-stone-400 text-sm mb-3">No games for your teams tonight.</p>
                <Link href="/mlb" className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
                  See all {allGames.length} games →
                </Link>
              </div>
            ) : (
              <div>
                {myGames.map(game => {
                  const pred   = predictions.get(game.gamePk)
                  const isPrimary = primaryTeamGame?.gamePk === game.gamePk
                  const isLive    = game.status.abstractGameState === 'Live'
                  const isFinal   = game.status.abstractGameState === 'Final'
                  const factors   = pred ? factorSummary(pred.components) : null

                  return (
                    <Link
                      key={game.gamePk}
                      href={`/mlb/${slugifyGame(game)}`}
                      className="block px-5 py-4 border-b border-stone-100 hover:bg-stone-50 transition group"
                      style={isPrimary ? { borderLeft: `3px solid ${theme.primary}` } : undefined}
                    >
                      {/* Matchup row */}
                      <div className="flex items-center gap-2 mb-2">
                        <img src={teamLogoUrl(game.teams.away.team.id)} alt="" width={18} height={18} />
                        <span className="text-[10px] font-mono text-stone-400">@</span>
                        <img src={teamLogoUrl(game.teams.home.team.id)} alt="" width={18} height={18} />
                        <span className="text-[13px] font-semibold text-stone-900">
                          {game.teams.away.team.abbreviation} @ {game.teams.home.team.abbreviation}
                        </span>
                        <span className={`ml-auto text-[10px] font-mono font-bold ${isLive ? 'text-[#FF5722]' : 'text-stone-400'}`}>
                          {isLive ? '● LIVE' : isFinal ? 'Final' : formatGameTime(game.gameDate)}
                        </span>
                      </div>

                      {/* Summary */}
                      {pred?.summary ? (
                        <p className="text-[13px] font-serif italic text-stone-600 leading-snug mb-2">
                          {pred.summary}
                        </p>
                      ) : (
                        <p className="text-[12px] font-mono text-stone-400 italic mb-2">Preview generating…</p>
                      )}

                      {/* Factor strip */}
                      {pred && factors && (
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex gap-0.5">
                            {Object.entries(pred.components).map(([key, val]) => {
                              const v = val as number
                              const bg = v > 5 ? 'bg-stone-800' : v < -5 ? 'bg-stone-300' : 'bg-stone-100'
                              return <div key={key} className={`w-1.5 h-1.5 rounded-full ${bg}`} />
                            })}
                          </div>
                          <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">
                            {pred.confidence_tier === 'tossup'
                              ? 'Toss-up'
                              : `${Math.max(factors.homeCount, factors.awayCount)}/${factors.total} factors · ${pred.confidence_tier}`}
                          </span>
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Team news */}
          <div className="bg-stone-50">
            <div className="px-4 py-3 border-b border-stone-200">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
                § {primaryTeam?.short ?? 'Team'} · News
              </span>
            </div>
            <div>
              {displayNews.length === 0 ? (
                <div className="px-4 py-8 text-center font-serif italic text-stone-400 text-sm">No news yet.</div>
              ) : displayNews.map((item, i) => (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 px-4 py-3 border-b border-stone-200 last:border-0 hover:bg-white transition group"
                >
                  <div className="w-14 h-14 shrink-0 bg-stone-200 overflow-hidden">
                    {item.image
                      ? <img src={item.image} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[8px] font-mono uppercase text-white"
                          style={{ background: i % 2 === 0 ? theme.primary : '#1A1A1A' }}>
                          {primaryTeam?.short ?? 'MLB'}
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-serif text-stone-800 leading-snug group-hover:text-[#FF5722] transition line-clamp-2 mb-1">
                      {item.headline}
                    </p>
                    <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wide">{timeAgo(item.published)}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── THINGS YOU MAY HAVE MISSED ───────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-10">
        <div className="border-t-[3px] border-stone-800 pt-6 mb-5">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722] mb-1">§ The Edge</div>
          <h2 className="text-xl font-serif font-bold text-stone-900">
            {primaryTeam?.short ?? 'Team'} · Things You May Have Missed
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

          {/* IL / Injuries */}
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722] mb-3">Injury report</div>
            <div className="bg-white border border-stone-200 overflow-hidden">
              {activeIL.length === 0 ? (
                <div className="px-4 py-5 text-[12px] font-serif italic text-stone-400">No active IL placements.</div>
              ) : activeIL.slice(0, 6).map((tx, i) => (
                <div key={tx.transaction_id} className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-50 last:border-0">
                  {tx.team_id && <img src={`https://www.mlbstatic.com/team-logos/${tx.team_id}.svg`} alt="" width={18} height={18} className="shrink-0" />}
                  <img
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${tx.player_id}/headshot/67/current`}
                    alt={tx.player_name}
                    className="w-7 h-7 rounded-full object-cover bg-stone-100 shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-stone-900 truncate">{tx.player_name}</div>
                    <div className="text-[10px] text-stone-400">{tx.injury_reason ?? tx.team_name ?? '—'}</div>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-yellow-800 bg-yellow-50 border border-yellow-200 px-2 py-0.5 shrink-0">
                    {tx.il_days ? `IL-${tx.il_days}` : 'IL'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Transactions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">Transactions</span>
              <span className="text-[9px] font-mono text-stone-400">Last 14 days</span>
            </div>
            <div className="bg-white border border-stone-200 overflow-hidden">
              {txFeed.length === 0 ? (
                <div className="px-4 py-5 text-[12px] font-serif italic text-stone-400">No recent transactions.</div>
              ) : txFeed.map((tx, i) => {
                const BADGE: Record<string, string> = {
                  TRADE: 'text-blue-800 bg-blue-50 border-blue-200',
                  SIGNING: 'text-green-800 bg-green-50 border-green-200',
                  CALLUP: 'text-purple-800 bg-purple-50 border-purple-200',
                  ACTIVATION: 'text-sky-800 bg-sky-50 border-sky-200',
                  OPTION: 'text-stone-600 bg-stone-50 border-stone-200',
                  DFA: 'text-red-800 bg-red-50 border-red-200',
                }
                return (
                  <div key={tx.transaction_id} className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-50 last:border-0">
                    <img
                      src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${tx.player_id}/headshot/67/current`}
                      alt={tx.player_name}
                      className="w-7 h-7 rounded-full object-cover bg-stone-100 shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-stone-900 truncate">{tx.player_name}</div>
                      <div className="text-[10px] text-stone-400">{tx.to_team_name ?? tx.team_name ?? '—'}</div>
                    </div>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 border shrink-0 ${BADGE[tx.category] ?? 'text-stone-600 bg-stone-50 border-stone-200'}`}>
                      {tx.category}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Division standings — primary team's division only */}
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722] mb-3">
              {primaryTeamDivision?.division ?? 'Division'} standings
            </div>
            <div className="bg-white border border-stone-200 overflow-hidden">
              {!primaryTeamDivision ? (
                <div className="px-4 py-5 text-[12px] font-serif italic text-stone-400">Standings unavailable.</div>
              ) : primaryTeamDivision.teams.map((team, i) => {
                const teamSlug = findTeamByName(team.name)?.slug ?? team.abbreviation.toLowerCase()
                const isPrimary = team.name === primaryTeam?.name || team.abbreviation === primaryTeam?.short
                const { type: streakType, count: streakCount } = parseStreak(team.streak)
                return (
                  <Link
                    key={team.id}
                    href={`/mlb/teams/${teamSlug}`}
                    className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-50 last:border-0 hover:bg-stone-50 transition"
                    style={isPrimary ? { borderLeft: `3px solid ${theme.primary}` } : undefined}
                  >
                    <span className={`text-[11px] font-mono font-bold w-5 shrink-0 ${i === 0 ? 'text-[#FF5722]' : 'text-stone-400'}`}>
                      {i + 1}
                    </span>
                    <img src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`} alt="" width={18} height={18} className="shrink-0" />
                    <span className={`flex-1 text-[13px] ${isPrimary ? 'font-bold text-stone-900' : 'font-medium text-stone-700'} truncate`}>
                      {team.name.split(' ').slice(-1)[0]}
                    </span>
                    {streakType && streakCount >= 3 && (
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 mr-1 ${streakType === 'W' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                        {streakType}{streakCount}
                      </span>
                    )}
                    <span className="text-[12px] font-mono font-bold text-stone-900 w-6 text-right">{team.wins}</span>
                    <span className="text-[12px] font-mono text-stone-400 w-6 text-center">{team.losses}</span>
                    <span className="text-[11px] font-mono text-stone-400 w-8 text-right">{team.gb}</span>
                  </Link>
                )
              })}
            </div>
          </div>

        </div>
      </section>

      {/* ── LEAGUE STAT LEADERS (top 3 per category) ─────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-10">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5722] mb-4">
          § MLB · Stat leaders
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-200 border border-stone-200">
          {ALL_CATS.map(cat => (
            <div key={cat.slug} className="bg-white p-4">
              <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722] mb-3">{cat.label}</div>
              {(leagueLeaders[cat.slug] ?? []).map((leader, i) => (
                <div key={leader.personId} className="flex items-center gap-2 py-1.5 border-b border-stone-50 last:border-0">
                  <img
                    src={leader.headshot}
                    alt={leader.name}
                    className="w-7 h-7 rounded-full object-cover bg-stone-100 shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-stone-900 truncate">{leader.name}</div>
                    <div className="text-[9px] font-mono text-stone-400">{leader.teamAbbr}</div>
                  </div>
                  <div
                    className="text-[16px] font-mono font-bold shrink-0"
                    style={{ color: i === 0 ? '#FF5722' : '#1A1A1A' }}
                  >
                    {leader.statValue}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── QUICK LINKS ──────────────────────────────────────────────────── */}
      <section className="px-6 py-10 border-t border-stone-200 bg-stone-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
          <Link href="/track-record" className="block bg-white border border-stone-200 p-6 hover:border-stone-400 transition">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#FF5722] mb-2">⊕ Track Record</div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">How accurate are we?</h3>
            <p className="text-sm text-stone-600">Public predictions log. Every game graded.</p>
          </Link>
          <Link href="/mlb" className="block bg-white border border-stone-200 p-6 hover:border-stone-400 transition">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#FF5722] mb-2">§ Full slate</div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">All games tonight</h3>
            <p className="text-sm text-stone-600">{allGames.length} games · all 8 components scored.</p>
          </Link>
          <Link href={`/preferences/${subscriber.preferences_token}`} className="block bg-white border border-stone-200 p-6 hover:border-stone-400 transition">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#FF5722] mb-2">⚙ Preferences</div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">Update your teams</h3>
            <p className="text-sm text-stone-600">Add, remove, or change your primary team.</p>
          </Link>
        </div>
      </section>

      <footer className="px-6 py-10 text-center border-t border-stone-200">
        <p className="text-[10px] font-mono uppercase tracking-wider text-stone-400">
          The Edge · Information only · No betting advice
        </p>
      </footer>
    </main>
  )
}