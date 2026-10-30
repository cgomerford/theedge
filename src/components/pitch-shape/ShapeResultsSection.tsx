'use client'

// src/components/pitch-shape/ShapeResultsSection.tsx
//
// "Ahead or behind the shape": the pitchers who throw the chosen movement, split into those getting more misses than the shape usually gets and those getting
// fewer, each with the numbers that could say why: location (strike zone, down the middle, chase), contact (quality allowed against what happened, the gap
// being defense and luck), calls, and how repeatable the movement is. Clues come from finder-math.diagnose; they say "may" and "suggests", never "because".
// Defense cannot change a swing and a miss, so it only appears in the contact rows. A figure with no data yet shows "—".
// Props are plain data (no functions cross the server boundary except the two handlers, which this client file receives from PitchFinderV2).

import Link from 'next/link'
import { useState } from 'react'
import { C, Foot } from '@/components/team/ui'
import FollowIsland from '@/components/signup/FollowIsland'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import type { Diag } from '@/lib/pitch-shape/diagnostics'
import { ABOUT_LEVEL_PTS, LOCATION_GAP_PTS, MIN_OWN_SWINGS, diagnose, splitThrowers, type Rated } from './finder-math'

const ORANGE_TEXT = '#B83A0E'
const R = 6
type Split = ReturnType<typeof splitThrowers>
export type ResultRow = Rated & { diag: Diag; /** set when he is compared with what his OWN shape gets (the across-the-map list) instead of the chosen spot */ shapeRate?: number | null }

const pc = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
const w3 = (x: number | null) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))
const sd = (x: number | null) => (x == null ? '—' : `±${x.toFixed(1)} in`)
const diffPts = (a: number | null, b: number | null) => (a == null || b == null ? null : (a - b) * 100)

type Line = { label: string; him: string; lgd: string; note: string | null; flag: boolean }

function lines(t: ResultRow, lgd: Diag, placeRate: number | null, own: boolean): { group: string; rows: Line[] }[] {
  const d = t.diag
  const loc = (a: number | null, b: number | null) => { const g = diffPts(a, b); return { note: g == null ? null : `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)} pts`, flag: g != null && Math.abs(g) >= LOCATION_GAP_PTS } }
  const z = loc(d.zonePct, lgd.zonePct), h = loc(d.heartPct, lgd.heartPct), c = loc(d.chasePct, lgd.chasePct)
  const gap = d.wobaCon != null && d.xwobaCon != null ? d.wobaCon - d.xwobaCon : null
  const lgGap = lgd.wobaCon != null && lgd.xwobaCon != null ? lgd.wobaCon - lgd.xwobaCon : null
  return [
    { group: 'Misses', rows: [
      { label: 'Whiffs per swing', him: pc(t.own), lgd: pc(placeRate), note: t.gapPts == null ? null : `${t.gapPts >= 0 ? '+' : '−'}${Math.abs(t.gapPts).toFixed(1)} pts`, flag: Math.abs(t.gapPts ?? 0) > ABOUT_LEVEL_PTS },
      { label: 'Hitters chase it outside the zone', him: pc(d.chasePct), lgd: pc(lgd.chasePct), ...c },
    ] },
    { group: 'Location', rows: [
      { label: 'In the strike zone', him: pc(d.zonePct), lgd: pc(lgd.zonePct), ...z },
      { label: 'Down the middle', him: pc(d.heartPct), lgd: pc(lgd.heartPct), ...h },
    ] },
    { group: 'Contact: defense and luck', rows: [
      { label: 'Contact quality allowed (xwOBA)', him: w3(d.xwobaCon), lgd: w3(lgd.xwobaCon), note: null, flag: false },
      { label: 'What actually happened (wOBA)', him: w3(d.wobaCon), lgd: w3(lgd.wobaCon), note: null, flag: false },
      { label: 'Results minus quality', him: gap == null ? '—' : `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(3).replace(/^0/, '')}`, lgd: lgGap == null ? '—' : `${lgGap >= 0 ? '+' : '−'}${Math.abs(lgGap).toFixed(3).replace(/^0/, '')}`, note: gap == null ? null : gap > 0.03 ? 'worse than quality' : gap < -0.03 ? 'better than quality' : 'in line', flag: gap != null && Math.abs(gap) > 0.03 },
    ] },
    { group: 'How repeatable and how called', rows: [
      { label: 'Ride, pitch to pitch', him: sd(d.sdIvb), lgd: sd(lgd.sdIvb), note: null, flag: false },
      { label: 'Run, pitch to pitch', him: sd(d.sdHb), lgd: sd(lgd.sdHb), note: null, flag: false },
      { label: 'Called strikes outside the zone', him: pc(d.giftPct), lgd: pc(lgd.giftPct), note: null, flag: false },
    ] },
  ]
}

function Card({ t, lgd, placeRate, lc, pitchName, onShow, onOpen, shownId, tint }: { t: ResultRow; lgd: Diag; placeRate: number | null; lc: string; pitchName: string; onShow: (id: number) => void; onOpen: (id: number, name: string) => void; shownId: number | null; tint: string }) {
  const [open, setOpen] = useState(false)
  const own = t.shapeRate !== undefined   // compared with his own shape, not the chosen spot
  const refRate = own ? t.shapeRate ?? null : placeRate
  const clues = diagnose(t.verdict, t.diag, lgd, pitchName)
  const loaded = t.diag.zonePct != null
  const g = lines(t, lgd, refRate, own)
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderLeft: `4px solid ${tint}`, borderRadius: R, padding: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={headshotCutoutUrl(t.pitcherId, 240)} alt="" width={56} height={56} loading="lazy" style={{ width: 56, height: 56, flex: 'none', objectFit: 'contain', objectPosition: 'center bottom' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/mlb/players/${t.pitcherId}`} style={{ fontWeight: 800, fontSize: 16, color: ORANGE_TEXT, textDecoration: 'none' }}>{t.name} · {t.teamAbbr}</Link>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{t.gapPts != null ? `${t.gapPts >= 0 ? '+' : '−'}${Math.abs(t.gapPts).toFixed(1)} pts vs ${own ? 'his own shape' : 'the shape'}` : ''}</div>
        </div>
        <div style={{ flex: 'none', color: C.ink }}><FollowIsland kind="player" refId={String(t.pitcherId)} name={t.name} /></div>
      </div>
      <div style={{ fontSize: 12.5, color: '#5b5347', margin: '6px 0 8px' }}>{pc(t.own)} whiffs per swing ({t.nSwings.toLocaleString()} swings){own ? ` · his shape usually gets ${pc(refRate)}` : ` · about ${t.estPitches.toLocaleString()} of his ${t.nPitches.toLocaleString()} ${lc}s land in this area`}</div>

      <div style={{ background: C.cream, borderRadius: R, padding: '9px 11px', fontSize: 13, lineHeight: 1.5 }}>
        <div className="pv-k" style={{ marginBottom: 3 }}>What the numbers suggest</div>
        {clues.length > 0
          ? <ul style={{ margin: 0, paddingLeft: 18 }}>{clues.map(c => <li key={c.id} style={{ marginBottom: 3 }}>{c.text}</li>)}</ul>
          : <span style={{ color: '#5b5347' }}>{loaded || t.diag.nBbe > 0 ? 'Nothing in these numbers stands out against the league. The difference may come from sequencing, deception or how hitters see it, which the map cannot show.' : 'Not enough here yet to say.'}</span>}
        {!loaded && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>Location and contact-result numbers load with the next data refresh.</div>}
      </div>

      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ marginTop: 8, minHeight: 44, background: 'none', border: 0, color: ORANGE_TEXT, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{open ? 'Hide all the numbers' : 'See all the numbers →'}</button>
      <button type="button" onClick={() => onOpen(t.pitcherId, t.name)} style={{ marginLeft: 14, minHeight: 44, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.orange}`, background: C.orange, color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Open all his pitches →</button>
      <button type="button" aria-pressed={shownId === t.pitcherId} onClick={() => onShow(t.pitcherId)} style={{ marginLeft: 14, minHeight: 44, padding: '0 12px', borderRadius: 4, border: `1px solid ${shownId === t.pitcherId ? C.ink : C.line}`, background: shownId === t.pitcherId ? C.ink : '#fff', color: shownId === t.pitcherId ? '#fff' : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{shownId === t.pitcherId ? 'Hide from map' : 'Show on map'}</button>

      {open && (
        <div style={{ marginTop: 6 }}>
          {g.map(grp => {
            const shown = grp.rows.filter(r => !(r.him === '—' && r.lgd === '—'))
            return (
            <div key={grp.group} style={{ marginTop: 8 }}>
              <div className="pv-k" style={{ color: C.mute }}>{grp.group}</div>
              {shown.length === 0 ? <div style={{ fontSize: 12.5, color: C.mute, padding: '4px 0' }}>Not loaded yet. These fill in with the next data refresh.</div> : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute }}><th style={{ textAlign: 'left', fontWeight: 700 }} /><th style={{ textAlign: 'right', fontWeight: 700 }}>Him</th><th style={{ textAlign: 'right', fontWeight: 700 }}>{grp.group === 'Misses' ? (own ? 'His shape' : 'This shape') : 'League'}</th><th /></tr></thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.label} style={{ borderTop: `1px solid ${C.soft}` }}>
                      <td style={{ padding: '5px 0' }}>{r.label}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: r.flag ? ORANGE_TEXT : C.ink }}>{r.him}</td>
                      <td style={{ textAlign: 'right', color: '#5b5347' }}>{r.lgd}</td>
                      <td style={{ textAlign: 'right', fontSize: 11.5, color: r.flag ? ORANGE_TEXT : C.mute, paddingLeft: 8 }}>{r.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
            </div>
          )})}
          <div style={{ fontSize: 11, color: C.mute, marginTop: 6 }}>League = every pitcher with 300+ {lc}s this season (the Misses block compares with this shape instead). Highlighted when {LOCATION_GAP_PTS}+ points apart, or 30+ points of wOBA on contact apart.</div>
        </div>
      )}
    </div>
  )
}

export default function ShapeResultsSection({ split, league, placeRate, lc, pitchName, latest, onShow, onOpen, shownId, across }: {
  split: Split & { unknownCount?: number }; league: Diag; placeRate: number | null; lc: string; pitchName: string; latest: number
  onShow: (pitcherId: number) => void; onOpen: (pitcherId: number, name: string) => void; shownId: number | null
  /** the most ahead and most behind across the whole map, each against his own shape: always something to show */
  across: { ahead: ResultRow[]; behind: ResultRow[] }
}) {
  const [all, setAll] = useState(false)
  const rows = (l: Rated[]) => l as ResultRow[]
  const ahead = rows(split.ahead), behind = rows(split.behind), level = rows(split.level)
  const any = ahead.length + behind.length + level.length > 0
  const locLoaded = [...ahead, ...behind].some(t => t.diag.zonePct != null)
  const shownAhead = all ? ahead.slice(0, 12) : ahead.slice(0, 3), shownBehind = all ? behind.slice(0, 12) : behind.slice(0, 3)
  return (
    <section id="shape-vs-results" style={{ marginTop: 36, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="pv-k" style={{ color: ORANGE_TEXT }}>⊕ Ahead or behind the shape</div>
      <h2 style={{ margin: '4px 0 6px', fontWeight: 800, fontSize: 'clamp(26px,4vw,38px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>Who gets more than the shape, and who gets less?</h2>
      <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 820, margin: '0 0 12px', lineHeight: 1.5 }}>
        These pitchers throw the movement you chose. When one gets fewer misses than the shape usually gets, the movement is there and something else is not. The numbers below are the ones that could say what: where the pitch ends up, how hitters respond to it, and what happens after contact.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          ['Is it location?', 'Fewer pitches in the zone, more down the middle, or hitters not chasing it: the movement is there, the pitch is not ending up in the right place.'],
          ['Is it how it’s thrown?', 'Movement that varies a lot from pitch to pitch means he does not always get the shape. Calls on borderline pitches go in here too.'],
          ['Is it defense or luck?', 'Defense cannot change a swing and a miss. It shows up after contact: what happened (wOBA) against the quality of contact (xwOBA).'],
        ].map(([h, t]) => (
          <div key={h} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: R, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, color: '#3a352c' }}><b style={{ display: 'block', fontSize: 14, color: C.ink }}>{h}</b>{t}</div>
        ))}
      </div>
      {!any ? <p style={{ fontSize: 14, color: '#5b5347' }}>No pitcher with 300+ {lc}s threw enough of them into this area in {latest} to compare. Choose another spot.</p>
        : placeRate == null ? <p style={{ fontSize: 14, color: '#5b5347' }}>This area has too few league swings to compare anyone against. Choose a coloured square.</p>
        : (
          <>
            {!locLoaded && <div style={{ background: '#FFF1EA', border: '1px solid #f3dccf', borderRadius: R, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>Location and contact-result numbers load with the next data refresh. Until then each pitcher shows whiffs, contact quality, how much the movement varies, and calls.</div>}
            <div className="pf2-vs" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, alignItems: 'start' }}>
              <style>{'@media(max-width:900px){.pf2-vs{grid-template-columns:1fr !important}}'}</style>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 800, padding: '4px 9px', borderRadius: 4, background: '#FFE4D6', color: ORANGE_TEXT }}>GETTING MORE THAN THE SHAPE</span>
                  <span style={{ fontSize: 12.5, color: '#5b5347' }}>{ahead.length} pitcher{ahead.length === 1 ? '' : 's'}</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 8px', lineHeight: 1.5 }}>More misses than this shape usually gets. Something beyond movement is helping.</p>
                <div style={{ display: 'grid', gap: 10 }}>{shownAhead.map(t => <Card key={t.pitcherId} t={t} lgd={league} placeRate={placeRate} lc={lc} pitchName={pitchName} onShow={onShow} onOpen={onOpen} shownId={shownId} tint={C.orange} />)}{ahead.length === 0 && <p style={{ fontSize: 13.5, color: '#5b5347' }}>No pitcher here is more than {ABOUT_LEVEL_PTS} points ahead.</p>}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 800, padding: '4px 9px', borderRadius: 4, background: '#E3EAF2', color: C.ink }}>GETTING LESS THAN THE SHAPE</span>
                  <span style={{ fontSize: 12.5, color: '#5b5347' }}>{behind.length} pitcher{behind.length === 1 ? '' : 's'}</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 8px', lineHeight: 1.5 }}>They have the shape but fewer misses than it usually gets. The shape is not what is holding them back.</p>
                <div style={{ display: 'grid', gap: 10 }}>{shownBehind.map(t => <Card key={t.pitcherId} t={t} lgd={league} placeRate={placeRate} lc={lc} pitchName={pitchName} onShow={onShow} onOpen={onOpen} shownId={shownId} tint="#5E7A99" />)}{behind.length === 0 && <p style={{ fontSize: 13.5, color: '#5b5347' }}>No pitcher here is more than {ABOUT_LEVEL_PTS} points behind.</p>}</div>
              </div>
            </div>
            {(ahead.length > 3 || behind.length > 3) && <button type="button" onClick={() => setAll(a => !a)} style={{ marginTop: 12, minHeight: 44, background: 'none', border: 0, color: ORANGE_TEXT, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{all ? 'Show fewer' : 'See every pitcher near this spot →'}</button>}
            {level.length > 0 && <div style={{ fontSize: 13, color: '#5b5347', marginTop: 10 }}><b style={{ color: C.ink }}>About level ({level.length}):</b> {level.slice(0, 8).map(t => t.name).join(', ')}{level.length > 8 ? '…' : ''}. Within {ABOUT_LEVEL_PTS} points of the shape’s rate.</div>}
            {split.unknown.length > 0 && <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>{split.unknown.length} more {split.unknown.length === 1 ? 'pitcher throws' : 'pitchers throw'} this shape but {split.unknown.length === 1 ? 'has' : 'have'} under {MIN_OWN_SWINGS} swings of {split.unknown.length === 1 ? 'his' : 'their'} own, too few to compare.</div>}
          </>
        )}
      {(across.ahead.length > 0 || across.behind.length > 0) && (
        <div style={{ marginTop: 28, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
          <div className="pv-k" style={{ color: ORANGE_TEXT }}>Across the whole map</div>
          <h3 style={{ margin: '4px 0 6px', fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, letterSpacing: '-.015em' }}>The most ahead and the most behind of their own shape</h3>
          <p style={{ color: '#5b5347', fontSize: 14, maxWidth: 780, margin: '0 0 12px', lineHeight: 1.5 }}>
            Every dot on the map is a pitcher at his average {lc}. Here are the ones who get the most and the fewest misses compared with what the league gets from pitches that move like his, wherever on the map he sits. The same numbers, and the same caution: the map shows where he differs, not why.
          </p>
          <div className="pf2-vs2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, alignItems: 'start' }}>
            <style>{'@media(max-width:900px){.pf2-vs2{grid-template-columns:1fr !important}}'}</style>
            <div>
              <span style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 800, padding: '4px 9px', borderRadius: 4, background: '#FFE4D6', color: ORANGE_TEXT }}>MOST AHEAD OF HIS OWN SHAPE</span>
              <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>{across.ahead.slice(0, all ? 6 : 3).map(t => <Card key={t.pitcherId} t={t} lgd={league} placeRate={placeRate} lc={lc} pitchName={pitchName} onShow={onShow} onOpen={onOpen} shownId={shownId} tint={C.orange} />)}</div>
            </div>
            <div>
              <span style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 800, padding: '4px 9px', borderRadius: 4, background: '#E3EAF2', color: C.ink }}>MOST BEHIND HIS OWN SHAPE</span>
              <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>{across.behind.slice(0, all ? 6 : 3).map(t => <Card key={t.pitcherId} t={t} lgd={league} placeRate={placeRate} lc={lc} pitchName={pitchName} onShow={onShow} onOpen={onOpen} shownId={shownId} tint="#5E7A99" />)}</div>
            </div>
          </div>
        </div>
      )}
      <Foot>{latest} regular season. These are clues, not causes: the numbers show where a pitcher differs from the league, and cannot prove why. “Land in this area” uses up to 60 sampled pitches per pitcher, so counts are approximate.</Foot>
    </section>
  )
}
