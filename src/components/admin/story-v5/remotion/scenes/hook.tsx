// src/components/admin/story-v5/remotion/scenes/hook.tsx
//
// Scene 1: cold open. The hardest pitch of the previous game flies in from catcher view with a long trail, a huge number counts up to its
// speed, the screen flashes at impact, then the pitch fades and the series score, "Game N tonight." and first pitch times flip in.

import { useCurrentFrame } from 'remotion'
import { PITCH_COLOR } from '../../arsenal'
import { Count, Flip, ease } from '../anim'
import { CatcherStage } from '../catcher'
import { MARGIN, TIMING } from '../config'
import { Headshot, Kicker, NUM, Pill, useOptBool, useTheme, useTitles } from '../ui'
import { firstPitchTimes } from '../time'
import { teamColor } from './replay'
import type { PreviewData } from '../../types'

export function HookScene({ data }: { data: PreviewData }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const T = TIMING.hook
  const oHead = useOptBool('hook', 'showHeadshot'), oScore = useOptBool('hook', 'showScore'), oUnit = useOptBool('hook', 'showUnit')
  const hook = data.hook
  const color = PITCH_COLOR[hook.code] ?? t.accent
  const flash = frame >= T.flyTo && frame <= T.flashEnd ? 0.5 * (1 - (frame - T.flyTo) / (T.flashEnd - T.flyTo)) : 0
  const out = oScore ? 1 - ease(frame, T.outAt, T.outAt + 8) : 1      // without the closing group the pitch and number stay up
  const value = data.hookText.value
  const num = Number(value)
  const decimals = (value.split('.')[1] ?? '').length
  const hookTeam = hook.teamId === data.teams.away.id ? data.teams.away : data.teams.home
  const lg = data.lastGame
  const winner = lg.winner === 'away' ? data.teams.away : data.teams.home
  const loser = lg.winner === 'away' ? data.teams.home : data.teams.away
  const [ws, ls] = lg.winner === 'away' ? [lg.awayScore, lg.homeScore] : [lg.homeScore, lg.awayScore]
  const tt = useTitles('hook', data)
  return (
    <>
      <div style={{ opacity: out }}>
        <CatcherStage flights={[{ points: hook.path.points, color, start: T.flyFrom, duration: T.flyTo - T.flyFrom }]} />
        <div style={{ position: 'absolute', left: MARGIN, top: 90 }}><Kicker>{tt.kicker}</Kicker></div>
        {oHead ? <div style={{ position: 'absolute', right: MARGIN, top: 80 }}><Headshot src={hook.headshot} size={150} border={teamColor(hookTeam, t.name)} /></div> : null}
        <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 850, display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontSize: 190, fontWeight: 800, lineHeight: 1, letterSpacing: -4, ...NUM }}>
            {Number.isFinite(num) ? <Count value={num} from={T.countFrom} frames={T.countFrames} fmt={n => n.toFixed(decimals)} /> : value}
          </span>
          {oUnit ? <span style={{ fontSize: 48, fontWeight: 800, color: t.accent }}>{data.hookText.unit}</span> : null}
        </div>
        {tt.extra ? <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1060, fontSize: 36, fontWeight: 600, color: t.dim, opacity: ease(frame, 44, 54) }}>{tt.extra}</div> : null}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: t.accent, opacity: flash, pointerEvents: 'none' }} />
      {oScore && frame >= T.groupAt ? (
        <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 330, bottom: 330, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 36, textAlign: 'center' }}>
          <Flip delay={T.groupAt}><div style={{ display: 'flex', gap: 20 }}><Pill team={winner} label={`${winner.abbr} ${ws}`} size={64} /><Pill team={loser} label={`${loser.abbr} ${ls}`} size={64} /></div></Flip>
          <Flip delay={T.groupAt + 4}><div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -1 }}>{tt.headline}</div></Flip>
          <Flip delay={T.groupAt + 8}><div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 2, color: t.accent }}>{firstPitchTimes(data.firstPitch.iso)?.line}</div></Flip>
        </div>
      ) : null}
    </>
  )
}
