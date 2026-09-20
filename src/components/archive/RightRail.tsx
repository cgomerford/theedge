// src/components/game-preview/RightRail.tsx
//
// The column Edge Indicator used to own outright. Now it's a small
// switcher: Edge Indicator by default, or a Starting Pitcher / Batting
// detail panel when George clicks into one from a team panel — see
// RightRailContext.tsx for why this needs to be a client component with
// shared state instead of local state in each card. All the data for
// every possible view is pre-fetched server-side in page.tsx and handed
// in as props; switching views is just picking which of these to show,
// no client-side fetching or loading state.

'use client'

import { useRightRail } from './RightRailContext'
import EdgeIndicatorPanel, { type EdgeIndicatorPanelProps } from '../game-preview/EdgeIndicatorPanel'
import StartingPitcherPanel, { type StartingPitcherData } from '../game-preview/StartingPitcherPanel'
import BattingPanel, { type BattingData } from './BattingPanel'
import ShellPlaceholder from '../game-preview/ShellPlaceholder'

export type RightRailProps = {
  edge: EdgeIndicatorPanelProps | null
  sp: { home: StartingPitcherData | null; away: StartingPitcherData | null }
  batting: { home: BattingData | null; away: BattingData | null }
}

export default function RightRail({ edge, sp, batting }: RightRailProps) {
  const { view, setView } = useRightRail()

  const activeSp = view.kind === 'sp' ? sp[view.team] : null
  const activeBatting = view.kind === 'batting' ? batting[view.team] : null

  const edgeView = edge
    ? <EdgeIndicatorPanel {...edge} />
    : <ShellPlaceholder title="Edge Indicator" note="No prediction on record for this game yet." />

  return (
    <div className="space-y-3">
      {view.kind !== 'edge' && (
        <button
          type="button"
          onClick={() => setView({ kind: 'edge' })}
          className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-600 transition flex items-center gap-1"
        >
          ← Back to Edge Indicator
        </button>
      )}

      {view.kind === 'edge' && edgeView}
      {view.kind === 'sp' && (activeSp ? <StartingPitcherPanel data={activeSp} /> : edgeView)}
      {view.kind === 'batting' && (activeBatting ? <BattingPanel data={activeBatting} /> : edgeView)}
    </div>
  )
}
