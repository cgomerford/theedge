'use client'

// src/components/admin/InGamePitcherCard.tsx
//
// The live-game pitcher X graphic — same 1080x1350 (4:5) canvas, stylesheet
// and fonts as the Scout Report Graphic and Game Preview Graphic (imports
// their cardCss directly, same brand header/§ sections/tiles/arsenal-bar
// classes — one visual system across all three, per DESIGN_SYSTEM.md).
// Content is this pitcher's arsenal usage and box score straight off the
// live feed (already in-progress-safe — see pitcher-arsenal-card.ts), plus
// an arm-angle module. Arm angle only exists on Baseball Savant's CSV, not
// the live feed, and can lag a live game by hours — the section tag says
// so explicitly ("season avg — tonight not yet tracked") rather than ever
// presenting a season number as if it were tonight's.

import { forwardRef } from 'react'
import type { PitcherGameLine, PitchRecord } from '@/types/postgame'
import type { GameInfo } from '@/lib/postgame'
import { buildArsenalCard, computeStrikePct, computeOverallWhiffPct } from '@/lib/pitcher-arsenal-card'
import type { PitcherGameArmAngle } from '@/lib/pitcher-game-arm-angle'
import { playerHeadshotUrl } from '@/lib/mlb'
import { C, MONO } from '@/components/team/ui'
import { cardCss } from '@/components/admin/scout-graphic/ScoutGraphicCard'

export type InGamePitcherCardProps = {
  dateLabel: string
  awayTeamId: number
  homeTeamId: number
  pitcher: PitcherGameLine
  pitches: PitchRecord[]
  gamePk: number
  teamColor: string
  teamAbbr: string
  opponentAbbr: string
  throws?: 'L' | 'R' | null
  gameInfo: GameInfo
  armAngle: PitcherGameArmAngle | null
  armAngleLoading: boolean
}

const igCss = `
.sg.sg-ig .sg-tiles6{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:14px}
.sg.sg-ig .sg-arm{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sg.sg-ig .sg-arm .sg-t{background:${C.soft};border-radius:10px;padding:10px 8px;text-align:center}
.sg.sg-ig .sg-arm .sg-t .sg-l{font-family:${MONO};font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${C.faint}}
.sg.sg-ig .sg-arm .sg-t .sg-v{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}
.sg.sg-ig .sg-live{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.bad}}
.sg.sg-ig .sg-live i{width:7px;height:7px;border-radius:50%;background:${C.bad};display:block}
.sg.sg-ig .sg-arsub{font-family:${MONO};font-size:9.5px;color:${C.faint};margin:0 0 6px 144px}
.sg.sg-ig .sg-move{padding:14px 20px 18px;display:flex;flex-direction:column;align-items:center}
.sg.sg-ig .sg-move svg{width:380px;height:320px}
.sg.sg-ig .sg-movecap{font-family:${MONO};font-size:9px;color:${C.faint};text-transform:uppercase;letter-spacing:.1em;margin-top:2px}
.sg.sg-ig .sg-movelegend{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:8px}
.sg.sg-ig .sg-movelegend .sg-lg{display:flex;align-items:center;gap:5px;font-family:${MONO};font-size:9.5px;color:${C.mute};text-transform:uppercase;letter-spacing:.08em}
.sg.sg-ig .sg-movelegend i{width:9px;height:9px;border-radius:50%;display:block}
`

function outsToIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

function mostUsedCountPitch(pitches: PitchRecord[]): string | null {
  const counts = new Map<string, number>()
  for (const p of pitches) {
    if (!p.typeDescription) continue
    const key = `${p.countAfter.balls}-${p.countAfter.strikes}|${p.typeDescription}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: { key: string; n: number } | null = null
  for (const [key, n] of counts) if (!best || n > best.n) best = { key, n }
  if (!best) return null
  const [count, pitchName] = best.key.split('|')
  return `${pitchName} on ${count} (${best.n}x)`
}

function mostUsedZone(pitches: PitchRecord[]): number | null {
  const counts = new Map<number, number>()
  for (const p of pitches) {
    if (p.zone == null) continue
    counts.set(p.zone, (counts.get(p.zone) ?? 0) + 1)
  }
  let best: { zone: number; n: number } | null = null
  for (const [zone, n] of counts) if (!best || n > best.n) best = { zone, n }
  return best?.zone ?? null
}

const InGamePitcherCard = forwardRef<HTMLDivElement, InGamePitcherCardProps>(function InGamePitcherCard(props, ref) {
  const { pitcher, pitches, teamColor, teamAbbr, opponentAbbr, throws, gameInfo, armAngle, armAngleLoading } = props

  const { types, movement } = buildArsenalCard(pitches)
  const strikePct = computeStrikePct(pitches)
  const whiffPct = computeOverallWhiffPct(pitches)
  const sequenceHeadline = mostUsedCountPitch(pitches)
  const zoneMode = mostUsedZone(pitches)
  const topPitches = types.slice(0, 5)
  const maxPct = Math.max(1, ...topPitches.map(t => t.usagePct))
  const colorByType = new Map(types.map(t => [t.typeCode, t.color]))

  const MOVE_RANGE = 24
  const moveX = (v: number) => 150 + Math.max(-MOVE_RANGE, Math.min(MOVE_RANGE, v)) * (130 / MOVE_RANGE)
  const moveY = (v: number) => 150 - Math.max(-MOVE_RANGE, Math.min(MOVE_RANGE, v)) * (130 / MOVE_RANGE)

  const armTag = armAngle?.source === 'this-game' ? "tonight's pitches"
    : armAngle?.source === 'season' ? 'season avg — tonight not yet tracked'
    : armAngleLoading ? 'loading…' : 'not yet available'

  const sources = [
    'Arsenal usage, velocity, whiff%: live MLB Gameday feed, this game.',
    'Arm angle: Baseball Savant pitch-level data — can lag a live game; falls back to season average when tonight isn’t tracked yet.',
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
          <img src={`https://www.mlbstatic.com/team-logos/${props.awayTeamId}.svg`} alt={props.awayTeamId ? '' : undefined} />
          <span className="sg-at">@</span>
          <img src={`https://www.mlbstatic.com/team-logos/${props.homeTeamId}.svg`} alt="" />
        </div>
      </div>

      <div className="sg-sec">
        <div className="sg-sechead">
          <span className="sg-no">§ 01</span><h2>On the mound</h2>
          <span className="sg-tag">{gameInfo.venue ?? teamAbbr} · vs {opponentAbbr}</span>
        </div>
        <div className="sg-mound">
          <div className="sg-mtop">
            <img className="sg-shot" width={116} height={116} style={{ width: 116, height: 116, border: `4px solid ${teamColor}` }}
              src={playerHeadshotUrl(pitcher.pitcherId, 240)} alt="" />
            <div className="sg-who">
              <div className="sg-nm">{pitcher.pitcherName}</div>
              <div className="sg-meta">{teamAbbr}{throws ? ` · ${throws}HP` : ''} · vs {opponentAbbr}</div>
              <div className="sg-live"><i />Live</div>
            </div>
          </div>

          <div className="sg-tiles6">
            {[['IP', outsToIP(pitcher.outsRecorded)], ['H', pitcher.hitsAllowed], ['R', pitcher.runsAllowed], ['ER', pitcher.earnedRunsAllowed], ['BB', pitcher.walks], ['K', pitcher.strikeouts]].map(([l, v]) => (
              <div className="sg-tile" key={l as string}><div className="sg-l">{l}</div><div className="sg-v">{v}</div></div>
            ))}
          </div>

          <div className="sg-lower">
            {topPitches.length > 0 ? (
              <div className="sg-arsenal sg-roomy">
                {topPitches.map((t, i) => (
                  <div key={t.typeCode}>
                    <div className="sg-ar">
                      <span className="sg-pn">{t.typeName}</span>
                      <span className="sg-bar"><i style={{ width: `${(t.usagePct / maxPct) * 100}%`, background: t.color, opacity: 1 - i * 0.15 }} /></span>
                      <span className="sg-num"><b>{t.usagePct}%</b>{t.avgVelo != null ? ` · ${t.avgVelo.toFixed(1)} mph` : ''}</span>
                    </div>
                    <div className="sg-arsub">
                      {[t.avgSpin != null ? `${Math.round(t.avgSpin)} rpm` : null, t.zonePct != null ? `${t.zonePct}% zone` : null, t.whiffPct != null ? `${t.whiffPct}% whiff` : null].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sg-empty">No pitches tracked yet tonight.</div>
            )}
          </div>
        </div>
      </div>

      <div className="sg-sec">
        <div className="sg-sechead"><span className="sg-no">§ 02</span><h2>Movement</h2><span className="sg-tag">induced break, this game</span></div>
        <div className="sg-move">
          {movement.length > 0 ? (
            <>
              <svg viewBox="0 0 300 300">
                <line x1={20} y1={150} x2={280} y2={150} stroke={C.line} strokeWidth={1} />
                <line x1={150} y1={20} x2={150} y2={280} stroke={C.line} strokeWidth={1} />
                {movement.map((m, i) => (
                  <circle key={i} cx={moveX(m.hBreak)} cy={moveY(m.vBreak)} r={3.5} fill={colorByType.get(m.typeCode) ?? C.faint} opacity={0.7} />
                ))}
              </svg>
              <div className="sg-movecap">Horizontal break ↔ · Induced vertical break ↕ (inches)</div>
              <div className="sg-movelegend">
                {topPitches.map(t => (
                  <div className="sg-lg" key={t.typeCode}><i style={{ background: t.color }} />{t.typeName}</div>
                ))}
              </div>
            </>
          ) : (
            <div className="sg-empty">No movement data tracked yet tonight.</div>
          )}
        </div>
      </div>

      <div className="sg-sec">
        <div className="sg-sechead"><span className="sg-no">§ 03</span><h2>Arm angle</h2><span className="sg-tag">{armTag}</span></div>
        <div style={{ padding: '16px 20px 18px' }}>
          {armAngle && armAngle.overallAvgArmAngle != null ? (
            <div className="sg-arm">
              <div className="sg-t"><div className="sg-l">Overall</div><div className="sg-v">{armAngle.overallAvgArmAngle.toFixed(0)}°</div></div>
              {armAngle.byPitchType.slice(0, 3).map(t => (
                <div className="sg-t" key={t.typeCode}><div className="sg-l">{t.typeName}</div><div className="sg-v">{t.avgArmAngle.toFixed(0)}°</div></div>
              ))}
            </div>
          ) : (
            <div className="sg-empty">{armAngleLoading ? 'Loading…' : 'Arm angle not yet available for tonight or this season.'}</div>
          )}
        </div>
      </div>

      <div className="sg-sec sg-mod sg-grow">
        <div className="sg-sechead"><span className="sg-no">§ 04</span><h2>Sequencing & command</h2></div>
        <div className="sg-body">
          <p style={{ margin: '0 0 14px', fontSize: 14.5, lineHeight: 1.45, color: '#3d372e' }}>
            {sequenceHeadline ? `Went to the ${sequenceHeadline}` : 'No dominant count/pitch pattern yet.'}
            {zoneMode != null && ` · most-thrown zone: ${zoneMode}`}
          </p>
          <div className="sg-grid">
            {[['Strike%', strikePct != null ? `${strikePct}%` : '—'], ['Whiff%', whiffPct != null ? `${whiffPct}%` : '—'], ['Pitches', pitches.length]].map(([l, v]) => (
              <div className="sg-t" key={l as string}><div className="sg-l">{l}</div><div className="sg-v">{v}</div></div>
            ))}
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

export default InGamePitcherCard
