'use client'

import { BattingLabProvider } from '@/lib/batting-lab-context'
import { PitchingLabProvider } from '@/lib/pitching-lab-context'
import { SAMPLE_BATTER, SAMPLE_PITCHER } from '@/lib/lab-sample'

// The real lab tab, working, on the sample player, for visitors who cannot open it. It is switched off (inert: no clicks, no focus)
// so it reads as a picture of the feature, and a note above says whose numbers these are.
export default function DemoFrame({ lab, realName, children }: { lab: 'batting' | 'pitching'; realName: string; children: React.ReactNode }) {
  const sample = lab === 'batting' ? SAMPLE_BATTER : SAMPLE_PITCHER
  const body = <div inert aria-label={`Example: ${sample.name}`} style={{ pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
  return (
    <div>
      <p style={{ margin: '0 0 14px', padding: '10px 0', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', fontSize: 14, color: '#3a352c' }}>
        <b>Example only.</b> This is {sample.name}&apos;s data{realName === sample.name ? '' : `, not ${realName}'s`}: it shows what the feature looks like.
      </p>
      {lab === 'batting'
        ? <BattingLabProvider key={sample.id} batterId={sample.id}>{body}</BattingLabProvider>
        : <PitchingLabProvider key={sample.id} pitcherId={sample.id}>{body}</PitchingLabProvider>}
    </div>
  )
}
