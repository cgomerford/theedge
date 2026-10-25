// src/components/admin/story-v5/remotion/scenes/replay.tsx
//
// Scene 2: how the previous game was won. A diamond (centre 540,760, base distance 250) plays the key plays in order:
// runners are dots in the batting club's colour that slide between bases, a run pops at home, a caught runner's dot empties and
// fades to 25%, a throw is an accent arc from the catcher to the base. Score pills, inning and the RUNNERS CAUGHT counter update per beat.

import type { ReactElement } from 'react'
import { Img, useCurrentFrame } from 'remotion'
import { Flip, ease } from '../anim'
import { MARGIN, SCENE_LENGTHS, TIMING } from '../config'
import { FONT, NUM, Pill, Title, useTheme, useTitles } from '../ui'
import type { Beat, PreviewData, TeamInfo } from '../../types'

const CX = 540, CY = 760, D = 250
const BASE_XY = [{ x: CX, y: CY + D }, { x: CX + D, y: CY }, { x: CX, y: CY - D }, { x: CX - D, y: CY }]   // home, 1B, 2B, 3B
/** Position along the base path for a continuous base number 0..4 (4 is home again). */
export function basePos(b: number): { x: number; y: number } {
  const c = Math.min(4, Math.max(0, b)), i = Math.min(3, Math.floor(c)), k = c - i
  const a = BASE_XY[i], z = BASE_XY[(i + 1) % 4]
  return { x: a.x + (z.x - a.x) * k, y: a.y + (z.y - a.y) * k }
}

export const teamColor = (team: TeamInfo, themeName: string) => (themeName === 'dark' ? team.light : team.primary)

function Dot({ x, y, color, hollow = false, opacity = 1, scale = 1 }: { x: number; y: number; color: string; hollow?: boolean; opacity?: number; scale?: number }) {
  const t = useTheme()
  return <circle cx={x} cy={y} r={22 * scale} fill={hollow ? 'none' : color} stroke={hollow ? color : t.bg} strokeWidth={hollow ? 5 : 3} opacity={opacity} />
}

function BeatView({ beat, f, team }: { beat: Beat; f: number; team: TeamInfo }) {
  const t = useTheme()
  const color = teamColor(team, t.name)
  const p = ease(f, 4, 16)                                   // movement progress
  const inFade = ease(f, 0, 4)
  const movers = new Map(beat.moves.map(m => [m.id, m]))
  const dots: ReactElement[] = []
  for (const r of beat.before) if (!movers.has(r.id)) dots.push(<Dot key={`s${r.id}`} {...basePos(r.base)} color={color} opacity={inFade} />)   // runners who stay put
  for (const m of beat.moves) {
    const out = m.to < 0
    const to = out ? m.from : m.to
    const pos = basePos(m.from + (to - m.from) * p)
    if (out) {
      dots.push(<Dot key={`m${m.id}`} {...pos} color={color} hollow={p > 0.6} opacity={(1 - 0.75 * ease(f, 14, 24)) * inFade} />)
    } else if (m.to === 4) {
      const popped = ease(f, 16, 26)
      dots.push(<Dot key={`m${m.id}`} {...pos} color={color} opacity={(p < 1 ? 1 : 1 - ease(f, 20, 30)) * inFade} scale={p < 1 ? 1 : 1 + 0.8 * popped} />)
    } else dots.push(<Dot key={`m${m.id}`} {...pos} color={color} opacity={inFade} />)
  }
  const scored = beat.moves.filter(m => m.to === 4).length
  const thr = beat.throwToBase != null ? ease(f, 4, 14) : 0
  const th = beat.throwToBase != null ? basePos(beat.throwToBase) : null
  const home = BASE_XY[0]
  return (
    <>
      {th ? (
        <path d={`M ${home.x} ${home.y} Q ${(home.x + th.x) / 2} ${Math.min(home.y, th.y) - 90} ${th.x} ${th.y}`} fill="none" stroke={t.accent} strokeWidth={6} strokeLinecap="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - thr} opacity={1 - ease(f, 16, 28)} />
      ) : null}
      {dots}
      {scored > 0 && f >= 16 ? <text x={home.x} y={home.y + 80} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={40} fill={t.accent} opacity={1 - ease(f, 24, 34)}>{`+${scored}`}</text> : null}
    </>
  )
}

export function ReplayScene({ data }: { data: PreviewData }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const beats = data.beats
  const T = TIMING.replay
  const n = beats.length
  const gap = Math.max(12, Math.min(T.maxGap, Math.floor((SCENE_LENGTHS.replay - T.firstBeat - 20) / n)))
  const idx = Math.min(n - 1, Math.max(0, Math.floor((frame - T.firstBeat) / gap)))
  const beat = beats[idx]
  const f = frame - T.firstBeat - idx * gap
  const started = frame >= T.firstBeat
  const teams = data.teams
  const batting = teams[beat.battingSide]
  const tt = useTitles('replay', data)
  const scoreAway = started ? beat.awayScore : 0, scoreHome = started ? beat.homeScore : 0
  const caught = started ? beat.caughtTotal : 0
  return (
    <>
      <Title kicker={tt.kicker} head={tt.headline} />
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 330, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Flip delay={10}><div style={{ display: 'flex', gap: 14 }}>
          <Pill team={teams.away} label={`${teams.away.abbr} ${scoreAway}`} size={32} /><Pill team={teams.home} label={`${teams.home.abbr} ${scoreHome}`} size={32} />
        </div></Flip>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 2, color: t.dim, ...NUM }}>{started ? `${beat.half === 'top' ? 'TOP' : 'BOT'} ${beat.inning}` : ''}</div>
      </div>
      <svg width={1080} height={1350} style={{ position: 'absolute', left: 0, top: 0 }}>
        <polygon points={BASE_XY.map(b => `${b.x},${b.y}`).join(' ')} fill={t.text} fillOpacity={0.04} stroke={t.text} strokeOpacity={0.25} strokeWidth={3} />
        {BASE_XY.slice(1).map((b, i) => <rect key={i} x={b.x - 16} y={b.y - 16} width={32} height={32} fill={t.card} stroke={t.text} strokeWidth={3} transform={`rotate(45 ${b.x} ${b.y})`} />)}
        <polygon points={`${CX - 20},${CY + D - 12} ${CX + 20},${CY + D - 12} ${CX + 20},${CY + D + 6} ${CX},${CY + D + 22} ${CX - 20},${CY + D + 6}`} fill={t.card} stroke={t.text} strokeWidth={3} />
        {started ? <BeatView key={idx} beat={beat} f={f} team={batting} /> : null}
      </svg>
      <div style={{ position: 'absolute', right: MARGIN, top: 470, textAlign: 'right' }}>
        <div style={{ fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 700 }}>RUNNERS CAUGHT</div>
        <div style={{ fontSize: 96, fontWeight: 800, color: caught > 0 ? t.accent : t.text, lineHeight: 1, ...NUM }}>{caught}</div>
      </div>
      {started ? (
        <div key={idx} style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1046, display: 'flex', alignItems: 'center', gap: 16, opacity: ease(f, 2, 10) }}>
          {beat.batterHeadshot ? <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', border: `4px solid ${teamColor(batting, t.name)}`, flex: '0 0 auto', background: t.card, boxSizing: 'border-box' }}><Img src={beat.batterHeadshot} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} /></div> : null}
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1 }}>{beat.text}</div>
        </div>
      ) : null}
    </>
  )
}
