'use client'

// src/components/pitch-shape/HeroFlight.tsx
//
// The pitch marker in the league banner: a bar in the pitch's own colour and the spinning ball beside its name, as on the Pitching Lab's pitch cards. The ball spins with the pitch's ride and run (the league
// average for the chosen pitch). Plain data in, no fetching.

import { C } from '@/components/team/ui'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { pitchColor } from '@/lib/mlb'

export default function HeroFlight({ type, name, hb, ivb }: { type: string; name: string; hb: number; ivb: number }) {
  return (
    <div style={{ width: 210, maxWidth: '100%' }}>
      <SpinBallStyles />
      <div style={{ height: 8, borderRadius: 4, background: pitchColor(type), marginBottom: 12 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SpinBall code={type} size={44} spin={{ rpm: null, ivb, hb }} />
        <b style={{ fontSize: 24, fontWeight: 800, color: C.ink }}>{name}</b>
      </div>
    </div>
  )
}
