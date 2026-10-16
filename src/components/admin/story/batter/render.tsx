import type { ReactNode } from 'react'
import type { RenderSegment } from '../StoryCanvas'
import Close from '../pitcher/segments/Close'
import Contact from './segments/Contact'
import Game from './segments/Game'
import Pas from './segments/Pas'
import Spray from './segments/Spray'
import Zone from './segments/Zone'
import type { BatterReelData } from './types'

export function batterRenderer(d: BatterReelData): RenderSegment {
  return (id, localT, dur): ReactNode => {
    const p = { d, localT, dur }
    switch (id) {
      case 'br-game': return <Game {...p} />
      case 'br-pas': return <Pas {...p} />
      case 'br-spray': return <Spray {...p} />
      case 'br-contact': return <Contact {...p} />
      case 'br-zone': return <Zone {...p} />
      case 'br-close': return <Close localT={localT} />
      default: return null
    }
  }
}
