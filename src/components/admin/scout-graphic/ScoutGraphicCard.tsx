'use client'

// src/components/admin/scout-graphic/ScoutGraphicCard.tsx
//
// The exported X graphic — 1080 x 1350 (4:5, the tallest image X shows in-feed).
// Purely presentational: ScoutGraphicBuilder owns state/fetching and hands
// this real data or null. Every module renders an explicit empty state when
// its data is null — never a placeholder number.
//
//   §01 On the mound   — always. With no batter picked it also shows the
//                        pitcher's own zone-usage grid so the graphic stands alone.
//   §02 Key matchup    — a batter is picked: his line vs the chosen pitch + the
//                        13-zone overlay + "the read".
//   §03 Career H2H / §04 At the park — optional, only with real samples.
//
// Fonts: CSS variables from next/font (never a literal family name) — Outfit
// for headers/bold/numbers, JetBrains Mono for light labels (DESIGN_SYSTEM §1).
// Layout is plain CSS in a <style> block (Tailwind responsive is unreliable
// under Turbopack, and a fixed-pixel export card has no breakpoints anyway).

import { forwardRef } from 'react'
import type { RichArsenalPitch } from '@/components/PitchLocationCard'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { BatterArsenalPitch } from '@/lib/batter-zone-arsenal'
import type { BatterSeasonStats, BatterVsPitcher } from '@/lib/batter-stats'
import type { BatterVenueRecordRow } from '@/lib/batter-venue-record'
import type { PitcherGameLog } from '@/lib/mlb'
import { playerHeadshotUrl } from '@/lib/mlb'
import { C, SANS, MONO } from '@/components/team/ui'
import { METRIC_LABELS, MIN_ZONE_SAMPLE, cellSample, fmtMetric, heatColor, zoneColor, type ZoneMetric } from './zone-utils'

/** Season line for a starter. fip / tto are optional: minor-league fallback profiles don't have them. */
export type PitcherCardStats = {
  era: number | null; whip: number | null; k_per_9: number | null; bb_per_9: number | null; l3_era: number | null
  fip?: number | null
  /** wOBA allowed 1st / 2nd / 3rd time through the order, with the PA behind each. Null = not verified yet. */
  tto?: { woba: [number | null, number | null, number | null]; pa: [number | null, number | null, number | null] } | null
}

export type CardPitcher = {
  id: number
  name: string
  abbr: string
  oppAbbr: string
  color: string
  throws: 'L' | 'R'
  stats: PitcherCardStats | null
  last3: PitcherGameLog[]
  arsenal: RichArsenalPitch[]
  hotZones: Record<string, PitcherHotZones>
  levelLabel: string | null   // e.g. 'AAA' when the pitcher's numbers are minor-league; null = MLB
}

export type CardBatter = {
  id: number
  name: string
  abbr: string
  color: string
  batSide: 'L' | 'R' | 'S' | null
  position: string | null
  season: BatterSeasonStats | null
}

export type CardOverlay = {
  pitchName: string
  metric: ZoneMetric
  pitch: BatterArsenalPitch | null      // null = no zone data for this batter/pitch
  splitLabel: string                    // 'vs RHP' / 'vs LHP' / 'all pitchers'
  stands: 'L' | 'R' | null              // side he bats from in THIS matchup; null = unknown (no in/away shown)
}

export type ScoutGraphicCardProps = {
  dateLabel: string
  awayTeamId: number
  homeTeamId: number
  awayAbbr: string
  homeAbbr: string
  venueName: string
  pitcher: CardPitcher
  batter: CardBatter | null
  overlay: CardOverlay | null
  read: string
  showArsenal: boolean
  showForm: boolean
  h2h: BatterVsPitcher | null           // null when toggled off OR no data
  venue: BatterVenueRecordRow | null    // null when toggled off OR no data
}

export const cardCss = `
.sg{width:1080px;height:1350px;background:${C.cream};padding:30px 34px 26px;display:flex;flex-direction:column;gap:14px;font-family:${SANS};color:${C.ink};box-sizing:border-box;overflow:hidden}
.sg *{box-sizing:border-box}
.sg .sg-mono{font-family:${MONO}}
.sg .sg-head{display:flex;align-items:center;justify-content:space-between}
.sg .sg-brand{display:flex;align-items:baseline;gap:10px}
.sg .sg-brand .sg-mk{color:${C.orange};font-size:26px;font-weight:800;line-height:1}
.sg .sg-brand .sg-nm{font-size:26px;font-weight:800;letter-spacing:-.02em}
.sg .sg-brand .sg-kick{font-family:${MONO};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.faint}}
.sg .sg-logos{display:flex;align-items:center;gap:14px}
.sg .sg-logos img{width:54px;height:54px;object-fit:contain}
.sg .sg-logos .sg-at{font-family:${MONO};font-size:13px;color:${C.faint}}
.sg .sg-sec{background:${C.card};border:1px solid ${C.line};border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.sg .sg-sec.sg-grow{flex:1;min-height:0}
.sg .sg-sechead{display:flex;align-items:center;gap:10px;padding:12px 20px 11px;border-bottom:1px solid ${C.soft}}
.sg .sg-sechead .sg-no{font-family:${MONO};font-size:12px;color:${C.orange};letter-spacing:.1em}
.sg .sg-sechead h2{margin:0;font-size:15px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.sg .sg-sechead .sg-tag{margin-left:auto;font-family:${MONO};font-size:10.5px;color:${C.faint}}
.sg .sg-mound{padding:16px 20px 18px;display:flex;flex-direction:column;flex:1;min-height:0}
.sg .sg-mtop{display:flex;gap:20px;align-items:center}
.sg .sg-shot{border-radius:50%;object-fit:cover;background:${C.soft};flex:0 0 auto}
.sg .sg-who .sg-nm{font-size:44px;font-weight:800;letter-spacing:-.025em;line-height:1}
.sg .sg-who .sg-meta{font-family:${MONO};font-size:13px;color:${C.mute};margin-top:6px;letter-spacing:.06em}
.sg .sg-form{margin-left:auto;text-align:right}
.sg .sg-form .sg-lab{font-family:${MONO};font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${C.faint}}
.sg .sg-form .sg-row{display:flex;gap:12px;margin-top:6px}
.sg .sg-form .sg-g{text-align:center}
.sg .sg-form .sg-g b{display:block;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.sg .sg-form .sg-g span{font-family:${MONO};font-size:9px;color:${C.faint}}
.sg .sg-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}
.sg .sg-tile{background:${C.soft};border-radius:10px;padding:10px 12px}
.sg .sg-tile .sg-l{font-family:${MONO};font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${C.faint}}
.sg .sg-tile .sg-v{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}
.sg .sg-lower{display:grid;gap:22px;margin-top:14px;flex:1;min-height:0;align-items:center}
.sg .sg-lower.sg-two{display:flex;flex-direction:column;justify-content:space-evenly;align-items:stretch;gap:0}
.sg .sg-arsenal{display:flex;flex-direction:column;gap:7px}
.sg .sg-arsenal.sg-roomy{gap:30px}
.sg .sg-ar{display:grid;grid-template-columns:132px 1fr 208px;align-items:center;gap:12px}
.sg .sg-arsenal.sg-roomy .sg-ar{grid-template-columns:132px 1fr 208px;gap:10px 12px}
.sg .sg-ar .sg-pn{font-size:14px;font-weight:700}
.sg .sg-ar .sg-bar{height:16px;background:${C.soft};border-radius:999px;overflow:hidden}
.sg .sg-arsenal.sg-roomy .sg-ar .sg-bar{height:22px}
.sg .sg-ar .sg-bar i{display:block;height:100%;border-radius:999px}
.sg .sg-ar .sg-num{font-family:${MONO};font-size:11px;color:${C.mute};text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sg .sg-arsenal.sg-roomy .sg-ar .sg-num{}
.sg .sg-ar .sg-num b{font-family:${SANS};font-weight:800;color:${C.ink}}
.sg .sg-mu{padding:18px 20px;display:grid;grid-template-columns:1fr calc(var(--z,344px) + 70px);gap:20px;flex:1;min-height:0;align-items:center}
.sg .sg-mu-left{display:flex;flex-direction:column}
.sg .sg-bat{display:flex;gap:14px;align-items:center}
.sg .sg-bat .sg-nm{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.05}
.sg .sg-bat .sg-meta{font-family:${MONO};font-size:11.5px;color:${C.mute};margin-top:4px}
.sg .sg-vsline{font-family:${MONO};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${C.faint};margin:16px 0 8px}
.sg .sg-pline{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sg .sg-pline .sg-t{background:${C.soft};border-radius:10px;padding:9px 10px}
.sg .sg-pline .sg-t .sg-l{font-family:${MONO};font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:${C.faint}}
.sg .sg-pline .sg-t .sg-v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.sg .sg-read{margin-top:16px;background:#FFF6F2;border:1px solid #ffd9cc;border-radius:12px;padding:13px 15px}
.sg .sg-read .sg-l{font-family:${MONO};font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:${C.orange};margin-bottom:5px}
.sg .sg-read p{margin:0;font-size:14.5px;line-height:1.45;color:#3d372e}
.sg .sg-read b{font-weight:800}
.sg .sg-zwrap{display:flex;flex-direction:column;align-items:center}
.sg .sg-zlab{font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.faint};margin-bottom:10px;text-align:center}
.sg .sg-zlab b{font-family:${SANS};font-weight:800;color:${C.ink};letter-spacing:0;text-transform:none;font-size:13px}
.sg .sg-zone{position:relative;width:var(--z,344px);height:var(--z,344px);border-radius:12px;overflow:hidden}
.sg .sg-chase{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.sg .sg-chase>div{display:flex;flex-direction:column;padding:10px;border:1px solid rgba(255,255,255,.35)}
.sg .sg-core{position:absolute;top:calc(var(--z,344px) * .1628);left:calc(var(--z,344px) * .1628);width:calc(var(--z,344px) * .6744);height:calc(var(--z,344px) * .6744);display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:4px}
.sg .sg-core>div{border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.5)}
.sg .sg-zv{font-size:calc(var(--z,344px) * .0436);font-weight:800;font-variant-numeric:tabular-nums;color:rgba(26,26,26,.85)}
.sg .sg-chase .sg-zv{font-size:calc(var(--z,344px) * .0349)}
.sg .sg-zn{font-family:${MONO};font-size:calc(var(--z,344px) * .0247);color:rgba(26,26,26,.5)}
.sg .sg-zdir{width:var(--z,344px);display:flex;justify-content:space-between;margin-top:8px;padding:0 4px;font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.mute}}
.sg .sg-zdir b{font-family:${SANS};font-weight:800;color:${C.ink}}
.sg .sg-zkey{display:flex;align-items:center;gap:6px;margin-top:8px;font-family:${MONO};font-size:9px;color:${C.faint}}
.sg .sg-zkey i{width:22px;height:9px;border-radius:2px;display:block}
.sg .sg-zfoot{font-family:${MONO};font-size:9.5px;color:${C.faint};margin-top:8px;text-align:center}
.sg .sg-mods{display:grid;gap:16px}
.sg .sg-mods.sg-two{grid-template-columns:1fr 1fr}
.sg .sg-mod .sg-body{padding:16px 20px 18px}
.sg .sg-mod .sg-headline{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.sg .sg-mod .sg-headline .sg-big{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sg .sg-mod .sg-headline .sg-cap{font-family:${MONO};font-size:10.5px;color:${C.mute}}
.sg .sg-mod .sg-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.sg .sg-mod .sg-grid .sg-t{background:${C.soft};border-radius:9px;padding:8px 6px;text-align:center}
.sg .sg-mod .sg-grid .sg-t .sg-l{font-family:${MONO};font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:${C.faint}}
.sg .sg-mod .sg-grid .sg-t .sg-v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.sg .sg-mod .sg-note{font-family:${MONO};font-size:9.5px;color:${C.faint};margin-top:10px;line-height:1.4}
.sg .sg-empty{padding:22px 20px;text-align:center;font-family:${MONO};font-size:11px;color:${C.faint}}
.sg .sg-foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding-top:4px}
.sg .sg-foot .sg-src{font-family:${MONO};font-size:9.5px;color:${C.faint};line-height:1.5;max-width:700px}
.sg .sg-foot .sg-cta{text-align:right}
.sg .sg-foot .sg-cta .sg-l{font-family:${MONO};font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${C.faint}}
.sg .sg-foot .sg-cta .sg-u{font-size:17px;font-weight:800;color:${C.orange}}
`

const fmt2 = (v: number | null | undefined) => (v != null ? v.toFixed(2) : '—')
const fmt1 = (v: number | null | undefined) => (v != null ? v.toFixed(1) : '—')

function RichText({ text }: { text: string }) {
  // **bold** markers only — the read is plain text authored by George/the draft.
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return <>{parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>
}

const CHASE_STYLE: Record<string, React.CSSProperties> = {
  '11': { alignItems: 'flex-start', justifyContent: 'flex-start' },
  '12': { alignItems: 'flex-end', justifyContent: 'flex-start' },
  '13': { alignItems: 'flex-start', justifyContent: 'flex-end' },
  '14': { alignItems: 'flex-end', justifyContent: 'flex-end' },
}

export type Cell = { value: string; sub: string; bg: string; fade: number }   // fade: 1 = full strength, lower = thinner sample

export function ZoneGridView({ cells }: { cells: Record<string, Cell | null> }) {
  const one = (k: string) => {
    const c = cells[k]
    return (
      <div key={k} style={{ background: c?.bg ?? '#f5f3ee', opacity: c?.fade ?? 1, ...(CHASE_STYLE[k] ?? {}) }}>
        <span className="sg-zv">{c?.value ?? '—'}</span>
        <span className="sg-zn">{c?.sub ?? ''}</span>
      </div>
    )
  }
  return (
    <div className="sg-zone">
      <div className="sg-chase">{['11', '12', '13', '14'].map(one)}</div>
      <div className="sg-core">{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(one)}</div>
    </div>
  )
}

const ScoutGraphicCard = forwardRef<HTMLDivElement, ScoutGraphicCardProps>(function ScoutGraphicCard(props, ref) {
  const { pitcher, batter, overlay } = props
  const hasBatter = batter != null && overlay != null

  const topPitches = [...pitcher.arsenal]
    .filter(p => (p.percentage ?? 0) >= 5)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
    .slice(0, 4)
  const maxPct = Math.max(1, ...topPitches.map(p => p.percentage ?? 0))

  // Pitcher's own zone-usage grid (default, no-batter view).
  const pz = pitcher.hotZones['all']?.zones ?? {}
  const pitcherCells: Record<string, Cell | null> = {}
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14']) {
    const u = pz[k]?.usage_pct
    if (u == null) { pitcherCells[k] = null; continue }
    pitcherCells[k] = { value: `${u.toFixed(0)}%`, sub: '', bg: heatColor(Math.min(u, 16) / 16), fade: 1 }
  }
  const hasPitcherZones = Object.values(pitcherCells).some(c => c != null)

  // Batter overlay cells.
  const batterCells: Record<string, Cell | null> = {}
  if (overlay?.pitch) {
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14']) {
      const cell = overlay.pitch.zones[k]
      const value = cell ? cell[overlay.metric] : null
      const n = cellSample(cell, overlay.metric)
      if (!cell || value == null) { batterCells[k] = null; continue }
      batterCells[k] = {
        value: fmtMetric(value, overlay.metric),
        sub: `n=${n}`,
        bg: zoneColor(value, overlay.metric),   // always coloured; a thin sample is shown faded, not blanked
        fade: n >= MIN_ZONE_SAMPLE ? 1 : n >= 3 ? 0.62 : 0.4,   // 1-2 AB barely registers
      }
    }
  }

  const modules = [props.h2h, props.venue].filter(Boolean).length
  // Give the zone grid the space the optional modules would have used.
  const zoneSize = modules === 0 ? 430 : modules === 1 ? 390 : 344
  const sources = [
    `Zone grids: Baseball Savant pitch-level data, ${new Date().getFullYear()} season, catcher's view.`,
    pitcher.levelLabel
      ? `Pitcher numbers are ${new Date().getFullYear()} minor-league (${pitcher.levelLabel}) — MLB Stats API and Savant minors; not MLB stats.`
      : 'Arsenal usage and velocity: Statcast pitch arsenals.',
    props.h2h || props.venue ? 'H2H and venue splits: MLB Stats API career logs.' : '',
    'Descriptions of what has happened — not forecasts.',
  ].filter(Boolean).join(' ')

  const b = batter
  const pitchStat = overlay?.pitch ?? null
  const batSideLabel = b?.batSide === 'S' ? `Switch (bats ${overlay?.stands ?? '?'} here)` : b?.batSide ? `${b.batSide}HB` : null
  const seasonLine = b?.season ? `${b.season.avg} / ${b.season.obp} / ${b.season.slg}` : null

  return (
    <div ref={ref} className="sg">
      <style>{cardCss}</style>

      <div className="sg-head">
        <div className="sg-brand">
          <span className="sg-mk">⊕</span>
          <span className="sg-nm">THE EDGE</span>
          <span className="sg-kick">Scout Report · {props.dateLabel}</span>
        </div>
        <div className="sg-logos">
          <img src={`https://www.mlbstatic.com/team-logos/${props.awayTeamId}.svg`} alt={props.awayAbbr} />
          <span className="sg-at">@</span>
          <img src={`https://www.mlbstatic.com/team-logos/${props.homeTeamId}.svg`} alt={props.homeAbbr} />
        </div>
      </div>

      {/* § 01 on the mound */}
      <div className={`sg-sec${hasBatter ? '' : ' sg-grow'}`}>
        <div className="sg-sechead"><span className="sg-no">§ 01</span><h2>On the mound</h2><span className="sg-tag">{pitcher.levelLabel ? `${new Date().getFullYear()} ${pitcher.levelLabel} · no MLB starts yet` : 'season to date'}</span></div>
        <div className="sg-mound">
          <div className="sg-mtop">
            <img className="sg-shot" width={116} height={116} style={{ width: 116, height: 116, border: `4px solid ${pitcher.color}` }}
              src={playerHeadshotUrl(pitcher.id, 240)} alt="" />
            <div className="sg-who">
              <div className="sg-nm">{pitcher.name}</div>
              <div className="sg-meta">{pitcher.abbr} · {pitcher.throws}HP · vs {pitcher.oppAbbr}</div>
            </div>
            {props.showForm && (
              <div className="sg-form">
                <div className="sg-lab">Last 3 starts</div>
                {pitcher.last3.length > 0 ? (
                  <div className="sg-row">
                    {pitcher.last3.slice(0, 3).map((s, i) => (
                      <div className="sg-g" key={i}><b>{s.ip}</b><span>IP · {s.er}ER</span></div>
                    ))}
                  </div>
                ) : (
                  <div className="sg-row"><span className="sg-mono" style={{ fontSize: 11, color: C.faint }}>no starts yet</span></div>
                )}
              </div>
            )}
          </div>

          <div className="sg-tiles">
            <div className="sg-tile"><div className="sg-l">ERA</div><div className="sg-v">{fmt2(pitcher.stats?.era)}</div></div>
            <div className="sg-tile"><div className="sg-l">WHIP</div><div className="sg-v">{fmt2(pitcher.stats?.whip)}</div></div>
            <div className="sg-tile"><div className="sg-l">K/9</div><div className="sg-v">{fmt1(pitcher.stats?.k_per_9)}</div></div>
            <div className="sg-tile"><div className="sg-l">BB/9</div><div className="sg-v">{fmt1(pitcher.stats?.bb_per_9)}</div></div>
            <div className="sg-tile"><div className="sg-l">L3 ERA</div><div className="sg-v">{fmt2(pitcher.stats?.l3_era)}</div></div>
          </div>

          {(props.showArsenal || !hasBatter) && (
            <div className={`sg-lower${hasBatter ? '' : ' sg-two'}`}>
              {props.showArsenal ? (
                topPitches.length > 0 ? (
                  <div className={`sg-arsenal${hasBatter ? '' : ' sg-roomy'}`}>
                    {topPitches.map((p, i) => {
                      const pct = p.percentage ?? 0
                      return (
                        <div className="sg-ar" key={p.pitch_type}>
                          <span className="sg-pn">{p.pitch_name ?? p.pitch_type}</span>
                          <span className="sg-bar"><i style={{ width: `${(pct / maxPct) * 100}%`, background: pitcher.color, opacity: 1 - i * 0.2 }} /></span>
                          <span className="sg-num">
                            <b>{pct.toFixed(0)}%</b>
                            {p.avg_velocity != null ? ` · ${p.avg_velocity.toFixed(1)} mph` : ''}
                            {p.whiff_percent != null ? ` · ${p.whiff_percent.toFixed(0)}% whiff` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="sg-empty">Arsenal data not yet available.</div>
                )
              ) : <div />}

              {!hasBatter && (
                <div className="sg-zwrap" style={{ ['--z' as string]: '420px' }}>
                  <div className="sg-zlab"><b>Where {pitcher.name.split(' ').slice(-1)[0]} lives</b><br />% of pitches by zone · catcher&apos;s view</div>
                  {hasPitcherZones ? <ZoneGridView cells={pitcherCells} /> : <div className="sg-empty">Zone data not yet available.</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* § 02 key matchup */}
      {hasBatter && b && overlay && (
        <div className="sg-sec sg-grow">
          <div className="sg-sechead">
            <span className="sg-no">§ 02</span><h2>Key matchup</h2>
            <span className="sg-tag">{pitcher.name.split(' ').slice(-1)[0]} vs {b.name.split(' ').slice(-1)[0]} · {overlay.pitchName} · {overlay.splitLabel}</span>
          </div>
          <div className="sg-mu" style={{ ['--z' as string]: `${zoneSize}px` }}>
            <div className="sg-mu-left">
              <div className="sg-bat">
                <img className="sg-shot" width={96} height={96} style={{ width: 96, height: 96, border: `4px solid ${b.color}` }} src={playerHeadshotUrl(b.id, 240)} alt="" />
                <div>
                  <div className="sg-nm">{b.name}</div>
                  <div className="sg-meta">{[b.abbr, batSideLabel, b.position, seasonLine].filter(Boolean).join(' · ')}</div>
                </div>
              </div>

              <div className="sg-vsline">vs the {overlay.pitchName}, this season</div>
              {pitchStat ? (
                <div className="sg-pline">
                  <div className="sg-t"><div className="sg-l">AVG</div><div className="sg-v">{fmtMetric(pitchStat.ba, 'ba')}</div></div>
                  <div className="sg-t"><div className="sg-l">SLG</div><div className="sg-v">{fmtMetric(pitchStat.slg, 'slg')}</div></div>
                  <div className="sg-t"><div className="sg-l">xwOBA</div><div className="sg-v">{fmtMetric(pitchStat.xwoba, 'xwoba')}</div></div>
                  <div className="sg-t"><div className="sg-l">Whiff</div><div className="sg-v">{fmtMetric(pitchStat.whiff_pct, 'whiff_pct')}</div></div>
                </div>
              ) : (
                <div className="sg-empty" style={{ textAlign: 'left', padding: '4px 0' }}>{b.name} hasn&apos;t seen enough {overlay.pitchName}s to show a line.</div>
              )}

              {props.read.trim() && (
                <div className="sg-read">
                  <div className="sg-l">The read</div>
                  <p><RichText text={props.read} /></p>
                </div>
              )}
            </div>

            <div className="sg-zwrap">
              <div className="sg-zlab"><b>{b.name.split(' ').slice(-1)[0]} · {METRIC_LABELS[overlay.metric]} vs {overlay.pitchName}</b><br />13 zones · catcher&apos;s view{overlay.stands ? ` · bats ${overlay.stands === 'R' ? 'right' : 'left'}` : ''} · {new Date().getFullYear()}</div>
              {overlay.pitch ? (
                <>
                  <ZoneGridView cells={batterCells} />
                  {overlay.stands && (
                    <div className="sg-zdir">
                      {overlay.stands === 'R' ? <><span>◀ <b>Inside</b></span><span><b>Away</b> ▶</span></> : <><span>◀ <b>Away</b></span><span><b>Inside</b> ▶</span></>}
                    </div>
                  )}
                  <div className="sg-zkey">
                    <i style={{ background: zoneColor(overlay.metric === 'whiff_pct' ? 15 : 0.2, overlay.metric) }} /> lower
                    <i style={{ background: C.soft }} />
                    <i style={{ background: zoneColor(overlay.metric === 'whiff_pct' ? 40 : 0.6, overlay.metric) }} /> higher
                  </div>
                  <div className="sg-zfoot">n = {overlay.metric === 'whiff_pct' ? 'swings' : 'at-bats'} in the zone · faded = under {MIN_ZONE_SAMPLE}</div>
                </>
              ) : (
                <div className="sg-empty">Zone-by-pitch data not yet available for {b.name}.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* § 03 / § 04 optional modules */}
      {modules > 0 && (
        <div className={`sg-mods${modules === 2 ? ' sg-two' : ''}`}>
          {props.h2h && (
            <div className="sg-sec sg-mod">
              <div className="sg-sechead"><span className="sg-no">§ 03</span><h2>Career H2H</h2></div>
              <div className="sg-body">
                <div className="sg-headline">
                  <span className="sg-big">{props.h2h.hits}-for-{props.h2h.ab}</span>
                  <span className="sg-cap">{props.h2h.avg} / {props.h2h.obp} / {props.h2h.slg} · {props.h2h.strikeouts} K</span>
                </div>
                <div className="sg-grid">
                  <div className="sg-t"><div className="sg-l">AB</div><div className="sg-v">{props.h2h.ab}</div></div>
                  <div className="sg-t"><div className="sg-l">H</div><div className="sg-v">{props.h2h.hits}</div></div>
                  <div className="sg-t"><div className="sg-l">HR</div><div className="sg-v">{props.h2h.home_runs}</div></div>
                  <div className="sg-t"><div className="sg-l">BB</div><div className="sg-v">{props.h2h.walks}</div></div>
                  <div className="sg-t"><div className="sg-l">K</div><div className="sg-v">{props.h2h.strikeouts}</div></div>
                </div>
                {props.h2h.ab < 25 && (
                  <p className="sg-note">{props.h2h.ab} career AB — a note, not a trend. A sample this small moves nothing on its own.</p>
                )}
              </div>
            </div>
          )}
          {props.venue && (
            <div className="sg-sec sg-mod">
              <div className="sg-sechead"><span className="sg-no">{props.h2h ? '§ 04' : '§ 03'}</span><h2>At {props.venueName}</h2></div>
              <div className="sg-body">
                <div className="sg-headline">
                  <span className="sg-big">{props.venue.avg}</span>
                  <span className="sg-cap">{props.venue.ops} OPS · career</span>
                </div>
                <div className="sg-grid">
                  <div className="sg-t"><div className="sg-l">G</div><div className="sg-v">{props.venue.games}</div></div>
                  <div className="sg-t"><div className="sg-l">AB</div><div className="sg-v">{props.venue.ab}</div></div>
                  <div className="sg-t"><div className="sg-l">H</div><div className="sg-v">{props.venue.hits}</div></div>
                  <div className="sg-t"><div className="sg-l">HR</div><div className="sg-v">{props.venue.hr}</div></div>
                  <div className="sg-t"><div className="sg-l">K</div><div className="sg-v">{props.venue.so}</div></div>
                </div>
                <p className="sg-note">Career game logs at this park, all seasons since debut.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sg-foot">
        <div className="sg-src">{sources}</div>
        <div className="sg-cta">
          <div className="sg-l">Full report</div>
          <div className="sg-u">edgereportdaily.com</div>
        </div>
      </div>
    </div>
  )
})

export default ScoutGraphicCard
