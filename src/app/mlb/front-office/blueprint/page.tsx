// /mlb/front-office/blueprint — Roster Blueprint.
// Free: all 30 clubs. Pro: player drill-down and PNG export. The player query
// only runs inside the ProGate render function, so free viewers never receive it.

import Link from 'next/link'
import FoShell from '@/components/front-office/FoShell'
import BlueprintChart, { Legend } from '@/components/front-office/BlueprintChart'
import ProGate from '@/components/front-office/ProGate'
import UpgradeCard from '@/components/front-office/UpgradeCard'
import ExportPng from '@/components/front-office/ExportPng'
import { Card, Empty, Foot, MONO, SANS, C, Tile, PlayerLink } from '@/components/team/ui'
import { ACQ_LABEL, getBlueprint, getBlueprintPlayers, type BlueprintTeam } from '@/lib/front-office/blueprint'
import { resolveIsPro } from '@/lib/front-office/access'
import { MLB_TEAMS } from '@/lib/teams'
import { pageMeta } from '@/lib/seo'

export const revalidate = 300
export const metadata = pageMeta({
  title: 'Roster blueprint',
  description:
    'How every MLB club built its roster, by draft, international signing, trade, free agency, waivers and Rule 5, with each route weighted by WAR.',
  path: '/mlb/front-office/blueprint',
})

type Props = { searchParams: Promise<{ team?: string; sort?: string; pro?: string }> }
const SORTS = { homegrown: 'Most homegrown', trade: 'Most trade-built', claimed: 'Waiver and Rule 5 haul', war: 'Total WAR' } as const
type SortKey = keyof typeof SORTS
const name = (id: number) => MLB_TEAMS.find(t => t.id === id)?.short ?? String(id)
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function sortRows(rows: BlueprintTeam[], sort: SortKey) {
  const key = (r: BlueprintTeam) => sort === 'homegrown' ? r.homegrownShare ?? -1 : sort === 'trade' ? r.tradeShare ?? -1 : sort === 'claimed' ? r.claimedWar : r.totalWar
  return [...rows].sort((a, b) => key(b) - key(a))
}

export default async function BlueprintPage({ searchParams }: Props) {
  const sp = await searchParams
  const isPro = await resolveIsPro(sp.pro)
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : 'homegrown'
  const selected = Number(sp.team) || null
  const season = new Date().getFullYear()
  const rows = sortRows(await getBlueprint(season), sort)
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ sort, ...(sp.pro ? { pro: sp.pro } : {}), ...extra })
    return `/mlb/front-office/blueprint?${p.toString()}#drill`
  }
  const best = (f: (r: BlueprintTeam) => number | null) => rows.reduce<BlueprintTeam | null>((a, r) => ((f(r) ?? -1) > (a ? f(a) ?? -1 : -1) ? r : a), null)
  const homegrown = best(r => r.homegrownShare), tradeBuilt = best(r => r.tradeShare), claimed = best(r => r.claimedWar)

  return (
    <FoShell active="/mlb/front-office/blueprint" kicker="Front Office" title="Roster Blueprint">
      <p style={{ fontFamily: SANS, fontSize: 14, color: '#5b5347', maxWidth: 760, lineHeight: 1.5, margin: '12px 0 20px' }}>
        Rosters are built, not bought. Each bar splits a club&apos;s {season} WAR by how the player arrived. Click a club to see who and how.
      </p>

      {rows.length === 0 ? (
        <Card><Empty>The Blueprint has not been computed yet. The nightly job fills this in.</Empty></Card>
      ) : (
        <>
          <div className="fo-grid" style={{ marginBottom: 20 }}>
            <Tile label="Most homegrown" value={homegrown ? name(homegrown.teamId) : '—'} sub={homegrown ? `${pct(homegrown.homegrownShare)} of WAR from draft and international` : undefined} />
            <Tile label="Most trade-built" value={tradeBuilt ? name(tradeBuilt.teamId) : '—'} sub={tradeBuilt ? `${pct(tradeBuilt.tradeShare)} of WAR from trades` : undefined} />
            <Tile label="Best waiver and Rule 5 haul" value={claimed ? name(claimed.teamId) : '—'} sub={claimed ? `${claimed.claimedWar.toFixed(1)} WAR claimed` : undefined} />
            <Tile label="Clubs covered" value={String(rows.length)} sub="of 30" />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.mute, letterSpacing: '.1em', textTransform: 'uppercase' }}>Sort</span>
            {(Object.keys(SORTS) as SortKey[]).map(k => (
              <Link key={k} href={`/mlb/front-office/blueprint?sort=${k}${sp.pro ? `&pro=${sp.pro}` : ''}`} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 4, textDecoration: 'none', background: sort === k ? C.ink : '#fff', color: sort === k ? C.cream : C.ink, border: `1px solid ${C.line}` }}>{SORTS[k]}</Link>
            ))}
            <span style={{ flex: 1 }} />
            {isPro && <ExportPng targetId="blueprint-export" filename={`roster-blueprint-${season}.png`} />}
          </div>

          <div id="blueprint-export" style={{ background: C.cream, padding: 4 }}>
            <Card title={`How each club was built · ${season} WAR`} note="Segment = share of positive WAR">
              <Legend />
              <BlueprintChart rows={rows} selectedTeamId={selected} hrefFor={id => q({ team: String(id) })} />
            </Card>
          </div>
        </>
      )}

      <div id="drill" style={{ marginTop: 24 }}>
        <ProGate
          isPro={isPro}
          fallback={<UpgradeCard title="Player-level drill-down and PNG export" features={['Every player on the club, with how and when he arrived', 'Who he came from in a trade', 'One-click PNG export for sharing']} message="See every player's route to the roster. Front Office tools are part of Pro." />}
          render={async () => {
            if (!selected) return <Empty>Choose a club above to see its players.</Empty>
            const players = await getBlueprintPlayers(selected, season)
            if (!players.length) return <Empty>No player rows for this club yet.</Empty>
            return (
              <Card title={`${name(selected)} · how each player arrived`} note={`${players.length} players`}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', color: C.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                      <th style={{ padding: '6px 8px' }}>Player</th><th>Pos</th><th>Arrived by</th><th>From</th><th>Date</th><th style={{ textAlign: 'right', paddingRight: 8 }}>WAR</th>
                    </tr></thead>
                    <tbody>
                      {players.map(p => (
                        <tr key={p.playerId} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td style={{ padding: '7px 8px' }}><PlayerLink id={p.playerId}>{p.name}</PlayerLink></td>
                          <td style={{ color: C.mute }}>{p.position ?? '—'}</td>
                          <td>{ACQ_LABEL[p.type]}</td>
                          <td style={{ color: C.mute }}>{p.fromName ?? '—'}</td>
                          <td style={{ fontFamily: MONO, fontSize: 11, color: C.mute }}>{p.date ?? '—'}</td>
                          <td style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.war.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          }}
        />
      </div>
    </FoShell>
  )
}
