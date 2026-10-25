// src/components/admin/story-v5/remotion/scenes/matchup.tsx
//
// The matchup slide: both clubs with their logos, the starting pitchers, first pitch time (ET and PT), the series line and the ballpark.
// Every component can be switched off in the slide's options.

import { Img, useCurrentFrame } from 'remotion'
import { Flip, sp } from '../anim'
import { MARGIN, TIMING } from '../config'
import { Headshot, NUM, Title, useOptBool, useTheme, useTitles } from '../ui'
import { firstPitchTimes } from '../time'
import { teamColor } from './replay'
import type { PreviewData, Side } from '../../types'

function Logo({ data, side, i }: { data: PreviewData; side: Side; i: number }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const team = data.teams[side]
  const s = sp(frame, TIMING.matchup.first + i * TIMING.matchup.step)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: 330, opacity: Math.min(1, s * 1.4), transform: `scale(${0.7 + 0.3 * Math.min(1.08, s)})` }}>
      <div style={{ width: 260, height: 260, borderRadius: '50%', background: '#fff', border: `4px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
        <Img src={team.logo} style={{ width: 190, height: 190, objectFit: 'contain' }} />
      </div>
      <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 1 }}>{team.abbr}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: t.dim, marginTop: -8 }}>{team.name}</div>
    </div>
  )
}

function Pitcher({ data, side, i }: { data: PreviewData; side: Side; i: number }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const st = data.starters[side], team = data.teams[side]
  const s = sp(frame, TIMING.matchup.first + 14 + i * TIMING.matchup.step)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 430, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - Math.min(1, s)) * 24}px)` }}>
      <Headshot src={st.headshot} size={120} border={teamColor(team, t.name)} badge={team.logo} />
      <div>
        <div style={{ fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 700 }}>{team.abbr} {st.confirmed ? 'STARTER' : 'PROBABLE'}{st.hand ? ` · ${st.hand === 'L' ? 'LEFT' : 'RIGHT'}` : ''}</div>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05 }}>{st.last}</div>
      </div>
    </div>
  )
}

export function MatchupScene({ data }: { data: PreviewData }) {
  const t = useTheme()
  const tt = useTitles('matchup', data)
  const logos = useOptBool('matchup', 'showLogos'), pitchers = useOptBool('matchup', 'showPitchers'), first = useOptBool('matchup', 'showFirstPitch')
  const series = useOptBool('matchup', 'showSeries'), venue = useOptBool('matchup', 'showVenue')
  return (
    <>
      <Title kicker={tt.kicker} head={tt.headline} />
      {logos ? (
        <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 360, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo data={data} side="away" i={0} />
          <Flip delay={TIMING.matchup.first + 8}><div style={{ fontSize: 40, fontWeight: 700, color: t.dim }}>at</div></Flip>
          <Logo data={data} side="home" i={1} />
        </div>
      ) : null}
      {pitchers ? (
        <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: logos ? 760 : 360, display: 'flex', justifyContent: 'space-between' }}>
          <Pitcher data={data} side="away" i={0} /><Pitcher data={data} side="home" i={1} />
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: logos && pitchers ? 905 : logos || pitchers ? 760 : 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {first ? <Flip delay={TIMING.matchup.first + 26}><div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 2, color: t.accent, ...NUM }}>{firstPitchTimes(data.firstPitch.iso)?.line}</div></Flip> : null}
        {series && tt.extra ? <Flip delay={TIMING.matchup.first + 30}><div style={{ fontSize: 34, fontWeight: 700 }}>{tt.extra}</div></Flip> : null}
        {venue && data.venue ? <Flip delay={TIMING.matchup.first + 34}><div style={{ fontSize: 28, fontWeight: 600, color: t.dim }}>{data.venue}</div></Flip> : null}
      </div>
    </>
  )
}
