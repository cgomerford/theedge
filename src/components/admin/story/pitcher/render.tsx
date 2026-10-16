import type { ReactNode } from 'react'
import type { RenderSegment } from '../StoryCanvas'
import Arm from './segments/Arm'
import Counts from './segments/Counts'
import Arsenal from './segments/Arsenal'
import Close from './segments/Close'
import Game from './segments/Game'
import Hits from './segments/Hits'
import Next from './segments/Next'
import Season from './segments/Season'
import Tto from './segments/Tto'
import type { PitcherReelData } from './types'

export function reelRenderer(d: PitcherReelData): RenderSegment {
  return (id, localT, dur): ReactNode => {
    const p = { d, localT, dur }
    switch (id) {
      case 'pr-game': return <Game {...p} />
      case 'pr-arsenal': return <Arsenal {...p} />
      case 'pr-counts': return <Counts {...p} />
      case 'pr-arm': return <Arm {...p} />
      case 'pr-hits': return <Hits {...p} />
      case 'pr-tto': return <Tto {...p} />
      case 'pr-season': return <Season {...p} />
      case 'pr-next': return <Next {...p} />
      case 'pr-close': return <Close localT={localT} />
      default: return null
    }
  }
}
