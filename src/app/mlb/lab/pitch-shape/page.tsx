// src/app/mlb/lab/pitch-shape/page.tsx
//
// Pitch Shape Lab, rebuilt from the ground up (2026-11-11, George). Step 1: the league shape heat maps, on a wide page with the views and a plain-language "What is pitch shape?" in a right-hand column.
//   view=one (default)  one large heat map for a pitch type, hand and level (LeagueHeatMap), with speed and arm-angle filters and click-a-spot pitcher groups
//   view=all            every pitch type's map side by side (MiniHeat), all on the one colour scale
//   view=compare        one pitch type across every level side by side (MiniHeat), all drawn on the MLB window so a difference in shape shows
//   pitcher=<id>        one pitcher's shape: the one-pitch view with his sampled pitches, average and spread drawn on the map, a player card under it, and the page moved to him (PitcherSearch finds him)
// Hand is right, left or both (hand=R|L|B): both is sound because every table stores run arm-side positive, so the two hands add cell by cell (bothHands.ts).
// Filters are dropdowns (ShapeControls) that reload this page with ?level=&type=&hand=&view=. Everything else that used to sit on this page (PitchFinderV2 and the rest of src/components/pitch-shape/)
// is untouched on disk and gets added back one piece at a time.
//
// Cells are read here on the server. Pro rule, unchanged: four-seam and sweeper are free, every other pitch type is Pro. A locked type is never read, so no number for it reaches a viewer who is not
// entitled to it (the interactive parts enforce the same rule in actions.ts). isProViewer() is the real session. Still noindex while it is being rebuilt.

import Link from 'next/link'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import LeagueHeatMap from '@/components/pitch-shape/LeagueHeatMap'
import MiniHeat from '@/components/pitch-shape/MiniHeat'
import HeatLegend from '@/components/pitch-shape/HeatLegend'
import ShapeControls from '@/components/pitch-shape/ShapeControls'
import ShapeIntro from '@/components/pitch-shape/ShapeIntro'
import PitcherHero from '@/components/pitch-shape/PitcherHero'
import LeagueHero from '@/components/pitch-shape/LeagueHero'
import PitcherSearch from '@/components/pitch-shape/PitcherSearch'
import { handWord, type ViewHand } from '@/components/pitch-shape/bothHands'
import { LockedCard } from '@/components/pitch-shape/parts'
import { C, Empty, Foot } from '@/components/team/ui'
import { isProViewer } from '@/lib/require-pro'
import { getAvailablePitchTypes, getPitcherPoints, getPitcherRepertoire } from '@/lib/pitch-shape/data'
import { getBinsFor, getCellsFor, seasonFor } from '@/lib/pitch-shape/cells-for'
import { coarseHeat, type CoarseHeat } from '@/lib/pitch-shape/coarse-heat'
import { summaryOf } from '@/lib/pitch-shape/filtered-heat'
import { FREE_SANDBOX_TYPES, PITCH_NAMES } from '@/lib/pitch-shape/model'
import { LEVELS, LEVEL_LABEL, parseLevel, type Level } from '@/lib/milb-shape/levels'
import { pageMeta, noindex } from '@/lib/seo'

export const metadata: Metadata = { ...pageMeta({ title: 'Pitch Shape Lab', description: 'League movement maps by pitch type: where pitches move and how often hitters miss them.', path: '/mlb/lab/pitch-shape' }), ...noindex() }
export const dynamic = 'force-dynamic'

const FREE = FREE_SANDBOX_TYPES as readonly string[]
type View = 'one' | 'all' | 'compare'
type SP = { type?: string; hand?: string; level?: string; view?: string; pitcher?: string; ui?: string }

export default async function PitchShapePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const isPro = await isProViewer()
  const level: Level = parseLevel(sp.level)
  const ui: 'v2' | 'v3' = sp.ui === 'v2' ? 'v2' : 'v3'   // v3 is the story-tabs layout; ?ui=v2 shows the original single-scroll page so the two can be compared
  const season = new Date().getFullYear()

  // A chosen pitcher: his repertoire at this level (only the pitch types the viewer may see). He fixes the hand and the view; the pitch defaults to the one he throws most.
  const pitcherId = Number.isInteger(Number(sp.pitcher)) && Number(sp.pitcher) > 0 ? Number(sp.pitcher) : null
  const rep = pitcherId ? await getPitcherRepertoire(pitcherId, await seasonFor(level), isPro, level) : null
  const hand: ViewHand = rep ? rep.hand : sp.hand === 'L' ? 'L' : sp.hand === 'B' ? 'B' : 'R'
  const view: View = rep ? 'one' : sp.view === 'all' ? 'all' : sp.view === 'compare' ? 'compare' : 'one'

  // The pitch types on offer: those with data at the chosen level. In the compare view every level is read, so the types offered are the MLB ones.
  const types = await getAvailablePitchTypes(view === 'compare' ? 'mlb' : level, season)
  const repTypes = rep ? rep.rows.map(r => r.pitchType) : []
  const type = rep && repTypes.length > 0 ? (repTypes.includes(sp.type ?? '') ? (sp.type as string) : repTypes[0]) : types.includes(sp.type ?? '') ? (sp.type as string) : types[0]
  const lockedType = (t: string) => !isPro && !FREE.includes(t)
  const handText = handWord(hand)

  // One pitch: only the chosen type is read, and only if the viewer may see it.
  const payload = view === 'one' && type && !lockedType(type) ? await getCellsFor(type, hand, level) : null
  const summary = payload && type ? summaryOf(await getBinsFor(type, hand, level)) : null
  const repRow = rep && type ? rep.rows.find(r => r.pitchType === type) ?? null : null
  const focus = rep && repRow && type && payload
    ? { id: rep.pitcherId, name: rep.name, team: rep.teamAbbr, hand: rep.hand, season: rep.season, type, row: { velo: repRow.velo, ivb: repRow.ivb, hb: repRow.hb, slot: repRow.slot, nPitches: repRow.nPitches, nSwings: repRow.nSwings, nWhiffs: repRow.nWhiffs },
        points: await getPitcherPoints(type, rep.hand, rep.season, rep.pitcherId, level),
        repertoire: rep.rows.map(r => ({ code: r.pitchType, name: PITCH_NAMES[r.pitchType] ?? r.pitchType, n: r.nPitches, href: `/mlb/lab/pitch-shape?pitcher=${rep.pitcherId}&type=${r.pitchType}${level !== 'mlb' ? `&level=${level}` : ''}` })), lockedTypes: rep.lockedTypes }
    : null

  // All pitches: every unlocked type is read and shrunk to a small map.
  const minis = view === 'all'
    ? await Promise.all(types.map(async t => (lockedType(t) ? { t, locked: true as const, heat: null } : { t, locked: false as const, heat: await getCellsFor(t, hand, level).then(p => (p ? coarseHeat(p) : null)) })))
    : []

  // Compare levels: the same pitch type at each level, every map drawn on the MLB window so a difference in shape shows as a difference in where the colour sits.
  type Tile = { level: Level; heat: CoarseHeat | null }
  let tiles: Tile[] = []
  if (view === 'compare' && type && !lockedType(type)) {
    const base = await getCellsFor(type, hand, 'mlb')
    const centre = base ? { hb: base.hb0, ivb: base.ivb0 } : undefined
    const have = await Promise.all(LEVELS.map(async l => ({ l, ok: l === 'mlb' || (await getAvailablePitchTypes(l, season)).includes(type) })))
    tiles = await Promise.all(have.filter(h => h.ok).map(async ({ l }) => ({ level: l, heat: await (l === 'mlb' ? Promise.resolve(base) : getCellsFor(type, hand, l, centre)).then(p => (p ? coarseHeat(p) : null)) })))
  }
  // the league banner (v3, one pitch) carries the search and the filters in its right-hand column, so they are not drawn a second time above it
  const heroOn = !rep && ui === 'v3' && view === 'one' && !!type && !!payload && !lockedType(type ?? '')
  // v3 league views: the search, the filters and "How to use" run down a column on the right beside everything else
  const sidebar = ui === 'v3' && !rep
  const mlbTile = tiles.find(t => t.level === 'mlb')?.heat ?? null

  const href = (o: Partial<SP>) => {
    const q = new URLSearchParams()
    const v = { type, hand, level, view, ui, pitcher: rep ? String(rep.pitcherId) : undefined, ...o }
    if (v.pitcher) q.set('pitcher', v.pitcher)
    if (v.level && v.level !== 'mlb') q.set('level', v.level)
    if (v.view && v.view !== 'one') q.set('view', v.view)
    if (v.type) q.set('type', v.type)
    if (v.hand && v.hand !== 'R') q.set('hand', v.hand)
    if (v.ui === 'v2') q.set('ui', 'v2')
    const s = q.toString()
    return `/mlb/lab/pitch-shape${s ? `?${s}` : ''}`
  }
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 12 }
  const diff = (x: number, base: number) => `${x - base >= 0 ? '+' : '−'}${Math.abs(x - base).toFixed(1)} in`

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <style>{`.psl-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}.psl-shell{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:28px;align-items:start}.psl-side{position:sticky;top:16px}@media(max-width:1100px){.psl-shell{grid-template-columns:minmax(0,1fr)}.psl-side{position:static}}`}</style>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1800, margin: '0 auto', padding: '22px 32px 80px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 22px', margin: '0 0 14px' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em' }}>Pitch shape maps</h1>
          <Link href="/mlb/lab/pitch-shape/guide" style={{ color: C.orange, fontWeight: 800, fontSize: 14 }}>How to read this page →</Link>
          <Link href="/mlb/lab/pitch-shape/how-shape-is-built" style={{ color: C.orange, fontWeight: 800, fontSize: 14 }}>How shape is built →</Link>
        </div>
        <div className={sidebar ? 'psl-shell' : undefined}>
          <div style={{ minWidth: 0 }}>
            {!sidebar && <ShapeIntro pitcherChosen={!!rep} />}
            {!sidebar && <PitcherSearch level={level} levelName={LEVEL_LABEL[level]} current={rep ? `${rep.name} (${rep.teamAbbr})` : null} />}
            {pitcherId && !rep && <Empty>No pitch shape data for that pitcher at {LEVEL_LABEL[level]} {season}. <Link href={href({ pitcher: undefined })} style={{ color: C.orange, fontWeight: 800 }}>Back to the league map</Link>. Nothing is estimated in its place.</Empty>}
            {rep && repRow && type && (
              <PitcherHero id={rep.pitcherId} name={rep.name} teamAbbr={rep.teamAbbr} hand={rep.hand} level={level} season={rep.season} pitchName={PITCH_NAMES[type] ?? type} backHref={href({ pitcher: undefined, type: undefined })}
                stats={[
                  { label: `${PITCH_NAMES[type] ?? type} thrown`, value: repRow.nPitches.toLocaleString('en-US'), sub: `${rep.season}` },
                  { label: 'Speed', value: `${repRow.velo.toFixed(1)} mph`, sub: `${Math.round(repRow.slot)}° arm angle` },
                  { label: 'Ride / run', value: `${repRow.ivb.toFixed(1)} / ${Math.abs(repRow.hb).toFixed(1)}`, sub: `in, ${repRow.hb >= 0 ? 'arm' : 'glove'} side` },
                  { label: 'Whiffs per swing', value: repRow.nSwings >= 50 ? `${((100 * repRow.nWhiffs) / repRow.nSwings).toFixed(1)}%` : '—', sub: repRow.nSwings >= 50 ? `${repRow.nSwings.toLocaleString('en-US')} swings` : 'under 50 swings' },
                  { label: 'Pitch types', value: String(rep.rows.length), sub: rep.lockedTypes > 0 ? `+${rep.lockedTypes} in Pro` : undefined },
                ]} />
            )}
            {heroOn && type && payload && (() => {
              const season0 = payload.seasons[payload.seasons.length - 1]
              const lg = season0?.league
              return (
                <LeagueHero flight={summary ? { type, hb: summary.centre.hb, ivb: summary.centre.ivb, mph: (summary.q25 + summary.q75) / 2, hand: hand === 'L' ? 'L' : 'R' } : null} pitchName={PITCH_NAMES[type] ?? type} handText={handText} levelName={LEVEL_LABEL[level]} seasonLabel={payload.pooledLabel ?? String(payload.latest)}
                  stats={[
                    { label: 'Pitches', value: lg ? lg.pitches.toLocaleString('en-US') : '—', sub: `${LEVEL_LABEL[level]}, ${payload.pooledLabel ?? payload.latest}` },
                    { label: 'Swings', value: lg ? lg.swings.toLocaleString('en-US') : '—', sub: 'at this pitch' },
                    { label: 'Whiffs per swing', value: lg && lg.swings > 0 ? `${((100 * lg.whiffs) / lg.swings).toFixed(1)}%` : '—', sub: 'league average' },
                    ...(summary ? [{ label: 'Typical speed', value: `${summary.q25.toFixed(0)}–${summary.q75.toFixed(0)} mph`, sub: 'middle half of pitches' }, { label: 'Average shape', value: `${summary.centre.ivb.toFixed(1)} / ${Math.abs(summary.centre.hb).toFixed(1)}`, sub: `in ride / run, ${summary.centre.hb >= 0 ? 'arm' : 'glove'} side` }] : []),
                  ]} />
              )
            })()}
            {!sidebar && <ShapeControls level={level} type={type ?? null} hand={hand} view={view} pitcher={rep ? rep.pitcherId : null}
              levels={LEVELS.map(l => ({ value: l, label: LEVEL_LABEL[l] }))} levelName={LEVEL_LABEL[level]} handName={`${handText} pitchers`}
              repertoire={focus ? focus.repertoire : rep ? rep.rows.map(r => ({ code: r.pitchType, name: PITCH_NAMES[r.pitchType] ?? r.pitchType, n: r.nPitches, href: `/mlb/lab/pitch-shape?pitcher=${rep.pitcherId}&type=${r.pitchType}${level !== 'mlb' ? `&level=${level}` : ''}` })) : []} lockedTypes={rep ? rep.lockedTypes : 0}
              types={types.map(t => ({ code: t, name: PITCH_NAMES[t] ?? t, locked: lockedType(t) }))} />}

            {types.length === 0 || !type ? (
              <Empty>No league shape data for {LEVEL_LABEL[view === 'compare' ? 'mlb' : level]} yet. Nothing is estimated in its place.</Empty>
            ) : view === 'one' ? (
              lockedType(type) ? (
                <div style={{ maxWidth: 520 }}><LockedCard title={`${PITCH_NAMES[type] ?? type} map`} /></div>
              ) : (
                <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '16px 18px 14px' }}>
                  <b style={{ display: 'block', fontSize: 17, marginBottom: 12 }}>{rep ? `${rep.name}: ` : ''}{PITCH_NAMES[type] ?? type}, {handText} pitchers · {LEVEL_LABEL[level]}</b>
                  <LeagueHeatMap key={`${ui}|${level}|${type}|${hand}|${rep?.pitcherId ?? ''}`} payload={payload} summary={summary} focus={focus} type={type} pitchName={PITCH_NAMES[type] ?? type} hand={hand} level={level} levelName={LEVEL_LABEL[level]} ui={ui} />
                </section>
              )
            ) : view === 'all' ? (
              <section>
                <div style={{ ...card, padding: '14px 18px', marginBottom: 14 }}><HeatLegend /></div>
                <div className="psl-tiles">
                  {minis.map(m => (
                    <div key={m.t} style={card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <b style={{ fontSize: 15 }}>{PITCH_NAMES[m.t] ?? m.t}</b>
                        {!m.locked && m.heat ? <Link href={href({ view: 'one', type: m.t })} style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>Open →</Link> : null}
                      </div>
                      {m.locked ? <LockedCard title="Pro pitch type" />
                        : m.heat ? <>
                          <MiniHeat heat={m.heat} label={`${PITCH_NAMES[m.t] ?? m.t} league movement map at ${LEVEL_LABEL[level]}, coloured by how often hitters swing and miss`} />
                          <div style={{ fontSize: 12, color: C.mute, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{m.heat.swings > 0 ? `${((100 * m.heat.whiffs) / m.heat.swings).toFixed(1)}% of swings miss` : 'no swings'} · n {m.heat.swings.toLocaleString('en-US')} swings</div>
                        </> : <div style={{ fontSize: 12.5, color: C.mute }}>Not enough {handText} data at {LEVEL_LABEL[level]} yet. Nothing is estimated in its place.</div>}
                    </div>
                  ))}
                </div>
                <Foot>Every map is the league average shape for {handText} pitchers at {LEVEL_LABEL[level]} ({level === 'mlb' ? 'latest season' : season}), sampled every half inch from the pitches within ±1 inch, ride up, glove-side movement to the left and arm-side movement to the right, on one colour scale. Boxes with under 40 swings nearby are blank. Source: Baseball Savant pitch data{level === 'mlb' ? '' : ', minor-league tracking'}. Describes what happened; it is not a forecast.</Foot>
              </section>
            ) : lockedType(type) ? (
              <div style={{ maxWidth: 520 }}><LockedCard title={`${PITCH_NAMES[type] ?? type} across levels`} /></div>
            ) : (
              <section>
                <div style={{ ...card, padding: '14px 18px', marginBottom: 14 }}>
                  <b style={{ display: 'block', fontSize: 17, marginBottom: 4 }}>{PITCH_NAMES[type] ?? type}, {handText} pitchers, across levels</b>
                  <div style={{ fontSize: 13, color: '#5b5347', lineHeight: 1.5, marginBottom: 12 }}>Every map is drawn on the same window, centred on the MLB average shape (the white cross), so where the colour sits is a real difference between levels. The yellow dot marks each level&apos;s own average shape.</div>
                  <HeatLegend />
                </div>
                <div className="psl-tiles">
                  {tiles.map(t => (
                    <div key={t.level} style={card}>
                      <b style={{ display: 'block', fontSize: 15, marginBottom: 8 }}>{LEVEL_LABEL[t.level]}</b>
                      {t.heat ? <>
                        <MiniHeat heat={t.heat} label={`${PITCH_NAMES[type] ?? type} league movement map at ${LEVEL_LABEL[t.level]}, coloured by how often hitters swing and miss`}
                          marks={[...(mlbTile ? [{ hb: mlbTile.meanHb, ivb: mlbTile.meanIvb, color: '#ffffff', ring: true }] : []), { hb: t.heat.meanHb, ivb: t.heat.meanIvb, color: '#FDE047' }]} />
                        <div style={{ fontSize: 12, color: C.mute, marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>
                          {t.heat.swings > 0 ? `${((100 * t.heat.whiffs) / t.heat.swings).toFixed(1)}% of swings miss` : 'no swings'} · n {t.heat.swings.toLocaleString('en-US')} swings<br />
                          Average shape: ride {t.heat.meanIvb.toFixed(1)} in, run {t.heat.meanHb.toFixed(1)} in
                          {t.level !== 'mlb' && mlbTile ? <><br />Against MLB: ride {diff(t.heat.meanIvb, mlbTile.meanIvb)}, run {diff(t.heat.meanHb, mlbTile.meanHb)}</> : null}
                        </div>
                      </> : <div style={{ fontSize: 12.5, color: C.mute }}>Not enough {handText} data at {LEVEL_LABEL[t.level]} yet. Nothing is estimated in its place.</div>}
                    </div>
                  ))}
                </div>
                <Foot>Each level is its own league: a map is only ever built from that level&apos;s pitches and is never mixed with another. MLB is the latest season; minor-league levels are this season. Maps are sampled every half inch from the pitches within ±1 inch, ride up, glove-side movement to the left and arm-side movement to the right, on one colour scale; boxes with under 40 swings nearby are blank. Averages are over the pitches inside the window. Source: Baseball Savant pitch data, minor-league tracking for the minor levels. Double-A, High-A and Rookie ball have no pitch tracking. Describes what happened; it is not a forecast.</Foot>
              </section>
            )}
          </div>
          {sidebar && (
            <aside className="psl-side" aria-label="Filters and how to use" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 16px', display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>Filters</div>
                <PitcherSearch level={level} levelName={LEVEL_LABEL[level]} current={null} />
                <ShapeControls variant="column" level={level} type={type ?? null} hand={hand} view={view} pitcher={null} levels={LEVELS.map(l => ({ value: l, label: LEVEL_LABEL[l] }))} levelName={LEVEL_LABEL[level]} handName={`${handText} pitchers`} types={types.map(t => ({ code: t, name: PITCH_NAMES[t] ?? t, locked: lockedType(t) }))} />
              </div>
              <ShapeIntro pitcherChosen={false} side />
            </aside>
          )}
        </div>
      </div>
    </main>
  )
}
