// Server-side Pro blocks for the Pitching Desk. Each is rendered ONLY inside <ProGate render={...}> on the page, so a
// free viewer never constructs these components and their data is never fetched (DESIGN_SYSTEM §5). Every
// not-yet-built card is a ChartCard shell whose empty state names the data or job it is waiting for.

import { Foot } from '@/components/team/ui'
import {
  getArsenal, getGameLog, getIlStints, getLeagueAvg, getPoints, type ArsenalRow, type Side, type Win,
} from '@/lib/front-office/pitching'
import ChartCard from './ChartCard'
import MovementPlot, { type MoveMean } from './MovementPlot'
import VeloByAppearance from './VeloByAppearance'
import { pitchName } from './format'

const FASTBALLS = ['FF', 'SI', 'FC']
const grid: React.CSSProperties = { display: 'grid', gap: 12, marginTop: 12 }

/** §01 Pro: Movement profile (live) + Release point and Shape comps (shells). */
export async function StuffProBlock({ pid, name, season, win, cmp, isPro }: {
  pid: number; name: string; season: number; win: Win; side: Side; cmp: { id: number; name: string } | null; isPro: boolean
}) {
  // Points have no batter-side split (one seeded sample per pitch type), so the plot always reads side 'all'.
  const [sets, arsenal, league, cmpRows] = await Promise.all([
    getPoints(pid, season, win), getArsenal(pid, season, win, 'all'), getLeagueAvg(season),
    cmp ? getArsenal(cmp.id, season, win, 'all') : Promise.resolve([] as ArsenalRow[]),
  ])
  const shown = arsenal.filter(r => r.pitches >= 10 && r.hb != null && r.ivb != null)
  const types = new Set(shown.map(r => r.pitchType))
  const means: MoveMean[] = shown.map(r => ({ pitchType: r.pitchType, hb: r.hb!, ivb: r.ivb!, pitches: r.pitches, velo: r.velo }))
  const leagueMeans: MoveMean[] = league.filter(l => types.has(l.pitchType) && l.hb != null && l.ivb != null).map(l => ({ pitchType: l.pitchType, hb: l.hb as number, ivb: l.ivb as number }))
  const withArm = arsenal.filter(r => r.armAngle != null)
  const wsum = withArm.reduce((a, r) => a + r.pitches, 0)
  const armAngle = wsum > 0 ? withArm.reduce((a, r) => a + r.armAngle! * r.pitches, 0) / wsum : null
  const compare = cmp ? { name: cmp.name, means: cmpRows.filter(r => r.pitches >= 10 && r.hb != null && r.ivb != null).map(r => ({ pitchType: r.pitchType, hb: r.hb!, ivb: r.ivb! })) } : null

  return (
    <div style={grid}>
      <ChartCard id="movement" title="Movement profile" pro isPro={isPro}
        subtitle="Each dot is a pitch. Solid dots are his averages, dashed rings the league average for that type, the dashed line his arm angle."
        sources={['SAVANT', 'EDGE CALC']}
        method={<><b>HB</b> is horizontal break, arm side positive (mirrored for left-handers so both hands compare). <b>IVB</b> is induced vertical break: rise relative to a spinless pitch. Up to 150 pitches per type, a seeded sample. This plot does not split by batter side. Click a pitch in the arsenal table to focus it.</>}
        empty={sets.length === 0 || means.length === 0 ? `No movement points for ${name} in this window yet. They come from the arsenal job (scripts/fo/sync_pitch_arsenal.py).` : undefined}>
        <MovementPlot sets={sets.filter(s => types.has(s.pitchType)).map(s => ({ pitchType: s.pitchType, points: s.points }))} means={means} league={leagueMeans} armAngle={armAngle} compare={compare} />
        <Foot>x9Lab · Baseball Savant pitch-level tracking, {season}. Pitch types with fewer than 10 pitches in the window are left out. {leagueMeans.length ? 'League rings are the pitch-weighted average for pitchers with 100+ pitches of that type.' : ''}</Foot>
      </ChartCard>
      <div className="pd-g2">
        <ChartCard id="release" title="Release point" pro isPro={isPro} subtitle="Tight, overlapping release points hide which pitch is coming."
          empty="Release scatter and extension are computed (rel_x, rel_z, extension) but the chart is not built yet. It is the next card in this section." />
        <ChartCard id="shape-comps" title="Shape comps" pro isPro={isPro} subtitle="The five league pitches closest in shape to his, and how they performed."
          empty="Shape comps arrive with the comps job (scripts/fo/sync_pitch_comps.py, weekly). fo_pitch_comps is empty until then." />
      </div>
    </div>
  )
}

/** §02 Pro: all six cards are shells today. */
export function ExecutionProBlock({ isPro }: { isPro: boolean }) {
  const cards: [string, string, string, string][] = [
    ['era-estimators', 'ERA vs estimators', 'Five ways to say what his ERA should be.', 'The ERA, FIP, xFIP, SIERA and xERA values are already computed (fo_pitch_staff). The ladder chart is not built yet.'],
    ['luck-check', 'Luck check', 'Stats that drift toward league average, with a meter for whether the sample means anything yet.', 'BABIP, LOB%, HR/FB and GB% are computed. The chart and its meters are not built yet.'],
    ['location', 'Location by pitch', "Catcher's view. Box = strike zone, outer ring = shadow and chase areas.", 'Location grid arrives with the execution data job (scripts/fo/sync_pitch_execution.py). fo_pitch_location is empty until then.'],
    ['discipline', 'Command & discipline', 'Bars run from league average.', 'Zone, chase, contact and first-pitch strike rates arrive with the execution data job. fo_pitch_discipline is empty until then.'],
    ['count-mix', 'Pitch mix by count', 'How he sequences: what he trusts when ahead, behind, and with two strikes.', 'Count mix arrives with the execution data job. fo_pitch_count_mix is empty until then.'],
    ['rolling-form', 'Rolling form', 'Is the process improving or slipping? Markers show when the sample became meaningful.', 'Per-appearance K−BB% and CSW% are computed (fo_pitch_game_log). The rolling chart is not built yet.'],
  ]
  return (
    <div className="pd-g2" style={grid}>
      {cards.map(([id, title, subtitle, empty]) => <ChartCard key={id} id={id} title={title} subtitle={subtitle} empty={empty} pro isPro={isPro} />)}
    </div>
  )
}

/** §03 Pro: Velocity by appearance (live) + four shells. */
export async function DurabilityProBlock({ pid, name, season, isPro }: { pid: number; name: string; season: number; isPro: boolean }) {
  const [log, stints] = await Promise.all([getGameLog(pid, season), getIlStints(pid, season)])
  const count: Record<string, number> = {}
  for (const g of log) for (const t of Object.keys(g.veloByType)) count[t] = (count[t] ?? 0) + 1
  const types = Object.keys(count).filter(t => count[t] >= 5).sort((a, b) => count[b] - count[a])
  const primary = FASTBALLS.filter(t => types.includes(t)).sort((a, b) => count[b] - count[a])[0] ?? null

  return (
    <div style={grid}>
      <ChartCard id="velo-by-appearance" title="Velocity by appearance" pro isPro={isPro}
        subtitle="Average velocity per pitch type, every outing. Shaded = injured list."
        sources={['SAVANT', 'MLB API']}
        method={<>Mean release speed per pitch type in each appearance, from public Statcast tracking. Shaded bands are injured-list stints parsed from MLB transaction text. The flag appears when his primary fastball ({primary ? pitchName(primary).toLowerCase() : 'n/a'}) averages at least 1.0 mph below its season mean over his last three appearances. Public tracking trends only, not a medical assessment.</>}
        empty={log.length === 0 || types.length === 0 ? `No appearance log for ${name} yet. It comes from scripts/fo/sync_pitch_game_log.py.` : undefined}>
        <VeloByAppearance games={log.map(g => ({ date: g.date, velo: g.veloByType, pitches: g.pitches, daysRest: g.daysRest, bf: g.bf, k: g.k, bb: g.bb, csw: g.csw }))} stints={stints.map(s => ({ start: s.start, end: s.end, ilType: s.ilType, description: s.description }))} types={types} primary={primary} />
        <Foot>x9Lab · Baseball Savant, MLB Stats API transactions. Pitch types with fewer than 5 appearances are left out. A stint with no activation on file is shaded to the last appearance. Public tracking trends only, not a medical assessment.</Foot>
      </ChartCard>
      <div className="pd-g2">
        <ChartCard id="tto" title="Times through order" pro isPro={isPro} subtitle="xwOBA allowed, 1st/2nd/3rd look."
          empty="Times-through-order arrives with scripts/fo/sync_pitch_tto_decay.py. fo_pitch_tto is empty until then." />
        <ChartCard id="velo-within-start" title="Within an outing" pro isPro={isPro} subtitle="Fastball velocity by pitch count."
          empty="Velocity by pitch count arrives with scripts/fo/sync_pitch_tto_decay.py. fo_pitch_velo_decay is empty until then." />
        <ChartCard id="workload" title="Workload" pro isPro={isPro} subtitle="Pitches per outing, coloured by rest."
          empty="Pitches and days of rest per outing are computed (fo_pitch_game_log). The chart is not built yet." />
        <ChartCard id="arm-angle-trend" title="Arm angle & release height trend" pro isPro={isPro} subtitle="Mechanical drift often shows up here before it shows up in results."
          empty="Per-outing arm angle and release height are computed (fo_pitch_game_log). The trend chart is not built yet." />
      </div>
    </div>
  )
}
