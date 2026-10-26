'use client'

import { useState, useEffect } from 'react'
import { installDemoFetch } from '@/lib/lab-demo-fetch'
import { BattingLabProvider } from '@/lib/batting-lab-context'
import { PitchingLabProvider } from '@/lib/pitching-lab-context'
import { SAMPLE_BATTER, SAMPLE_PITCHER } from '@/lib/lab-sample'

// The real lab tab, working, on the sample player, for visitors who cannot open it. It is switched off (inert: no clicks, no focus)
// so it reads as a picture of the feature, and a note above says whose numbers these are.
export default function DemoFrame({ lab, realName, children }: { lab: 'batting' | 'pitching'; realName: string; children: React.ReactNode }) {
  const sample = lab === 'batting' ? SAMPLE_BATTER : SAMPLE_PITCHER
  // Installed during render (before the children's effects fetch) so the example tab reads stored data, never the database.
  const [uninstall] = useState(() => installDemoFetch(lab))
  useEffect(() => () => uninstall(), [uninstall])
  const body = <div inert aria-label={`Example: ${sample.name}`} style={{ pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
  return (
    <div>
      <p style={{ margin: '0 0 14px', padding: '10px 0', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', fontSize: 14, color: '#3a352c' }}>
        <b>Example only.</b> Stored sample numbers{realName === sample.name ? '' : `, not ${realName}'s`}: this is what it could look like.
      </p>
      {lab === 'batting'
        ? <BattingLabProvider key={sample.id} batterId={sample.id}>{body}</BattingLabProvider>
        : <PitchingLabProvider key={sample.id} pitcherId={sample.id}>{body}</PitchingLabProvider>}
    </div>
  )
}
