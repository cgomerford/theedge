'use client'

// src/components/admin/InGameBatterCard.tsx
//
// The live-game batter X graphic — same 1080x1350 (4:5) canvas/stylesheet as
// InGamePitcherCard/ScoutGraphicCard/GamePreviewCard (imports the shared
// cardCss). Box score + exit-velo come from the same live-feed-driven
// helpers as the postgame report (batterExitVeloSummary). Hard-hit/barrel
// counts reuse isBarrel/HARD_HIT_MPH from postgame/contact.ts rather than
// re-deriving the barrel formula. The spray chart is a fresh inline field
// diagram (not the Tailwind-styled PostGameSprayChart) so it sits visually
// inside the same cream/orange system as the rest of the card.

import { forwardRef } from 'react'
import type { BatterGameLine, BattedBallRecord, PitchRecord } from '@/types/postgame'
import type { GameInfo } from '@/lib/postgame'
import { batterExitVeloSummary } from '@/lib/postgame-batter-adapt'
import { isBarrel, HARD_HIT_MPH } from '@/lib/postgame/contact'
import { playerHeadshotUrl } from '@/lib/mlb'
import type { BatterSeasonStats, BatterStatcast } from '@/lib/batter-stats'
import { C, MONO } from '@/components/team/ui'
import { cardCss, ZoneGridView, type Cell } from '@/components/admin/scout-graphic/ScoutGraphicCard'
import { heatColor } from '@/components/admin/scout-graphic/zone-utils'

export type InGameBatterCardProps = {
  dateLabel: string
  awayTeamId: number
  homeTeamId: number
  batter: BatterGameLine
  battedBalls: BattedBallRecord[]
  pitchLog: PitchRecord[]
  teamColor: string
  teamAbbr: string
  opponentAbbr: string
  batSide?: 'L' | 'R' | 'S' | null
  gameInfo: GameInfo
  seasonStats: BatterSeasonStats | null
  statcast: BatterStatcast | null
  seasonLoading: boolean
}

const igCss = `
.sg.sg-ig .sg-tiles4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
.sg.sg-ig .sg-tiles4 + .sg-tiles4{margin-top:8px}
.sg.sg-ig .sg-live{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.bad}}
.sg.sg-ig .sg-live i{width:7px;height:7px;border-radius:50%;background:${C.bad};display:block}
.sg.sg-ig .sg-spray{display:flex;flex-direction:column;align-items:center}
.sg.sg-ig .sg-spray svg{width:260px;height:260px}
.sg.sg-ig .sg-spraylegend{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:6px}
.sg.sg-ig .sg-spraylegend .sg-lg{display:flex;align-items:center;gap:4px;font-family:${MONO};font-size:8.5px;color:${C.mute};text-transform:uppercase;letter-spacing:.05em}
.sg.sg-ig .sg-spraylegend i{width:8px;height:8px;border-radius:50%;display:block}
.sg.sg-ig .sg-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:14px 20px 16px;align-items:start}
.sg.sg-ig .sg-vslab{font-family:${MONO};font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${C.faint};margin-bottom:6px}
.sg.sg-ig .sg-vslab + .sg-grid{margin-bottom:14px}
`

const FIELD_SIZE = 250
const HOME_X = 125
const HOME_Y = 205

const OUTCOME_COLOR: Record<string, string> = {
  home_run: C.orange,
  triple: C.yellow,
  double: C.yellow,
  single: C.good,
}
function colorFor(outcome: string): string {
  const key = (outcome ?? '').toLowerCase().replace(/\s+/g, '_')
  return OUTCOME_COLOR[key] ?? C.faint
}

const ZONE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14']

const InGameBatterCard = forwardRef<HTMLDivElement, InGameBatterCardProps>(function InGameBatterCard(props, ref) {
  const { batter, battedBalls, pitchLog, teamColor, teamAbbr, opponentAbbr, batSide, gameInfo, seasonStats, statcast, seasonLoading } = props

  const evSummary = batterExitVeloSummary(battedBalls, batter.batterId)
  const batterBattedBalls = battedBalls.filter(b => b.batterId === batter.batterId)
  const measured = batterBattedBalls.filter((b): b is BattedBallRecord & { launchSpeed: number } => b.launchSpeed != null)
  const hardHitCount = measured.filter(b => b.launchSpeed >= HARD_HIT_MPH).length
  const barrelCount = measured.filter(b => b.launchAngle != null && isBarrel(b.launchSpeed, b.launchAngle)).length

  const sprayable = batterBattedBalls.filter((b): b is BattedBallRecord & { coordX: number; coordY: number } => b.coordX != null && b.coordY != null)

  // Pitch heat map — % of tonight's tracked pitches to this batter, by zone.
  // Density, not outcome: with a handful of PA per game, a result-based
  // metric per zone would mostly be n=1 noise, so this mirrors the pitcher's
  // own "where they live" usage grid instead.
  const batterPitches = pitchLog.filter(p => p.batterId === batter.batterId && p.zone != null)
  const zoneCounts = new Map<string, number>()
  for (const p of batterPitches) {
    const k = String(p.zone)
    zoneCounts.set(k, (zoneCounts.get(k) ?? 0) + 1)
  }
  const heatCells: Record<string, Cell | null> = {}
  for (const k of ZONE_KEYS) {
    const n = zoneCounts.get(k) ?? 0
    if (n === 0 || batterPitches.length === 0) { heatCells[k] = null; continue }
    const pct = (n / batterPitches.length) * 100
    heatCells[k] = { value: `${pct.toFixed(0)}%`, sub: `n=${n}`, bg: heatColor(Math.min(pct, 30) / 30), fade: 1 }
  }
  const hasHeat = Object.values(heatCells).some(c => c != null)

  const tonightLine = `${batter.hits}-${batter.atBats}`

  const sources = [
    'Box score and exit velocity: live MLB Gameday feed, this game.',
    `Barrel: exit velo ≥ 98 mph with a launch-angle window that widens with speed (Statcast's own definition, rebuilt from the feed).`,
    'Season line and Statcast averages: MLB Stats API and Baseball Savant, season to date.',
    'Descriptions of what has happened — not forecasts.',
  ].join(' ')

  return (
    <div ref={ref} className="sg sg-ig">
      <style>{cardCss + igCss}</style>

      <div className="sg-head">
        <div className="sg-brand">
          <span className="sg-mk">⊕</span>
          <span className="sg-nm">THE EDGE</span>
          <span className="sg-kick">In-Game · {props.dateLabel}</span>
        </div>
        <div className="sg-logos">
          <img src={`https://www.mlbstatic.com/team-logos/${props.awayTeamId}.svg`} alt="" />
          <span className="sg-at">@</span>
          <img src={`https://www.mlbstatic.com/team-logos/${props.homeTeamId}.svg`} alt="" />
        </div>
      </div>

      <div className="sg-sec">
        <div className="sg-sechead">
          <span className="sg-no">§ 01</span><h2>At the plate</h2>
          <span className="sg-tag">{gameInfo.venue ?? teamAbbr} · vs {opponentAbbr}</span>
        </div>
        <div className="sg-mound">
          <div className="sg-mtop">
            <img className="sg-shot" width={116} height={116} style={{ width: 116, height: 116, border: `4px solid ${teamColor}` }}
              src={playerHeadshotUrl(batter.batterId, 240)} alt="" />
            <div className="sg-who">
              <div className="sg-nm">{batter.batterName}</div>
              <div className="sg-meta">{teamAbbr}{batSide ? ` · ${batSide === 'S' ? 'Switch' : `${batSide}HB`}` : ''} · vs {opponentAbbr}</div>
              <div className="sg-live"><i />Live</div>
            </div>
          </div>

          <div className="sg-tiles4">
            {[['AB', batter.atBats], ['H', batter.hits], ['R', batter.runsScored], ['RBI', batter.rbi]].map(([l, v]) => (
              <div className="sg-tile" key={l as string}><div className="sg-l">{l}</div><div className="sg-v">{v}</div></div>
            ))}
          </div>
          <div className="sg-tiles4">
            {[['HR', batter.homeRuns], ['BB', batter.walks], ['K', batter.strikeouts], ['P', batter.pitchesSeen]].map(([l, v]) => (
              <div className="sg-tile" key={l as string}><div className="sg-l">{l}</div><div className="sg-v">{v}</div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="sg-sec sg-mod">
        <div className="sg-sechead"><span className="sg-no">§ 02</span><h2>Exit velo & barrels</h2><span className="sg-tag">{measured.length} batted ball{measured.length === 1 ? '' : 's'} measured</span></div>
        <div className="sg-body">
          <div className="sg-grid">
            {[['Min EV', evSummary.min], ['Max EV', evSummary.max], ['Avg EV', evSummary.avg]].map(([l, v]) => (
              <div className="sg-t" key={l as string}><div className="sg-l">{l}</div><div className="sg-v">{v != null ? (v as number).toFixed(1) : '—'}</div></div>
            ))}
            <div className="sg-t"><div className="sg-l">Hard-hit</div><div className="sg-v">{hardHitCount}</div></div>
            <div className="sg-t"><div className="sg-l">Barrels</div><div className="sg-v">{barrelCount}</div></div>
          </div>
        </div>
      </div>

      <div className="sg-sec">
        <div className="sg-sechead"><span className="sg-no">§ 03</span><h2>Contact & command</h2><span className="sg-tag">spray + pitch heat map · this game</span></div>
        <div className="sg-cols">
          <div className="sg-zwrap">
            <div className="sg-zlab"><b>Spray chart</b><br />{sprayable.length} ball{sprayable.length === 1 ? '' : 's'} in play</div>
            {sprayable.length > 0 ? (
              <div className="sg-spray">
                <svg viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}>
                  <path d={`M ${HOME_X} ${HOME_Y} L 10 40 A 163 163 0 0 1 240 40 Z`} fill={C.soft} stroke={C.line} strokeWidth={1} />
                  <line x1={HOME_X} y1={HOME_Y} x2={10} y2={40} stroke={C.line} strokeWidth={1} />
                  <line x1={HOME_X} y1={HOME_Y} x2={240} y2={40} stroke={C.line} strokeWidth={1} />
                  <path d={`M ${HOME_X} ${HOME_Y} L ${HOME_X - 40} ${HOME_Y - 40} L ${HOME_X} ${HOME_Y - 80} L ${HOME_X + 40} ${HOME_Y - 40} Z`} fill="none" stroke={C.line} strokeWidth={1} />
                  {sprayable.map((b, i) => {
                    const barrel = b.launchSpeed != null && b.launchAngle != null && isBarrel(b.launchSpeed, b.launchAngle)
                    return (
                      <circle key={i} cx={b.coordX} cy={b.coordY}
                        r={barrel ? 6 : b.launchSpeed && b.launchSpeed > 100 ? 4.5 : 3.5}
                        fill={colorFor(b.resultEvent ?? '')}
                        stroke={barrel ? C.orange : '#fff'}
                        strokeWidth={barrel ? 2 : 0.75}
                        opacity={0.92}
                      />
                    )
                  })}
                </svg>
                <div className="sg-spraylegend">
                  {[['home_run', 'HR'], ['double', 'XBH'], ['single', '1B'], ['field_out', 'Out']].map(([k, label]) => (
                    <div className="sg-lg" key={k as string}><i style={{ background: colorFor(k as string) }} />{label}</div>
                  ))}
                  <div className="sg-lg"><i style={{ background: 'transparent', border: `2px solid ${C.orange}` }} />Barrel</div>
                </div>
              </div>
            ) : (
              <div className="sg-empty">No balls in play yet tonight.</div>
            )}
          </div>

          <div className="sg-zwrap" style={{ ['--z' as string]: '260px' }}>
            <div className="sg-zlab"><b>Pitch heat map</b><br />% of pitches seen · catcher&apos;s view</div>
            {hasHeat ? <ZoneGridView cells={heatCells} /> : <div className="sg-empty">No zone data yet tonight.</div>}
          </div>
        </div>
      </div>

      <div className="sg-sec sg-mod sg-grow">
        <div className="sg-sechead">
          <span className="sg-no">§ 04</span><h2>Tonight vs season</h2>
          <span className="sg-tag">{seasonLoading ? 'loading…' : seasonStats ? `${new Date().getFullYear()} season to date` : 'season data unavailable'}</span>
        </div>
        <div className="sg-body">
          <div className="sg-vslab">Tonight</div>
          <div className="sg-grid">
            <div className="sg-t"><div className="sg-l">Line</div><div className="sg-v">{tonightLine}</div></div>
            <div className="sg-t"><div className="sg-l">Avg EV</div><div className="sg-v">{evSummary.avg != null ? evSummary.avg.toFixed(1) : '—'}</div></div>
            <div className="sg-t"><div className="sg-l">Hard-hit</div><div className="sg-v">{hardHitCount}</div></div>
            <div className="sg-t"><div className="sg-l">Barrels</div><div className="sg-v">{barrelCount}</div></div>
            <div className="sg-t"><div className="sg-l">BB / K</div><div className="sg-v">{batter.walks}/{batter.strikeouts}</div></div>
          </div>
          <div className="sg-vslab">Season</div>
          <div className="sg-grid">
            <div className="sg-t"><div className="sg-l">AVG</div><div className="sg-v">{seasonStats?.avg ?? '—'}</div></div>
            <div className="sg-t"><div className="sg-l">OBP</div><div className="sg-v">{seasonStats?.obp ?? '—'}</div></div>
            <div className="sg-t"><div className="sg-l">SLG</div><div className="sg-v">{seasonStats?.slg ?? '—'}</div></div>
            <div className="sg-t"><div className="sg-l">Avg EV</div><div className="sg-v">{statcast?.avg_exit_velocity != null ? statcast.avg_exit_velocity.toFixed(1) : '—'}</div></div>
            <div className="sg-t"><div className="sg-l">Hard-hit%</div><div className="sg-v">{statcast?.hard_hit_pct != null ? `${statcast.hard_hit_pct.toFixed(0)}%` : '—'}</div></div>
          </div>
        </div>
      </div>

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

export default InGameBatterCard
