// /mlb/front-office — Phillies Front Office (locked to one club; see FO_TEAM).
// Phase 1: how the club is constructed. Roster Blueprint (how players arrived), WAR,
// age profile, contracts, prospects and the full 40-man with stats. Analytical tools
// come later on top of this.
//
// Data: team_front_office_snapshot (compute_team_front_office.py), team_blueprint_snapshot
// (compute_roster_blueprint.py), player_contract_seasons (hand-loaded; empty state until then).
// Every viewer gets the same page — it is all public data, so there is no Pro gate here.

import Link from 'next/link'
import FoShell from '@/components/front-office/FoShell'
import BlueprintChart, { Legend } from '@/components/front-office/BlueprintChart'
import { AgeBars, PayrollBars, type AgeBucket, type PayrollYear } from '@/components/front-office/TeamCharts'
import { Card, Empty, Foot, Section, Tile, PlayerLink, C, MONO, SANS, DISPLAY } from '@/components/team/ui'
import { ACQ_COLOR, ACQ_LABEL, ACQ_TYPES, getBlueprint, type AcqKey } from '@/lib/front-office/blueprint'
import { FO_TEAM, getContracts, getTeamSnapshot, type ContractYear, type Prospect, type RosterPlayer } from '@/lib/front-office/team'

export const revalidate = 600
export const metadata = {
  title: 'Phillies Front Office · x9Lab',
  description: 'How the Phillies are built: where the roster came from, WAR, age profile, contracts and the farm system.',
}

// ── formatting ──────────────────────────────────────────────────────────────
const r3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const d1 = (v: number | null) => (v == null ? '—' : v.toFixed(1))
const d2 = (v: number | null) => (v == null ? '—' : v.toFixed(2))
const int = (v: number | null) => (v == null ? '—' : String(Math.round(v)))
const money = (usd: number) => `$${(usd / 1e6).toFixed(1)}M`
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

const AGE_BUCKETS: { label: string; test: (a: number) => boolean }[] = [
  { label: '≤24', test: a => a <= 24 }, { label: '25–26', test: a => a >= 25 && a <= 26 },
  { label: '27–28', test: a => a >= 27 && a <= 28 }, { label: '29–30', test: a => a >= 29 && a <= 30 },
  { label: '31–32', test: a => a >= 31 && a <= 32 }, { label: '33–34', test: a => a >= 33 && a <= 34 },
  { label: '35+', test: a => a >= 35 },
]

// ── small table pieces ──────────────────────────────────────────────────────
type Col<T> = { head: string; cell: (r: T) => React.ReactNode; left?: boolean }

function DataTable<T extends { id: number }>({ cols, rows }: { cols: Col<T>[]; rows: T[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ color: C.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            {cols.map(c => <th key={c.head} style={{ padding: '6px 8px', textAlign: c.left ? 'left' : 'right', fontWeight: 400, whiteSpace: 'nowrap' }}>{c.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderTop: `1px solid ${C.line}` }}>
              {cols.map(c => <td key={c.head} style={{ padding: '7px 8px', textAlign: c.left ? 'left' : 'right', whiteSpace: 'nowrap' }}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const who = <T extends { id: number; name: string; pos: string }>(): Col<T> => ({
  head: 'Player', left: true,
  cell: r => <PlayerLink id={r.id}>{r.name}</PlayerLink>,
})
const posCol = <T extends { pos: string }>(): Col<T> => ({ head: 'Pos', left: true, cell: r => <span style={{ color: C.mute }}>{r.pos || '—'}</span> })
const bold = (v: React.ReactNode) => <b style={{ fontWeight: 800 }}>{v}</b>

const hitterCols: Col<RosterPlayer>[] = [
  who(), posCol(), { head: 'Age', cell: r => int(r.age) }, { head: 'WAR', cell: r => bold(d1(r.war)) }, { head: 'PA', cell: r => int(r.pa) },
  { head: 'AVG', cell: r => r3(r.avg) }, { head: 'OBP', cell: r => r3(r.obp) }, { head: 'SLG', cell: r => r3(r.slg) }, { head: 'OPS', cell: r => r3(r.ops) },
  { head: 'wRC+', cell: r => int(r.wrcPlus) }, { head: 'HR', cell: r => int(r.hr) }, { head: 'SB', cell: r => int(r.sb) },
]
const pitcherCols: Col<RosterPlayer>[] = [
  who(), { head: 'Role', left: true, cell: r => <span style={{ color: C.mute }}>{(r.gs ?? 0) > 0 && (r.gs ?? 0) >= (r.g ?? 0) / 2 ? 'SP' : 'RP'}</span> },
  { head: 'Age', cell: r => int(r.age) }, { head: 'WAR', cell: r => bold(d1(r.war)) }, { head: 'IP', cell: r => d1(r.ip) },
  { head: 'ERA', cell: r => d2(r.era) }, { head: 'FIP', cell: r => d2(r.fip) }, { head: 'WHIP', cell: r => d2(r.whip) },
  { head: 'K', cell: r => int(r.so) }, { head: 'BB', cell: r => int(r.bb) }, { head: 'SV', cell: r => int(r.sv) },
]
const prospectHitterCols: Col<Prospect>[] = [
  who(), posCol(), { head: 'Age', cell: r => int(r.age) }, { head: 'PA', cell: r => int(r.pa) }, { head: 'AVG', cell: r => r3(r.avg) },
  { head: 'OBP', cell: r => r3(r.obp) }, { head: 'SLG', cell: r => r3(r.slg) }, { head: 'OPS', cell: r => bold(r3(r.ops)) },
  { head: 'HR', cell: r => int(r.hr) }, { head: 'SB', cell: r => int(r.sb) },
]
const prospectPitcherCols: Col<Prospect>[] = [
  who(), { head: 'Age', cell: r => int(r.age) }, { head: 'IP', cell: r => d1(r.ip) }, { head: 'ERA', cell: r => bold(d2(r.era)) },
  { head: 'WHIP', cell: r => d2(r.whip) }, { head: 'K', cell: r => int(r.so) }, { head: 'BB', cell: r => int(r.bb) },
]

/** First `limit` rows visible; the rest tucked into a native <details> so the page stays short without client JS. */
function Expandable<T extends { id: number }>({ cols, rows, limit }: { cols: Col<T>[]; rows: T[]; limit: number }) {
  return (
    <>
      <DataTable cols={cols} rows={rows.slice(0, limit)} />
      {rows.length > limit && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.orange, padding: '6px 8px' }}>Show {rows.length - limit} more</summary>
          <DataTable cols={cols} rows={rows.slice(limit)} />
        </details>
      )}
    </>
  )
}

/** Horizontal WAR bars. Bars show positive WAR only; the printed number is always the real value. */
function WarBars({ rows, color }: { rows: RosterPlayer[]; color: string }) {
  const max = Math.max(...rows.map(r => r.war ?? 0), 0.1)
  return (
    <div>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 40px', gap: 10, alignItems: 'center', padding: '4px 0' }}>
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><PlayerLink id={r.id}>{r.name}</PlayerLink></span>
          <span style={{ height: 14, borderRadius: 4, background: C.soft, display: 'block' }}>
            <span style={{ display: 'block', height: '100%', borderRadius: 4, background: color, width: `${Math.max(((r.war ?? 0) / max) * 100, 0)}%` }} />
          </span>
          <b style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, textAlign: 'right' }}>{d1(r.war)}</b>
        </div>
      ))}
    </div>
  )
}

export default async function FrontOfficePage() {
  const snap = await getTeamSnapshot(FO_TEAM.id)
  const color = FO_TEAM.primary_color

  if (!snap || snap.roster.length === 0) {
    return (
      <FoShell active="/mlb/front-office" kicker="MLB" title={`${FO_TEAM.short} Front Office`}>
        <Card><Empty>The {FO_TEAM.short} roster snapshot has not been computed yet. The nightly job fills this in.</Empty></Card>
      </FoShell>
    )
  }

  const { roster, prospects, season } = snap
  const hitters = roster.filter(p => !p.isPitcher).sort((a, b) => (b.war ?? -99) - (a.war ?? -99))
  const pitchers = roster.filter(p => p.isPitcher).sort((a, b) => (b.war ?? -99) - (a.war ?? -99))
  const withAge = roster.filter(p => p.age != null)
  const meanAge = withAge.length ? sum(withAge.map(p => p.age!)) / withAge.length : null
  const posWar = sum(roster.map(p => Math.max(p.war ?? 0, 0)))
  const warWeightedAge = posWar > 0 ? sum(withAge.map(p => p.age! * Math.max(p.war ?? 0, 0))) / sum(withAge.map(p => Math.max(p.war ?? 0, 0))) : null
  const totalWar = sum(roster.map(p => p.war ?? 0))
  const missingWar = roster.filter(p => p.war == null).length
  const injured = roster.filter(p => p.status !== 'A').length

  const ageData: AgeBucket[] = AGE_BUCKETS.map(b => {
    const ps = withAge.filter(p => b.test(p.age!))
    return { label: b.label, players: ps.length, war: Math.round(sum(ps.map(p => p.war ?? 0)) * 10) / 10 }
  })

  const blueprint = (await getBlueprint(season)).find(b => b.teamId === FO_TEAM.id) ?? null

  // Contracts: only rows a human loaded. Coverage is stated, not hidden.
  const contracts = await getContracts(roster.map(p => p.id), season)
  const byPlayer = new Map<number, ContractYear[]>()
  for (const c of contracts) byPlayer.set(c.playerId, [...(byPlayer.get(c.playerId) ?? []), c])
  const contractSeasons = [...new Set(contracts.map(c => c.season))].sort()
  const payroll: PayrollYear[] = contractSeasons.map(y => {
    const rows = contracts.filter(c => c.season === y)
    return {
      season: String(y),
      guaranteed: Math.round(sum(rows.filter(c => c.guaranteed && !c.option).map(c => c.salary)) / 1e5) / 10,
      option: Math.round(sum(rows.filter(c => !c.guaranteed || c.option).map(c => c.salary)) / 1e5) / 10,
    }
  })
  const latestVerified = contracts.map(c => c.verifiedAt).sort().pop() ?? null
  const contracted = roster.filter(p => byPlayer.has(p.id)).sort((a, b) => (byPlayer.get(b.id)!.reduce((m, c) => Math.max(m, c.salary), 0)) - (byPlayer.get(a.id)!.reduce((m, c) => Math.max(m, c.salary), 0)))

  // Prospects, grouped by level in system order.
  const levels = [...new Set(prospects.map(p => p.level))]
    .sort((a, b) => (prospects.find(p => p.level === a)!.levelSportId) - (prospects.find(p => p.level === b)!.levelSportId))

  const asOf = new Date(snap.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <FoShell active="/mlb/front-office" kicker="MLB" title={`${FO_TEAM.short} Front Office`}>
      <div style={{ background: color, color: FO_TEAM.text_on_primary, borderRadius: 14, padding: '18px 22px', margin: '14px 0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .8 }}>{season} · {FO_TEAM.league} {FO_TEAM.division}</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, letterSpacing: '-.01em' }}>{FO_TEAM.name}</div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, opacity: .8 }}>Snapshot {asOf}</div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `.fo-sec a.fo-pill{font-family:${MONO};font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;padding:6px 11px;border-radius:999px;border:1px solid ${C.line};background:#fff;color:${C.ink};text-decoration:none;white-space:nowrap}` }} />
      <div className="fo-sec fo-nav" style={{ margin: '12px 0 0' }}>
        {[['built', 'How it’s built'], ['war', 'WAR'], ['age', 'Age profile'], ['contracts', 'Contracts'], ['prospects', 'Prospects'], ['roster', '40-man']].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="fo-pill">{label}</a>
        ))}
      </div>

      <div className="fo-grid" style={{ marginTop: 18 }}>
        <Tile label="40-man roster" value={String(roster.length)} sub={injured ? `${injured} on the injured list` : undefined} />
        <Tile label="Roster WAR" value={d1(totalWar)} sub={`${hitters.length} hitters · ${pitchers.length} pitchers`} />
        <Tile label="Average age" value={meanAge == null ? '—' : meanAge.toFixed(1)} sub={warWeightedAge == null ? undefined : `${warWeightedAge.toFixed(1)} weighted by WAR`} />
        <Tile label="Commitments" value={payroll.length ? money(sum(contracts.filter(c => c.season === contractSeasons[0]).map(c => c.salary))) : '—'} sub={payroll.length ? `${contractSeasons[0]} salary, ${byPlayer.size} players loaded` : 'contracts not loaded yet'} />
      </div>

      <Section id="built" num="01" title="How the roster was built" sub="Each segment is the share of the club’s positive WAR, split by how the player arrived.">
        {blueprint && blueprint.totalWar > 0 ? (
          <div className="fo-two">
            <Card title={`${FO_TEAM.short} · ${season} WAR by route`} note="positive WAR only">
              <Legend />
              <BlueprintChart rows={[blueprint]} hrefFor={id => `/mlb/front-office/blueprint?team=${id}#drill`} />
              <Foot>x9Lab · MLB Stats API (WAR, transactions). A player’s full-season WAR is credited to his current club. Player-by-player routes are on the Roster Blueprint page.</Foot>
            </Card>
            <Card title="By the numbers">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr style={{ color: C.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Route</th><th style={{ textAlign: 'right', fontWeight: 400 }}>Players</th><th style={{ textAlign: 'right', fontWeight: 400 }}>WAR</th>
                </tr></thead>
                <tbody>
                  {([...ACQ_TYPES, 'unclassified'] as AcqKey[]).filter(k => blueprint.counts[k] > 0).map(k => (
                    <tr key={k} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td style={{ padding: '6px 0' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: ACQ_COLOR[k], display: 'inline-block', marginRight: 8, border: k === 'unclassified' ? `1px solid ${C.line}` : 0 }} />{ACQ_LABEL[k]}</td>
                      <td style={{ textAlign: 'right' }}>{blueprint.counts[k]}</td>
                      <td style={{ textAlign: 'right' }}>{bold(d1(blueprint.war[k]))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Foot>Players counted are everyone with {season} WAR on the club, not just the 40-man.</Foot>
            </Card>
          </div>
        ) : (
          <Card><Empty>The Roster Blueprint has not been computed for {season} yet.</Empty></Card>
        )}
      </Section>

      <Section id="war" num="02" title="Where the WAR comes from" sub={`${season} season WAR for players on the 40-man. WAR is the MLB Stats API sabermetrics figure (hitters include batting, fielding and baserunning).`}>
        <div className="fo-two">
          <Card title="Hitters" note={`${d1(sum(hitters.map(p => p.war ?? 0)))} WAR`}><WarBars rows={hitters.slice(0, 10)} color={color} /></Card>
          <Card title="Pitchers" note={`${d1(sum(pitchers.map(p => p.war ?? 0)))} WAR`}><WarBars rows={pitchers.slice(0, 10)} color={color} /></Card>
        </div>
        <Foot>x9Lab · MLB Stats API sabermetrics. Top 10 per group; the full list is in the 40-man table.{missingWar ? ` ${missingWar} players have no WAR row (no major-league innings or plate appearances) and show —.` : ''}</Foot>
      </Section>

      <Section id="age" num="03" title="Age profile" sub="How old the roster is, and which age groups are producing the WAR.">
        <Card title="Players and WAR by age" note="age as of today">
          <AgeBars data={ageData} color={color} />
          <Foot>x9Lab · MLB Stats API. Left axis: players on the 40-man. Right axis: summed {season} WAR for that bracket (a below-replacement player lowers it).</Foot>
        </Card>
      </Section>

      <Section id="contracts" num="04" title="Contracts" sub="Salary commitments by season for the players on the 40-man.">
        {contracts.length === 0 ? (
          <Card>
            <Empty>Contract data has not been loaded. The MLB Stats API publishes no contract terms, so these rows are entered from a checked source (every row carries its source link and date).</Empty>
          </Card>
        ) : (
          <>
            <Card title="Committed salary by season" note={`${byPlayer.size} of ${roster.length} players loaded`}>
              <PayrollBars data={payroll} color={color} />
              <Foot>Only players with loaded contract rows are counted, so these totals are a floor, not the full payroll. Last verified {latestVerified}.</Foot>
            </Card>
            <div style={{ height: 12 }} />
            <Card title="By player">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                  <thead><tr style={{ color: C.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', fontWeight: 400, padding: '6px 8px' }}>Player</th><th style={{ fontWeight: 400 }}>Age</th>
                    {contractSeasons.map(y => <th key={y} style={{ textAlign: 'right', fontWeight: 400, padding: '6px 8px' }}>{y}</th>)}
                  </tr></thead>
                  <tbody>
                    {contracted.map(p => {
                      const rows = byPlayer.get(p.id)!
                      return (
                        <tr key={p.id} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}><PlayerLink id={p.id}>{p.name}</PlayerLink></td>
                          <td style={{ textAlign: 'center', color: C.mute }}>{int(p.age)}</td>
                          {contractSeasons.map(y => {
                            const c = rows.find(r => r.season === y)
                            return <td key={y} style={{ textAlign: 'right', padding: '7px 8px', whiteSpace: 'nowrap' }}>{c ? <>{bold(money(c.salary))}{(c.option || !c.guaranteed) && <span style={{ fontFamily: MONO, fontSize: 9, color: C.orange, marginLeft: 4 }}>{c.option ?? 'non-gtd'}</span>}</> : <span style={{ color: C.faint }}>—</span>}</td>
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Foot>A dash means no contract row for that season, not necessarily no contract. Sources are stored per row.</Foot>
            </Card>
          </>
        )}
      </Section>

      <Section id="prospects" num="05" title="Prospects" sub={`Players in the system aged 25 or under who are not on the 40-man, with their ${season} minor-league stats. Hitters ranked by OPS, pitchers by ERA.`}>
        {levels.length === 0 ? (
          <Card><Empty>No minor-league stat lines yet.</Empty></Card>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {levels.map(level => {
              const here = prospects.filter(p => p.level === level)
              const hs = here.filter(p => !p.isPitcher).sort((a, b) => (b.ops ?? -1) - (a.ops ?? -1))
              const ps = here.filter(p => p.isPitcher).sort((a, b) => (a.era ?? 99) - (b.era ?? 99))
              return (
                <Card key={level} title={level} note={`${hs.length} hitters · ${ps.length} pitchers`}>
                  <div className="fo-two">
                    <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.mute, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Hitters</div>
                      {hs.length ? <Expandable cols={prospectHitterCols} rows={hs} limit={6} /> : <Empty>None qualified.</Empty>}</div>
                    <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.mute, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Pitchers</div>
                      {ps.length ? <Expandable cols={prospectPitcherCols} rows={ps} limit={6} /> : <Empty>None qualified.</Empty>}</div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
        <Foot>x9Lab · MLB Stats API. This is a statistical view of the system, not a scouting ranking: grades and org ranks are editorial products with no free source. Minimum 50 PA or 15 IP at the level; a player who played at more than one level appears at each.</Foot>
      </Section>

      <Section id="roster" num="06" title="The 40-man" sub={`Every player on the 40-man roster with ${season} major-league stats.`}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Card title="Hitters"><DataTable cols={hitterCols} rows={hitters} /></Card>
          <Card title="Pitchers"><DataTable cols={pitcherCols} rows={pitchers} /></Card>
        </div>
        <Foot>x9Lab · MLB Stats API. A dash means the player has no plate appearances or innings to measure. Role: starter if he started at least half his appearances.</Foot>
      </Section>

      <p style={{ marginTop: 28, fontFamily: SANS, fontSize: 13, color: '#5b5347' }}>
        Looking for how each player arrived? <Link href={`/mlb/front-office/blueprint?team=${FO_TEAM.id}#drill`} style={{ color: C.orange, fontWeight: 700 }}>Roster Blueprint →</Link>
      </p>
    </FoShell>
  )
}
