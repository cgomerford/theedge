'use client'

import { usePathname } from 'next/navigation'
import { ArsenalPreview, ZonesPreview, TablePreview, ChartFramePreview, LabelledRowsPreview } from './previews'

// The barebones view of whichever lab tab the visitor is on: that tab's own labels and an empty frame, never numbers, n or dates.
// The gate lives in the shared (pro) layout, so the shell picks its content from the last URL segment.

const PITCHES = ['Four-seam fastball', 'Sinker', 'Cutter', 'Slider', 'Curveball', 'Changeup', 'Splitter']
const COUNTS = ['First pitch', 'Ahead in the count', 'Even count', 'Behind in the count', 'Two strikes']

function tabOf(path: string | null): string {
  return (path ?? '').replace(/\/$/, '').split('/').pop() ?? ''
}

export default function LabTabShell({ lab }: { lab: 'batting' | 'pitching' }) {
  const tab = tabOf(usePathname())
  const bat = lab === 'batting'
  switch (tab) {
    case '':
      return <TablePreview title="Overview" cols={['Measure', 'This season', 'Percentile']} rows={['Season line', 'Quality of contact', 'League rank']} />
    case 'swing':
      return <div style={{ display: 'grid', gap: 24 }}><ChartFramePreview title="Did his swing change?" x="Month" y="Setup and swing" /><LabelledRowsPreview title="Beside it" labels={['Contact over the same months']} /></div>
    case 'contact':
      return <div style={{ display: 'grid', gap: 24 }}><TablePreview title="How hard, and where, he hits it" cols={['Measure', 'Count', 'Rate']} rows={['Balls in play', 'Hard hit', 'Barrels']} /><LabelledRowsPreview title="Direction" labels={['Pull', 'Middle', 'Opposite field']} /></div>
    case 'outcomes':
      return <TablePreview title="Three true outcomes" cols={['Outcome', 'Count', 'Share of plate appearances']} rows={['Strikeouts', 'Walks', 'Home runs', 'Balls in play']} />
    case 'platoon':
      return <TablePreview title="Is the split real?" cols={['Against', 'Results', 'Swing numbers', 'Plate appearances (n)']} rows={['Left-handed pitching', 'Right-handed pitching']} />
    case 'approach':
      return <TablePreview title="What he swings at, and when" cols={['Count', 'Swings in the zone', 'Swings outside the zone', 'League average']} rows={COUNTS} />
    case 'hot-zones':
      return <div style={{ display: 'grid', gap: 24 }}><ZonesPreview title="Hot zones" /><LabelledRowsPreview title="Measure" labels={['xwOBA', 'Whiff %', 'Hard-hit %']} /></div>
    case 'overlay':
      return <div style={{ display: 'grid', gap: 24 }}><ZonesPreview title="Hot zone overlay" /><LabelledRowsPreview title="Hitter" labels={['Choose a hitter']} /></div>
    case 'location':
      return <div style={{ display: 'grid', gap: 24 }}><ZonesPreview title="Location" /><LabelledRowsPreview title="Pitch types" labels={PITCHES} /></div>
    case 'sequencing':
      return <TablePreview title="Sequencing" cols={['Count', 'Most common pitch', 'Share', 'Pitches (n)']} rows={COUNTS} />
    case 'trends':
      return <div style={{ display: 'grid', gap: 24 }}><ChartFramePreview title="Trends" x="Month" y={bat ? 'Rolling xwOBA' : 'Pitch mix share'} /><ChartFramePreview title="Contact" x="Month" y={bat ? 'Hard-hit %' : 'Velocity'} /></div>
    case 'h2h':
      return <TablePreview title="Head to head" cols={[bat ? 'Pitcher' : 'Hitter', 'PA', 'AVG', 'OPS', 'HR', 'K']} rows={['Choose an opponent']} />
    case 'stuff':
      return <TablePreview title="Stuff" cols={['Pitch', 'Velo', 'Spin', 'Horizontal break', 'Induced vertical break', 'Pitches (n)']} rows={PITCHES} />
    default:
      return <ArsenalPreview title={bat ? 'Vs arsenal' : 'Arsenal'} />
  }
}
