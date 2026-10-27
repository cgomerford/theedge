// src/components/scout/ClubDeskSection.tsx: Club, form & park tab body (server). For each club: who is available (getClubStatus), who they are (getRosterProfiles), the form windows
// and trend explorer (getTeamTrend); once: tonight's park (getParkDeep, getParkFactor). Triple-A and Double-A rosters are server components wrapped in Suspense and handed to the
// client ClubLab as slots, so a slow affiliate fetch never holds up the MLB view. Nothing is fetched by the browser.
import { Suspense } from 'react'
import { Headshot } from '@/components/home/Logo'
import { getClubStatus, type ClubPlayer } from '@/lib/scout/club-status'
import { getAffiliateStatus, MINOR_LEVELS } from '@/lib/scout/affiliates'
import { getRosterProfiles, makeup, MIN_TYPE_PA, POWER_ISO, SMALL_ISO, SMALL_K, SMALL_SB } from '@/lib/scout/roster-profile'
import { getTeamTrend, MIN_VERDICT_PA, OFFENSE_STATS, OFFENSE_TILES } from '@/lib/scout/team-trends'
import { getParkDeep } from '@/lib/scout/park-deep'
import { getParkFactor } from '@/lib/parks'
import { teamLogoUrl } from '@/lib/mlb'
import ClubLab, { type ClubDeskSide, type PersonCard } from './lab/ClubLab'
import type { ScoutClub, ScoutContext } from './types'

const SYMBOL = { available: '●', questionable: '▲', out: '■' } as const
const COLOR = { available: '#1D9E75', questionable: '#c98a00', out: '#8a8275' } as const
const rank = { out: 0, questionable: 1, available: 2 }
const short = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '')

function MinorCards({ players }: { players: (ClubPlayer & { seasonLine?: string | null })[] }) {
  const sorted = [...players].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 8, marginTop: 8 }}>
      {sorted.map(p => (
        <div key={p.id} title={`${p.name}: ${p.status}${p.reason ? ` (${p.reason})` : ''}`} style={{ display: 'flex', gap: 8, alignItems: 'center', border: `1px solid ${p.status === 'available' ? '#e7e2d8' : COLOR[p.status]}`, borderRadius: 10, padding: '6px 8px', background: '#fff', opacity: p.status === 'out' ? 0.65 : 1 }}>
          <Headshot id={p.id} name={p.name} size={30} />
          <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 800 }}><span style={{ color: COLOR[p.status] }}>{SYMBOL[p.status]}</span> {p.name}<small style={{ display: 'block', fontWeight: 600, color: '#8a8275', fontSize: 11 }}>{p.tag ?? p.pos} · {p.lastPlayed ? `last played ${short(p.lastPlayed)}` : 'no recent game'}{p.seasonLine ? ` · ${p.seasonLine}` : ''}</small></span>
        </div>
      ))}
    </div>
  )
}

async function MinorPanel({ club, sportId, label, on40, ctx }: { club: ScoutClub; sportId: number; label: string; on40: Set<number>; ctx: ScoutContext }) {
  const aff = await getAffiliateStatus(club.id, sportId, ctx.gameDate, on40).catch(() => null)
  if (!aff) return <p style={{ fontSize: 14, color: '#8a8275' }}>No {label} roster is available for {club.abbr}.</p>
  const hit = aff.players.filter(p => p.group === 'hitter'), pit = aff.players.filter(p => p.group === 'pitcher')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#5b5347' }}><b>{aff.name}</b> · {label} · {aff.lastGameDate ? `last game ${short(aff.lastGameDate)}` : 'no recent games'} · {aff.counts.available} available, {aff.counts.questionable} questionable, {aff.counts.out} out</p>
      <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 14 }}><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722', textTransform: 'uppercase' }}>Position players · {hit.length}</div><MinorCards players={hit} /></div>
      <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 14 }}><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722', textTransform: 'uppercase' }}>Pitchers · {pit.length}</div><MinorCards players={pit} /></div>
    </div>
  )
}

async function load(club: ScoutClub, ctx: ScoutContext): Promise<ClubDeskSide> {
  const season = Number(ctx.gameDate.slice(0, 4))
  const [status, trend] = await Promise.all([
    getClubStatus(club.id, ctx.gameDate, ctx.gamePk, club.probableId).catch(() => null),
    getTeamTrend(club.id, club.abbr, ctx.gameDate, club.name).catch(() => null),
  ])
  const profiles = status ? await getRosterProfiles(club.id, status.roster40Ids, ctx.gameDate).catch(() => null) : null
  const on40 = new Set(status?.roster40Ids ?? [])
  const people: Record<number, PersonCard> = {}
  for (const p of status?.players ?? []) {
    const pr = profiles?.byId.get(p.id)
    people[p.id] = {
      id: p.id, name: p.name, pos: p.pos, tag: p.tag, group: p.group, status: p.status, reason: p.reason, restDays: p.restDays, lastPlayed: p.lastPlayed, lastLine: p.lastLine, outSince: p.outSince,
      age: pr?.age ?? null, country: pr?.country ?? null, drafted: !!pr?.draftedByClub, draftYear: pr?.draftYear ?? null, draftRound: pr?.draftRound ?? null,
      bats: pr?.bats ?? null, throws: pr?.throws ?? null, archetype: pr?.archetype ?? null, hit: pr?.hit ?? null, contractThrough: pr?.contractThrough ?? null,
    }
  }
  return {
    club: { id: club.id, abbr: club.abbr, name: club.name }, logo: teamLogoUrl(club.id),
    status: status ? { counts: status.counts, omittedStarters: status.omittedStarters, lineupConfirmed: status.lineupConfirmed, transactions: status.transactions.slice(0, 10).map(t => ({ id: t.transaction_id, date: t.transaction_date, name: t.player_name, category: t.category, injury: t.injury_reason ?? null, effect: t.effect })) } : null,
    people,
    makeup: status && profiles ? makeup(status.active, profiles.byId, season) : null,
    contractsLoaded: profiles?.contractsLoaded ?? false,
    trend: trend ? { l7: trend.l7, l15: trend.l15, l30: trend.l30, seasonXwoba: trend.seasonXwoba, seasonWoba: trend.seasonWoba, verdict: trend.verdict } : null,
    explorer: trend?.explorer ?? null,
    minors: Object.fromEntries(MINOR_LEVELS.map(l => [String(l.sportId), { label: l.label, node: <Suspense fallback={<p style={{ fontSize: 14, color: '#8a8275' }}>Loading the {l.label} roster…</p>}><MinorPanel club={club} sportId={l.sportId} label={l.label} on40={on40} ctx={ctx} /></Suspense> }])),
  }
}

export default async function ClubDeskSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home, park, pf] = await Promise.all([load(ctx.away, ctx), load(ctx.home, ctx), getParkDeep(ctx.venueId, ctx.venueName).catch(() => null), getParkFactor(ctx.venueName).catch(() => null)])
  return (
    <ClubLab clubs={{ away, home }} park={park} parkExtra={pf ? { altitude: pf.altitude_feet ?? 0, dome: !!pf.is_dome } : null} venueName={ctx.venueName} dayNight={ctx.dayNight} isPro={ctx.isPro}
      stats={OFFENSE_STATS} tiles={OFFENSE_TILES} minVerdictPa={MIN_VERDICT_PA}
      rules={{ minTypePa: MIN_TYPE_PA, power: POWER_ISO, small: SMALL_ISO, smallSb: SMALL_SB, smallK: SMALL_K }} />
  )
}
