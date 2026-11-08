'use client'

// src/components/contact-shape/ContactShapeLab.tsx
//
// Contact Shape: for a hitter, where his batted balls land by launch angle and exit velocity, what that contact is worth, how it compares with the league or a second hitter, and a box you can set
// to ask "how often does he hit it like this". Data: recorded batted balls (Baseball Savant, held in this repo as fixtures) for 36 hitters, plus league cells. Loaded on demand, no fetching, no
// predictions: every figure describes balls already hit, with its sample beside it. Read-only; nothing is stored.

import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '@/components/team/ui'
import { Tip } from '@/components/pitch-shape/InfoTip'
import ContactMap, { type MapMode } from './ContactMap'
import { CONTACT_INFO, type ContactInfoKey } from '@/lib/contact-shape/info'
import { BANDS, GRID, MIN_CELL, cellHit, cellX, evLabel, gridOf, inZone, laLabel, leagueGrid, profileOf, type Ball, type Grid, type Profile, type Zone } from '@/lib/contact-shape/math'

type Hitter = { id: number; name: string; bats: string; events: Record<string, Ball[]> }
type Summary = { n: number; avgEv: number; hardHit: number; sweetSpot: number; barrel: number; xwoba: number; hitRate: number; lastDate: string }
type Data = { hitters: Hitter[]; meta: { snapshot: string; selection: string; source: string }; league: Record<string, number[][]>; summary: Record<string, Summary> }
type Season = '2026' | '2025' | 'both'
export type InitialView = { h?: number; c?: number; s?: Season; m?: MapMode }

const ORANGE_TEXT = '#B83A0E'
const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }
const sel: React.CSSProperties = { minHeight: 40, minWidth: 190, border: `1px solid ${C.line}`, borderRadius: 4, background: '#fff', padding: '0 10px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.ink, cursor: 'pointer' }
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px' }
const pct = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const d3 = (x: number | null) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))

function Lab({ k: key, children }: { k: ContactInfoKey; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center' }}>{children}<Tip info={CONTACT_INFO[key]} /></span>
}

const ballsOf = (h: Hitter | undefined, s: Season): Ball[] => (!h ? [] : s === 'both' ? [...(h.events['2025'] ?? []), ...(h.events['2026'] ?? [])] : h.events[s] ?? [])
const sumGrids = (rows: Record<string, number[][]>, s: Season): Grid => {
  if (s !== 'both') return leagueGrid(rows[s] ?? [])
  const a = leagueGrid(rows['2025'] ?? []), b = leagueGrid(rows['2026'] ?? [])
  return a.map((r, e) => r.map((c, i) => ({ n: c.n + b[e][i].n, hits: c.hits + b[e][i].hits, xSum: c.xSum + b[e][i].xSum, xN: c.xN + b[e][i].xN })))
}
const leagueSummary = (sm: Record<string, Summary>, s: Season): Profile | null => {
  const list = s === 'both' ? ['2025', '2026'].map(y => sm[y]) : [sm[s]]
  if (list.some(x => !x)) return null
  const n = list.reduce((t, x) => t + x.n, 0), w = (f: (x: Summary) => number) => list.reduce((t, x) => t + f(x) * x.n, 0) / n
  return { n, avgEv: w(x => x.avgEv), maxEv: null, avgLa: null, hardHit: w(x => x.hardHit), sweetSpot: w(x => x.sweetSpot), barrel: w(x => x.barrel), xwoba: w(x => x.xwoba), xwobaN: n, hitRate: w(x => x.hitRate), gb: null, ld: null, fb: null, pu: null }
}

export default function ContactShapeLab({ initial }: { initial: InitialView }) {
  const [data, setData] = useState<Data | null | undefined>(undefined)
  const [season, setSeason] = useState<Season>(initial.s ?? '2026')
  const [aId, setAId] = useState<number | null>(initial.h ?? null)
  const [bId, setBId] = useState<number | null>(initial.c ?? null)
  const [mode, setMode] = useState<MapMode>(initial.m ?? 'dots')
  const [cell, setCell] = useState<{ e: number; a: number } | null>(null)
  const [zone, setZone] = useState<Zone | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([import('@/lib/contact-shape/fixtures/hitters.json'), import('@/lib/contact-shape/fixtures/league.json')])
      .then(([h, l]) => { if (live) setData({ hitters: h.hitters as unknown as Hitter[], meta: h.meta as Data['meta'], league: l.league as Record<string, number[][]>, summary: l.summary as Record<string, Summary> }) })
      .catch(e => { console.error('[ContactShapeLab] data failed to load:', e instanceof Error ? e.message : e); if (live) setData(null) })
    return () => { live = false }
  }, [])

  useEffect(() => {
    try {
      const q = new URLSearchParams()
      if (aId != null) q.set('h', String(aId)); if (bId != null) q.set('c', String(bId))
      if (season !== '2026') q.set('s', season); if (mode !== 'dots') q.set('m', mode)
      window.history.replaceState(null, '', q.toString() ? `?${q}` : window.location.pathname)
    } catch { /* an address that cannot be rewritten just is not shared */ }
  }, [aId, bId, season, mode])

  const A = data?.hitters.find(h => h.id === aId), B = data?.hitters.find(h => h.id === bId)
  const leagueG = useMemo(() => (data ? sumGrids(data.league, season) : null), [data, season])
  const aBalls = useMemo(() => ballsOf(A, season), [A, season])
  const bBalls = useMemo(() => ballsOf(B, season), [B, season])
  const aG = useMemo(() => gridOf(aBalls), [aBalls]), bG = useMemo(() => gridOf(bBalls), [bBalls])
  const pa = useMemo(() => profileOf(aBalls), [aBalls]), pb = useMemo(() => profileOf(bBalls), [bBalls])
  const lp = data ? leagueSummary(data.summary, season) : null

  if (data === undefined) return <p style={{ color: C.mute, padding: '30px 0' }}>Loading the batted balls…</p>
  if (data === null || !leagueG) return <p role="alert" style={{ color: '#A8391F', padding: '30px 0' }}>The batted-ball data could not be loaded. Nothing is shown rather than a made-up map.</p>

  const diffRef = B ? bG : leagueG
  const effMode: MapMode = mode === 'diff' || mode === 'density' || mode === 'dots' ? mode : 'dots'
  const seasonText = season === 'both' ? '2025 and 2026' : season
  const zoneCells = (g: Grid, z: Zone) => {
    const e0 = Math.round((z.evMin - GRID.evStart) / GRID.evStep), e1 = Math.round((z.evMax - GRID.evStart) / GRID.evStep)
    const a0 = Math.round((z.laMin - GRID.laStart) / GRID.laStep), a1 = Math.round((z.laMax - GRID.laStart) / GRID.laStep)
    let n = 0, hits = 0, xs = 0, xn = 0
    for (let e = e0; e < e1; e++) for (let a = a0; a < a1; a++) { const c = g[e]?.[a]; if (!c) continue; n += c.n; hits += c.hits; xs += c.xSum; xn += c.xN }
    return { n, hits, x: xn > 0 ? xs / xn : null }
  }
  const zoneStats = zone && A ? { mine: zoneCells(aG, zone), league: zoneCells(leagueG, zone), tot: aBalls.length, ltot: leagueG.flat().reduce((s, c) => s + c.n, 0) } : null
  const hc = cell ? { mine: aG[cell.e][cell.a], league: leagueG[cell.e][cell.a] } : null

  const save = async () => {
    if (!cardRef.current || !A) return
    setSaving(true); setSaveErr('')
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#FAF8F3' })
      const a = document.createElement('a'); a.href = url; a.download = `contact-shape-${A.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${season}.png`; a.click()
    } catch (e) { console.error('[ContactShapeLab] image export failed:', e instanceof Error ? e.message : e); setSaveErr('The image could not be made in this browser.') }
    finally { setSaving(false) }
  }
  const setBox = (z: Zone | null) => setZone(z)
  const PRESETS: { text: string; z: Zone }[] = [
    { text: 'Barrel zone (98+ mph, 26° to 50°)', z: { evMin: 96, evMax: 116, laMin: 25, laMax: 50 } },
    { text: 'Hard-hit line drives', z: { evMin: 96, evMax: 116, laMin: 10, laMax: 25 } },
    { text: 'Sweet spot (8° to 32°)', z: { evMin: 40, evMax: 116, laMin: 10, laMax: 30 } },
    { text: 'Hit into the ground', z: { evMin: 40, evMax: 116, laMin: -60, laMax: 10 } },
  ]
  const rows: { key: ContactInfoKey; label: string; f: (p: Profile) => string; l: string | null }[] = [
    { key: 'balls', label: 'Batted balls', f: p => String(p.n), l: null },
    { key: 'avgEv', label: 'Average exit velocity', f: p => (p.avgEv == null ? '—' : `${p.avgEv.toFixed(1)} mph`), l: lp?.avgEv == null ? null : `${lp.avgEv.toFixed(1)} mph` },
    { key: 'maxEv', label: 'Hardest ball', f: p => (p.maxEv == null ? '—' : `${p.maxEv.toFixed(1)} mph`), l: null },
    { key: 'hardHit', label: 'Hard-hit rate (95+ mph)', f: p => pct(p.hardHit), l: lp ? pct(lp.hardHit) : null },
    { key: 'sweetSpot', label: 'Sweet-spot rate (8° to 32°)', f: p => pct(p.sweetSpot), l: lp ? pct(lp.sweetSpot) : null },
    { key: 'barrel', label: 'Barrel rate', f: p => pct(p.barrel), l: lp ? pct(lp.barrel) : null },
    { key: 'xwoba', label: 'xwOBA on contact', f: p => d3(p.xwoba), l: lp ? d3(lp.xwoba) : null },
    { key: 'hitRate', label: 'Hit rate on balls in play', f: p => pct(p.hitRate), l: lp ? pct(lp.hitRate) : null },
    ...BANDS.map(b => ({ key: b.id as ContactInfoKey, label: `${b.label} (${b.range})`, f: (p: Profile) => pct(p[b.id]), l: null as string | null })),
  ]

  return (
    <div className="cs-root">
      <style>{`.cs-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:18px;align-items:start}@media (max-width:900px){.cs-grid{grid-template-columns:minmax(0,1fr)}}.cs-root input[type=range]{width:100%;min-height:36px}`}</style>
      <div role="note" style={{ background: '#FFF8D6', border: `1px solid ${C.yellow}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#3a352c', lineHeight: 1.5, marginBottom: 14 }}>
        <b>Recorded data, a snapshot to {data.meta.snapshot}.</b> Real regular-season batted balls from Baseball Savant for {data.hitters.length} hitters ({data.meta.selection}). League figures use every batted ball with a recorded speed and angle. This page does not update by itself.
      </div>

      <div className="cs-filters" role="group" aria-label="Choose a hitter" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'flex-end', ...card, padding: '12px 14px', borderRadius: 6, marginBottom: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={k}>Hitter</span>
          <select value={aId ?? ''} onChange={e => { setAId(e.target.value ? Number(e.target.value) : null); setCell(null) }} style={sel} aria-label="Hitter">
            <option value="">Choose a hitter</option>{data.hitters.map(h => <option key={h.id} value={h.id}>{h.name} ({h.bats === 'S' ? 'switch' : h.bats === 'L' ? 'left' : 'right'})</option>)}
          </select></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={k}>Compare with</span>
          <select value={bId ?? ''} onChange={e => setBId(e.target.value ? Number(e.target.value) : null)} style={sel} aria-label="Compare with">
            <option value="">The league</option>{data.hitters.filter(h => h.id !== aId).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={k}>Season</span>
          <select value={season} onChange={e => setSeason(e.target.value as Season)} style={{ ...sel, minWidth: 140 }} aria-label="Season">
            <option value="2026">2026</option><option value="2025">2025</option><option value="both">2025 and 2026</option>
          </select></label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={k}>Map</span>
          <span role="group" aria-label="Map view" style={{ display: 'inline-flex' }}>
            {([['dots', 'Every ball'], ['density', 'Where it lands'], ['diff', B ? `vs ${B.name.split(' ').slice(-1)[0]}` : 'vs league']] as [MapMode, string][]).map(([id, t], i) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}
                style={{ minHeight: 40, padding: '0 12px', border: `1px solid ${mode === id ? C.ink : C.line}`, background: mode === id ? C.ink : '#fff', color: mode === id ? '#fff' : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', borderRadius: i === 0 ? '4px 0 0 4px' : i === 2 ? '0 4px 4px 0' : 0, marginLeft: i ? -1 : 0 }}>{t}</button>
            ))}
          </span></div>
      </div>

      {!A ? (
        <div style={{ ...card, color: '#5b5347', fontSize: 15 }}>
          <b style={{ color: C.ink }}>Choose a hitter to see his contact shape.</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {data.hitters.filter((_, i) => i % 4 === 0).slice(0, 8).map(h => <button key={h.id} type="button" onClick={() => setAId(h.id)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{h.name}</button>)}
          </div>
        </div>
      ) : aBalls.length === 0 ? (
        <div style={{ ...card }}>No recorded batted balls for {A.name} in {seasonText}.</div>
      ) : (
        <>
          <div className="cs-grid">
            <section style={card} aria-label="Contact map">
              <div className="pv-k" style={{ color: ORANGE_TEXT, marginBottom: 2 }}>
                {A.name}{B && mode === 'diff' ? ` minus ${B.name}` : ''} · {seasonText}
                <Tip info={effMode === 'dots' ? CONTACT_INFO.mapDots : effMode === 'density' ? CONTACT_INFO.mapDensity : CONTACT_INFO.mapLeague} />
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>
                {effMode === 'dots' ? 'Each dot is a batted ball, orange if it fell for a hit. The shading is what the league’s balls in each box have produced (darker = a higher expected wOBA).'
                  : effMode === 'density' ? 'The darker the box, the more of his batted balls landed there.'
                  : `Orange boxes: he hits more of his balls there than ${B ? B.name : 'the league'} does. Blue: fewer.`}
                {' '}Dashed outline: the barrel zone.
              </p>
              <ContactMap balls={aBalls} mine={aG} against={diffRef} league={leagueG} mode={effMode} zone={zone} onCell={(e, a) => setCell({ e, a })} label={`Contact map for ${A.name}, ${seasonText}`} />
              <div aria-live="polite" style={{ minHeight: 64, marginTop: 8, fontSize: 13.5, color: '#3a352c', lineHeight: 1.5, background: C.soft, borderRadius: 6, padding: '8px 10px' }}>
                {hc ? (
                  <>
                    <b>{evLabel(cell!.e)}, {laLabel(cell!.a)}</b><Tip info={CONTACT_INFO.sample} /><br />
                    {A.name.split(' ').slice(-1)[0]}: {hc.mine.n} ball{hc.mine.n === 1 ? '' : 's'}{hc.mine.n >= MIN_CELL ? ` · ${pct(cellHit(hc.mine), 0)} hits · xwOBA ${d3(cellX(hc.mine))}` : ' · too few to read'}<br />
                    League: {hc.league.n.toLocaleString()} balls · {hc.league.n >= MIN_CELL ? `${pct(cellHit(hc.league), 0)} hits · xwOBA ${d3(cellX(hc.league))}` : 'too few to read'}
                  </>
                ) : <span style={{ color: C.mute }}>Touch or hover a box to read it: how many balls, how often they fell for a hit, and what the league’s balls there produced.</span>}
              </div>
            </section>

            <section style={card} aria-label="Contact profile">
              <div className="pv-k" style={{ color: ORANGE_TEXT, marginBottom: 6 }}>His contact, in numbers</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr>
                  <th style={{ ...k, textAlign: 'left', padding: '4px 0', borderBottom: `2px solid ${C.ink}` }}>Measure</th>
                  <th style={{ ...k, textAlign: 'right', padding: '4px 6px', borderBottom: `2px solid ${C.ink}` }}>{A.name.split(' ').slice(-1)[0]}</th>
                  {B && <th style={{ ...k, textAlign: 'right', padding: '4px 6px', borderBottom: `2px solid ${C.ink}` }}>{B.name.split(' ').slice(-1)[0]}</th>}
                  <th style={{ ...k, textAlign: 'right', padding: '4px 0 4px 6px', borderBottom: `2px solid ${C.ink}` }}>League</th>
                </tr></thead>
                <tbody>{rows.map(r => (
                  <tr key={r.label} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: '7px 0', fontWeight: 600, color: '#3a352c' }}><Lab k={r.key}>{r.label}</Lab></td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 800 }}>{r.f(pa)}</td>
                    {B && <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: '#5b5347' }}>{r.f(pb)}</td>}
                    <td style={{ padding: '7px 0 7px 6px', textAlign: 'right', color: C.mute }}>{r.l ?? '—'}</td>
                  </tr>))}</tbody>
              </table>
              <p style={{ fontSize: 11.5, color: C.faint, margin: '8px 0 0', lineHeight: 1.5 }}>{pa.n} batted balls for {A.name} in {seasonText}{pa.n < 150 ? ' (a small sample: the rates move a lot from ball to ball)' : ''}. League: {lp ? lp.n.toLocaleString() : '—'} batted balls. Source: Baseball Savant. Barrel uses the published rule on the recorded speed and angle.</p>
            </section>
          </div>

          <section style={{ ...card, marginTop: 18 }} aria-label="Explore recorded contact">
            <div className="pv-k" style={{ color: ORANGE_TEXT }}><Lab k="zone">Explore recorded contact</Lab></div>
            <p style={{ margin: '4px 0 10px', fontSize: 14, color: '#5b5347', lineHeight: 1.5, maxWidth: 760 }}>Set a box of exit speeds and launch angles and see how many of his batted balls landed in it, what they produced, and what the league’s balls in the same box produced.</p>
            <div role="group" aria-label="Starting boxes" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {PRESETS.map(p => <button key={p.text} type="button" onClick={() => setBox(p.z)} style={{ minHeight: 38, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{p.text}</button>)}
              <button type="button" onClick={() => setBox(null)} disabled={!zone} style={{ minHeight: 38, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', color: zone ? ORANGE_TEXT : C.faint, fontWeight: 800, fontSize: 13, cursor: zone ? 'pointer' : 'default', fontFamily: 'inherit' }}>Clear box</button>
            </div>
            {zone && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 20px', marginBottom: 12 }}>
                {([['Slowest exit velocity', 'evMin', GRID.evStart, GRID.evStart + GRID.evBins * GRID.evStep - GRID.evStep, GRID.evStep, 'mph'], ['Hardest exit velocity', 'evMax', GRID.evStart + GRID.evStep, GRID.evStart + GRID.evBins * GRID.evStep, GRID.evStep, 'mph'],
                  ['Lowest launch angle', 'laMin', GRID.laStart, GRID.laStart + (GRID.laBins - 1) * GRID.laStep, GRID.laStep, '°'], ['Highest launch angle', 'laMax', GRID.laStart + GRID.laStep, GRID.laStart + GRID.laBins * GRID.laStep, GRID.laStep, '°']] as [string, keyof Zone, number, number, number, string][]).map(([t, f, lo, hi, step, u]) => (
                  <label key={f} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={k}>{t}: <b style={{ color: C.ink }}>{zone[f]}{u === '°' ? '°' : ` ${u}`}</b></span>
                    <input type="range" min={lo} max={hi} step={step} value={zone[f]} aria-label={t}
                      onChange={e => { const v = Number(e.target.value); const nz = { ...zone, [f]: v }; if (nz.evMin >= nz.evMax || nz.laMin >= nz.laMax) return; setZone(nz) }} /></label>
                ))}
              </div>
            )}
            {zoneStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                {[
                  ['His balls in the box', `${zoneStats.mine.n}`, `${pct(zoneStats.mine.n / zoneStats.tot)} of his ${zoneStats.tot}`],
                  ['League balls in the box', pct(zoneStats.league.n / zoneStats.ltot), 'of all league batted balls'],
                  ['His hit rate there', zoneStats.mine.n >= MIN_CELL ? pct(zoneStats.mine.hits / zoneStats.mine.n, 0) : '—', zoneStats.league.n ? `league ${pct(zoneStats.league.hits / zoneStats.league.n, 0)}` : ''],
                  ['His xwOBA there', zoneStats.mine.n >= MIN_CELL ? d3(zoneStats.mine.x) : '—', `league ${d3(zoneStats.league.x)}`],
                ].map(([a, b, c]) => <div key={a} style={{ background: C.soft, borderRadius: 6, padding: '8px 10px' }}><div style={k}>{a}</div><b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{b}</b><div style={{ fontSize: 11.5, color: C.faint }}>{c}</div></div>)}
                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12, color: C.faint }}>The box is drawn on the map above. {aBalls.filter(b => inZone(b, zone!)).length} of his balls are inside it by exact speed and angle; the boxes are counted in whole map squares ({GRID.evStep} mph by {GRID.laStep}°).</p>
              </div>
            ) : <p style={{ margin: 0, fontSize: 13, color: C.mute }}>Choose a starting box above to open the sliders.</p>}
          </section>

          <section style={{ ...card, marginTop: 18 }} aria-label="Share card">
            <div className="pv-k" style={{ color: ORANGE_TEXT }}>Share card</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0 12px' }}>
              <button type="button" onClick={save} disabled={saving} style={{ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: '#fff7f3', color: ORANGE_TEXT, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? 'Making the image…' : 'Save as image'}</button>
              {saveErr && <span role="alert" style={{ color: '#A8391F', fontSize: 13 }}>{saveErr}</span>}
            </div>
            <div ref={cardRef} style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, maxWidth: 640 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <b style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em' }}>{A.name}</b>
                <span style={{ ...k, color: ORANGE_TEXT }}>Contact shape · {seasonText}</span>
              </div>
              <ContactMap balls={aBalls} mine={aG} against={leagueG} league={leagueG} mode="dots" label={`Contact map for ${A.name}`} compact />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
                {[['Avg exit velo', pa.avgEv == null ? '—' : `${pa.avgEv.toFixed(1)}`, lp?.avgEv == null ? '' : `lg ${lp.avgEv.toFixed(1)}`], ['Hard-hit', pct(pa.hardHit, 0), lp ? `lg ${pct(lp.hardHit, 0)}` : ''], ['Barrel', pct(pa.barrel), lp ? `lg ${pct(lp.barrel)}` : ''], ['xwOBA on contact', d3(pa.xwoba), lp ? `lg ${d3(lp.xwoba)}` : '']].map(([a, b, c]) => (
                  <div key={a}><div style={{ ...k, fontSize: 9 }}>{a}</div><b style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{b}</b><div style={{ fontSize: 10.5, color: C.faint }}>{c}</div></div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>{pa.n} batted balls with recorded speed and angle · Orange dots fell for hits · Source: Baseball Savant · xlab9.com</div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
