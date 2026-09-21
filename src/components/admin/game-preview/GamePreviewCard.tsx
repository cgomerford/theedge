'use client'

// src/components/admin/game-preview/GamePreviewCard.tsx
//
// The exported "Game Preview" X graphic — the two probable starters head to
// head. 1080 x 1350 (4:5), same shell, fonts and colours as the Scout Report
// Graphic (it reuses that card's stylesheet and zone grid), different content:
//
//   §  Starting pitchers  — name/hand + ERA, FIP, WHIP, K/9, BB/9, L3 ERA side
//                           by side; the better number on each row is shaded.
//                           (Descriptive — no percentages, no meters, no picks.)
//   §  Arsenal            — usage / velocity / whiff by pitch
//   §  Where they live    — % of pitches by zone (catcher's view)
//   §  Times through the order — wOBA allowed 1st/2nd/3rd time, with the PA behind it
//   plus last-3-starts chips and an editable read.
//
// Purely presentational. Every module renders an explicit empty state when its
// data is null — never a placeholder number.

import { forwardRef } from 'react'
import { playerHeadshotUrl } from '@/lib/mlb'
import { C, SANS, MONO } from '@/components/team/ui'
import { cardCss, ZoneGridView, type Cell, type CardPitcher } from '@/components/admin/scout-graphic/ScoutGraphicCard'
import { heatColor } from '@/components/admin/scout-graphic/zone-utils'
import { STAT_ROWS, betterSide, statValue } from './preview-utils'

/** `bottom` is ONE lower module (or none) — zone grids and times-through-order together don't fit a 4:5 card. */
export type GamePreviewShow = { arsenal: boolean; last3: boolean; bottom: 'zones' | 'tto' | 'none' }

/** The card is a fixed 4:5 canvas; the builder compares content height against this. */
export const PREVIEW_CARD_HEIGHT = 1350

export type GamePreviewCardProps = {
  dateLabel: string
  awayTeamId: number
  homeTeamId: number
  awayAbbr: string
  homeAbbr: string
  venueName: string
  firstPitch: string
  away: CardPitcher
  home: CardPitcher
  read: string
  show: GamePreviewShow
}

const gpCss = `
.sg.sg-gp{gap:12px}
.sg.sg-gp .sg-sec{flex-shrink:0}
.sg.sg-gp .sg-sec.sg-grow{flex:1 0 auto}
.sg .sg-cols{display:grid;grid-template-columns:1fr 1fr;gap:26px;padding:12px 20px 12px}
.sg.sg-gp .sg-sec.sg-grow .sg-cols{flex:1;align-content:center}
.sg .sg-vshead{display:grid;grid-template-columns:1fr 84px 1fr;align-items:center;padding:10px 20px 2px}
.sg .sg-vsp{display:flex;align-items:center;gap:14px;min-width:0}
.sg .sg-vsp.sg-r{flex-direction:row-reverse;text-align:right}
.sg .sg-vsp .sg-nm{font-size:32px;font-weight:800;letter-spacing:-.025em;line-height:1.02}
.sg .sg-vsp .sg-meta{font-family:${MONO};font-size:11.5px;color:${C.mute};margin-top:5px;letter-spacing:.06em}
.sg .sg-vsmid{text-align:center;font-family:${MONO};font-size:11px;letter-spacing:.2em;color:${C.faint}}
.sg .sg-vsrow{display:grid;grid-template-columns:1fr 104px 1fr;align-items:center;padding:0 20px}
.sg .sg-vsrow .sg-lab{text-align:center;font-family:${MONO};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${C.faint}}
.sg .sg-vsrow .sg-cell{display:flex;padding:2px 0}
.sg .sg-vsrow .sg-cell.sg-l{justify-content:flex-end}
.sg .sg-vsrow .sg-cell.sg-rr{justify-content:flex-start}
.sg .sg-vsrow .sg-pill{min-width:132px;text-align:center;font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;padding:2px 12px;border-radius:10px;color:${C.ink}}
.sg .sg-vsrow .sg-pill.sg-dim{color:${C.mute};font-weight:700}
.sg .sg-chips{display:flex;gap:8px;justify-content:center}
.sg .sg-chip{background:${C.soft};border-radius:8px;padding:5px 10px;font-family:${MONO};font-size:11px;color:${C.mute};white-space:nowrap}
.sg .sg-chip b{font-family:${SANS};font-weight:800;color:${C.ink};font-size:15px}
.sg .sg-colhead{font-size:17px;font-weight:800;letter-spacing:-.01em;margin-bottom:10px;display:flex;align-items:baseline;gap:8px}
.sg .sg-colhead span{font-family:${MONO};font-weight:400;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.faint}}
.sg .sg-gar{display:grid;grid-template-columns:100px 1fr 42px;align-items:center;gap:10px;margin-bottom:2px}
.sg .sg-gar .sg-pn{font-size:13px;font-weight:700}
.sg .sg-gar .sg-bar{height:14px;background:${C.soft};border-radius:999px;overflow:hidden}
.sg .sg-gar .sg-bar i{display:block;height:100%;border-radius:999px}
.sg .sg-gar .sg-pc{font-size:14px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums}
.sg .sg-gsub{font-family:${MONO};font-size:9.5px;color:${C.faint};margin:0 0 5px 110px;min-height:12px}
.sg .sg-ttorow{display:grid;grid-template-columns:34px 1fr 50px 52px;align-items:center;gap:10px;margin-bottom:9px}
.sg .sg-ttorow .sg-pn{font-family:${MONO};font-size:10px;letter-spacing:.1em;color:${C.faint}}
.sg .sg-ttorow .sg-bar{height:14px;background:${C.soft};border-radius:999px;overflow:hidden}
.sg .sg-ttorow .sg-bar i{display:block;height:100%;border-radius:999px}
.sg .sg-ttorow .sg-pc{font-size:15px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums}
.sg .sg-ttorow .sg-n{font-family:${MONO};font-size:9.5px;color:${C.faint};text-align:right}
`

const CELL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14']

function usageCells(p: CardPitcher): { cells: Record<string, Cell | null>; any: boolean } {
  const zones = p.hotZones['all']?.zones ?? {}
  const cells: Record<string, Cell | null> = {}
  for (const k of CELL_KEYS) {
    const u = zones[k]?.usage_pct
    cells[k] = u == null ? null : { value: `${u.toFixed(0)}%`, sub: '', bg: heatColor(Math.min(u, 16) / 16), fade: 1 }
  }
  return { cells, any: Object.values(cells).some(c => c != null) }
}

const fmt = (v: number | null, digits: number) => (v == null ? '—' : v.toFixed(digits))
const last = (n: string) => n.trim().split(' ').slice(-1)[0]

function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return <>{parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>
}

function PitcherHead({ p, right }: { p: CardPitcher; right?: boolean }) {
  return (
    <div className={`sg-vsp${right ? ' sg-r' : ''}`}>
      <img className="sg-shot" width={72} height={72} style={{ width: 72, height: 72, border: `4px solid ${p.color}` }} src={playerHeadshotUrl(p.id, 240)} alt="" />
      <div style={{ minWidth: 0 }}>
        <div className="sg-nm">{p.name}</div>
        <div className="sg-meta">{p.abbr} · {p.throws}HP{p.levelLabel ? ` · ${p.levelLabel}` : ''}</div>
      </div>
    </div>
  )
}

function ArsenalCol({ p }: { p: CardPitcher }) {
  const top = [...p.arsenal].filter(x => (x.percentage ?? 0) >= 5).sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)).slice(0, 4)
  const max = Math.max(1, ...top.map(x => x.percentage ?? 0))
  return (
    <div>
      <div className="sg-colhead">{last(p.name)} <span>usage · velo · whiff</span></div>
      {top.length === 0 ? <div className="sg-empty" style={{ padding: '10px 0', textAlign: 'left' }}>Arsenal not yet available.</div> : top.map((x, i) => (
        <div key={x.pitch_type}>
          <div className="sg-gar">
            <span className="sg-pn">{x.pitch_name ?? x.pitch_type}</span>
            <span className="sg-bar"><i style={{ width: `${((x.percentage ?? 0) / max) * 100}%`, background: p.color, opacity: 1 - i * 0.2 }} /></span>
            <span className="sg-pc">{(x.percentage ?? 0).toFixed(0)}%</span>
          </div>
          <div className="sg-gsub">
            {x.avg_velocity != null ? `${x.avg_velocity.toFixed(1)} mph` : ''}{x.whiff_percent != null ? ` · ${x.whiff_percent.toFixed(0)}% whiff` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

function TtoCol({ p }: { p: CardPitcher }) {
  const tto = p.stats?.tto ?? null
  const labels = ['1st', '2nd', '3rd']
  return (
    <div>
      <div className="sg-colhead">{last(p.name)} <span>wOBA allowed</span></div>
      {!tto ? <div className="sg-empty" style={{ padding: '10px 0', textAlign: 'left' }}>Times-through-order split not yet available.</div> : labels.map((l, i) => {
        const w = tto.woba[i]
        const pa = tto.pa[i]
        // .200 -> .450 wOBA maps to an empty -> full bar; the number itself is always shown.
        const width = w == null ? 0 : Math.max(4, Math.min(100, ((w - 0.2) / 0.25) * 100))
        return (
          <div className="sg-ttorow" key={l}>
            <span className="sg-pn">{l}</span>
            <span className="sg-bar"><i style={{ width: `${width}%`, background: p.color, opacity: 0.85 }} /></span>
            <span className="sg-pc">{w == null ? '—' : w.toFixed(3).replace(/^0/, '')}</span>
            <span className="sg-n">{pa != null ? `${pa} PA` : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

const GamePreviewCard = forwardRef<HTMLDivElement, GamePreviewCardProps>(function GamePreviewCard(props, ref) {
  const { away, home, show } = props
  const az = usageCells(away)
  const hz = usageCells(home)

  // The last visible module stretches to fill the card so a trimmed-down graphic isn't half empty.
  const growKey = show.bottom !== 'none' ? show.bottom : show.arsenal ? 'arsenal' : 'stats'
  let n = 0
  const no = () => `§ ${String(++n).padStart(2, '0')}`

  const zoneSize = 222
  const sources = [
    'Season lines: MLB Stats API and Baseball Savant.',
    show.arsenal ? 'Arsenal: Statcast pitch arsenals.' : '',
    show.bottom === 'zones' ? "Zones: Baseball Savant pitch-level data, catcher's view." : '',
    show.bottom === 'tto' ? 'Times through the order: MLB Stats API play-by-play.' : '',
    away.levelLabel || home.levelLabel ? `Minor-league numbers (${[away.levelLabel && `${last(away.name)}: ${away.levelLabel}`, home.levelLabel && `${last(home.name)}: ${home.levelLabel}`].filter(Boolean).join(', ')}) are not MLB stats.` : '',
    'Shaded = better number on that stat. Descriptions of what has happened — not forecasts.',
  ].filter(Boolean).join(' ')

  return (
    <div ref={ref} className="sg sg-gp">
      <style>{cardCss + gpCss}</style>

      <div className="sg-head">
        <div className="sg-brand">
          <span className="sg-mk">⊕</span>
          <span className="sg-nm">THE EDGE</span>
          <span className="sg-kick">Game Preview · {props.dateLabel}</span>
        </div>
        <div className="sg-logos">
          <img src={`https://www.mlbstatic.com/team-logos/${props.awayTeamId}.svg`} alt={props.awayAbbr} />
          <span className="sg-at">@</span>
          <img src={`https://www.mlbstatic.com/team-logos/${props.homeTeamId}.svg`} alt={props.homeAbbr} />
        </div>
      </div>

      {/* Starting pitchers head to head */}
      <div className={`sg-sec${growKey === 'stats' ? ' sg-grow' : ''}`}>
        <div className="sg-sechead">
          <span className="sg-no">{no()}</span><h2>Starting pitchers</h2>
          <span className="sg-tag">{[props.venueName, props.firstPitch].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="sg-vshead">
          <PitcherHead p={away} />
          <div className="sg-vsmid">VS</div>
          <PitcherHead p={home} right />
        </div>
        <div style={{ padding: '6px 0 14px' }}>
          {STAT_ROWS.map(r => {
            const av = statValue(away.stats, r.key)
            const hv = statValue(home.stats, r.key)
            const side = betterSide(av, hv, r.lowerIsBetter, r.digits)
            return (
              <div className="sg-vsrow" key={r.key}>
                <div className="sg-cell sg-l"><span className={`sg-pill${av == null ? ' sg-dim' : ''}`} style={side === 'away' ? { background: `${away.color}26` } : undefined}>{fmt(av, r.digits)}</span></div>
                <div className="sg-lab">{r.label}</div>
                <div className="sg-cell sg-rr"><span className={`sg-pill${hv == null ? ' sg-dim' : ''}`} style={side === 'home' ? { background: `${home.color}26` } : undefined}>{fmt(hv, r.digits)}</span></div>
              </div>
            )
          })}
          {show.last3 && (
            <div className="sg-vsrow" style={{ marginTop: 6 }}>
              {[away, home].map((p, i) => (
                <div key={p.id} style={{ gridColumn: i === 0 ? 1 : 3, gridRow: 1 }}>
                  <div className="sg-chips" style={{ justifyContent: i === 0 ? 'flex-end' : 'flex-start' }}>
                    {p.last3.length === 0 ? <span className="sg-chip">no starts yet</span> : p.last3.slice(0, 3).map((s, j) => (
                      <span className="sg-chip" key={j}><b>{s.ip}</b> IP · {s.er} ER</span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="sg-lab" style={{ gridColumn: 2, gridRow: 1 }}>Last 3</div>
            </div>
          )}
        </div>
      </div>

      {show.arsenal && (
        <div className={`sg-sec${growKey === 'arsenal' ? ' sg-grow' : ''}`}>
          <div className="sg-sechead"><span className="sg-no">{no()}</span><h2>Arsenal</h2><span className="sg-tag">what each one throws</span></div>
          <div className="sg-cols"><ArsenalCol p={away} /><ArsenalCol p={home} /></div>
        </div>
      )}

      {show.bottom === 'zones' && (
        <div className="sg-sec sg-grow">
          <div className="sg-sechead"><span className="sg-no">{no()}</span><h2>Where they live</h2><span className="sg-tag">% of pitches by zone · catcher&apos;s view</span></div>
          <div className="sg-cols" style={{ ['--z' as string]: `${zoneSize}px` }}>
            {[{ p: away, z: az }, { p: home, z: hz }].map(({ p, z }) => (
              <div key={p.id} className="sg-zwrap">
                <div className="sg-zlab"><b>{last(p.name)}</b></div>
                {z.any ? <ZoneGridView cells={z.cells} /> : <div className="sg-empty">Zone data not yet available.</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {show.bottom === 'tto' && (
        <div className={`sg-sec${growKey === 'tto' ? ' sg-grow' : ''}`}>
          <div className="sg-sechead"><span className="sg-no">{no()}</span><h2>Times through the order</h2><span className="sg-tag">lower wOBA = tougher on hitters</span></div>
          <div className="sg-cols"><TtoCol p={away} /><TtoCol p={home} /></div>
        </div>
      )}

      {props.read.trim() && (
        <div className="sg-read" style={{ marginTop: 0 }}>
          <div className="sg-l">The read</div>
          <p><RichText text={props.read} /></p>
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

export default GamePreviewCard
