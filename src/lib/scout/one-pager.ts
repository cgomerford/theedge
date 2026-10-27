// src/lib/scout/one-pager.ts
//
// The Scout Report's one-page overview: for each club, what it is good at, where it struggles, tonight's starter, the lineup, the bench and the bullpen,
// each pulled from the data the detailed tabs already use: getTeamProfile (league ranks for every headline number), getProjectedLineup, the roster
// profile and getBullpenDesk (arm usage). Strengths and weaknesses are the club's best and worst league ranks, described with the rank among the clubs that
// have the number; nothing is predicted. Every source fails on its own: a missing piece is null and the page shows an empty state for that part.
import { getTeamProfile, type Metric, type TeamProfile } from '@/lib/team-profile'
import { getProjectedLineup, type ProjectedLineup } from '@/lib/lineups'
import { getBullpenDesk, type BullpenDesk } from '@/lib/scout/bullpen-desk'
import type { HitterLine, PitcherLine } from '@/lib/team-profile'
import type { ScoutClub, ScoutContext } from '@/components/scout/types'

export type RankItem = { group: string; label: string; display: string; rank: number; of: number; leagueDisplay: string }
export type ClubOnePager = {
  club: ScoutClub
  profile: TeamProfile | null
  strengths: RankItem[]
  weaknesses: RankItem[]
  starter: PitcherLine | null
  lineup: ProjectedLineup | null
  bench: HitterLine[]
  desk: BullpenDesk | null
  relievers: PitcherLine[]
}

const GROUPS: [keyof TeamProfile['ranks'], string][] = [['offense', 'Offense'], ['rotation', 'Rotation'], ['bullpen', 'Bullpen'], ['defense', 'Defense'], ['running', 'Running']]

function items(p: TeamProfile): RankItem[] {
  const out: RankItem[] = []
  for (const [k, group] of GROUPS) for (const m of p.ranks[k] as Metric[]) if (m.rank != null) out.push({ group, label: m.label, display: m.display, rank: m.rank, of: m.of, leagueDisplay: m.leagueDisplay })
  return out
}
/** The first `n` items in order, at most two from any one group so the list is not one theme. */
function pick(list: RankItem[], n: number): RankItem[] {
  const per = new Map<string, number>(), out: RankItem[] = []
  for (const it of list) { const c = per.get(it.group) ?? 0; if (c >= 2) continue; per.set(it.group, c + 1); out.push(it); if (out.length === n) break }
  return out
}

async function safe<T>(label: string, p: Promise<T>): Promise<T | null> {
  try { return await p } catch (e) { console.error(`[onePager] ${label} failed:`, (e as Error).message); return null }
}

export async function getClubOnePager(club: ScoutClub, ctx: ScoutContext): Promise<ClubOnePager> {
  const season = Number(ctx.gameDate.slice(0, 4))
  const [profile, lineup, desk] = await Promise.all([
    safe('profile', getTeamProfile(club.id, season, ctx.gameDate)),
    safe('lineup', getProjectedLineup(club.id, ctx.gameDate, ctx.gamePk)),
    safe('bullpen', getBullpenDesk(club.id, ctx.gameDate, ctx.postseason, club.probableId != null ? [club.probableId] : [])),
  ])
  const all = profile ? items(profile) : []
  const third = (it: RankItem) => Math.ceil(it.of / 3)
  const strengths = pick(all.filter(i => i.rank <= third(i)).sort((a, b) => a.rank - b.rank), 3)
  const weaknesses = pick(all.filter(i => i.rank > i.of - third(i)).sort((a, b) => b.rank - a.rank), 3)
  const inLineup = new Set((lineup?.batters ?? []).map(b => b.player_id))
  const bench = (profile?.roster?.hitters ?? []).filter(h => !inLineup.has(h.id) && h.pa >= 20).sort((a, b) => b.pa - a.pa).slice(0, 6)
  const starter = club.probableId != null ? (profile?.roster?.pitchers ?? []).find(p => p.id === club.probableId) ?? null : null
  const relievers = (profile?.roster?.pitchers ?? []).filter(p => p.role === 'RP').sort((a, b) => b.ip - a.ip).slice(0, 7)
  return { club, profile, strengths, weaknesses, starter, lineup, bench, desk, relievers }
}
