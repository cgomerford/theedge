'use client'

// src/components/pitch-shape/MilbPitcherCard.tsx
//
// What the Lab shows for a Triple-A or Florida State League pitcher in place of the MLB pitcher read (which needs MLB-only data: the Shape Score board, run values, the
// season line and ESPN ownership). Level-only facts, each with its denominator: his average shape, how often hitters at THIS level missed his pitch, and the sample.
// Below it, "Closest MLB shape": the major-league pitchers whose average pitch is nearest on physical shape alone. No MLB result is attached to him.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'
import { GATE, PITCH_NAMES } from '@/lib/pitch-shape/model'
import type { Repertoire } from '@/lib/pitch-shape/data'
import type { Diag } from '@/lib/pitch-shape/diagnostics'
import type { Closest } from '@/lib/milb-shape/closest'
import type { MlbLite } from '@/lib/pitch-shape/results'
import { Headshot, TeamBadge } from '@/components/front-office/pitching/Avatar'
import { teamOf } from '@/lib/milb-shape/teams'
import { translate } from '@/lib/milb-shape/translate'
import TranslationBanner from './TranslationBanner'
import PitcherShapeLevels from './PitcherShapeLevels'
import type { BoardRow } from '@/lib/pitch-shape/results'
import { LEVEL_LABEL, LEVEL_SHORT, type Level } from '@/lib/milb-shape/levels'
import { log } from '@/lib/log'

const ORANGE_TEXT = '#B83A0E'
type Rate = { whiff: number | null; xwobaCon: number | null; swings: number; bbe: number; pitches: number }
type ClosestResp = {
  closest: (Closest & { mlb: MlbLite | null })[]; season: number
  /** MLB pitches that move like his (any speed): results on the MLB scale */
  movement: MlbLite | null
  mlbAvgWhiff?: number | null
  /** the same movement at his speed against every speed, and the typical speed for it */
  speed: { typicalVelo: number | null; veloDiff: number | null; all: Rate; atSpeed: Rate; whiffEffect: number | null; contactEffect: number | null } | null
}
const cache = new Map<string, ClosestResp | null>()

export type MilbPitcher = { pitcherId: number; name: string; teamAbbr: string; nPitches: number; velo: number; ivb: number; hb: number; slot: number; nSwings: number; nWhiffs: number; diag?: Diag }
type LevelRep = { level: Level; season: number | null; repertoire: Repertoire | null }
const levelsCache = new Map<number, LevelRep[] | null>()

/** Every pitch he has thrown at every level (one request per pitcher, cached). undefined while loading. */
function useLevels(id: number): LevelRep[] | null | undefined {
  const [got, setGot] = useState<{ id: number; v: LevelRep[] | null } | null>(null)
  useEffect(() => {
    if (levelsCache.has(id)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-levels?id=${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { levels: LevelRep[] }) => { levelsCache.set(id, j.levels); if (live) setGot({ id, v: j.levels }) })
      .catch(e => { log.error('MilbPitcherCard', 'levels fetch failed', e instanceof Error ? e.message : e); levelsCache.set(id, null); if (live) setGot({ id, v: null }) })
    return () => { live = false }
  }, [id])
  if (levelsCache.has(id)) return levelsCache.get(id)
  return got?.id === id ? got.v : undefined
}

const pc = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const w3 = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))
const sg = (x: number, d = 1) => { const r = Number(x.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function useClosest(p: MilbPitcher, type: string, hand: string, armAngle: boolean) {
  const key = `${p.pitcherId}|${type}|${hand}|${armAngle}`
  const [got, setGot] = useState<{ key: string; v: ClosestResp | null } | null>(null)
  useEffect(() => {
    if (cache.has(key)) return
    let live = true
    const slot = armAngle ? p.slot : 45   // with no arm angle at this level, compare on the other three axes by holding arm angle at a typical value for both sides
    fetch(`/api/mlb/pitch-shape/closest-mlb?type=${type}&hand=${hand}&velo=${p.velo.toFixed(1)}&ivb=${p.ivb.toFixed(1)}&hb=${p.hb.toFixed(1)}&slot=${slot.toFixed(0)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ClosestResp) => { cache.set(key, j); if (live) setGot({ key, v: j }) })
      .catch(e => { log.error('MilbPitcherCard', 'closest fetch failed', e instanceof Error ? e.message : e); cache.set(key, null); if (live) setGot({ key, v: null }) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (cache.has(key)) return cache.get(key)
  return got?.key === key ? got.v : undefined
}

export default function MilbPitcherCard({ p, level, season, type, hand, pitchName, armAngle, leagueDiag, row, levelAvgWhiff, chips, onClear }: {
  p: MilbPitcher; level: Level; season: number | null; type: string; hand: 'R' | 'L'; pitchName: string; armAngle: boolean; leagueDiag?: Diag | null
  /** his row on this level's board (his shape's results at the level), and the level's average whiffs per swing, for the does-it-carry-to-MLB flag */
  row?: BoardRow | null; levelAvgWhiff?: number | null; chips?: string[]; onClear: () => void
}) {
  const closest = useClosest(p, type, hand, armAngle)
  const club = teamOf(level, p.teamAbbr)
  // the same flag the list shows, now with his speed against MLB pitches that move like his
  const carry = row && closest ? translate({
    levelLabel: LEVEL_LABEL[level], level: { saved: row.shape.saved, whiff: row.shape.whiff, pitches: row.shape.pitches }, levelAvgWhiff: levelAvgWhiff ?? null,
    mlb: closest.movement ? { saved: closest.movement.saved, whiff: closest.movement.whiff, pitches: closest.movement.pitches } : null, mlbAvgWhiff: closest.mlbAvgWhiff ?? null,
    speed: closest.speed ? { veloDiff: closest.speed.veloDiff, atSpeedWhiff: closest.speed.atSpeed.whiff, allWhiff: closest.speed.all.whiff, swings: closest.speed.atSpeed.swings } : null,
  }) : row?.translation ?? null
  const levels = useLevels(p.pitcherId)
  const here = levels?.find(l => l.level === level)?.repertoire ?? null
  const total = here ? here.rows.reduce((s, r) => s + r.nPitches, 0) : 0
  const thisPitch = (levels ?? []).flatMap(l => { const r = l.repertoire?.rows.find(x => x.pitchType === type); return r ? [{ level: l.level, season: l.season, r }] : [] })
  const base = thisPitch.length > 1 ? thisPitch[thisPitch.length - 1] : null   // the lowest level he threw it at (levels run MLB, Triple-A, Florida State League)
  const d = p.diag, ld = leagueDiag
  const tile = (label: string, v: string, avg: string | null) => (
    <div key={label} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: '8px 10px', background: C.cream, minWidth: 104 }}>
      <div style={{ fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      {avg && <div style={{ fontSize: 11.5, color: C.mute }}>{LEVEL_SHORT[level]} avg {avg}</div>}
    </div>
  )
  const lc = pitchName.toLowerCase()
  const whiff = p.nSwings >= GATE.swings ? p.nWhiffs / p.nSwings : null
  const stat: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96 }
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }
  const v: React.CSSProperties = { fontWeight: 800, fontSize: 20, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums' }
  return (
    <section aria-label={`${p.name} at ${LEVEL_LABEL[level]}`} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <Headshot id={p.pitcherId} size={64} />
          <div style={{ minWidth: 0 }}>
            <div className="pv-k" style={{ color: ORANGE_TEXT }}>{LEVEL_LABEL[level]}{season ? ` · ${season}` : ''}</div>
            <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.02em', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {p.name}
              {club && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14, color: C.mute }}><TeamBadge id={club.id} size={30} disc={false} />{p.teamAbbr}{club.parentId != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Parent club">· <TeamBadge id={club.parentId} size={22} disc={false} /></span>}</span>}
            </div>
            <div style={{ fontSize: 13.5, color: '#5b5347' }}>His {hand === 'L' ? 'left' : 'right'}-handed {lc}, {p.nPitches.toLocaleString()} pitches with tracking at this level.</div>
            {chips && chips.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{chips.map(t => <span key={t} style={{ background: C.soft, color: '#5b5347', fontWeight: 600, fontSize: 12, borderRadius: 3, padding: '2px 8px' }}>{t}</span>)}</div>}
          </div>
        </div>
        <button type="button" onClick={onClear} style={{ minHeight: 40, padding: '0 12px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: '#fff7f3', color: ORANGE_TEXT, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Clear selected pitcher</button>
      </div>

      <TranslationBanner t={carry} levelLabel={LEVEL_LABEL[level]} />

      <div style={{ display: 'flex', gap: '12px 24px', flexWrap: 'wrap', margin: '14px 0' }}>
        <div style={stat}><span style={k}>Velocity</span><span style={v}>{p.velo.toFixed(1)} mph</span></div>
        <div style={stat}><span style={k}>Ride</span><span style={v}>{p.ivb.toFixed(1)} in</span></div>
        <div style={stat}><span style={k}>Run</span><span style={v}>{p.hb.toFixed(1)} in</span></div>
        <div style={stat}><span style={k}>Arm angle</span><span style={armAngle ? v : { ...v, color: C.mute }}>{armAngle ? `${Math.round(p.slot)}°` : 'pending'}</span></div>
        <div style={stat}>
          <span style={k}>Whiffs per swing</span>
          {whiff != null ? <span style={v}>{(whiff * 100).toFixed(1)}%</span> : <span style={{ ...v, color: C.mute }}>pending</span>}
          <span style={{ fontSize: 11.5, color: C.mute }}>{p.nWhiffs.toLocaleString()} of {p.nSwings.toLocaleString()} swings{whiff == null ? `, under ${GATE.swings} needed` : ''}</span>
        </div>
      </div>
      {!armAngle && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#5b5347' }}>Arm angle is pending at this level for this pitch, so it is left out of the shape and never estimated.</p>}

      {d && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginBottom: 12 }}>
          <div className="pv-k" style={{ color: ORANGE_TEXT }}>Where he throws it and what hitters did</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {tile('In the zone', pc(d.zonePct), ld ? pc(ld.zonePct) : null)}
            {tile('Down the middle', pc(d.heartPct), ld ? pc(ld.heartPct) : null)}
            {tile('Chase rate', pc(d.chasePct), ld ? pc(ld.chasePct) : null)}
            {tile('Damage on contact', d.nBbe >= GATE.bbe ? w3(d.xwobaCon) : 'pending', ld && d.nBbe >= GATE.bbe ? w3(ld.xwobaCon) : null)}
            {tile('Ride variation', d.sdIvb == null ? '—' : `±${d.sdIvb.toFixed(1)} in`, ld && ld.sdIvb != null ? `±${ld.sdIvb.toFixed(1)}` : null)}
            {tile('Run variation', d.sdHb == null ? '—' : `±${d.sdHb.toFixed(1)} in`, ld && ld.sdHb != null ? `±${ld.sdHb.toFixed(1)}` : null)}
          </div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Damage on contact is xwOBA on balls in play ({d.nBbe.toLocaleString()} here, {GATE.bbe} needed); lower is better for the pitcher. Variation is how much his own {lc}s vary. All of it is measured at {LEVEL_LABEL[level]} only.</div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginBottom: 12 }}>
        <div className="pv-k" style={{ color: ORANGE_TEXT }}>His shape at each level</div>
        <p style={{ margin: '2px 0 8px', fontSize: 12.5, color: '#5b5347', lineHeight: 1.5 }}>The same pitcher’s movement at MLB and the minors, pitch by pitch. A difference here is a change in his pitch.</p>
        <PitcherShapeLevels pitcherId={p.pitcherId} initialType={type} />
        <a href={`/mlb/lab/pitching-lab/${p.pitcherId}/levels`} style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 700, color: ORANGE_TEXT }}>Compare his location, sequencing and results across levels in the Pitching Lab →</a>
      </div>

      {levels === undefined ? <div style={{ fontSize: 13, color: C.mute, marginBottom: 12 }}>Loading his other pitches and levels…</div> : levels && (
        <>
          {here && here.rows.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginBottom: 12 }}>
              <div className="pv-k" style={{ color: ORANGE_TEXT }}>All his pitches at {LEVEL_LABEL[level]}</div>
              <div style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                  <thead><tr><th style={th}>Pitch</th><th style={th}>Share</th><th style={th}>Velocity</th><th style={th}>Ride</th><th style={th}>Run</th><th style={th}>Arm</th><th style={th}>Whiffs / swing</th><th style={th}>Zone</th><th style={th}>Chase</th></tr></thead>
                  <tbody>
                    {here.rows.map(r => (
                      <tr key={r.pitchType} style={{ background: r.pitchType === type ? '#FFF3EA' : undefined }}>
                        <td style={{ ...td, fontWeight: 700 }}>{PITCH_NAMES[r.pitchType] ?? r.pitchType}</td>
                        <td style={td}>{total ? pc(r.nPitches / total, 0) : '—'}<span style={{ color: C.mute, fontSize: 11.5 }}> {r.nPitches.toLocaleString()}</span></td>
                        <td style={td}>{r.velo.toFixed(1)}</td><td style={td}>{r.ivb.toFixed(1)}</td><td style={td}>{r.hb.toFixed(1)}</td><td style={td}>{Math.round(r.slot)}°</td>
                        <td style={td}>{r.nSwings >= GATE.swings ? pc(r.nWhiffs / r.nSwings) : <span style={{ color: C.mute }}>pending</span>}</td>
                        <td style={td}>{pc(r.diag.zonePct, 0)}</td><td style={td}>{pc(r.diag.chasePct, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {here.lockedTypes > 0 && <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>{here.lockedTypes} more pitch type{here.lockedTypes === 1 ? '' : 's'} with Pro.</div>}
            </div>
          )}
          {thisPitch.length > 1 && (
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginBottom: 12 }}>
              <div className="pv-k" style={{ color: ORANGE_TEXT }}>His {lc} at every level he has thrown it</div>
              <div style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                  <thead><tr><th style={th}>Level</th><th style={th}>Pitches</th><th style={th}>Velocity</th><th style={th}>Ride</th><th style={th}>Run</th><th style={th}>Arm angle</th><th style={th}>Whiffs / swing</th></tr></thead>
                  <tbody>
                    {thisPitch.map(t => (
                      <tr key={t.level} style={{ background: t.level === level ? '#FFF3EA' : undefined }}>
                        <td style={{ ...td, fontWeight: 800 }}>{LEVEL_LABEL[t.level]}</td><td style={td}>{t.r.nPitches.toLocaleString()}</td>
                        <td style={td}>{t.r.velo.toFixed(1)}</td><td style={td}>{t.r.ivb.toFixed(1)}</td><td style={td}>{t.r.hb.toFixed(1)}</td><td style={td}>{Math.round(t.r.slot)}°</td>
                        <td style={td}>{t.r.nSwings >= GATE.swings ? pc(t.r.nWhiffs / t.r.nSwings) : <span style={{ color: C.mute }}>pending</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {base && <div style={{ fontSize: 12.5, color: '#3a352c', marginTop: 6, lineHeight: 1.5 }}>From {LEVEL_LABEL[base.level]} to {LEVEL_LABEL[thisPitch[0].level]}, his {lc} changed by <b>{sg(thisPitch[0].r.velo - base.r.velo)} mph</b>, <b>{sg(thisPitch[0].r.ivb - base.r.ivb)} in of ride</b> and <b>{sg(thisPitch[0].r.hb - base.r.hb)} in of run</b>. Whiff rates are measured against each level’s own hitters, so they are not on one scale.</div>}
            </div>
          )}
        </>
      )}

      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <div className="pv-k" style={{ color: ORANGE_TEXT }}>Closest MLB shape</div>
        <p style={{ margin: '2px 0 8px', fontSize: 12.5, color: '#5b5347', lineHeight: 1.5 }}>Major-league {lc}s nearest to this one on physical shape alone: speed, ride, run{armAngle ? ' and arm angle' : ''}. Below is what MLB pitches of this shape have done, and how speed changes it. These are MLB results for MLB pitches, shown for comparison; none of them is counted as his.</p>
        {closest === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Finding the closest MLB shapes…</div>
          : closest === null || closest.closest.length === 0 ? <div style={{ fontSize: 13, color: C.mute }}>No major-league {lc}s to compare with yet.</div>
          : (
            <>
              {closest.movement && (
                <div style={{ background: C.soft, borderRadius: 6, padding: '10px 12px', marginBottom: 10, fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}>
                  <b>What this movement has produced in MLB.</b> MLB {lc}s within 1 in of his ride and run ({closest.movement.pitches.toLocaleString()} pitches, any speed): {closest.movement.whiff != null ? <><b>{pc(closest.movement.whiff)}</b> whiffs per swing ({closest.movement.swings.toLocaleString()} swings)</> : 'too few swings for a whiff rate'}{closest.movement.saved != null ? <>, <b>{sg(closest.movement.saved, 2)}</b> runs saved per 100 pitches</> : ''}{closest.movement.woba != null ? <>, wOBA <b>{w3(closest.movement.woba)}</b></> : ''}{closest.movement.xwoba != null ? <> and xwOBA <b>{w3(closest.movement.xwoba)}</b></> : ''}.
                  {closest.speed && closest.speed.typicalVelo != null && closest.speed.veloDiff != null && (
                    <> <b>Speed.</b> MLB {lc}s with this movement are thrown at about <b>{closest.speed.typicalVelo.toFixed(1)} mph</b>; he throws {p.velo.toFixed(1)}, which is <b>{Math.abs(closest.speed.veloDiff).toFixed(1)} mph</b> {closest.speed.veloDiff < 0 ? 'slower' : 'faster'}.{' '}
                      {closest.speed.atSpeed.whiff != null && closest.speed.all.whiff != null
                        ? <>MLB {lc}s with this movement at his speed get <b>{pc(closest.speed.atSpeed.whiff)}</b> whiffs per swing ({closest.speed.atSpeed.swings.toLocaleString()} swings), against <b>{pc(closest.speed.all.whiff)}</b> at every speed{closest.speed.whiffEffect != null ? <> ({sg(closest.speed.whiffEffect * 100)} pts)</> : ''}{closest.speed.atSpeed.xwobaCon != null && closest.speed.all.xwobaCon != null ? <>; contact against them averages {w3(closest.speed.atSpeed.xwobaCon)} xwOBA against {w3(closest.speed.all.xwobaCon)} at every speed</> : ''}.</>
                        : <>Too few MLB {lc}s at his speed with this movement to say what his speed has meant.</>}</>
                  )}
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead><tr><th style={th}>MLB pitcher</th><th style={th}>Velocity</th><th style={th}>vs his</th><th style={th}>Ride</th><th style={th}>Run</th>{armAngle && <th style={th}>Arm</th>}<th style={th}>Pitches</th><th style={th}>Whiffs / swing</th><th style={th}>Runs saved / 100</th><th style={th}>wOBA</th><th style={th}>xwOBA</th></tr></thead>
                  <tbody>
                    {closest.closest.map(c => {
                      const tm = teamOf('mlb', c.teamAbbr)
                      return (
                        <tr key={c.pitcherId}>
                          <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Headshot id={c.pitcherId} size={34} /><span><b>{c.name}</b><span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.mute }}>{tm && <TeamBadge id={tm.id} size={18} disc={false} />}{c.teamAbbr}</span></span></span></td>
                          <td style={td}>{c.velo.toFixed(1)}</td>
                          <td style={{ ...td, fontWeight: 700, color: Math.abs(c.velo - p.velo) < 0.05 ? C.mute : '#3a352c' }}>{sg(c.velo - p.velo)}</td>
                          <td style={td}>{c.ivb.toFixed(1)}</td><td style={td}>{c.hb.toFixed(1)}</td>{armAngle && <td style={td}>{Math.round(c.slot)}°</td>}
                          <td style={td}>{c.mlb ? c.mlb.pitches.toLocaleString() : '—'}</td>
                          <td style={td}>{c.mlb && c.mlb.whiff != null && c.mlb.swings >= GATE.swings ? pc(c.mlb.whiff) : <span style={{ color: C.mute }}>pending</span>}</td>
                          <td style={td}>{c.mlb && c.mlb.saved != null && c.mlb.rvPitches >= 300 ? sg(c.mlb.saved, 2) : <span style={{ color: C.mute }}>pending</span>}</td>
                          <td style={td}>{c.mlb && c.mlb.woba != null ? w3(c.mlb.woba) : '—'}</td><td style={td}>{c.mlb && c.mlb.xwoba != null ? w3(c.mlb.xwoba) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 6, lineHeight: 1.5 }}>“vs his” is the MLB pitcher’s speed minus his. Each MLB pitcher’s results are his own {closest.season} {lc} against MLB hitters; runs saved per 100 is the MLB average minus his. Whiff rates need {GATE.swings} swings and runs per 100 need 300 pitches. They show what that pitch has done in MLB, not what his would do.</div>
            </>
          )}
      </div>
    </section>
  )
}
