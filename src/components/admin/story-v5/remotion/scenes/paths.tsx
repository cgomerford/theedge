// src/components/admin/story-v5/remotion/scenes/paths.tsx
//
// One pitcher's average pitch paths in the Story v5 catcher view, for the article writer's chart picker. It reuses the story's own stage (CatcherStage),
// flight timing (TIMING.arsenal) and PitchCard, so the movement looks exactly like the arsenal slide. The picker scrubs it with `t` (0 to 1) through the Player's seekTo,
// which also lets it draw each frame for the animated GIF.

'use client'

import { useEffect, useRef } from 'react'
import { AbsoluteFill } from 'remotion'
import { Player, type PlayerRef } from '@remotion/player'
import { FPS, MARGIN, THEMES, TIMING } from '../config'
import { CatcherStage, type Flight } from '../catcher'
import { FONT, NUM, Title, ThemeProvider, useTheme } from '../ui'
import { PITCH_COLOR } from '../../arsenal'
import { PitchCard } from './arsenal'
import type { ArsenalPitch } from '../../types'

const HOLD = 36
export const pathsFrames = (n: number) => TIMING.arsenal.firstPitch + Math.max(0, n - 1) * TIMING.arsenal.gap + TIMING.arsenal.flight + HOLD

type Props = { name: string; season: number; pitches: ArsenalPitch[] }

function PathsScene({ name, season, pitches }: Props) {
  const t = useTheme()
  const T = TIMING.arsenal
  const flights: Flight[] = pitches.map((p, i) => ({ points: p.path.points, color: PITCH_COLOR[p.code] ?? t.accent, start: T.firstPitch + i * T.gap, duration: T.flight }))
  const bestWhiff = Math.max(...pitches.map(p => p.whiffPct ?? -1))
  return (
    <AbsoluteFill style={{ background: t.bg, color: t.text, fontFamily: FONT }}>
      <CatcherStage flights={flights} />
      <Title kicker="PITCH MOVEMENT" head={name} />
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 836 }}>
        <span style={{ fontSize: 24, letterSpacing: 2, color: t.dim, fontWeight: 600, ...NUM }}>{season} AVERAGE PATHS · CATCHER VIEW</span>
      </div>
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 878, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {pitches.map((p, i) => <PitchCard key={p.code} p={p} delay={T.firstPitch + i * T.gap + T.flight} best={p.whiffPct != null && p.whiffPct === bestWhiff} />)}
      </div>
    </AbsoluteFill>
  )
}

function Comp(props: Props) {
  return <ThemeProvider value={THEMES.paper}><PathsScene {...props} /></ThemeProvider>
}

/** The Story v5 movement animation, shown at 560 x 581 and moved to `t` (0 to 1) by the caller. */
export default function PitchPathsPlayer({ t, ...props }: Props & { t: number }) {
  const ref = useRef<PlayerRef>(null)
  const total = pathsFrames(props.pitches.length)
  useEffect(() => {
    const p = ref.current
    if (!p) return
    p.pause()
    p.seekTo(Math.round(Math.min(1, Math.max(0, t)) * (total - 1)))
  }, [t, total])
  return (
    <Player
      ref={ref} component={Comp as never} inputProps={props}
      durationInFrames={total} fps={FPS} compositionWidth={1080} compositionHeight={1120}
      initialFrame={total - 1} controls={false} acknowledgeRemotionLicense
      style={{ width: 560, height: 581 }}
    />
  )
}
