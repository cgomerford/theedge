import type { CSSProperties, ReactNode } from 'react'
import { BODY_TOP, SAFE, SAFE_W } from '../layout'

/** Natural-height, top-aligned column under the header. Leftover space stays below as breathing room. */
export default function Body({ children, gap = 0, top = BODY_TOP, style }: {
  children: ReactNode; gap?: number; top?: number; style?: CSSProperties
}) {
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top, width: SAFE_W, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap, ...style }}>
      {children}
    </div>
  )
}
