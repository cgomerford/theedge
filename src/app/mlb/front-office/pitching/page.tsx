// /mlb/front-office/pitching — the Pitching Desk (Phillies; the Front Office is locked to one club, see FO_TEAM).
//
// Controls live in the URL: ?p=<MLBAM id> &w=season|l30|l15|l5 &side=all|R|L &cmp=lg|<MLBAM id>. The server reads
// them, so a view is shareable. Default pitcher = the staff leader in IP.
//
// Data: fo_pitch_* tables written by scripts/fo/sync_pitch_*.py (see scripts/sql/create_fo_pitching_desk.sql).
// Nothing is fetched from Savant or the MLB API here.
//
// Free: §00 Staff board, Process vs results, pitcher header, Arsenal table.
// Pro:  Movement, Release, Shape comps, all of §02 and §03. The Pro blocks sit inside <ProGate render={...}>, so for a
//       free viewer they are never constructed and their data is never fetched.

import Link from 'next/link'
import FoShell from '@/components/front-office/FoShell'
import ProGate from '@/components/front-office/ProGate'
import UpgradeCard from '@/components/front-office/UpgradeCard'
import { Card, Empty, Foot, C, DISPLAY, MONO, SANS } from '@/components/team/ui'
import ArsenalTable, { PitchFocusProvider, type ArsenalLine, type LeagueByType } from '@/components/front-office/pitching/ArsenalTable'
import ChartCard from '@/components/front-office/pitching/ChartCard'
import Controls from '@/components/front-office/pitching/Controls'
import { NotebookProvider, NotebookTray } from '@/components/front-office/pitching/notebook'
import PitcherHeader from '@/components/front-office/pitching/PitcherHeader'
import ProcessVsResults, { type ScatterPt } from '@/components/front-office/pitching/ProcessVsResults'
import { DurabilityProBlock, ExecutionProBlock, StuffProBlock } from '@/components/front-office/pitching/ProBlocks'
import { SectionChips, SectionRail } from '@/components/front-office/pitching/SectionRail'
import { TeamBadge } from '@/components/front-office/pitching/Avatar'
import StaffBoard, { type RoleStats, type StaffLine } from '@/components/front-office/pitching/StaffBoard'
import { resolveIsPro } from '@/lib/front-office/access'
import {
  SIDES, SIDE_LABEL, WINDOWS, WIN_LABEL, getArsenal, getLeagueAvg, getLeagueContext, getStaff, getStaffSeason, parseSide, parseWin,
  type LeagueContext, type StaffRow,
} from '@/lib/front-office/pitching'
import { getStabilisation } from '@/lib/front-office/signal'
import { FO_TEAM } from '@/lib/front-office/team'

export const metadata = {
  title: 'Pitching Desk · Front Office · x9Lab',
  description: 'The Phillies pitching staff in one cockpit: stuff and shape, execution and results, durability and trajectory.',
}

type Props = { searchParams: Promise<{ p?: string; w?: string; side?: string; cmp?: string; pro?: string }> }

const CSS = `
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
.pd-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:32px;margin-top:16px;align-items:start}
.pd-rail{align-self:stretch}
.pd-anchor{scroll-margin-top:196px}
.pd-chips{display:none}
.pd-row:hover{background:#FFF8F0 !important}
.pd-row:focus-visible{outline:2px solid #FF5722;outline-offset:-2px}
.pd-g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pd-g75{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:12px}
.pd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.pd-bench{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){
  .pd-layout{grid-template-columns:minmax(0,1fr)}.pd-rail{display:none}
  .pd-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 10px}
  .pd-controls{position:static !important}.pd-anchor{scroll-margin-top:70px}
  .pd-g2,.pd-g75{grid-template-columns:minmax(0,1fr)}.pd-kpis,.pd-bench{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:480px){.pd-bench{grid-template-columns:minmax(0,1fr)}}
`

const BENCH: [string, string, string][] = [
  ['Model', 'Edge Stuff Grade', 'Our own pitch model on the 20-80 scale, trained on Statcast physics.'],
  ['What-if', 'Pitch design lab', "Change a pitch's velocity or break and see how its comps and results move."],
  ['Usage', 'Arsenal optimiser', 'Which pitches deserve more or less usage, by count and batter side.'],
  ['Role', 'Role & platoon fit', 'Starter or reliever? Splits, times through the order and stamina in one read.'],
  ['Pipeline', 'Prospect arms', 'Triple-A Statcast for the next wave, graded on the same scales.'],
  ['Market', 'Control & contracts', 'Years of control and surplus, from The Ledger.'],
  ['Scouting', 'Reclamation radar', 'League-wide arms whose stuff outruns their results.'],
  ['Notebook', 'My scout report', 'Save pinned charts and notes as a report you can export or share.'],
]

function DeskSection({ id, num, title, badges, lede, question, children }: {
  id: string; num: string; title: string; badges: string[]; lede?: string; question?: string; children: React.ReactNode
}) {
  return (
    <section id={id} className="pd-anchor" style={{ marginTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.orange, letterSpacing: '.16em' }}>§ {num}</span>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, letterSpacing: '-.01em', margin: 0, lineHeight: 1.1 }}>{title}</h2>
        {badges.map(b => <span key={b} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', padding: '2px 7px', borderRadius: 5, background: b === 'FREE' ? '#E1F5EE' : b === 'COMING' ? C.soft : C.yellow, color: b === 'FREE' ? '#085041' : C.ink }}>{b}</span>)}
      </div>
      {(question || lede) && (
        <p style={{ fontFamily: SANS, fontSize: 14, color: '#5b5347', margin: '0 0 16px', maxWidth: 760, lineHeight: 1.5 }}>
          {question && <b style={{ color: C.ink }}>The question: {question} </b>}{lede}
        </p>
      )}
      {children}
    </section>
  )
}

/** League means/SDs per role for the staff-board shading, from fo_league_pitch_context.sd (means are stored as mean_<metric>). */
function roleStats(ctx: LeagueContext[]): Record<string, RoleStats> {
  const out: Record<string, RoleStats> = {}
  for (const c of ctx) {
    const st = (sdKey: string, meanKey = sdKey) => ({ mean: c.sd[`mean_${meanKey}`] ?? null, sd: c.sd[sdKey] ?? null })
    out[c.role] = { kbb: st('kbb_pct'), csw: st('csw_pct'), whiff: st('whiff_pct'), xera: st('xera'), era: st('era'), fbd: st('fb_velo_delta') }
  }
  return out
}

export default async function PitchingDeskPage({ searchParams }: Props) {
  const sp = await searchParams
  const isPro = await resolveIsPro(sp.pro)
  const color = FO_TEAM.primary_color
  const season = await getStaffSeason(FO_TEAM.id)

  if (season == null) {
    return (
      <FoShell active="/mlb/front-office/pitching" kicker="MLB · Front Office" title={`${FO_TEAM.short} Front Office`}>
        <Card><Empty>The pitching staff has not been computed yet. Run scripts/fo/sync_pitch_staff.py to fill fo_pitch_staff.</Empty></Card>
      </FoShell>
    )
  }

  const win = parseWin(sp.w)
  const side = parseSide(sp.side)
  const seasonStaff = await getStaff(FO_TEAM.id, season, 'season')
  const byIp = [...seasonStaff].sort((a, b) => (b.ip ?? 0) - (a.ip ?? 0))
  const wantP = Number(sp.p)
  const pitcherRow: StaffRow | undefined = byIp.find(r => r.playerId === wantP) ?? byIp[0]
  if (!pitcherRow) {
    return (
      <FoShell active="/mlb/front-office/pitching" kicker="MLB · Front Office" title={`${FO_TEAM.short} Front Office`}>
        <Card><Empty>No pitchers found for {season}. Run scripts/fo/sync_pitch_staff.py.</Empty></Card>
      </FoShell>
    )
  }
  const pid = pitcherRow.playerId
  const wantCmp = Number(sp.cmp)
  const cmpRow = sp.cmp && sp.cmp !== 'lg' ? byIp.find(r => r.playerId === wantCmp && r.playerId !== pid) : undefined

  // Free data only: staff for the window, league context, stabilisation, this pitcher's arsenal, league averages.
  const [staff, ctx, stab, arsenalRows, leagueAvg] = await Promise.all([
    win === 'season' ? Promise.resolve(seasonStaff) : getStaff(FO_TEAM.id, season, win),
    getLeagueContext(season), getStabilisation(), getArsenal(pid, season, win, side), getLeagueAvg(season),
  ])
  const row = staff.find(r => r.playerId === pid) ?? null
  const stats = roleStats(ctx)

  const lines: StaffLine[] = staff.map(r => ({
    id: r.playerId, name: r.name, role: r.role, throws: r.throws, age: r.age, ip: r.ip, bf: r.bf, kbb: r.kbbPct, csw: r.cswPct, whiff: r.whiffPct,
    xera: r.xera, era: r.era, fbd: r.fbVeloDelta, stuff: r.stuffGrade,
  }))
  const scatter: ScatterPt[] = staff.filter(r => r.xera != null && r.era != null && (r.ip ?? 0) >= 20)
    .map(r => ({ id: r.playerId, name: r.name, xera: r.xera!, era: r.era!, ip: r.ip! }))

  const league: LeagueByType = {}
  for (const l of leagueAvg) {
    const st = (k: string) => ({ mean: l[k] as number | null, sd: l[`${k}Sd`] as number | null })
    league[l.pitchType] = {
      n: l.nPitchers,
      stats: { velo: st('velo'), ivb: st('ivb'), hb: st('hb'), spin: st('spin'), activeSpinPct: st('activeSpinPct'), vaa: st('vaa'), extension: st('extension'), whiffPct: st('whiffPct'), xwoba: st('xwoba') },
    }
  }
  const arsenal: ArsenalLine[] = arsenalRows.map(r => ({
    pitchType: r.pitchType, pitches: r.pitches, usage: r.usagePct, velo: r.velo, ivb: r.ivb, hb: r.hb, spin: r.spin, activeSpin: r.activeSpinPct,
    vaa: r.vaa, ext: r.extension, whiff: r.whiffPct, xwoba: r.xwoba, rv: r.rvPer100, stuff: r.stuffGrade,
  }))

  const opts = byIp.map(r => ({ value: String(r.playerId), label: `${r.name} (${r.role ?? '—'})` }))
  const asOf = new Date(pitcherRow.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <FoShell wide active="/mlb/front-office/pitching" kicker="MLB · Front Office" title={`${FO_TEAM.short} Front Office`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <NotebookProvider team={FO_TEAM.slug} pitcher={pitcherRow.name}>
        <div style={{ background: color, color: FO_TEAM.text_on_primary, borderRadius: 14, padding: '18px 22px', margin: '14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <TeamBadge id={FO_TEAM.id} size={60} />
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .8 }}>{season} · {FO_TEAM.league} {FO_TEAM.division} · Pitching department</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, letterSpacing: '-.01em' }}>{FO_TEAM.name}</div>
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, opacity: .8 }}>Snapshot {asOf}</div>
        </div>

        <div className="pd-layout">
          <SectionRail isPro={isPro} />
          <div style={{ minWidth: 0 }}>
            <SectionChips />
            <Controls pitchers={opts} windows={WINDOWS.map(v => ({ value: v, label: WIN_LABEL[v] }))} sides={SIDES.map(v => ({ value: v, label: SIDE_LABEL[v] }))}
              p={String(pid)} w={win} side={side} cmp={cmpRow ? String(cmpRow.playerId) : 'lg'} />

            <PitcherHeader playerId={pid} teamId={FO_TEAM.id} name={pitcherRow.name} row={row} win={win} stab={stab} league={stats[row?.role ?? 'SP'] ?? null} color={color} onText={FO_TEAM.text_on_primary} />

            {/* §00 */}
            <DeskSection id="s0" num="00" title="Staff board" badges={['FREE']} question="Who on this staff is pitching better or worse than his results say?"
              lede="The first pass: process stats that settle fast, set against the ERA everyone sees. Click a pitcher to load him into every tool below.">
              <div className="pd-g75">
                <ChartCard id="staff-board" title={`Pitching staff · ${season}`} subtitle={`${WIN_LABEL[win]}. Sort any column. Shading = vs league average for the role.`} sources={['MLB API', 'SAVANT', 'EDGE CALC']} isPro={isPro}
                  method={<><b>K−BB%</b> strikeouts minus walks per batter faced; settles first. <b>CSW%</b> called strikes plus whiffs per pitch. <b>xERA</b> from Savant expected stats, a season-long figure. <b>FB Δ</b> primary fastball velocity vs last season. Shading is how many standard deviations a cell sits from the league mean for starters or relievers. <b>Stuff Grade</b> is x9Lab&apos;s own model and arrives in a later release.</>}
                  empty={lines.length === 0 ? `No pitchers have appearances in the ${WIN_LABEL[win].toLowerCase()} window.` : undefined}>
                  <StaffBoard rows={lines} stats={stats} selected={pid} />
                  <Foot>x9Lab · MLB Stats API, Baseball Savant. Windows end at the last game in the data ({WIN_LABEL[win]}). xERA and FB Δ are season-level, so xERA shows a dash outside the Season window.</Foot>
                </ChartCard>
                <ChartCard id="process-vs-results" title="Process vs results" subtitle="Above the line: ERA worse than expected. Below: outperforming." sources={['SAVANT']} isPro={isPro}
                  method="x = xERA (what the quality of contact, strikeouts and walks deserved), y = actual ERA. Distance from the diagonal is the part of a pitcher's line driven by defence, sequencing and luck, which tends not to repeat. Pitchers with at least 20 IP in the window."
                  empty={scatter.length < 2 ? 'xERA is a season-long Savant figure. Choose the Season window to see this chart.' : undefined}>
                  <ProcessVsResults points={scatter} selected={pid} color={color} />
                  <Foot>x9Lab · Baseball Savant expected statistics, MLB Stats API.</Foot>
                </ChartCard>
              </div>
            </DeskSection>

            {/* §01 */}
            <DeskSection id="s1" num="01" title="Stuff & shape" badges={['FREE TABLE', 'PRO DRILL-DOWN']} question="Is the raw material good?"
              lede="Every pitch against league average for that pitch type, then the shape behind it.">
              <PitchFocusProvider>
                <ChartCard id="arsenal" title="Arsenal" isPro={isPro} sources={['SAVANT', 'EDGE CALC']}
                  subtitle={`${WIN_LABEL[win]}, ${SIDE_LABEL[side].toLowerCase()}. Every pitch graded against league average for that pitch type. Click a row to focus it in the charts.`}
                  method={<><b>IVB</b> induced vertical break: rise relative to a spinless pitch. <b>HB</b> horizontal break, arm side positive (mirrored for left-handers so both hands compare). <b>Active spin</b> share of spin that creates movement (Savant, season-level). <b>VAA</b> vertical approach angle at the front of the plate. <b>RV/100</b> runs saved per 100 pitches, positive = good for the pitcher. <b>Stuff Grade</b> arrives with x9Lab&apos;s own model.</>}
                  empty={arsenal.length === 0 ? `No pitches for ${pitcherRow.name} in this window and batter-side selection.` : undefined}>
                  <ArsenalTable rows={arsenal} league={league} />
                  <Foot>x9Lab · Baseball Savant pitch-level tracking, {season}. Shading appears where one direction is clearly better (velocity, whiff%, xwOBA) and compares with pitchers who threw 100+ of that pitch.</Foot>
                </ChartCard>
                <div style={{ marginTop: 12 }}>
                  <ProGate isPro={isPro}
                    fallback={<UpgradeCard title="Movement, release point and shape comps in Pro" features={['Movement profile with league-average rings and his arm angle', 'Release point and extension', 'Shape comps: the five closest league pitches and how they performed', 'Compare with any pitcher on the staff']} message="The arsenal table is free. The drill-down behind it is part of Pro." />}
                    render={() => <StuffProBlock pid={pid} name={pitcherRow.name} season={season} win={win} side={side} cmp={cmpRow ? { id: cmpRow.playerId, name: cmpRow.name } : null} isPro={isPro} />} />
                </div>
              </PitchFocusProvider>
            </DeskSection>

            {/* §02 */}
            <DeskSection id="s2" num="02" title="Execution & results" badges={['PRO']} question="Is he getting what his stuff deserves, and does he control it?"
              lede="ERA against its estimators, luck indicators, location, discipline and sequencing.">
              <ProGate isPro={isPro}
                fallback={<UpgradeCard title="Execution and results in Pro" features={['ERA, FIP, xFIP, SIERA and xERA on one ladder', 'Luck check with sample-size meters', 'Location by pitch, command and discipline', 'Pitch mix by count and rolling form']} />}
                render={() => <ExecutionProBlock isPro={isPro} />} />
            </DeskSection>

            {/* §03 */}
            <DeskSection id="s3" num="03" title="Durability & trajectory" badges={['PRO']} question="Will it hold up inside an outing, across a season and over a contract?"
              lede="Velocity, workload and arm slot are the public early-warning signals teams watch. These are trends in public tracking data, not medical assessments.">
              <ProGate isPro={isPro}
                fallback={<UpgradeCard title="Durability and trajectory in Pro" features={['Velocity by appearance with injured-list shading and a velocity flag', 'Times through the order and velocity within an outing', 'Workload and rest', 'Arm angle and release height trend']} />}
                render={() => <DurabilityProBlock pid={pid} name={pitcherRow.name} season={season} isPro={isPro} />} />
            </DeskSection>

            {/* §04 */}
            <DeskSection id="s4" num="04" title="Coming next" badges={['COMING']} lede="The next tools on the Pitching Desk, in build order.">
              <div className="pd-bench">
                {BENCH.map(([tag, title, text]) => (
                  <div key={title} style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, padding: 16 }}>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>{tag}</div>
                    <h4 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, margin: '4px 0 6px' }}>{title}</h4>
                    <p style={{ fontFamily: SANS, fontSize: 12.5, color: '#5b5347', margin: 0, lineHeight: 1.45 }}>{text}</p>
                  </div>
                ))}
              </div>
            </DeskSection>

            <p style={{ marginTop: 28, marginBottom: 56, fontFamily: SANS, fontSize: 13, color: '#5b5347' }}>
              Back to the club overview? <Link href="/mlb/front-office" style={{ color: C.orange, fontWeight: 700 }}>Front Office →</Link>
            </p>
          </div>
        </div>
        <NotebookTray isPro={isPro} />
      </NotebookProvider>
    </FoShell>
  )
}
