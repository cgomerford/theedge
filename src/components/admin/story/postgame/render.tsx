import type { ReactNode } from 'react'
import type { RenderSegment } from '../StoryCanvas'
import Close from '../pitcher/segments/Close'
import Final from './segments/Final'
import Flow from './segments/Flow'
import Hitters from './segments/Hitters'
import Pitching from './segments/Pitching'
import Plays from './segments/Plays'
import Spray from './segments/Spray'
import type { PostgameReelData } from './types'

export function postgameRenderer(d: PostgameReelData): RenderSegment {
  return (id, localT, dur): ReactNode => {
    const p = { d, localT, dur }
    switch (id) {
      case 'pg-final': return <Final {...p} />
      case 'pg-flow': return <Flow {...p} />
      case 'pg-plays': return <Plays {...p} />
      case 'pg-hitters': return <Hitters {...p} />
      case 'pg-pitching': return <Pitching {...p} />
      case 'pg-spray': return <Spray {...p} />
      case 'pg-close': return <Close localT={localT} />
      default: return null
    }
  }
}
