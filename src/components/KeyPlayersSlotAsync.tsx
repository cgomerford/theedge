// src/components/KeyPlayersSlotAsync.tsx
//
// Async Server Component for the Key Players tab, extracted from
// mlb/[slug]/page.tsx's slotKeyPlayers block so it streams independently
// under <Suspense>. Same self-contained pattern as the other *SlotAsync
// components — own game lookup, own data fetching. getSeriesTop3 and
// getTeamILList are React `cache()`-wrapped, so the overlap with
// SidebarSlotAsync (getSeriesTop3) and TeamsSlotAsync (getTeamILList)
// dedupes for free within the same request instead of double-fetching.

import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getPitcherGameResult } from '@/lib/pitcher-series-edge'
import { getKeyPlayersSnapshot, type KeyPlayersSnapshot } from '@/lib/key-players'
import { computeTeamKeyPlayers } from '@/lib/key-players-pipeline'
import { getBatterGameResult, getBatterPitchByPitchResult } from '@/lib/series-matchup'
import { getTeamILList } from '@/lib/team-transactions'
import { getActiveRosterIds } from '@/lib/active-roster'
import { getParkFactor } from '@/lib/parks'
import Top3KeyPlayersTab, { type PostgameResults } from '@/components/Top3KeyPlayersTab'
import type { RecentFormContext } from '@/lib/key-players-narrative'
import type { HotStreakPlayer } from '@/lib/scout'

// Key Players is computed from live Savant pitch logs (2MB CSV per batter) and
// can take minutes on a cold cache. A streamed section must never hang the page,
// so we give the compute a fixed budget. On timeout the work keeps running in the
// background (it fills savant_fetch_cache, so the next view is fast) and we show
// an honest "still computing" state, not a guess.
const KEY_PLAYERS_BUDGET_MS = 12_000
function withBudget<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); console.error('[KeyPlayersSlotAsync] compute failed:', e instanceof Error ? e.message : e); resolve(null) },
    )
  })
}

function KeyPlayersPending() {
  return (
    <div className="p-8 text-center font-mono text-xs text-stone-500 bg-white border border-stone-200 rounded-xl">
      Key Players are still being computed for this game — refresh in a minute.
    </div>
  )
}

export default async function KeyPlayersSlotAsync({ slug, isPro }: { slug: string; isPro: boolean }) {
  const supa = createAdminClient()
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) return null

  let game: MLBGame | null = null
  try {
    const freshGames = await getScheduleForDate(dateMatch[1])
    game = freshGames.find(g => slugifyGame(g) === slug) ?? null
  } catch {}
  if (!game) {
    const { data: cached } = await supa.from('game_previews').select('raw_data').eq('slug', slug).single()
    if (cached?.raw_data) game = cached.raw_data as MLBGame
  }
  if (!game) return <div className="p-8 text-center text-stone-400 font-mono text-xs">Key Players unavailable for this game.</div>

  const isFinal = game.status?.abstractGameState === 'Final'
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]
  const season = Number(gameDateApi.slice(0, 4)) || new Date().getFullYear()

  // Real park factor (lib/parks.ts's park_factors table) for the Key
  // Players narrative — "does this ballpark's HR factor add to (or work
  // against) this batter's case." One cheap Supabase read per game, not
  // per player.
  const park = game.venue?.name ? await getParkFactor(game.venue.name, season) : null

  if (isFinal) {
    const all = await getKeyPlayersSnapshot(game.gamePk)
    const awayId = game.teams.away.team.id
    const homeId = game.teams.home.team.id
    const awaySnap = all.filter(s => s.team_id === awayId)
    const homeSnap = all.filter(s => s.team_id === homeId)

    // Recorded lines + pitch-by-pitch, fetched server-side so the report card
    // (rating next to each pick) is on the card at first paint. This used to
    // be a client fetch that only fired when the popup opened — and it
    // passed gamePk 0 for every postgame card and hit an /api route that
    // doesn't exist, so results never loaded.
    async function resultsFor(rows: KeyPlayersSnapshot[]): Promise<PostgameResults> {
      const out: PostgameResults = {}
      await Promise.all(rows.map(async (r) => {
        if (r.player_type === 'pitcher') {
          out[String(r.player_id)] = { pitcher: await getPitcherGameResult(r.player_id, game!.gamePk, gameDateApi), batter: null, pbp: null }
          return
        }
        const oppPitcher = r.reason_summary.opposing_pitcher_id
          ?? (r.team_id === awayId ? homePitcherId : awayPitcherId)
          ?? null
        const [batter, pbp] = await Promise.all([
          getBatterGameResult(r.player_id, game!.gamePk, gameDateApi),
          oppPitcher ? getBatterPitchByPitchResult(r.player_id, oppPitcher, game!.gamePk, []) : Promise.resolve(null),
        ])
        out[String(r.player_id)] = { batter, pitcher: null, pbp }
      }))
      return out
    }
    // If the per-player results are slow, show the picks without the report-card
    // ratings rather than hang; ratings fill in on a later view once cached.
    const [awayResults, homeResults] = (await withBudget(
      Promise.all([resultsFor(awaySnap), resultsFor(homeSnap)]), KEY_PLAYERS_BUDGET_MS,
    )) ?? [{} as PostgameResults, {} as PostgameResults]

    return (
      <div className="grid md:grid-cols-2 gap-4">
        <Top3KeyPlayersTab variant="postgame" snapshot={awaySnap} results={awayResults} teamName={game.teams.away.team.name} teamId={awayId} isPro={isPro} />
        <Top3KeyPlayersTab variant="postgame" snapshot={homeSnap} results={homeResults} teamName={game.teams.home.team.name} teamId={homeId} isPro={isPro} />
      </div>
    )
  }

  // ── Recent-form context (heating/cooling) for the pregame candidate cards ──
  const _awayTeamShort = game.teams.away.team.name
  const _homeTeamShort = game.teams.home.team.name
  const _formDate = new Date().toISOString().split('T')[0]
  const _formCols = 'player_id, player_name, team_name, player_type, signal, signal_quality, metric, current_value, extreme_value, magnitude, trend, avg, rbi, runs, walks, games'

  async function fetchFormSignals(teamShort: string, signal: 'heating' | 'cooling', limit: number) {
    const shortName = teamShort.split(' ').slice(-1)[0]
    const today = await supa.from('player_form_signals')
      .select(_formCols)
      .eq('computed_date', _formDate).eq('player_type', 'batter').eq('signal', signal)
      .ilike('team_name', `%${shortName}%`)
      .order('magnitude', { ascending: false }).limit(limit)
    if (today.data?.length) return today.data
    const fallback = await supa.from('player_form_signals')
      .select(_formCols)
      .lt('computed_date', _formDate).eq('player_type', 'batter').eq('signal', signal)
      .ilike('team_name', `%${shortName}%`)
      .order('computed_date', { ascending: false })
      .order('magnitude', { ascending: false }).limit(limit)
    return fallback.data ?? []
  }

  const [awayInjuries, homeInjuries, awayActiveRosterIds, homeActiveRosterIds, _awayHeating, _awayCooling, _homeHeating, _homeCooling] = await Promise.all([
    getTeamILList(game.teams.away.team.id),
    getTeamILList(game.teams.home.team.id),
    getActiveRosterIds(game.teams.away.team.id),
    getActiveRosterIds(game.teams.home.team.id),
    fetchFormSignals(_awayTeamShort, 'heating', 2),
    fetchFormSignals(_awayTeamShort, 'cooling', 2),
    fetchFormSignals(_homeTeamShort, 'heating', 2),
    fetchFormSignals(_homeTeamShort, 'cooling', 2),
  ])
  const _awayFormData = [..._awayHeating, ..._awayCooling]
  const _homeFormData = [..._homeHeating, ..._homeCooling]

  const _toHotStreak = (row: any): HotStreakPlayer => ({
    player_id: row.player_id, player_name: row.player_name, team_abbr: row.team_name ?? '',
    player_type: row.player_type, signal: row.signal,
    signal_quality: row.signal_quality, metric: row.metric,
    current_value: Number(row.current_value), extreme_value: Number(row.extreme_value),
    magnitude: Number(row.magnitude),
    recentGameLog: Array.isArray(row.trend) ? row.trend.map(Number) : undefined,
    avg: row.avg != null ? Number(row.avg) : undefined,
    rbi: row.rbi != null ? Number(row.rbi) : undefined,
    runs: row.runs != null ? Number(row.runs) : undefined,
    walks: row.walks != null ? Number(row.walks) : undefined,
    games: row.games != null ? Number(row.games) : undefined,
  })

  function dedupeByPlayerId(rows: ReturnType<typeof _toHotStreak>[]) {
    const byId = new Map<number, ReturnType<typeof _toHotStreak>>()
    for (const r of rows) {
      const existing = byId.get(r.player_id)
      if (!existing || r.magnitude > existing.magnitude) byId.set(r.player_id, r)
    }
    return Array.from(byId.values())
  }

  const _awayInjuredIds = new Set((awayInjuries ?? []).map((i: any) => i.player_id).filter(Boolean))
  const _homeInjuredIds = new Set((homeInjuries ?? []).map((i: any) => i.player_id).filter(Boolean))
  const awayRosterCheckAvailable = awayActiveRosterIds.size > 0
  const homeRosterCheckAvailable = homeActiveRosterIds.size > 0

  const _awayHotStreaks = dedupeByPlayerId(
    (_awayFormData ?? [])
      .map(_toHotStreak)
      .filter(s => !_awayInjuredIds.has(s.player_id) && (!awayRosterCheckAvailable || awayActiveRosterIds.has(s.player_id)))
  )
  const _homeHotStreaks = dedupeByPlayerId(
    (_homeFormData ?? [])
      .map(_toHotStreak)
      .filter(s => !_homeInjuredIds.has(s.player_id) && (!homeRosterCheckAvailable || homeActiveRosterIds.has(s.player_id)))
  )

  function buildFormMap(streaks: typeof _awayHotStreaks): Record<string, RecentFormContext> {
    const out: Record<string, RecentFormContext> = {}
    for (const s of streaks) {
      if (s.signal !== 'heating' && s.signal !== 'cooling') continue
      out[String(s.player_id)] = { signal: s.signal, metric: `${s.metric} ${s.current_value}`, trend: s.recentGameLog }
    }
    return out
  }
  const awayFormMap = buildFormMap(_awayHotStreaks)
  const homeFormMap = buildFormMap(_homeHotStreaks)

  const computed = await withBudget(Promise.all([
    computeTeamKeyPlayers({
      game, teamId: game.teams.away.team.id, opposingTeamId: game.teams.home.team.id, gameDate: gameDateApi,
      pitcher: awayPitcherId ? { id: awayPitcherId, name: game.teams.away.probablePitcher?.fullName ?? 'TBD' } : null,
      isHome: false, formByPlayerId: awayFormMap, park,
    }),
    computeTeamKeyPlayers({
      game, teamId: game.teams.home.team.id, opposingTeamId: game.teams.away.team.id, gameDate: gameDateApi,
      pitcher: homePitcherId ? { id: homePitcherId, name: game.teams.home.probablePitcher?.fullName ?? 'TBD' } : null,
      isHome: true, formByPlayerId: homeFormMap, park,
    }),
  ]), KEY_PLAYERS_BUDGET_MS)
  if (!computed) return <KeyPlayersPending />
  const [awayKeyPlayers, homeKeyPlayers] = computed

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Top3KeyPlayersTab variant="pregame" candidates={awayKeyPlayers} teamName={game.teams.away.team.name} teamId={game.teams.away.team.id} formByPlayerId={awayFormMap} isPro={isPro} park={park} dayNight={game.dayNight ?? null} />
      <Top3KeyPlayersTab variant="pregame" candidates={homeKeyPlayers} teamName={game.teams.home.team.name} teamId={game.teams.home.team.id} formByPlayerId={homeFormMap} isPro={isPro} park={park} dayNight={game.dayNight ?? null} />
    </div>
  )
}
