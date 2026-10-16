import { SANS } from '@/components/team/ui'
import { SAFE, SAFE_W, TYPE, footTop } from '../layout'

/** Source / sample line placed directly under the content (`after` = content bottom y), clamped inside SAFE. */
export default function Foot({ children, after, lines = 1 }: { children: React.ReactNode; after: number; lines?: number }) {
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top: footTop(after, lines), width: SAFE_W, fontFamily: SANS, fontSize: TYPE.foot, lineHeight: 1.25, color: 'rgba(250,248,243,.7)' }}>
      {children}
    </div>
  )
}
