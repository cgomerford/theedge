// src/components/scout/TendenciesDeskSection.tsx: Tendencies tab body (server). The game sheet (getManagerCards: one row per situation, each with the sample behind it) and, for Pro
// and an opened look only, each club's lineup and probable starter split by platoon, home/road and day/night (getClubSplits). A free viewer gets the first FREE_WATCH_FORS rows per
// club in full; the rest are counted, and their text is never built here or sent. Handed to the client TendenciesLab. Nothing is fetched by the browser.
import { getManagerCards, type WatchFor } from '@/lib/scout/manager-card'
import { getClubSplits, MIN_SPLIT_BF, MIN_SPLIT_PA } from '@/lib/scout/splits'
import { FREE_WATCH_FORS } from './sections'
import TendenciesLab, { type TendSide } from './lab/TendenciesLab'
import type { ScoutClub, ScoutContext } from './types'

const TAB: Record<string, string> = { 'lineup-vs-sp': 'lineups', 'pitcher-attack': 'starters', 'run-game': 'baserunning', abs: 'abs', bullpen: 'bullpen', defense: 'fielding', splits: 'tendencies', park: 'club', 'club-status': 'club', 'form-vs-skill': 'club', leverage: 'leverage' }

async function load(club: ScoutClub, side: 'away' | 'home', items: WatchFor[], ctx: ScoutContext): Promise<TendSide> {
  const shown = ctx.isPro ? items : items.slice(0, FREE_WATCH_FORS)
  return {
    club: { id: club.id, abbr: club.abbr, name: club.name }, side,
    rows: shown.map(w => ({ id: w.id, tag: w.tag, when: w.when, body: w.body, title: w.title, tab: TAB[w.section] ?? 'overview', sectionLabel: w.sectionLabel })),
    lockedTags: ctx.isPro ? [] : items.slice(FREE_WATCH_FORS).map(w => w.tag),
    splits: ctx.isPro ? await getClubSplits(club.id, ctx.gameDate, ctx.gamePk, club.probableId).catch(() => null) : null,
  }
}

export default async function TendenciesDeskSection({ ctx }: { ctx: ScoutContext }) {
  const cards = await getManagerCards(ctx)
  const [away, home] = await Promise.all([load(ctx.away, 'away', cards.away, ctx), load(ctx.home, 'home', cards.home, ctx)])
  return <TendenciesLab clubs={{ away, home }} isPro={ctx.isPro} dayNight={ctx.dayNight} minPa={MIN_SPLIT_PA} minBf={MIN_SPLIT_BF} />
}
