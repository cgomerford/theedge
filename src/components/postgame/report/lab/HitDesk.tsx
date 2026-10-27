'use client'

// src/components/postgame/report/lab/HitDesk.tsx
//
// Postgame → Hitters. Every hitter who came to the plate, by club, then one of them: his night (plate appearances, hits, walks, strikeouts, best
// exit speed, swings, misses, chase), the pitches he saw by type, where they were thrown and where he swung and missed, how tonight compares with
// his season, and every plate appearance pitch by pitch. From the game's live feed (lib/postgame/pitchlog.ts); his season comes from his season
// log. Descriptions of what happened, not advice.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Headshot } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { fetchLabLog } from '@/lib/lab-log'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import type { PitchRec } from '@/lib/postgame/pitchlog'
import { SmoothHeatmap } from '@/components/pitching-lab/ArsenalExtras'
import { Pills, kick, note, tile } from '@/components/pitching-lab/LocationExplorer'
import { PAList, isOutside, mean, pc, plateAppearances } from './shared'

type Club = { id: number; abbr: string }
const HIT = new Set(['single', 'double', 'triple', 'home_run'])
const NOT_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'sac_fly_double_play', 'sac_bunt_double_play', 'catcher_interf'])
const SWING_D = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'hit_into_play'])
const WHIFF_D = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])

function lineOf(ps: PitchRec[]) {
  const pas = plateAppearances(ps)
  let h = 0, hr = 0, bb = 0, k = 0, ab = 0
  for (const pa of pas) {
    const t = pa.pitches[pa.pitches.length - 1].resultType
    if (HIT.has(t)) { h++; if (t === 'home_run') hr++ }
    if (t === 'walk' || t === 'intent_walk') bb++
    if (t.startsWith('strikeout')) k++
    if (t && !NOT_AB.has(t)) ab++
  }
  return { pa: pas.length, ab, h, hr, bb, k }
}

export default function HitDesk({ pitches, away, home, season }: { pitches: PitchRec[]; away: Club; home: Club; season: number }) {
  const hitters = useMemo(() => {
    const m = new Map<number, { id: number; name: string; side: 'away' | 'home'; ps: PitchRec[] }>()
    for (const p of pitches) {
      const side = p.fielding === 'home' ? 'away' : 'home'
      const e = m.get(p.batterId) ?? { id: p.batterId, name: p.batterName, side, ps: [] }
      e.ps.push(p); m.set(p.batterId, e)
    }
    return [...m.values()]
  }, [pitches])
  const [club, setClub] = useState<'away' | 'home'>('away')
  const list = hitters.filter(h => h.side === club)
  const [bid, setBid] = useState(list[0]?.id ?? hitters[0]?.id ?? 0)
  const [logs, setLogs] = useState<Record<number, PitcherPitchLog | null>>({})
  const cur = hitters.find(h => h.id === bid)

  useEffect(() => {
    if (!bid || logs[bid] !== undefined) return
    let off = false
    fetchLabLog('batter', bid, season).then(l => { if (!off) setLogs(x => ({ ...x, [bid]: l })) })
    return () => { off = true }
  }, [bid, season]) // eslint-disable-line react-hooks/exhaustive-deps

  if (hitters.length === 0) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute }}>No pitch data is available for this game.</p>
  const ps = cur?.ps ?? []
  const ln = lineOf(ps)
  const swings = ps.filter(p => p.swing), whiffs = ps.filter(p => p.whiff), out = ps.filter(p => isOutside(p.zone)), chased = out.filter(p => p.swing)
  const evs = ps.filter(p => p.ev != null).map(p => p.ev as number)
  const types = (() => { const m = new Map<string, { t: string; name: string; seen: number; sw: number; wh: number; ip: number; ev: number | null }>(); for (const p of ps) { const e = m.get(p.type) ?? { t: p.type, name: p.typeName, seen: 0, sw: 0, wh: 0, ip: 0, ev: null }; e.seen++; if (p.swing) e.sw++; if (p.whiff) e.wh++; if (p.inPlay) { e.ip++; if (p.ev != null) e.ev = Math.max(e.ev ?? 0, p.ev) } m.set(p.type, e) } return [...m.values()].sort((a, b) => b.seen - a.seen) })()
  const heat = (arr: PitchRec[]) => arr.filter(p => p.x != null && p.z != null).map(p => ({ plateX: p.x as number, plateZ: p.z as number, balls: p.balls, strikes: p.strikes }))
  const sLog = logs[bid]
  const sp = sLog?.pitches ?? []
  const sSw = sp.filter(p => SWING_D.has(p.description ?? '')), sOut = sp.filter(p => p.zone && Number(p.zone) >= 11)
  const sBip = sp.filter(p => p.description === 'hit_into_play' && p.exitVelo != null)
  const compare: [string, string, string][] = [
    ['Swing rate', pc(ps.length ? swings.length / ps.length : null), pc(sp.length ? sSw.length / sp.length : null)],
    ['Whiff rate', pc(swings.length ? whiffs.length / swings.length : null), pc(sSw.length ? sSw.filter(p => WHIFF_D.has(p.description ?? '')).length / sSw.length : null)],
    ['Chase rate', pc(out.length ? chased.length / out.length : null), pc(sOut.length ? sOut.filter(p => SWING_D.has(p.description ?? '')).length / sOut.length : null)],
    ['Average exit speed', evs.length ? `${mean(evs)!.toFixed(1)} mph` : '—', sBip.length ? `${mean(sBip.map(p => p.exitVelo as number))!.toFixed(1)} mph` : '—'],
    ['Hard-hit (95 mph or more)', evs.length ? pc(evs.filter(e => e >= 95).length / evs.length) : '—', sBip.length ? pc(sBip.filter(p => (p.exitVelo as number) >= 95).length / sBip.length) : '—'],
  ]

  return (
    <div className="hd-grid">
      <style>{`.hd-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.hd-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.hd-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.hd-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.hd-btn.on{border-color:#FF5722;background:#fff1ea}.hd-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.hd-span2{grid-column:span 2}.hd-span3{grid-column:1 / -1}.hd-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.hd-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.hd-tbl th:first-child,.hd-tbl td:first-child{text-align:left}.hd-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.hd-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.hd-grid{grid-template-columns:minmax(0,1fr)}.hd-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.hd-btn{width:auto;white-space:nowrap}.hd-tiles{grid-template-columns:minmax(0,1fr)}.hd-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="hd-side" aria-label="Hitters">
        <Pills items={[['away', away.abbr], ['home', home.abbr]] as ['away' | 'home', string][]} value={club} onChange={v => { setClub(v); const f = hitters.find(h => h.side === v); if (f) setBid(f.id) }} />
        {list.map(h => { const l = lineOf(h.ps); return (
          <button key={h.id} type="button" className={`hd-btn${bid === h.id ? ' on' : ''}`} onClick={() => setBid(h.id)}>
            <Headshot id={h.id} name={h.name} size={32} />
            <span>{h.name}<small>{l.h}-for-{l.ab}{l.hr ? `, ${l.hr} HR` : ''}{l.bb ? `, ${l.bb} BB` : ''}{l.k ? `, ${l.k} K` : ''}</small></span>
          </button>
        ) })}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Headshot id={bid} name={cur?.name ?? ''} size={52} />
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{cur?.name}</h2>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{ln.h}-for-{ln.ab} · {ps.length} pitches seen</span>
          <Link href={`/mlb/lab/batting-lab/${bid}`} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: C.orange, textDecoration: 'none' }}>Batting Lab →</Link>
        </div>

        <div className="hd-tiles">
          <div style={tile}>
            <div style={kick}>His night</div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
              {([['PA', ln.pa], ['AB', ln.ab], ['H', ln.h], ['HR', ln.hr], ['BB', ln.bb], ['K', ln.k]] as [string, number][]).map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{v}</dd></div>)}
            </dl>
            <p style={note}>Best exit speed {evs.length ? `${Math.max(...evs).toFixed(0)} mph` : '—'} · {swings.length} swings, {whiffs.length} misses · {chased.length} swings on {out.length} pitches out of the zone.</p>
          </div>
          <SmoothHeatmap pitches={heat(ps)} title="Pitches he saw" counts={false} />
          <SmoothHeatmap pitches={heat(whiffs)} title="Where he swung and missed" counts={false} />

          <div className="hd-span2" style={{ ...tile, overflowX: 'auto' }}>
            <div style={kick}>The pitches he saw</div>
            <table className="hd-tbl" style={{ marginTop: 6, minWidth: 420 }}>
              <thead><tr><th>Pitch</th><th>Seen</th><th>Swings</th><th>Misses</th><th>In play</th><th>Best exit speed</th></tr></thead>
              <tbody>
                {types.map(t => <tr key={t.t}><td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SpinBall code={t.t} size={22} spin={null} />{t.name}</span></td><td>{t.seen}</td><td>{t.sw}</td><td>{t.wh}</td><td>{t.ip}</td><td>{t.ev != null ? `${t.ev.toFixed(0)} mph` : '—'}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div style={{ ...tile, overflowX: 'auto' }}>
            <div style={kick}>Tonight vs his season</div>
            <table className="hd-tbl" style={{ marginTop: 6, minWidth: 260 }}>
              <thead><tr><th></th><th>Tonight</th><th>Season</th></tr></thead>
              <tbody>{compare.map(([k, a, b]) => <tr key={k}><td style={{ fontWeight: 800 }}>{k}</td><td>{a}</td><td>{sLog === undefined ? '…' : b}</td></tr>)}</tbody>
            </table>
            <p style={note}>One game is a small sample: read it as what happened, not a change.</p>
          </div>

          <div className="hd-span3" style={tile}>
            <div style={kick}>Every plate appearance · {ln.pa}</div>
            <PAList pas={plateAppearances(ps)} who="batter" />
            <p style={note}>Each dot is a pitch, coloured by type and marked B ball, CS called strike, SS swinging strike, F foul, IP in play. Hover a dot for the speed, count and result.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
